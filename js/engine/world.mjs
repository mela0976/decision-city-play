import osm from './data/xinyi-osm.json' with { type:'json' };

export const metersPerUnit=.105;
export const geographicOrigin=osm.origin;
export const geographicBounds=osm.bounds;
const [south,west,north,east]=osm.bounds;
const earth=6378137,rad=Math.PI/180,cosLat=Math.cos(geographicOrigin[0]*rad);
export function projectMeters(lat,lon) {
  return {x:(lon-geographicOrigin[1])*rad*earth*cosLat,y:(geographicOrigin[0]-lat)*rad*earth};
}
const upperLeft=projectMeters(north,west);
export function toWorld(lat,lon) {
  const p=projectMeters(lat,lon);
  return {x:(p.x-upperLeft.x)/metersPerUnit,y:(p.y-upperLeft.y)/metersPerUnit};
}
export function toGeo(x,y) {
  return {lat:geographicOrigin[0]-(upperLeft.y+y*metersPerUnit)/(rad*earth),
    lon:geographicOrigin[1]+(upperLeft.x+x*metersPerUnit)/(rad*earth*cosLat)};
}
const limit=toWorld(south,east);
export const width=limit.x,height=limit.y;
export const scooterSpeed=13.1/metersPerUnit;
export const osmAttribution=osm.attribution;
export const roadNodes=[];
export const ways=[];
export const roads=[];
export const columns=[],rows=[],columnNames=[],rowNames=[];
export const river=toWorld(25.055,west).y;
export const water=(osm.water??[]).filter(w=>w[1]==='基隆河'||w[2].length>24).map(([id,name,line])=>({
  id,name,points:line.map(p=>toWorld(...p)),
}));
export const civicWalkway={...toWorld(25.038,121.56696),y0:toWorld(25.0395,121.56696).y,y1:toWorld(25.0348,121.56696).y,name:'香堤大道行人徒步區'};
const nodesByKey=new Map();
const widths={trunk:14,primary:13,secondary:12,tertiary:9,residential:6.5,unclassified:6,service:4,
  living_street:5,pedestrian:5,primary_link:7,secondary_link:6,tertiary_link:5};
function nodeFor(p) {
  const key=p.join(',');
  if(nodesByKey.has(key))return nodesByKey.get(key);
  const index=roadNodes.length;
  nodesByKey.set(key,index);
  roadNodes.push({...toWorld(...p),index,out:[],around:[]});
  return index;
}
for(const [id,name,kind,oneway,layer,points,widthTag,lanes] of osm.roads) {
  if(parseFloat(layer)<0||kind==='trunk') continue;
  const declared=parseFloat(widthTag),laneCount=parseInt(lanes,10);
  const w=(declared>2&&declared<45?declared:laneCount>0&&laneCount<10?Math.max(3.4,laneCount*3.1):widths[kind]??5)/metersPerUnit;
  const way={id,name,kind,oneway,layer:parseFloat(layer)||0,points:points.map(pt=>toWorld(...pt))};
  ways.push(way);
  for(let j=0;j<points.length-1;j++) {
    const a=roadNodes[nodeFor(points[j])],b=roadNodes[nodeFor(points[j+1])];
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d<.1)continue;
    const edge={a:a.index,b:b.index,d,w,way,forward:oneway!=='-1',reverse:!['yes','1','true'].includes(oneway)};
    roads.push([a.x,a.y,b.x,b.y,w,edge]);
    if(kind!=='pedestrian'&&way.layer===0) {
      a.around.push(b.index);b.around.push(a.index);
      if(edge.forward)a.out.push({...edge,to:b.index});
      if(edge.reverse)b.out.push({...edge,to:a.index});
    }
  }
}
const groups=new Int32Array(roadNodes.length).fill(-1);
let largest=-1,largestSize=0;
for(const node of roadNodes) {
  if(groups[node.index]!==-1)continue;
  const queue=[node.index];
  groups[node.index]=node.index;
  for(let i=0;i<queue.length;i++)for(const next of roadNodes[queue[i]].around){
    if(groups[next]!==-1)continue;
    groups[next]=node.index;queue.push(next);
  }
  if(queue.length>largestSize){largest=node.index;largestSize=queue.length;}
}
const cellSize=144;
const buildingCells=new Map(),roadCells=new Map();
const key=(x,y)=>y*1024+x;
function insert(map,item,x0,y0,x1,y1) {
  for(let y=Math.floor(y0/cellSize);y<=Math.floor(y1/cellSize);y++)
    for(let x=Math.floor(x0/cellSize);x<=Math.floor(x1/cellSize);x++){
      const k=key(x,y);
      if(!map.has(k))map.set(k,[]);
      map.get(k).push(item);
    }
}
for(const r of roads) insert(roadCells,r,Math.min(r[0],r[2])-r[4],Math.min(r[1],r[3])-r[4],
  Math.max(r[0],r[2])+r[4],Math.max(r[1],r[3])+r[4]);

