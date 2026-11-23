import {
  civicWalkway, locations, metersPerUnit as unit, random, roadAt, roadOptions, roads, toWorld, worldContact,
} from '../world.mjs?v=1448599f';
import {crossingForNode} from '../street-crossings.mjs?v=1448599f';
import landuse from '../data/xinyi-landuse.json' with {type:'json'};

const tau=2*Math.PI;
const profiles={
  camphor:{bark:'#756752',tint:'#eff7e5',rise:1.05,spread:1.15},
  bishopwood:{bark:'#765b4c',tint:'#d6e4ca',rise:1.07,spread:1.09},
  rainTree:{bark:'#73614d',tint:'#fff8ed',rise:.95,spread:1.04,pods:true},
  banyan:{bark:'#695d4d',tint:'#d0dfc3',rise:1.03,spread:1.28,roots:true},
  terminalia:{bark:'#736956',tint:'#f1f4d9',rise:1.23,spread:1.06},
  cypress:{bark:'#785c49',tint:'#e4dbb5',rise:1.39,spread:.69,spire:true},
  sweetgum:{bark:'#746555',tint:'#f0e5bc',rise:1.31,spread:.80,spire:true,autumn:true},
};
const streetTrees=['camphor','camphor','bishopwood','rainTree','terminalia'];
const parkTrees=['camphor','camphor','banyan','bishopwood','sweetgum'];
const sites=Object.fromEntries(locations.map(site=>[site.id,site]));
const temple=sites.temple;
const songshan=sites.studio;
const songshanGarden=toWorld(25.04495,121.56120);
const songrenNorth=toWorld(25.03900,121.56830);
const near=(x,z,site,radius)=>Math.hypot(x-site.x*unit,z-site.y*unit)<radius;

function speciesAt(x,z,seed,park){
  if(near(x,z,temple,34))return seed%3===0?'bishopwood':'banyan';
  if(near(x,z,songshan,135)||near(x,z,songshanGarden,82))return ['banyan','bishopwood','sweetgum'][Math.abs(seed)%3];
  if(near(x,z,sites.mrt,110))return seed%2?'terminalia':'rainTree';
  if(near(x,z,sites.breakfast,75)||near(x,z,sites.gamadiam,85)||near(x,z,sites.night_market,55))
    return seed%2?'bishopwood':'banyan';
  if(Math.abs(x-civicWalkway.x*unit)<70&&z>civicWalkway.y0*unit&&z<civicWalkway.y1*unit)
    return random(seed+61)<.52?'terminalia':'camphor';
  const mix=park?parkTrees:streetTrees;
  return mix[Math.floor(random(seed+61)*mix.length)];
}

function bough(instance,tint,x,z,base,dx,dy,dz,width){
  const yz=Math.hypot(dy,dz);
  instance('metal','cylinder',tint,x+dx/2,base+dy/2,z+dz/2,width,
    Math.hypot(dx,yz),width,0,Math.atan2(dz,dy),-Math.atan2(dx,yz));
}

export function placeTree(instance,x,z,seed,trunkWidth=.22){
  drawTree(instance,x,z,seed,trunkWidth,speciesAt(x,z,seed,trunkWidth>.22));
}

function drawTree(instance,x,z,seed,trunkWidth,species,scale=1,avenue=false){
  const {bark,tint,rise,spread,pods,roots,spire,autumn}=profiles[species];
  const size=.83+random(seed+7)*.34,phase=random(seed+13)*tau;
  const height=avenue?8.7+random(seed+73)*2.8:4.9*rise*size*scale;
  const crownWidth=avenue?8.45+random(seed+36)*.55:4.7*spread*size*scale;
  const crownHeight=height*(spire?.66:avenue?.51:.55);
  const fork=height-crownHeight*.78;
  const trunkShape=avenue?'vegetationTrunk':'cylinder';
  instance('metal',trunkShape,bark,x,fork/2,z,trunkWidth,fork,trunkWidth);
  const top=fork+crownHeight*.43;
  for(let i=0;i<2;i++){
    const angle=phase+i*2.2,reach=crownWidth*(i===0?.21:.29);
    const dx=Math.cos(angle)*reach,dz=Math.sin(angle)*reach;
    bough(instance,bark,x,z,fork-.55,dx,top-fork+.55,dz,trunkWidth*.42);
    if(roots)instance('metal','cylinder',bark,x+dx,top-1.26,z+dz,.043,1.40,.043);
  }
  const slot=pods?'pod':autumn?'autumn':'leaf';
  instance('grass','vegetationCards',tint,x,height-crownHeight*.50,z,
    crownWidth,crownHeight,crownWidth,phase,0,0,slot);
}

