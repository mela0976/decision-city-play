// A24. Coordinates use world units; crosswalk, stop and box distances are metres
// from the OSM arm's anchor, including on divided carriageways.
import {roads,roadNodes,toWorld,roadAt,metersPerUnit as unit} from './world.mjs?v=fced202e';
import tagged from './data/xinyi-signals.json' with {type:'json'};

const rank={primary:3,secondary:2,tertiary:1};
const arms=roadNodes.map(()=>[]);
for(const [,,,,,e] of roads){
  if(e.way.kind==='pedestrian'||e.way.layer!==0)continue;
  for(const [from,to,forward,reverse] of [[e.a,e.b,e.forward,e.reverse],[e.b,e.a,e.reverse,e.forward]]){
    if(arms[from].some(a=>a.to===to))continue;
    const p=roadNodes[from],q=roadNodes[to];
    arms[from].push({from,to,x:p.x,y:p.y,dx:(q.x-p.x)/e.d,dy:(q.y-p.y)/e.d,width:e.w,
      length:e.d,way:e.way,forward,reverse});
  }
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)*unit;
const intersect=(a,b)=>Math.abs(a.dx*b.dy-a.dy*b.dx)>.42;
const roadName=way=>(way.name??'').replace(/[一二三四五六七八九十]+段$/,'');
function arterialIntersection(approaches){
  return approaches.some(a=>rank[a.way.kind]&&approaches.some(b=>rank[b.way.kind]&&
    a.way.id!==b.way.id&&(!a.way.name||!b.way.name||roadName(a.way)!==roadName(b.way))&&intersect(a,b)));
}
const nodes=roadNodes.filter(n=>arms[n.index].length>=3);
const major=new Set(nodes.filter(n=>arterialIntersection(arms[n.index])).map(n=>n.index));
const candidates=new Set(major),ids=new Map();
const coordKey=p=>Math.round(p.x*100)+','+Math.round(p.y*100);
const byCoordinate=new Map(roadNodes.map(n=>[coordKey(n),n]));
export const skippedSignals=[];
// P2 perf：「25 m 內最近的路口」與「25 m 內併成同一路口」原本逐一比對全部路口。改用 30 m 格子只取附近的候選，
// 候選依原本的陣列順序（索引由小到大）檢查，所以找到的路口、並列時的取捨都和逐一比對相同。
const nearCell=30/unit;
function pointGrid(points){
  const cells=new Map();
  points.forEach((n,i)=>{
    const key=Math.floor(n.x/nearCell)*65536+Math.floor(n.y/nearCell);
    let list=cells.get(key);
    if(!list)cells.set(key,list=[]);
    list.push(i);
  });
  return cells;
}
function nearIndices(cells,p){
  const out=[],ci=Math.floor(p.x/nearCell),cj=Math.floor(p.y/nearCell);
  for(let i=ci-1;i<=ci+1;i++)for(let j=cj-1;j<=cj+1;j++){
    const list=cells.get(i*65536+j);
    if(list)for(const k of list)out.push(k);
  }
  return out.sort((a,b)=>a-b);
}
const nodeCells=pointGrid(nodes);
for(const [id,lat,lon,ped] of tagged.nodes){
  const p=toWorld(lat,lon),exact=byCoordinate.get(coordKey(p));
  // OSM commonly places heads on the incoming way, before the graph junction.
  let nearest=null,best=25;
  for(const index of nearIndices(nodeCells,p)){
    const n=nodes[index];
    if(exact&&!arms[n.index].some(a=>arms[exact.index].some(b=>a.way.id===b.way.id)))continue;
    const d=dist(n,p);
    if(d<best){best=d;nearest=n;}
  }
  if(!nearest&&ped&&exact&&arms[exact.index].length===2)nearest=exact;
  if(!nearest){skippedSignals.push(id);continue;}
  candidates.add(nearest.index);
  if(!ids.has(nearest.index))ids.set(nearest.index,[]);
  ids.get(nearest.index).push(id);
}

