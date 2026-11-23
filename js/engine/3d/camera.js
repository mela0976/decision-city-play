import {canopyBounds} from '../venue-entrances.mjs?v=5114ee85'; // A27
import {headerBounds} from '../entry-courts.mjs?v=5114ee85'; // A23 night: elevated entrance fixtures share their rendered dimensions.
import {buildings} from '../world.mjs?v=5114ee85';

const topByShape={spire:160,twist:78,office:266,datalab:47,dome:15,construction:90,memorial:13,
  cityhall:20,studio:7,market:7,temple:11,park:4,mall:21,cinema:15,village:7,mrt:13};
const overheadBounds=headerBounds.concat(canopyBounds); // A27
// P2 perf：建物的鏡頭邊界（含多邊形外框）每次都算得一樣，第一次用到時算好存起來，之後每幀只篩選。
let staticBounds=null,staticUnit=null;
function buildingBounds(unit){
  if(staticUnit===unit)return staticBounds;
  staticUnit=unit;
  staticBounds=buildings.map((b,index)=>{
    const minX=b.x*unit,minZ=b.y*unit,maxX=(b.x+b.w)*unit,maxZ=(b.y+b.h)*unit;
    const top=Math.max(b.elevation??(4.5+((b.floors??3)-1)*2.72+(b.modern?4+index%8:0)),topByShape[b.shape]??0);
    const footprint=b.polygon?.map(p=>[p.x*unit,p.y*unit]);
    return {id:b.osmId,minX,minZ,maxX,maxZ,top,footprint};
  });
  return staticBounds;
}
export function cameraObstacles(x,z,unit,radius=39) {
  const bounds=[],all=buildingBounds(unit);
  for(let i=0;i<all.length;i++) {
    const b=all[i];
    if(b.minX>x+radius||b.maxX<x-radius||b.minZ>z+radius||b.maxZ<z-radius)continue;
    bounds.push(b);
  }
  for(let i=0;i<overheadBounds.length;i++){const b=overheadBounds[i];if(b.minX<=x+radius&&b.maxX>=x-radius&&b.minZ<=z+radius&&b.maxZ>=z-radius)bounds.push(b);}
  return bounds;
}
function solid(b,x,y,z,padding) {
  if(y<(b.bottom??-Infinity)-padding||y>b.top+padding||x<b.minX-padding||x>b.maxX+padding||z<b.minZ-padding||z>b.maxZ+padding)return false;
  const points=b.footprint;
  if(!points)return true;
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const pj=points[j],pi=points[i],ax=pj[0],az=pj[1],bx=pi[0],bz=pi[1];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    if(padding && Math.hypot(x-ax-dx*t,z-az-dz*t)<padding)return true;
  }
  return inside;
}
// P2 perf：用迴圈代替每一步都建一個 some() 閉包，結果相同。
function anySolid(bounds,x,y,z,padding){
  for(let i=0;i<bounds.length;i++)if(solid(bounds[i],x,y,z,padding))return true;
  return false;
}
export function cameraFraction(bounds,origin,end) {
  const steps=Math.max(1,Math.ceil(Math.hypot(end.x-origin.x,end.y-origin.y,end.z-origin.z)/.27));
  const padding=.37;
  const clearAtOrigin=!anySolid(bounds,origin.x,origin.y,origin.z,padding);
  let escaped=clearAtOrigin;
  for(let i=1;i<=steps;i++){
    const t=i/steps,x=origin.x+(end.x-origin.x)*t,y=origin.y+(end.y-origin.y)*t,z=origin.z+(end.z-origin.z)*t;
    const touching=anySolid(bounds,x,y,z,padding);
    if(!touching){escaped=true;continue;}
    if(escaped||anySolid(bounds,x,y,z,0))return Math.max(0,(i-1)/steps-.027);
  }
  return escaped?1:0;
}