const shorelineParks=new Set([468371626,588528707,588628968,596306247]);
const riverside=sites.riverside;
const riversidePath=toWorld(25.05290,121.57120);
function inside(ring,x,z){
  let contained=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a.y>z)!==(b.y>z)&&x<(b.x-a.x)*(z-a.y)/(b.y-a.y)+a.x)contained=!contained;
  }
  return contained;
}

function plumeClump(instance,x,z,seed){
  const phase=random(seed+2)*tau;
  const plumes=random(seed+6)<.78?['#d8cfb1','#eee5cc']:['#a38b65','#c8b894'];
  for(let i=0;i<4;i++){
    const turn=phase+i*2.39996,reach=.19+random(seed+i+42)*.34;
    const dx=Math.cos(turn)*reach,dz=Math.sin(turn)*reach;
    const height=.56+random(seed+i+74)*.64;
    const yz=Math.hypot(height,dz);
    const rx=Math.atan2(dz,height),rz=-Math.atan2(dx,yz);
    instance('metal','box',i%2?'#777d47':'#5c6f3c',x+dx/2,height/2-.05,z+dz/2,
      .032,Math.hypot(dx,yz),.022,0,rx,rz);
    instance('metal','box',plumes[i%2],x+dx,height+.05,z+dz,
      .085,.25,.066,0,rx,rz);
  }
  for(const side of [-1,1]){
    const turn=phase+side*1.4;
    instance('metal','box','#627144',x+Math.cos(turn)*.17,.18,z+Math.sin(turn)*.17,
      .077,.47,.034,-turn,0,side*.54);
  }
}

const corridors=[
  {site:songrenNorth,names:['松仁路','松高路','市府路','松智路'],radius:360,margin:1.72},
  {site:sites.convenience,names:['松仁路','松壽路','松智路'],radius:175,margin:1.72},
  {site:sites.datalab,names:['松智路','松仁路','松壽路','松廉路','信義路五段'],radius:205,margin:1.82},
  {site:toWorld(25.0333,121.5542),names:['信義路四段'],radius:480,margin:1.85},
  {site:sites.tvstation,names:['忠孝東路四段'],radius:140,margin:1.95},
  // 信義區的林蔭大道整條都種：仁愛路、光復南路、信義路五段、忠孝東路五段、基隆路一段、南京東路五段、松仁路
  {site:toWorld(25.0385,121.5650),names:['仁愛路四段','光復南路','信義路五段','忠孝東路五段','基隆路一段','南京東路五段','松仁路'],radius:2600,margin:1.85},
];
const clearGround=(x,z,r)=>!roadAt(x,z,-r/unit)&&!worldContact(x,z,r/unit);
const spacing=7.2;
let landscapeTrees;
let landscapeHedges;
let landscapeMedians=[];

