import {subtractRectangle} from './paving-geometry.mjs';
import {wuxingArcades} from './wuxing-arcades.mjs'; // A24
// All geometry here is in metres (x east, z south). World queries take simulation units.
import {buildings, inWuxing, inBuilding, metersPerUnit as unit, oldStreetDistrict, roadAt, roads, toGeo, worldContact} from './world.mjs';
import {urbanInfill} from './infill.mjs';
import {crosswalkEnds} from './crosswalks.mjs';

const cells = new Map(), asphalt = new Map();
const cellSize = 24;
const cellKey = (i,j) => i*8192+j;
export const paving = [];
export const curbWidth = .18;
const roadLevel = .02;

function register(grid, s, padding=0) {
  const rx = Math.abs(s.dx)*s.half + Math.abs(s.nx)*s.depth/2 + padding;
  const rz = Math.abs(s.dz)*s.half + Math.abs(s.nz)*s.depth/2 + padding;
  for(let i=Math.floor((s.x-rx)/cellSize);i<=Math.floor((s.x+rx)/cellSize);i++)
    for(let j=Math.floor((s.z-rz)/cellSize);j<=Math.floor((s.z+rz)/cellSize);j++) {
      const key=cellKey(i,j);
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(s);
    }
}
const nearby=(grid,x,z)=>grid.get(cellKey(Math.floor(x/cellSize),Math.floor(z/cellSize)))??[];
const along=(s,x,z)=>(x-s.x)*s.dx+(z-s.z)*s.dz;
const across=(s,x,z)=>(x-s.x)*s.nx+(z-s.z)*s.nz;
export function pavingPoint(s,t,d) {
  return {x:s.x+s.dx*t+s.nx*(d-s.depth/2), z:s.z+s.dz*t+s.nz*(d-s.depth/2)};
}
function add(s) {
  paving.push(s);
  // Largest ground vehicle is a 10.8 m bus. Padding keeps each footprint query in one cell.
  register(cells,s,6);
}

// Interval along the proposed slab that intersects a carriageway. Project the
// moving cross-section on both road axes and its own side normal (separating axes).
function roadInterval(s,r) {
  let start=-s.half,end=s.half;
  for(const [ux,uz] of [[r.dx,r.dz],[r.nx,r.nz],[s.dx,s.dz]]) {
    const reach=Math.abs(r.dx*ux+r.dz*uz)*r.half+Math.abs(r.nx*ux+r.nz*uz)*r.depth/2+
      Math.abs(s.nx*ux+s.nz*uz)*s.depth/2;
    const origin=(s.x-r.x)*ux+(s.z-r.z)*uz, rate=s.dx*ux+s.dz*uz;
    if(Math.abs(rate)<1e-8){if(Math.abs(origin)>=reach-.001)return null;continue;}
    const a=(-reach-origin)/rate,b=(reach-origin)/rate;
    start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));
    if(start>=end)return null;
  }
  return [start,end];
}
function addClipped(s,owner) {
  const obstacles=new Set();
  const steps=Math.ceil(2*s.half/10);
  for(let i=0;i<=steps;i++){
    const t=(2*i/steps-1)*s.half;
    for(const r of nearby(asphalt,s.x+s.dx*t,s.z+s.dz*t))if(r!==owner)obstacles.add(r);
  }
  const cuts=[];
  for(const r of obstacles){const cut=roadInterval(s,r);if(cut)cuts.push(cut);}
  cuts.sort((a,b)=>a[0]-b[0]);
  let start=-s.half;
  for(const [lo,hi] of [...cuts,[s.half,s.half]]){
    if(lo-start>.12){
      const mid=(start+lo)/2;
      add({...s,x:s.x+s.dx*mid,z:s.z+s.dz*mid,half:(lo-start)/2});
    }
    start=Math.max(start,hi);
  }
}

const ways=[];
for(const [ax,ay,bx,by,w,edge] of roads){
  if(edge.way.layer!==0||edge.way.kind==='pedestrian')continue;
  const dx=(bx-ax)/edge.d,dz=(by-ay)/edge.d;
  const r={x:(ax+bx)*unit/2,z:(ay+by)*unit/2,dx,dz,nx:-dz,nz:dx,half:edge.d*unit/2,depth:w*unit,edge};
  ways.push(r);register(asphalt,r,12);
}
for(const r of ways){
  const {edge}=r,kind=edge.way.kind;
  const arterial=['primary','secondary','tertiary'].includes(kind);
  const {lat,lon}=toGeo(r.x/unit,r.z/unit);
  const planned=lat>=25.0317&&lat<=25.042&&lon>=121.561&&lon<=121.5735&&!oldStreetDistrict(lat,lon);
  if(!arterial&&!planned)continue;
  const depth=arterial?2.6:1.65;
  for(const side of [-1,1]){
    const offset=(r.depth+depth)*side/2;
    addClipped({...r,x:r.x+r.nx*offset,z:r.z+r.nz*offset,nx:r.nx*side,nz:r.nz*side,
      depth,kind:'sidewalk',rise:.15,roadId:edge.way.id},r);
  }
}

