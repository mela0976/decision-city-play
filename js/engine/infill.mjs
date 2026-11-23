import landuse from './data/xinyi-landuse.json' with {type:'json'};
import {metersPerUnit as unit,toWorld,inWuxing,roadAt,worldContact,random,roads,locations,civicWalkway} from './world.mjs?v=1448599f';

// Residential rings keep their original character; the wide ring covers every other gap in the map.
const neighborhoods=[
  {center:toWorld(25.0300,121.5631),radius:322,civic:false},
  {center:toWorld(25.0368,121.5665),radius:395,civic:true},
  {center:toWorld(25.044,121.5596),radius:255,civic:false},
  {center:toWorld(25.0335,121.5640),radius:1150,civic:false,sparse:true},
];
import {occupancy} from './collision.mjs?v=1448599f';
const civicCenter=toWorld(25.0375,121.5664);
const walkwayHalfWidth=20/unit;

function overlapsWalkway(x,y,halfX,halfY){
  return Math.abs(x-civicWalkway.x)<walkwayHalfWidth+halfX
    &&y>civicWalkway.y0-halfY&&y<civicWalkway.y1+halfY;
}

let cached;
export function urbanInfill(){
  if(cached)return cached;
  const designated=landuse.features.map(([,kind,,ring])=>{
    const points=ring.map(pair=>toWorld(...pair));
    return {kind,points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  });
  // P2 perf：先用外框格子找出可能包含這一點的地塊，再做同樣的點在多邊形內判斷（結果只看「有沒有任何一塊」，與順序無關）。
  const designCell=200,designGrid=new Map();
  for(const d of designated){
    for(let i=Math.floor(d.minX/designCell);i<=Math.floor(d.maxX/designCell);i++)
      for(let j=Math.floor(d.minY/designCell);j<=Math.floor(d.maxY/designCell);j++){
        const key=i*65536+j;
        let list=designGrid.get(key);
        if(!list)designGrid.set(key,list=[]);
        list.push(d);
      }
  }
  function designation(x,y){
    const list=designGrid.get(Math.floor(x/designCell)*65536+Math.floor(y/designCell));
    if(!list)return false;
    for(let k=0;k<list.length;k++){
      const {points,minX,maxX,minY,maxY}=list[k];
      if(x<minX||x>maxX||y<minY||y>maxY)continue;
      let inside=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];
        if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      }
      if(inside)return true;
    }
    return false;
  }
  const parcels=[],step=20/unit;
  const found=new Set();
  for(const {center,radius,civic,sparse} of neighborhoods){
    for(let iy=Math.floor((center.y-radius/unit)/step);iy*step<center.y+radius/unit;iy++){
      for(let ix=Math.floor((center.x-radius/unit)/step);ix*step<center.x+radius/unit;ix++){
        const x=(ix+.5)*step,y=(iy+.5)*step,id=iy*65536+ix;
        if(found.has(id)||Math.hypot(x-center.x,y-center.y)*unit>radius||designation(x,y))continue;
        if(overlapsWalkway(x,y,9/unit,9/unit)||roadAt(x,y,-13/unit)||worldContact(x,y,9/unit,9/unit))continue;
        found.add(id);
        const sample=random(id),housing=!civic&&sample>(sparse?.58:.48);
        const pick=random(id*3+11);
        // Open ground gets a use: car park, fenced lot, pocket park or bare lot.
        let lot=null;
        if(!housing){
          lot=civic?'park':pick<.28?'parking':pick<.46?'fence':pick<.74?'park':'bare';
          if(inWuxing(x,y))lot='motorcycleBay';
        }
        parcels.push({x:x*unit,z:y*unit,housing,civic,tree:!housing&&(lot==='park'||(lot==='bare'&&sample>.3)),lot,
          width:housing?9+sample*4:16,depth:housing?10+sample*4:16,height:housing?7+sample*8:4,
          tin:housing&&!civic&&pick>.82});
      }
    }
  }
  // 只看中心點會讓 16 公尺的空地、圍籬或房子整塊蓋到馬路上：整塊範圍（含四角與邊中點）都要離開車道。
  const footprintClear=q=>{
    const hw=q.width/2/unit,hd=q.depth/2/unit;
    for(const a of [-1,-.5,0,.5,1])for(const b of [-1,-.5,0,.5,1])
      if(roadAt(q.x/unit+a*hw,q.z/unit+b*hd,0))return false;
    return true;
  };
  for(let i=parcels.length-1;i>=0;i--)if(!footprintClear(parcels[i]))parcels.splice(i,1);
  const occupied=occupancy();
  for(const q of parcels){
    if(q.housing)occupied.put({x:q.x/unit,y:q.z/unit,width:q.depth/2/unit},q.width/2/unit,'parcel');
    else if(q.tree)occupied.put({x:q.x/unit,y:q.z/unit,width:.20/unit},.20/unit,'tree');
  }
  for(const [index,[ax,ay,bx,by,w,e]] of roads.entries()){
    const local=inWuxing((ax+bx)/2,(ay+by)/2);
    if(e.way.layer!==0||e.d*unit<8)continue;
    if(local?e.way.kind==='pedestrian':!e.way.name)continue;
    const length=e.d*unit,heading=Math.atan2(by-ay,bx-ax),dx=Math.cos(heading),dz=Math.sin(heading);
    const count=Math.max(1,Math.floor(length/13)),segment=length/count;
    const span=local?segment-.34:Math.min(14,segment-.65),depth=local?6:9;
    const halfX=(Math.abs(dx)*span+Math.abs(dz)*depth)/2/unit;
    const halfY=(Math.abs(dz)*span+Math.abs(dx)*depth)/2/unit;
    const arterial=['primary','secondary'].includes(e.way.kind)||(e.way.kind==='tertiary'&&w*unit>=11);
    for(const side of [-1,1])for(let i=0;i<count;i++){
      const along=(i+.5)*segment;
      const setback=w*unit/2+(local?1.65:3.7),offset=side*(setback+depth/2);
      const x=ax+(dx*along-dz*offset)/unit,y=ay+(dz*along+dx*offset)/unit;
      if(overlapsWalkway(x,y,halfX,halfY)||locations.some(p=>Math.hypot(x-p.x,y-p.y)*unit<16))continue;
      if(worldContact(x,y,(span/2+.45)/unit,(depth/2+.55)/unit,heading)||designation(x,y))continue;
      const pose={x,y,heading,width:(depth/2+.1)/unit};
      if(occupied.hit(x,y,(span/2+.12)/unit,pose))continue;
      let clear=true;
      for(const t of [-.5,0,.5])for(const d of [-.5,0,.5]){
        const px=x+(dx*span*t-dz*depth*d)/unit,py=y+(dz*span*t+dx*depth*d)/unit;
        if(roadAt(px,py,-(local?1.1:2.3)/unit)||designation(px,py))clear=false;
      }
      if(!clear)continue;
      occupied.put(pose,span/2/unit,'parcel');
      const fromCivic=Math.hypot(x-civicCenter.x,y-civicCenter.y)*unit;
      const civic=fromCivic<485;
      const sample=random(index*13+i+side*7);
      const mix=random(index*31+i*5+side*3+2);
      // Keep interior streets at four or five storeys, with a gradual step up on civic-area arterials.
      const storeys=arterial&&fromCivic<800?7+Math.floor(sample*3):4+Number(sample>=.52);
      parcels.push({x:x*unit,z:y*unit,width:span,depth,height:civic?5+sample*4:3.8+3.15*(storeys-1),
        housing:true,civic,heading,streetSide:-side,shop:Math.floor(mix*12),street:true,
        setback:!civic&&mix>.62?1:0});
    }
  }
  return cached=parcels;
}