function plantAvenues(addTree,addHedge,addMedian=()=>{}){
  const distanceByWay=new Map();
  for(const [ax,az,bx,bz,width,edge] of roads){
    if(edge.way.layer!==0)continue;
    const length=edge.d*unit,dx=(bx-ax)/edge.d,dz=(bz-az)/edge.d;
    const middleX=(ax+bx)*unit/2,middleZ=(az+bz)*unit/2;
    const corridor=corridors.find(({site,names,radius})=>
      names.includes(edge.way.name)&&near(middleX,middleZ,site,radius+length/2));
    if(!corridor)continue;
    const since=distanceByWay.get(edge.way.id)??0;
    distanceByWay.set(edge.way.id,since+length);
    const start=crossingForNode.get(edge.a)?.approaches.find(arm=>arm.to===edge.b)?.crosswalk??0;
    const end=length-(crossingForNode.get(edge.b)?.approaches.find(arm=>arm.to===edge.a)?.crosswalk??0);
    if(end-start<1.55)continue;
    const at=(t,offset)=>[ax*unit+t*dx-dz*offset,az*unit+t*dz+dx*offset];
    const first=spacing/2+Math.ceil((since+start-spacing/2)/spacing)*spacing-since;
    const heading=-Math.atan2(dz,dx);
    for(const side of [-1,1]){
      for(let t=first;t<end;t+=spacing){
        const offset=side*(width*unit/2+corridor.margin);
        const [x,z]=at(t,offset);
        if(locations.some(site=>near(x,z,site,4.8)))continue;
        const seed=edge.way.id+Math.round((since+t)*7)+side;
        const species=edge.way.name==='信義路四段'?'camphor':random(seed+45)<.57?'rainTree':'terminalia';
        addTree(x,z,seed,species,.32,1,true);
      }
      const offset=side*(width*unit/2+3.3); // A24 keep avenue hedges behind the stone walking strip
      for(let t=start;t<end-1.4;t+=5.4){
        const span=Math.min(5.4,end-t);
        const [x,z]=at(t+span/2,offset);
        addHedge(x,z,span,heading);
      }
    }
    if(edge.forward===edge.reverse)continue;
    for(let t=start;t<end-2;t+=5.4){
      const span=Math.min(5.4,end-t),[x,z]=at(t+span/2,0);
      const opposite=roadOptions(x/unit,z/unit,16).find(({r,t,d})=>{
        const other=r[5];
        const along=((r[2]-r[0])*dx+(r[3]-r[1])*dz)/other.d;
        return other.way.id!==edge.way.id&&other.way.name===edge.way.name&&other.forward!==other.reverse&&
          along*(edge.forward===other.forward?1:-1)<-.95&&t>.03&&t<.97&&d*unit<28;
      });
      if(!opposite)continue;
      const gap=opposite.d*unit-(width+opposite.r[4])*unit/2;
      if(gap<1.35)continue;
      const fraction=(width*unit/2+gap/2)/(opposite.d*unit);
      const mx=x+(opposite.x*unit-x)*fraction,mz=z+(opposite.y*unit-z)*fraction;
      // 中間還夾著別條車道（例如仁愛路四條平行車道時抓到更遠那條）就不是分隔島：整個寬度都不能壓到路面
      const nx=(opposite.x*unit-x)/(opposite.d*unit),nz=(opposite.y*unit-z)/(opposite.d*unit);
      const islandClear=[-.42,-.25,0,.25,.42].every(f=>!roadAt((mx+nx*gap*f)/unit,(mz+nz*gap*f)/unit,-.2/unit));
      if(!islandClear)continue;
      // 分隔島鋪草地；夠寬（3 公尺以上）就在中間種一排大樹，像真的林蔭大道
      if(gap>=2.2)addMedian(mx,mz,span,heading,gap);
      if(gap>=3){
        const seed=edge.way.id+Math.round((since+t)*5);
        if(Math.round(t/5.4)%2===0)addTree(mx,mz,seed,edge.way.name==='仁愛路四段'?'camphor':random(seed+45)<.6?'camphor':'terminalia',.34,1.08,true);
      }
      addHedge(mx,mz,span,heading,true);
    }
  }
}