export function nearestOnRoad(x,y,r) {
  const [ax,ay,bx,by]=r,dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  return {x:ax+dx*t,y:ay+dy*t,t,d:Math.hypot(x-ax-dx*t,y-ay-dy*t)};
}
export function roadDistance(x,y,r) {return nearestOnRoad(x,y,r).d;}
export function roadAt(x,y,inset=0) {
  return (roadCells.get(key(Math.floor(x/cellSize),Math.floor(y/cellSize)))??[]).some(r=>roadDistance(x,y,r)<=r[4]/2-inset);
}
export function roadOptions(x,y,count=5,componentOnly=true) {
  const nearby=new Set();
  const eligible=r=>!componentOnly||groups[r[5].a]===largest&&groups[r[5].b]===largest&&r[5].way.kind!=='pedestrian'&&r[5].way.layer===0;
  for(let size=0;size<=14 && nearby.size<Math.max(22,count*2);size++) {
    for(let cy=-size;cy<=size;cy++)for(let cx=-size;cx<=size;cx++)
      for(const r of roadCells.get(key(Math.floor(x/cellSize)+cx,Math.floor(y/cellSize)+cy))??[])if(eligible(r))nearby.add(r);
  }
  return [...(nearby.size?nearby:roads.filter(eligible))]
    .map(r=>({...nearestOnRoad(x,y,r),r})).sort((a,b)=>a.d-b.d).slice(0,count);
}
export function random(seed) {return ((Math.sin(seed*127.1+91.7)*43758.5453)%1+1)%1;}
const colors=['#a08c7c','#7c9091','#c4ad84','#869077','#967d78','#aaa299','#8f8b8f'];
const locationDefs=[
  ['home','吳興街租屋處',25.02851,121.56313,'house','吳興街街廓估點'],
  ['breakfast','巷口早餐店',25.02814,121.56377,'house','吳興街巷口估點'],
  ['office','富幫 A25',25.0396333,121.5705752,'office','way/1010525370',1010525370],
  ['client_hq','台北一洞么',25.0339372,121.5646194,'spire','way/1159328965',1159328965],
  ['mrt','捷運市政府站',25.0413185,121.5670568,'mrt','node/569951808'],
  ['department','新光三月',25.0381443,121.5667804,'mall','way/274647896',274647896],
  ['convenience','巷口超商',25.03589,121.56785,'house','松壽路街廓估點'],
  ['studio','鬆山文創攝影棚',25.04503,121.55951,'studio','node/13607291754'],
  ['datalab','藍山廣場數據實驗室',25.0343944,121.5673855,'datalab','way/383731054',383731054],
  ['tvstation','大巨旦轉播中心',25.0424104,121.5594054,'dome','way/442195153',442195153],
  ['night_market','拎薑街夜市',25.02952,121.55406,'market','node/8755153190'],
  ['temple','福德街土地公廟',25.03636,121.57913,'temple','福德街街廓估點'],
  ['gamadiam','思思南村柑仔店',25.03155,121.56253,'village','松勤街四四南村估點'],
  ['riverside','彩虹河濱公園',25.0529,121.5712,'park','基隆河彩虹公園陸側估點'],
  ['rechao','吳興街熱炒',25.02790,121.56421,'house','吳興街街廓估點'],
];
const scenicDefs=[
  ['twist','陶朱隱園',383731055],['cityhall','台北市政府',142113976],['memorial','國父紀念館',189788192],
  ['construction','天空塔工地',1339580862],
];
const special=new Map([...locationDefs.filter(a=>a[6]).map(a=>[a[6],{id:a[0],name:a[1],shape:a[4]}]),
  ...scenicDefs.map(a=>[a[2],{shape:a[0],name:a[1]}])]);