export function planFlyover(site,unit,aspect=1.7) {
  const x=site.x*unit,z=site.y*unit;
  const subject=buildings.find(b=>b.id===site.id)??(site.id==='riverside'?null:buildings
    .filter(b=>!b.id&&!b.shape)
    .map(b=>({b,gap:Math.hypot((b.x+b.w/2)*unit-x,(b.y+b.h/2)*unit-z)}))
    .sort((a,b)=>a.gap-b.gap)[0]?.b);
  const cx=subject?(subject.x+subject.w/2)*unit:x,cz=subject?(subject.y+subject.h/2)*unit:z;
  const size=subject?Math.max(subject.w,subject.h)*unit:48;
  const bounds=cameraObstacles(cx,cz,unit,340);
  const buildingTop=subject?Math.max(subject.elevation??0,topByShape[subject.shape]??0):0;
  const neighborhood=bounds.filter(b=>Math.hypot((b.minX+b.maxX)/2-cx,(b.minZ+b.maxZ)/2-cz)<Math.max(100,size));
  const nearby=Math.max(buildingTop,...neighborhood.map(b=>b.top),0);
  const narrow=Math.max(1,1.15/aspect);
  const radius=Math.min(290,Math.max(94,size*.85+40,nearby*.65)*Math.min(narrow,1.5));
  const roof=Math.max(3,buildingTop);
  const obstruction=Math.max(...bounds.filter(b=>
    b.minX<=cx+radius+16&&b.maxX>=cx-radius-16&&b.minZ<=cz+radius+16&&b.maxZ>=cz-radius-16
  ).map(b=>b.top),0);
  let high=Math.max(118,nearby+54,obstruction+26,roof+Math.min(200,size)*.42);
  const sight=(angle,altitude,fraction)=>{
    const dx=Math.cos(angle),dz=Math.sin(angle);
    for(let step=1;step<=24;step++){
      const t=step/24*fraction;
      for(const b of bounds)if(b.id!==subject?.osmId&&solid(b,cx+dx*radius*(1-t),altitude+(roof+8-altitude)*t,cz+dz*radius*(1-t),4))return step/24;
    }
    return 1;
  };
  const headings=Array.from({length:36},(_,i)=>i*Math.PI/18);
  const clearArc=angle=>[0,.25,.5,.75,1].every(turn=>sight(angle+turn,high,.91)===1);
  while(high<610&&!headings.some(clearArc))high+=18;
  const score=angle=>Number(clearArc(angle))*8+[0,.25,.5,.75,1].reduce(
    (total,turn)=>total+sight(angle+turn,high,.98),0);
  const angle=headings.reduce((best,heading)=>score(heading)>score(best)?heading:best,headings[0]);
  const extent=size*.58;
  const topAngle=Math.atan2(high-roof-12,radius+extent);
  const baseAngle=Math.atan2(high,Math.max(12,radius-extent));
  const aim=high-Math.tan((topAngle+baseAngle)/2)*radius;
  const fov=Math.max(56,(baseAngle-topAngle)*180/Math.PI+18);
  return {cx,cz,radius,high,aim,angle,roof,fov,clearance:high-obstruction,clearArc:clearArc(angle)};
}

export function streetSkylineView(site,tower,candidates,unit){
  const tx=(tower.x+tower.w/2)*unit,tz=(tower.y+tower.h/2)*unit;
  const rank=point=>{
    const x=point.x*unit,z=point.y*unit,dx=tx-x,dz=tz-z;
    const distance=Math.hypot(dx,dz),eye=4.4;
    const bounds=cameraObstacles((tx+x)/2,(tz+z)/2,unit,distance*.54);
    let elevation=0;
    for(const wall of bounds){
      if(wall.id===tower.osmId)continue;
      const x0=(wall.minX-x)/dx,x1=(wall.maxX-x)/dx,z0=(wall.minZ-z)/dz,z1=(wall.maxZ-z)/dz;
      const enter=Math.max(0,Math.min(x0,x1),Math.min(z0,z1));
      const exit=Math.min(.99,Math.max(x0,x1),Math.max(z0,z1));
      if(enter<exit)elevation=Math.max(elevation,(wall.top-eye)/Math.max(.002,enter));
    }
    const street=point.heading;
    const alignment=Number.isFinite(street)?Math.abs((dx*Math.cos(street)+dz*Math.sin(street))/distance):0;
    return {x,z,elevation,score:elevation+Math.hypot(point.x-site.x,point.y-site.y)*unit*.22+(1-alignment)*145};

  };
  return candidates.map(rank).sort((a,b)=>a.score-b.score)[0]??rank(site);
}
