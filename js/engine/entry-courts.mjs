// Local axes follow the mapped entrance. Side is along the frontage and depth points into the site.
import {byId,metersPerUnit as unit} from './world.mjs?v=b0bdcee1';

export function courtPoint(site,side,depth){
  const a=site.viewHeading;
  return [site.x*unit+side*Math.sin(a)+depth*Math.cos(a),site.y*unit-side*Math.cos(a)+depth*Math.sin(a)];
}

export const entranceHeaders={
  mrt:{depth:5.4,y:2.42,w:2.21,h:.19,d:2.96,tint:'#727f77'},
  department:{depth:10.1,y:3.54,w:4.2,h:.51,d:.11,tint:'#66706b'}
};
export const courtPlanters={
  mrt:{sides:[-18,-9,7,17],depth:5.5},
  department:{sides:[-17,-9,2,13],depth:6.5}
};

// The sign and canopy are above head height. Only the camera needs their overhead volumes.
export const headerBounds=Object.entries(entranceHeaders).map(([id,header])=>{
  const p=byId.get(id),x=[],z=[];
  const footprint=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,d])=>{
    const point=courtPoint(p,s*header.w/2,header.depth+d*header.d/2);
    x.push(point[0]);z.push(point[1]);return point;
  });
  return {minX:Math.min(...x),maxX:Math.max(...x),minZ:Math.min(...z),maxZ:Math.max(...z),
    bottom:header.y-header.h/2,top:header.y+header.h/2,footprint};
});
