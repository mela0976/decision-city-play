import landuse from './data/xinyi-landuse.json' with {type:'json'};
import {metersPerUnit as unit,toWorld,roadAt,worldContact,random,roads,locations} from './world.mjs';

const neighborhoods=[
  {center:toWorld(25.0300,121.5631),radius:322,civic:false},
  {center:toWorld(25.0368,121.5665),radius:395,civic:true},
  {center:toWorld(25.044,121.5596),radius:255,civic:false},
];
import {occupancy} from './collision.mjs';
let cached;
export function urbanInfill(){
  if(cached)return cached;
  const designated=landuse.features.map(([,kind,,ring])=>{
    const points=ring.map(pair=>toWorld(...pair));
    return {kind,points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  });
  function designation(x,y){
    return designated.some(({points,minX,maxX,minY,maxY})=>{
      if(x<minX||x>maxX||y<minY||y>maxY)return false;
      let inside=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];
        if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      }
      return inside;
    });
  }
  const parcels=[],step=20/unit;
  const found=new Set();
  for(const {center,radius,civic} of neighborhoods){
    for(let iy=Math.floor((center.y-radius/unit)/step);iy*step<center.y+radius/unit;iy++){
      for(let ix=Math.floor((center.x-radius/unit)/step);ix*step<center.x+radius/unit;ix++){
        const x=(ix+.5)*step,y=(iy+.5)*step,id=iy*65536+ix;
        if(found.has(id)||Math.hypot(x-center.x,y-center.y)*unit>radius||designation(x,y))continue;
        if(roadAt(x,y,-13/unit)||worldContact(x,y,9/unit,9/unit))continue;
        found.add(id);
        const sample=random(id),housing=!civic&&sample>.48;
        parcels.push({x:x*unit,z:y*unit,housing,civic,tree:!housing&&sample>.20,
          width:housing?9+sample*4:16,depth:housing?10+sample*4:16,height:housing?7+sample*8:4});
      }
    }
  }
  const occupied=occupancy();
  for(const q of parcels){
    if(q.housing)occupied.put({x:q.x/unit,y:q.z/unit,width:q.depth/2/unit},q.width/2/unit,'parcel');
    else if(q.tree)occupied.put({x:q.x/unit,y:q.z/unit,width:.20/unit},.20/unit,'tree');
  }
  const civicCenter=toWorld(25.0375,121.5664);
  for(const [index,[ax,ay,bx,by,w,e]] of roads.entries()){
    if(!e.way.name||e.way.layer!==0||e.d*unit<8)continue;
    const length=e.d*unit,heading=Math.atan2(by-ay,bx-ax),dx=Math.cos(heading),dz=Math.sin(heading);
    const count=Math.max(1,Math.floor(length/13)),segment=length/count;
    const span=Math.min(14,segment-.65),depth=9;
    for(const side of [-1,1])for(let i=0;i<count;i++){
      const along=(i+.5)*segment;
      const setback=w*unit/2+3.7,offset=side*(setback+depth/2);
      const x=ax+(dx*along-dz*offset)/unit,y=ay+(dz*along+dx*offset)/unit;
      if(locations.some(p=>Math.hypot(x-p.x,y-p.y)*unit<16))continue;
      if(worldContact(x,y,(span/2+.45)/unit,(depth/2+.55)/unit,heading)||designation(x,y))continue;
      const pose={x,y,heading,width:(depth/2+.1)/unit};
      if(occupied.hit(x,y,(span/2+.12)/unit,pose))continue;
      let clear=true;
      for(const t of [-.5,0,.5])for(const d of [-.5,0,.5]){
        const px=x+(dx*span*t-dz*depth*d)/unit,py=y+(dz*span*t+dx*depth*d)/unit;
        if(roadAt(px,py,-2.3/unit)||designation(px,py))clear=false;
      }
      if(!clear)continue;
      occupied.put(pose,span/2/unit,'parcel');
      const civic=Math.hypot(x-civicCenter.x,y-civicCenter.y)*unit<485;
      const sample=random(index*13+i+side*7);
      parcels.push({x:x*unit,z:y*unit,width:span,depth,height:civic?5+sample*4:13.2+sample*3.3,
        housing:true,civic,heading,streetSide:-side,shop:index%6,street:true});
    }
  }
  return cached=parcels;
}