export const crossings=[],crossingForNode=new Map(),junctionById=new Map(),alleyStops=[];
export const signalGroup=(j,dx,dy)=>Math.abs(j.dx*dx+j.dy*dy)>=Math.SQRT1_2;
const pending=new Set([...candidates].sort((a,b)=>a-b));
const roadNodeCells=pointGrid(roadNodes); // roadNodes[i].index===i，候選索引就是節點編號
while(pending.size){
  const first=pending.values().next().value,members=[first];
  pending.delete(first);
  for(const i of members)for(const k of nearIndices(roadNodeCells,roadNodes[i]))if(pending.has(k)&&dist(roadNodes[i],roadNodes[k])<25){
    members.push(k);pending.delete(k);
  }
  const inside=new Set(members);
  // Absorb geometry vertices along short internal links between the merged nodes.
  for(const i of members)for(const a of arms[i]){
    let prev=i,next=a.to,length=a.length*unit;
    const path=[];
    while(!inside.has(next)&&arms[next].length===2&&length<30&&!path.includes(next)){
      path.push(next);
      const out=arms[next].find(b=>b.to!==prev);
      if(!out)break;
      prev=next;next=out.to;length+=out.length*unit;
    }
    if(inside.has(next))for(const k of path)inside.add(k);
  }
  const approaches=members.flatMap(i=>arms[i].filter(a=>!inside.has(a.to)));
  if(!approaches.length)continue;
  const axis=[...approaches].sort((a,b)=>(rank[b.way.kind]??0)-(rank[a.way.kind]??0)||b.width-a.width||a.way.id-b.way.id)[0];
  const center={x:0,y:0};
  for(const i of members){center.x+=roadNodes[i].x/members.length;center.y+=roadNodes[i].y/members.length;}
  const id='j'+first,hash=Math.imul(first+1,2654435761)>>>0,cycle=30,greenA=Math.round((cycle-10)*.5);
  const j={...center,id,node:first,members,osmIds:members.flatMap(i=>ids.get(i)??[]),twoStage:arterialIntersection(approaches),
    dx:axis.dx,dy:axis.dy,width:axis.width,cycle,greenA,greenB:cycle-10-greenA,
    offset:0,approaches,poles:[]};
  // A common cycle prevents neighboring heads from drifting apart over long games.
  // Follow the major corridor, with bounded ID-based variation at each intersection.
  // Keep the east-west green window aligned even where the north-south road
  // has priority (its east-west movement is group B instead of group A).
  const vertical=Math.abs(axis.dy)>Math.abs(axis.dx);
  const along=(center.x+center.y)*unit;
  const axisStart=vertical?greenA+5:0;
  const nearOffsets=new Set(crossings.filter(other=>dist(j,other)<150).map(other=>other.offset));
  j.offset=(cycle+axisStart-Math.round(along/55)%cycle+(hash>>>16)%5)%cycle;
  while(nearOffsets.has(j.offset))j.offset=(j.offset+1)%cycle;
  for(const a of approaches){
    const clearance=approaches.reduce((max,b)=>!intersect(a,b)?max:Math.max(max,
      b.width*unit/(2*Math.max(.7,Math.abs(a.dx*b.dy-a.dy*b.dx)))+.4),3);
    a.crosswalk=Math.min(13.2,clearance);
    a.stop=a.crosswalk+3.6;a.box=a.crosswalk+2.78;a.arrow=a.stop+3;
    a.paintLength=a.length*unit;a.group=signalGroup(j,a.dx,a.dy);a.junctionId=id;
    a.laneWidth=a.width*unit/(a.forward&&a.reverse?2:1);
    a.offset=a.forward&&a.reverse?-a.laneWidth/2:0;
    a.groupName=a.group?'a':'b';
  }
  j.crosswalk=axis.crosswalk;
  // Four inbound-facing heads even at a T. Pick the arm nearest each bearing.
  const base=Math.atan2(axis.dy,axis.dx);
  for(let k=0;k<4;k++){
    const angle=base+k*Math.PI/2,dx=Math.cos(angle),dy=Math.sin(angle);
    const a=[...approaches].sort((a,b)=>(b.dx-a.dx)*dx+(b.dy-a.dy)*dy)[0];
    const aligned=a.dx*dx+a.dy*dy>.65;
    const ux=aligned?a.dx:dx,uy=aligned?a.dy:dy;
    const origin=aligned?a:center;
    // 號誌杆要立在路外：從路緣往外推，右側推不出路面就試左側（最遠約 12 公尺）；兩邊都還在車道上就不放這一支，不要立在路中央
    let x,y,placed=false;
    for(const sign of [1,-1]){
      let side=a.width*unit/2+.55;
      for(let i=0;i<26&&!placed;i++,side+=.45){
        x=origin.x*unit+ux*(a.crosswalk+.7)+uy*side*sign;
        y=origin.y*unit+uy*(a.crosswalk+.7)-ux*side*sign;
        if(!roadAt(x/unit,y/unit,-.4/unit))placed=true;
      }
      if(placed)break;
    }
    if(!placed)continue;
    const street=approaches.find(b=>b.group!==a.group&&b.way.name)?.way.name||a.way.name;
    j.poles.push({x,y,dx:ux,dy:uy,group:signalGroup(j,ux,uy),name:street,en:tagged.english[street]??'',junction:j});
  }
  crossings.push(j);junctionById.set(id,j);
  for(const i of inside)crossingForNode.set(i,j);
}
for(const n of nodes){
  if(crossingForNode.has(n.index)||!arms[n.index].some(a=>rank[a.way.kind]))continue;
  for(const a of arms[n.index])if(a.reverse&&!rank[a.way.kind]&&arms[n.index].some(b=>rank[b.way.kind]&&intersect(a,b))){
    alleyStops.push({...a,stop:Math.max(...arms[n.index].map(b=>b.width*unit))/2+1.25});
  }
}
export const invalidSignalGroups=new Set();
export function signalState(j,clock,hour){
  const invalid=!(j.greenA>0&&j.greenB>0&&j.greenA+j.greenB+10===j.cycle);
  if(invalid)invalidSignalGroups.add(j.id);
  const flashing=invalid||hour>=23||hour<6;
  if(flashing)return {a:'flashing-yellow',b:'flashing-yellow',countdown:null,flashing:true};
  const t=((clock+j.offset)%j.cycle+j.cycle)%j.cycle;
  const bStart=j.greenA+5,bEnd=bStart+j.greenB;
  const a=t<j.greenA?'green':t<j.greenA+3?'yellow':'red';
  const b=t<bStart?'red':t<bEnd?'green':t<bEnd+3?'yellow':'red';
  return {a,b,countdown:a==='green'?Math.ceil(j.greenA-t):b==='green'?Math.ceil(bEnd-t):0,flashing:false};
}
export function waitSeconds(j,group,clock,hour){
  const s=signalState(j,clock,hour);
  if(s.flashing||s[group?'a':'b']==='green')return 0;
  const t=((clock+j.offset)%j.cycle+j.cycle)%j.cycle;
  return ((group?0:j.greenA+5)-t+j.cycle)%j.cycle;
}