function facade(ax,az,bx,bz,nx,nz,maxDepth){
  const length=Math.hypot(bx-ax,bz-az);
  if(length<1)return;
  const x=(ax+bx)/2,z=(az+bz)/2;
  if(!roadAt(x/unit,z/unit,-72))return;
  for(let d=.25;d<=maxDepth;d+=.25){
    if(!roadAt((x+nx*d)/unit,(z+nz*d)/unit))continue;
    const depth=Math.max(.2,d-.15);
    // Orient the slab from its street-facing lip towards the facade.
    addClipped({x:x+nx*depth/2,z:z+nz*depth/2,dx:(bx-ax)/length,dz:(bz-az)/length,
      nx:-nx,nz:-nz,half:length/2,depth,kind:'arcade',rise:.12});
    break;
  }
}
for(const b of buildings){
  if(b.modern||b.shape||inWuxing(b.x+b.w/2,b.y+b.h/2))continue;
  const points=b.polygon;
  const winding=Math.sign(points.reduce((sum,a,i)=>{
    const c=points[(i+1)%points.length];return sum+a.x*c.y-c.x*a.y;
  },0));
  for(let i=0;i<points.length;i++){
    const a=points[i],c=points[(i+1)%points.length],length=Math.hypot(c.x-a.x,c.y-a.y);
    if(length*unit<1)continue;
    facade(a.x*unit,a.y*unit,c.x*unit,c.y*unit,(c.y-a.y)*winding/length,(a.x-c.x)*winding/length,10);
  }
}
for(const p of urbanInfill()){
  if(!p.street||p.civic||!p.housing||inWuxing(p.x/unit,p.z/unit))continue;
  const dx=Math.cos(p.heading),dz=Math.sin(p.heading),nx=-dz*p.streetSide,nz=dx*p.streetSide;
  const x=p.x+nx*p.depth/2,z=p.z+nz*p.depth/2;
  facade(x-dx*p.width/2,z-dz*p.width/2,x+dx*p.width/2,z+dz*p.width/2,nx,nz,4.25);
}

for(const {cx,cz,dx,dz,nx,nz,span,depth} of wuxingArcades()){
  addClipped({x:cx+nx*depth/2,z:cz+nz*depth/2,dx,dz,nx:-nx,nz:-nz,half:span/2,depth,
    kind:'arcade',rise:.12});
}

// A crossing belongs to the markings module. Leave an endpoint flush on asphalt
// when the upstream rectangle stops in another lane. Report that specific endpoint.
function buildRamps(crosswalks){
  const results=[];
  for(const {junctionId,roadId,depthMeters,ends} of crosswalks)for(const [side,e] of ends.entries()){
    const x=e.x*unit,z=e.y*unit,nx=e.dx,nz=e.dy,depth=1.5;
    const entry={junctionId,roadId,side,x:e.x,y:e.y};
    results.push(entry);
    if(carriagewayAt(e.x+nx*.08/unit,e.y+nz*.08/unit)){
      entry.status='in-carriageway';continue;
    }
    const ramp={x:x+nx*depth/2,z:z+nz*depth/2,dx:-nz,dz:nx,nx,nz,half:depthMeters/2+.36,depth,
      rise:.15,kind:'ramp',roadId,index:results.length};
    // Clip the landing as a polygon: at a skew corner one lip corner can be on
    // asphalt even though the centre and the entire accessible approach are clear.
    let polys=[[[-ramp.half,0],[ramp.half,0],[ramp.half,depth],[-ramp.half,depth]].map(([t,d])=>{
      const p=pavingPoint(ramp,t,d);return [p.x,0,p.z];
    })];
    for(const road of nearby(asphalt,ramp.x,ramp.z)){
      if(!roadInterval(ramp,road))continue;
      (ramp.cutouts??=[]).push(road);
      polys=polys.flatMap(poly=>subtractRectangle(poly,road));
    }
    if(!polys.length){entry.status='no-clear-depth';continue;}
    if(ramp.cutouts)ramp.polys=polys;
    add(ramp);
    entry.status='placed';
  }
  // Tie clipping to the physical ramp, including secondary slabs at skew junctions.
  for(const ramp of paving){
    if(ramp.kind!=='ramp')continue;
    for(const slab of nearby(cells,ramp.x,ramp.z)){
      if(slab===ramp||!roadInterval(slab,ramp))continue;
      (slab.cutouts??=[]).push(ramp);
    }
  }
  return results;
}
export const rampEnds=buildRamps(crosswalkEnds());
export function pavingHeight(s,t,d){
  return roadLevel+s.rise*(s.kind==='ramp'?Math.max(0,Math.min(1,d/s.depth)):1);
}
export function surfaceAt(x,y){
  x*=unit;y*=unit;
  let top=null,height=0,ramp=null,rampHeight=Infinity;
  for(const s of nearby(cells,x,y)){
    const t=along(s,x,y),d=across(s,x,y)+s.depth/2;
    if(Math.abs(t)>s.half||d<0||d>s.depth)continue;
    const h=pavingHeight(s,t,d);
    if(s.kind==='ramp'){
      if(h<rampHeight&&(!s.polys||!carriagewayAt(x/unit,y/unit))){ramp=s;rampHeight=h;}
      continue;
    }
    if(h>height){top=s;height=h;}
  }
  return ramp?{slab:ramp,height:rampHeight}:top&&{slab:top,height};
}
// Extra separating axes for the small subset of ramps clipped by skew carriageways.
function hitsPolygon(poly,x,z,ux,uz,length,width){
  const axes=[[ux,uz],[-uz,ux]];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[2]-a[2];
    if(Math.abs(dx)+Math.abs(dz)>.00001)axes.push([-dz,dx]);
  }
  for(const [ax,az] of axes){
    let lo=Infinity,hi=-Infinity;
    for(const p of poly){const v=(p[0]-x)*ax+(p[2]-z)*az;lo=Math.min(lo,v);hi=Math.max(hi,v);}
    const extent=Math.abs(ax*ux+az*uz)*length+Math.abs(az*ux-ax*uz)*width;
    if(lo>=extent||hi<=-extent)return false;
  }
  return true;
}
export function curbContact(x,y,halfLength,halfWidth,heading){
  x*=unit;y*=unit;halfLength*=unit;halfWidth*=unit;
  const ux=Math.cos(heading),uz=Math.sin(heading);
  for(const s of nearby(cells,x,y)){
    const l=Math.abs(ux*s.dx+uz*s.dz),w=Math.abs(ux*s.nx+uz*s.nz);
    if(Math.abs(across(s,x,y))>=s.depth/2+l*halfWidth+w*halfLength||
       Math.abs(along(s,x,y))>=s.half+l*halfLength+w*halfWidth)continue;
    const dx=x-s.x,dz=y-s.z;
    if(Math.abs(dx*ux+dz*uz)<halfLength+s.half*l+s.depth/2*w&&
       Math.abs(dz*ux-dx*uz)<halfWidth+s.half*w+s.depth/2*l&&
       (!s.polys||s.polys.some(poly=>hitsPolygon(poly,x,y,ux,uz,halfLength,halfWidth))))return true;
  }
  return false;
}