// The renderer and collision fixture registration use the same trunk positions.
export function visitLandscapeTrees(visit){
  if(!landscapeTrees){
    landscapeTrees=[];
    landscapeHedges=[];
    // P2 perf：「附近已經有樹／綠籬」改用格子只比附近的（原本每次比對全部），判斷條件與結果相同。
    const treeCells=new Map(),hedgeCells=new Map();
    const crowded=(cells,size,x,z,limit)=>{
      const ci=Math.floor(x/size),cj=Math.floor(z/size);
      for(let i=ci-1;i<=ci+1;i++)for(let j=cj-1;j<=cj+1;j++){
        const list=cells.get(i*65536+j);
        if(list)for(const t of list)if(Math.hypot(t.x-x,t.z-z)<limit)return true;
      }
      return false;
    };
    const remember=(cells,size,item)=>{
      const key=Math.floor(item.x/size)*65536+Math.floor(item.z/size);
      let list=cells.get(key);
      if(!list)cells.set(key,list=[]);
      list.push(item);
    };
    const add=(x,z,seed,species,width,scale,avenue=false)=>{
      if(!clearGround(x/unit,z/unit,.62)||crowded(treeCells,6,x,z,5.8))return;
      const tree={x,z,seed,species,width,scale,avenue};
      landscapeTrees.push(tree);remember(treeCells,6,tree);
    };
    const addHedge=(x,z,length,heading,median=false)=>{
      const dx=Math.cos(heading),dz=-Math.sin(heading);
      const clear=[-.47,-.25,0,.25,.47].every(t=>clearGround((x+dx*t*length)/unit,(z+dz*t*length)/unit,.43));
      if(!clear||crowded(hedgeCells,1.5,x,z,1.25))return;
      // 綠籬會擋人：店門口與地點入口前後留開口，讓人從路邊走得到門口
      if(locations.some(site=>Math.hypot(x-site.x*unit,z-site.y*unit)<length/2+14))return;
      const hedge={x,z,length,heading,median};
      landscapeHedges.push(hedge);remember(hedgeCells,1.5,hedge);
    };
    for(let z=civicWalkway.y0*unit+3.6;z<civicWalkway.y1*unit;z+=spacing){
      for(const side of [-1,1]){
        const seed=Math.round(z)*2+side;
        for(const margin of [3.4,4.7,5.9]){
          const x=civicWalkway.x*unit+margin*side;
          if(!clearGround(x/unit,z/unit,.62))continue;
          add(x,z,seed,seed%3===0?'camphor':'terminalia',.35,1,true);
          break;
        }
      }
    }
    landscapeMedians=[];
    plantAvenues(add,addHedge,(x,z,length,heading,gap)=>landscapeMedians.push({x,z,length,heading,gap}));
    // Choose mature trees inside mapped green space, away from the venue and water footprints.
    for(const [id,kind,name,coordinates] of landuse.features){
      if(kind!=='green'||!name)continue;
      const river=shorelineParks.has(id);
      if(!river&&!/松山文創|松山菸廠|巴洛克花園|四四南村/.test(name))continue;
      const ring=coordinates.map(([lat,lon])=>toWorld(lat,lon));
      const centers=river?[riverside]:name.includes('四四')?[sites.gamadiam]:[songshan,songshanGarden];
      const spacing=(river?15:12)/unit,range=(river?115:82)/unit;
      const mix=river?['cypress','camphor']:['banyan','bishopwood','sweetgum'];
      for(const focus of centers){
        for(let gx=focus.x-range;gx<focus.x+range;gx+=spacing){
          for(let gz=focus.y-range;gz<focus.y+range;gz+=spacing){
            const seed=id+Math.round(gx*17+gz*149);
            const x=gx+random(seed)*spacing,z=gz+random(seed+7)*spacing;
            const distance=Math.hypot(x-focus.x,z-focus.y);
            if(distance>range||distance<6/unit||!inside(ring,x,z)||random(seed+12)<.48)continue;
            add(x*unit,z*unit,seed,mix[Math.abs(seed)%mix.length],.43,1.46);
          }
        }
      }
    }
    for(const [dx,dz] of [[-8,-8],[-4,-8],[-12,-8],[-8,12]]){
      const previous=landscapeTrees.length;
      add(temple.x*unit+dx,temple.y*unit+dz,8319,'banyan',.44,1.45);
      if(landscapeTrees.length>previous)break;
    }
  }
  landscapeTrees.forEach(visit);
}