// Underground MRT station outlines do not represent a street-level obstruction.
const undergroundStations=new Set([810557338,810557339,810653312]);
export const buildings=osm.buildings.filter(b=>!undergroundStations.has(b[0])).map(([id,name,h,levels,points])=>{
  const polygon=points.map(p=>toWorld(...p));
  const xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,d=Math.max(...ys)-y;
  const floors=Math.max(1,parseFloat(levels)||2+Math.floor(random(id)*5));
  const modern=x>toWorld(25,121.563).x&&y>toWorld(25.042,121).y&&y<toWorld(25.033,121).y;
  const elevation=parseFloat(h)||floors*3.45;
  return {osmId:id,x,y,w,h:d,z:elevation*2,elevation,floors,polygon,modern,
    color:colors[id%colors.length],name:'',...special.get(id)};
}).filter(b=>b.w>5 && b.h>5);
for(const b of buildings)insert(buildingCells,b,b.x,b.y,b.x+b.w,b.y+b.h);
export const landmarks=buildings.filter(b=>b.shape && !b.id);
function contains(x,y,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function inBuilding(x,y) {
  return (buildingCells.get(key(Math.floor(x/cellSize),Math.floor(y/cellSize)))??[])
    .some(b=>contains(x,y,b.polygon));
}
export const locations=locationDefs.map(([id,name,lat,lon,shape,source,osmId])=>{
  const anchor=toWorld(lat,lon);
  const options=roadOptions(anchor.x,anchor.y,14);
  // The stadium transfer stop uses the eastbound Zhongxiao East Road
  // carriageway. The westbound frontage is retained for street traffic.
  const transferOptions=id==='tvstation'?roadOptions(anchor.x,anchor.y,45).filter(p=>p.r[5].way.id===297603932):options;
  const candidates=transferOptions.flatMap(p=>{
    const r=p.r,dx=r[2]-r[0],dy=r[3]-r[1],d=Math.hypot(dx,dy);
    const side=Math.sign(dx*(anchor.y-p.y)-dy*(anchor.x-p.x))||1;
    const direction=Math.atan2(dx/d*side,-dy/d*side);
    return [1,.55,0,-.45].map(scale=>{
      const shift=Math.min(r[4]*.28,39)*side*scale;
      return {x:p.x-dy/d*shift,y:p.y+dx/d*shift,r,viewHeading:direction,
        score:p.d+(r[5].way.kind==='service'?36:0)+Math.abs(1-scale)*47};
    });
  }).filter(p=>!inBuilding(p.x,p.y)).sort((a,b)=>a.score-b.score);
  if(!candidates.length)throw new Error('No open OSM road around '+id);
  const {x,y,r,viewHeading}=candidates[0];
  const b=osmId?buildings.find(b=>b.osmId===osmId):null;
  if(b) b.angle=viewHeading-Math.PI/2;
  return {id,name,x,y,lat,lon,source,road:r[5].way.id,viewHeading,shape,
    anchorX:anchor.x,anchorY:anchor.y};
});
export const byId=new Map(locations.map(site=>[site.id,site]));
export function blocked(x,y,r=10) {
  if(x<0||y<0||x>width||y>height||inBuilding(x,y))return true;
  return !roadAt(x,y,-Math.min(r*1.3,20));
}