// OSM arrival coordinates are lane anchors. Look towards the venue for an
// accessible pedestrian entrance within the original interaction radius.
export function pedestrianEntrance(site,accessible=()=>true){
  if(surfaceAt(site.x,site.y)&&accessible(site.x,site.y))return site;
  const ux=Math.cos(site.viewHeading),uz=Math.sin(site.viewHeading);
  for(const offset of [0,.8,-.8,1.6,-1.6,2.4,-2.4])for(let d=.5;d<=8;d+=.5){
    const x=site.x+(ux*d-uz*offset)/unit,y=site.y+(uz*d+ux*offset)/unit;
    const surface=surfaceAt(x,y);
    if(surface&&across(surface.slab,x*unit,y*unit)+surface.slab.depth/2>=.40&&
       !inBuilding(x,y)&&!worldContact(x,y,.29/unit)&&accessible(x,y))return {x,y};
  }
  return null;
}

export function carriagewayAt(x,y){
  x*=unit;y*=unit;
  return nearby(asphalt,x,y).some(r=>Math.abs(along(r,x,y))<=r.half+.01&&Math.abs(across(r,x,y))<=r.depth/2);
}

// Project the oriented ground footprint onto the nearest lane that can hold it.
// This only runs while choosing a touchdown, never while the vehicle is airborne.
export function laneTouchdown(x,y,heading,length,width,clear){
  if(carriagewayAt(x,y)&&clear(x,y))return {x,y};
  if(!surfaceAt(x,y))return null;
  const mx=x*unit,mz=y*unit,ux=Math.cos(heading),uz=Math.sin(heading);
  let best=null,bestDistance=Infinity;
  for(const r of nearby(asphalt,mx,mz)){
    const parallel=Math.abs(ux*r.dx+uz*r.dz),cross=Math.abs(ux*r.nx+uz*r.nz);
    const bound=r.depth/2-(length*cross+width*parallel)*unit-.04;
    if(bound<0)continue;
    const t=Math.max(-r.half,Math.min(r.half,along(r,mx,mz)));
    const nearest=Math.max(-bound,Math.min(bound,across(r,mx,mz)));
    for(const lateral of [nearest,nearest*.5,0,-nearest*.5,-nearest]){
      const cx=(r.x+r.dx*t+r.nx*lateral)/unit,cy=(r.z+r.dz*t+r.nz*lateral)/unit;
      const distance=Math.hypot(x-cx,y-cy);
      if(distance>=bestDistance||!clear(cx,cy))continue;
      best={x:cx,y:cy};bestDistance=distance;
    }
  }
  return best;
}