// Call once with instanceFor('vegetation'). Soft ground cover remains decorative.
// 綠籬和樹一樣是實體：碰撞註冊（fixtures.mjs）用同一份位置，人不能穿過，只能從綠籬之間的缺口走。
export function visitLandscapeHedges(visit){
  if(!landscapeHedges)visitLandscapeTrees(()=>{});
  for(const hedge of landscapeHedges)visit(hedge);
}

export function placeGroundVegetation(instance){
  visitLandscapeTrees(({x,z,seed,species,width,scale,avenue})=>{
    drawTree(instance,x,z,seed,width,species,scale,avenue);
    if(avenue)instance('metal','box','#53524a',x,.085,z,.94,.029,.94);
  });
  // 分隔島草地（綠籬與大樹底下那一條）
  for(const {x,z,length,heading,gap} of landscapeMedians){
    instance('grass','box','#6f8a5a',x,.075,z,length*1.02,.05,Math.max(.6,gap-.7),heading);
  }
  for(const {x,z,length,heading,median} of landscapeHedges){
    instance('grass','vegetationCards',median?'#d8ebbf':'#e0edcc',x,.50,z,
      length*1.07,1.03,.95,heading,0,0,'hedge');
  }
  // Mapped water clearance also identifies narrow bank strips outside park polygons.
  const step=2.9/unit,reach=29/unit;
  for(let x=-reach;x<=reach;x+=step)for(let z=-reach;z<=reach;z+=step){
    const distance=Math.hypot(x,z);
    if(distance>reach||distance<3.5/unit)continue;
    const seed=Math.round(x*741+z*17);
    const gx=riversidePath.x+x+(random(seed)-.5)*step,gz=riversidePath.y+z+(random(seed+1)-.5)*step;
    if(clearGround(gx,gz,1.1)&&worldContact(gx,gz,3.1/unit)==='water')
      plumeClump(instance,gx*unit,gz*unit,seed);
  }
  for(const [id,kind,name,coordinates] of landuse.features){
    if(kind!=='green'||!name)continue;
    const river=shorelineParks.has(id);
    const ring=coordinates.map(([lat,lon])=>toWorld(lat,lon));
    const step=(river?5.4:16)/unit;
    const range=145/unit;
    const minX=Math.max(Math.min(...ring.map(p=>p.x)),river?riverside.x-range:-Infinity);
    const maxX=Math.min(Math.max(...ring.map(p=>p.x)),river?riverside.x+range:Infinity);
    const minZ=Math.max(Math.min(...ring.map(p=>p.y)),river?riverside.y-range:-Infinity);
    const maxZ=Math.min(Math.max(...ring.map(p=>p.y)),river?riverside.y+range:Infinity);
    for(let x=minX;x<maxX;x+=step)for(let z=minZ;z<maxZ;z+=step){
      const seed=id+Math.round(x*17+z*1237);
      if(random(seed)<(river?.50:.66))continue;
      const gx=x+random(seed+3)*step,gz=z+random(seed+5)*step,px=gx*unit,pz=gz*unit;
      if(river&&!near(px,pz,riverside,145))continue;
      if(!inside(ring,gx,gz)||!clearGround(gx,gz,1.1))continue;
      if(river)plumeClump(instance,px,pz,seed);
      else {
        const turn=random(seed+9)*tau;
        instance('grass','crown','#51663d',px,.20,pz,1.16,.41,1.02,turn);
        instance('grass','crown','#72804a',px+.48,.29,pz+.19,1.48,.63,1.18,turn);
        if(near(px,pz,songshan,82)||near(px,pz,songshanGarden,82))instance('metal','box','#97714b',px-.72,.012,pz-.38,.12,.012,.075,turn);
      }
    }
  }
}