// The occupancy test uses the actual painted rectangle (separating-axis theorem).
export function overlaps(a,b){
  for(const [ux,uy] of [[a.dx,a.dy],[-a.dy,a.dx],[b.dx,b.dy],[-b.dy,b.dx]]){
    const reach=p=>Math.abs(p.dx*ux+p.dy*uy)*p.depth/2+Math.abs(p.dx*uy-p.dy*ux)*p.span/2;
    if(Math.abs((a.x-b.x)*ux+(a.y-b.y)*uy)>=reach(a)+reach(b)-.001)return false;
  }
  return true;
}
// Intersect a transverse line with the ground-road capsules, including round
// OSM segment ends. A median less than 1.5 m wide cannot receive a ramp.
const roadBins=new Map(),binSize=48;
for(const [x0,y0,x1,y1,width,edge] of roads){
  if(edge.way.layer!==0||edge.way.kind==='pedestrian')continue;
  const r=width*unit/2,x=x0*unit,y=y0*unit,ex=x1*unit,ey=y1*unit,len=edge.d*unit;
  const segment={x,y,ex,ey,r,len,ux:(ex-x)/len,uy:(ey-y)/len};
  for(let i=Math.floor((Math.min(x,ex)-r)/binSize);i<=Math.floor((Math.max(x,ex)+r)/binSize);i++)
    for(let k=Math.floor((Math.min(y,ey)-r)/binSize);k<=Math.floor((Math.max(y,ey)+r)/binSize);k++){
      const key=i+','+k;
      if(!roadBins.has(key))roadBins.set(key,[]);
      roadBins.get(key).push(segment);
    }
}
function curbSpan(x,y,dx,dy,half){
  const reach=half+18,near=new Set(),intervals=[];
  for(let i=Math.floor((x-reach)/binSize);i<=Math.floor((x+reach)/binSize);i++)
    for(let k=Math.floor((y-reach)/binSize);k<=Math.floor((y+reach)/binSize);k++)
      for(const s of roadBins.get(i+','+k)??[])near.add(s);
  for(const s of near){
    for(const [px,py] of [[s.x,s.y],[s.ex,s.ey]]){
      const ex=px-x,ey=py-y,perp=ex*dy-ey*dx;
      if(Math.abs(perp)>s.r)continue;
      const along=ex*dx+ey*dy,delta=Math.sqrt(Math.max(0,s.r*s.r-perp*perp));
      intervals.push([along-delta,along+delta]);
    }
    let lo=-Infinity,hi=Infinity;
    for(const [ex,ey,min,max] of [[s.ux,s.uy,0,s.len],[-s.uy,s.ux,-s.r,s.r]]){
      const v=dx*ex+dy*ey,w=(x-s.x)*ex+(y-s.y)*ey;
      if(Math.abs(v)<1e-8){if(w<min||w>max){hi=-Infinity;break;}continue;}
      const a=(min-w)/v,b=(max-w)/v;
      lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
    }
    if(lo<=hi&&Number.isFinite(hi))intervals.push([lo,hi]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const [lo,hi] of intervals){
    const last=merged.at(-1);
    if(last&&lo<=last[1]+1.55)last[1]=Math.max(last[1],hi);
    else merged.push([lo,hi]);
  }
  const result=merged.find(([lo,hi])=>lo<=0&&hi>=0);
  if(!result||result[0]<-reach||result[1]>reach)return null;
  return result;
}
export const crosswalks=[],skippedCrosswalks=[];
// 只畫在路面、不參與路緣斜坡與行人路網的斑馬線（駛出路口的單向車道補的那一條）
export const paintedCrosswalks=[];
// 在這條進出路口的車道上找一條兩側都有路緣的斑馬線位置（和其他斑馬線不重疊）；找到就記在 a.walk。
function placeWalk(j,a,into=crosswalks){
  const span=a.width*unit,depth=1.8;
  const rect={dx:a.dx,dy:a.dy,span,depth,junctionId:j.id,roadId:a.way.id,name:a.way.name,from:a.from};
  const local=[...crosswalks,...paintedCrosswalks].filter(p=>Math.hypot(p.x-a.x*unit,p.y-a.y*unit)<55);
  let preferred=a.crosswalk;
  // 有分隔島的大道是兩條單向車道：對面那條車道上已經放好的斑馬線，這一條要沿路對齊它，行人過了這一半可以直直走過去，
  // 不要兩側各畫在自己路口的位置（原本只有約四成對得上）。對面那條的位置在可放範圍內才對齊，否則維持原本的位置。
  if(a.way.name){
    let partner=null,gap=Infinity;
    for(const q of local){
      if(q.name!==a.way.name||q.roadId===a.way.id||Math.abs(q.dx*a.dx+q.dy*a.dy)<.97)continue;
      const dx=q.x-a.x*unit,dy=q.y-a.y*unit,lateral=Math.abs(-dx*a.dy+dy*a.dx);
      if(lateral<3||lateral>40)continue;
      if(lateral<gap){gap=lateral;partner=q;}
    }
    if(partner){
      const along=(partner.x-a.x*unit)*a.dx+(partner.y-a.y*unit)*a.dy-depth/2; // 這條車道上要放在離進路起點多遠，才會和對面對齊
      if(Math.abs(along-a.crosswalk)<20)preferred=along; // 超出 3–14 公尺的可放範圍時，下面會挑範圍內最靠近的位置
    }
  }
  const choices=Array.from({length:46},(_,i)=>3+i*.24).sort((x,y)=>Math.abs(x-preferred)-Math.abs(y-preferred));
  for(const start of choices){
    const x=a.x*unit+a.dx*(start+depth/2),y=a.y*unit+a.dy*(start+depth/2);
    const edges=curbSpan(x,y,-a.dy,a.dx,span/2);
    if(!edges)continue;
    // 路邊是廣場或空地時，路緣離得很遠，斑馬線會拉得比路寬長好幾倍（例如市民大道五段14巷 6 公尺的路畫出 38 公尺）。
    // 超過路寬 1.5 倍＋2 公尺時，只畫到路寬兩側各多 1 公尺。
    // 路緣斜坡與行人路線仍用原本的路緣位置；只有畫在地上的斑馬線縮短（paintSpan、paintX、paintY）。
    const paint=edges[1]-edges[0]>span*1.5+2?[Math.max(edges[0],-span/2-1),Math.min(edges[1],span/2+1)]:edges;
    const offset=(edges[0]+edges[1])/2;
    rect.x=x-a.dy*offset;rect.y=y+a.dx*offset;rect.span=edges[1]-edges[0];
    const paintOffset=(paint[0]+paint[1])/2;rect.paintX=x-a.dy*paintOffset;rect.paintY=y+a.dx*paintOffset;rect.paintSpan=paint[1]-paint[0];
    if(j.members.every(i=>Math.hypot(roadNodes[i].x*unit-rect.x,roadNodes[i].y*unit-rect.y)>15))continue;
    const shared=local.find(p=>overlaps(p,rect));
    if(shared){
      if(shared.junctionId===j.id&&Math.abs(shared.dx*a.dx+shared.dy*a.dy)>.99&&
        Math.abs((shared.x-x)*a.dx+(shared.y-y)*a.dy)<1&&
        Math.abs((shared.y-y)*a.dx-(shared.x-x)*a.dy)<shared.span/2){
        a.crosswalk=start+(shared.x-x)*a.dx+(shared.y-y)*a.dy;
        a.walk=shared;break;
      }
      continue;
    }
    a.crosswalk=start;a.walk=rect;into.push(rect);break;
  }
}
for(const j of crossings)for(const a of j.approaches.filter(a=>a.reverse)){
  const depth=1.8;
  placeWalk(j,a);
  if(!a.walk)skippedCrosswalks.push({junctionId:j.id,roadId:a.way.id,from:a.from,to:a.to,reason:'no clear pair of curbs'});
  a.stop=a.crosswalk+depth+1.65;a.box=a.crosswalk+depth+.825;a.arrow=a.stop+3;
  if(j.twoStage){
    // Far-right corner for the first leg; the pocket faces the second green.
    const far=j.approaches.filter(b=>b!==a).sort((b,c)=>(b.dx-c.dx)*a.dx+(b.dy-c.dy)*a.dy)[0];
    const ux=far&&far.dx*a.dx+far.dy*a.dy<-.65?far.dx:-a.dx;
    const uy=far&&far.dx*a.dx+far.dy*a.dy<-.65?far.dy:-a.dy;
    const side=(far?.width??a.width)*unit/2-.85;
    const origin=far&&far.dx*a.dx+far.dy*a.dy<-.65?far:a;
    a.turnBox={x:origin.x*unit+ux*(a.crosswalk-1.2)-uy*side,
      y:origin.y*unit+uy*(a.crosswalk-1.2)+ux*side};
  }
}

const cellSize=48,gateCells=new Map();
for(const j of crossings)for(const a of j.approaches.filter(a=>a.reverse)){
  const x=a.x*unit+a.dx*a.stop-a.dy*a.offset,y=a.y*unit+a.dy*a.stop+a.dx*a.offset;
  const r=a.laneWidth/2+3;
  for(let i=Math.floor((x-r)/cellSize);i<=Math.floor((x+r)/cellSize);i++)
    for(let k=Math.floor((y-r)/cellSize);k<=Math.floor((y+r)/cellSize);k++){
      const key=i+','+k;
      if(!gateCells.has(key))gateCells.set(key,[]);
      gateCells.get(key).push({a,j,x,y});
    }
}
// Ray/stop-line intersection, measured from the front of the moving vehicle.
export function gateAhead(p,ux,uy,reach,front=0){
  const x=p.x*unit+ux*front,y=p.y*unit+uy*front;
  let best=null;
  const endX=x+reach*ux,endY=y+reach*uy;
  for(let i=Math.floor(Math.min(x,endX)/cellSize);i<=Math.floor(Math.max(x,endX)/cellSize);i++)
    for(let k=Math.floor(Math.min(y,endY)/cellSize);k<=Math.floor(Math.max(y,endY)/cellSize);k++)
      for(const g of gateCells.get(i+','+k)??[]){
        const {a}=g,facing=-(ux*a.dx+uy*a.dy);
        if(facing<.64)continue;
        const dx=x-g.x,dy=y-g.y,d=(dx*a.dx+dy*a.dy)/facing;
        if(d<-.02||d>reach||best&&best.distance<=d)continue;
        if(Math.abs((dy+uy*d)*a.dx-(dx+ux*d)*a.dy)>a.laneWidth*.5+.20)continue;
        best={...g,distance:Math.max(0,d)};
      }
  return best;
}

// 有分隔島的雙向道在地圖資料裡是兩條單向道：斑馬線原本只畫在車子駛進路口的那一側，
// 兩條車道就一東一西錯開。駛出路口的單向車道也補一條斑馬線（不畫停止線與待轉格），兩側車道對齊。
for(const j of crossings)for(const a of j.approaches.filter(a=>a.forward&&!a.reverse)){
  const keep={crosswalk:a.crosswalk,stop:a.stop,box:a.box,arrow:a.arrow,walk:a.walk};
  placeWalk(j,a,paintedCrosswalks);
  Object.assign(a,keep); // 這條車道的停止線、行人路網都維持原樣，只多畫一條斑馬線
}
