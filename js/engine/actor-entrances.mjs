// Reserve the marker and three metres across the approaches from the surrounding streets.
import {locations,metersPerUnit as unit,roadAt} from './world.mjs?v=b0bdcee1';
import {officePoint} from './office-entrance.mjs?v=b0bdcee1';

export const locationRadius=84; // world units, shared with location:enter
const halfWidth=1.5/unit,extent=24/unit;
const entrances=locations.map(site=>{
  const directions=new Set([site.viewHeading,site.viewHeading+Math.PI]);
  // Keyboard/joystick approaches can enter open plazas diagonally from the road.
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,ux=Math.cos(angle),uy=Math.sin(angle);
    if([12,18,24,32,40].some(m=>roadAt(site.x+ux*m/unit,site.y+uy*m/unit)))directions.add(angle);
  }
  return {site,axes:[...directions].map(a=>[Math.cos(a),Math.sin(a)]),
    door:site.id==='office'?officePoint():null};
});

// Inflate the protected surface by the actor's enclosing radius.
export function obstructsEntrance(x,y,reach){
  for(const {site,axes,door} of entrances){
    const dx=x-site.x,dy=y-site.y;
    if(Math.abs(dx)>extent+halfWidth+reach||Math.abs(dy)>extent+halfWidth+reach)continue;
    if(Math.hypot(dx,dy)<=locationRadius+reach||
      door&&Math.hypot(x-door.x,y-door.y)<=5/unit+reach)return true;
    for(const [ux,uy] of axes){
      const along=Math.max(0,Math.min(extent,dx*ux+dy*uy));
      if(Math.hypot(dx-ux*along,dy-uy*along)<=halfWidth+reach)return true;
    }
  }
  return false;
}

// As a vehicle approaches the lane end, its remaining distance falls from near to far.
export function entranceWindows(start,end,reach){
  const dx=start.x-end.x,dy=start.y-end.y,length=Math.hypot(dx,dy);
  const pad=extent+halfWidth+reach;
  if(!entrances.some(({site})=>site.x>=Math.min(start.x,end.x)-pad&&site.x<=Math.max(start.x,end.x)+pad&&
    site.y>=Math.min(start.y,end.y)-pad&&site.y<=Math.max(start.y,end.y)+pad))return [];
  const n=Math.max(1,Math.ceil(length*unit)),step=length/n,windows=[];
  let current;
  for(let i=0;i<=n;i++){
    // The extra half-step covers the space between samples, including tangential contacts.
    if(!obstructsEntrance(end.x+dx*i/n,end.y+dy*i/n,reach+step*.5)){current=null;continue;}
    if(!current){current={far:Math.max(0,(i-.5)*step),near:0};windows.push(current);}
    current.near=Math.min(length,(i+.5)*step);
  }
  return windows;
}
