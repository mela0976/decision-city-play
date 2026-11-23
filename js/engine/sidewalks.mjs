import {subtractConvex,subtractRectangle} from './paving-geometry.mjs?v=1448599f';
import {wuxingArcades} from './wuxing-arcades.mjs?v=1448599f'; // A24
// All geometry here is in metres (x east, z south). World queries take simulation units.
import {buildings, inWuxing, inBuilding, metersPerUnit as unit, oldStreetDistrict, roadAt, roadNodes, roads, toGeo, worldContact} from './world.mjs?v=1448599f';
import {urbanInfill} from './infill.mjs?v=1448599f';
import {crosswalkEnds} from './crosswalks.mjs?v=1448599f';

const cells = new Map(), asphalt = new Map();
export const fillets=[]; // A25 rounded kerb corners
const filletCells=new Map();
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
function addClipped(s,owner,sink=add) {
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
      sink({...s,x:s.x+s.dx*mid,z:s.z+s.dz*mid,half:(lo-start)/2});
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

// A25 OSM footways and pedestrian streets are drawn as flush stone paving. They are
// pedestrian space too: scooters treat their edge like a curb, walkers cross freely.
export const footways=[];
const footCells=new Map();
for(const [ax,ay,bx,by,w,edge] of roads){
  if(edge.way.kind!=='pedestrian'||edge.way.layer!==0||edge.d<1e-6)continue;
  const dx=(bx-ax)/edge.d,dz=(by-ay)/edge.d;
  addClipped({x:(ax+bx)*unit/2,z:(ay+by)*unit/2,dx,dz,nx:-dz,nz:dx,half:edge.d*unit/2,depth:w*unit,kind:'footway',rise:0},
    null,f=>{footways.push(f);register(footCells,f,6);});
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
// A25 round every kerb corner between two consecutive streets with a circular fillet
// (1.5–3 m, wider streets get the larger radius). The fan of triangles between the sharp
// corner and the arc is subtracted from each slab it touches; rendering, collision and
// surface queries all read the resulting polygons, and the cut area is drawn as asphalt.
function slabPolygon(s){
  return [[-s.half,0],[s.half,0],[s.half,s.depth],[-s.half,s.depth]].map(([t,d])=>{
    const p=pavingPoint(s,t,d);return [p.x,0,p.z];
  });
}
const inTriangle=(x,z,[a,b,c])=>{
  const d1=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]),d2=(c[0]-b[0])*(z-b[1])-(c[1]-b[1])*(x-b[0]),
    d3=(a[0]-c[0])*(z-c[1])-(a[1]-c[1])*(x-c[0]);
  return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));
};
export let skippedFillets=0;
function buildFillets(){
  const arms=new Map();
  for(const r of ways){
    const {edge}=r;
    for(const [node,sign] of [[edge.a,1],[edge.b,-1]]){
      if(!arms.has(node))arms.set(node,[]);
      arms.get(node).push({r,ux:r.dx*sign,uz:r.dz*sign,h:r.depth/2,length:r.half*2});
    }
  }
  for(const [index,list] of arms){
    if(list.length<2)continue;
    const node=roadNodes[index],ox=node.x*unit,oz=node.y*unit;
    list.sort((a,b)=>Math.atan2(a.uz,a.ux)-Math.atan2(b.uz,b.ux));
    for(let i=0;i<list.length;i++){
      const A=list[i],B=list[(i+1)%list.length];
      if(A===B)continue;
      let phi=Math.atan2(B.uz,B.ux)-Math.atan2(A.uz,A.ux);
      if(phi<=0)phi+=Math.PI*2;
      if(phi<.35||phi>2.75)continue;
      // Normals pointing into the sector between A and B.
      const nA=[-A.uz,A.ux],nB=[B.uz,-B.ux];
      const meet=R=>{
        // ox + t*A.u + nA*(hA+R) = ox + s*B.u + nB*(hB+R)
        const rx=nB[0]*(B.h+R)-nA[0]*(A.h+R),rz=nB[1]*(B.h+R)-nA[1]*(A.h+R);
        const det=A.ux*(-B.uz)-A.uz*(-B.ux);
        if(Math.abs(det)<1e-6)return null;
        const t=(rx*(-B.uz)-rz*(-B.ux))/det,u=(A.ux*rz-A.uz*rx)/det;
        return {t,u,x:ox+A.ux*t+nA[0]*(A.h+R),z:oz+A.uz*t+nA[1]*(A.h+R)};
      };
      const corner=meet(0);
      if(!corner||corner.t<=0||corner.u<=0)continue;
      const shape=R=>{
        const centre=meet(R);
        if(!centre||centre.t<=0||centre.u<=0||centre.t>A.length*.9||centre.u>B.length*.9)return null;
        const a0=Math.atan2(-nA[1],-nA[0]),a1=Math.atan2(-nB[1],-nB[0]);
        let sweepAngle=a1-a0;
        while(sweepAngle>Math.PI)sweepAngle-=Math.PI*2;
        while(sweepAngle<-Math.PI)sweepAngle+=Math.PI*2;
        const steps=6,arc=[];
        for(let k=0;k<=steps;k++){
          const a=a0+sweepAngle*k/steps;
          arc.push([centre.x+Math.cos(a)*R,centre.z+Math.sin(a)*R]);
        }
        const triangles=[];
        for(let k=0;k<steps;k++)triangles.push([[corner.x,corner.z],arc[k],arc[k+1]]);
        return {centre,arc,triangles,R};
      };
      // Keep every crosswalk ramp's accessible landing: shrink the radius until no ramp probe is cut.
      const ramps=nearby(cells,corner.x,corner.z).filter(r=>r.kind==='ramp');
      const conflict=f=>ramps.some(r=>[0,.08,.4,.75,1.1,1.46].some(d=>{
        const x=r.x+r.nx*(d-r.depth/2),z=r.z+r.nz*(d-r.depth/2);
        return f.triangles.some(t=>inTriangle(x,z,t));
      }));
      let chosen=null,partial=false;
      const preferred=Math.max(1.5,Math.min(3,1.2+.14*Math.min(A.h,B.h)*2));
      for(let R=preferred;R>=1.5-1e-9;R-=.25){
        const f=shape(R);
        if(f&&!conflict(f)){chosen=f;break;}
      }
      // A crosswalk landing sits on the corner itself: round the kerb with 1.5 m and keep the ramp whole.
      if(!chosen){chosen=shape(1.5);partial=true;skippedFillets++;}
      if(!chosen)continue;
      const {centre,arc,triangles,R}=chosen;
      const fillet={x:corner.x,z:corner.z,cx:centre.x,cz:centre.z,R,arc,triangles,node:index,cut:[],partial,ramps};
      // Bounding radius for grid registration.
      fillet.reach=Math.max(...arc.map(([x,z])=>Math.hypot(x-corner.x,z-corner.z)))+.05;
      fillets.push(fillet);
    }
  }
  for(const f of fillets){
    const r=f.reach;
    for(let i=Math.floor((f.x-r)/cellSize);i<=Math.floor((f.x+r)/cellSize);i++)
      for(let j=Math.floor((f.z-r)/cellSize);j<=Math.floor((f.z+r)/cellSize);j++){
        const key=cellKey(i,j);
        if(!filletCells.has(key))filletCells.set(key,[]);
        filletCells.get(key).push(f);
      }
    const touched=new Set([...nearby(cells,f.x,f.z),...nearby(footCells,f.x,f.z)]);
    for(const slab of touched){
      if(f.partial&&slab.kind==='ramp')continue;
      let polys=slab.polys??[slabPolygon(slab)],changed=false;
      for(const tri of f.triangles){
        const next=polys.flatMap(poly=>{
          const pieces=subtractConvex(poly,tri);
          // Unchanged polygon: a single piece with the same vertex count and area.
          if(pieces.length===1&&pieces[0].length===poly.length&&pieces[0].every((p,i)=>p===poly[i]))return pieces;
          changed=true;return pieces;
        });
        polys=next;
      }
      if(!changed)continue;
      slab.polys=polys;
      (slab.fillets??=[]).push(f);
      f.cut.push(slab);
    }
  }
}
buildFillets();
// Inside a rounded kerb corner that was cut out of raised or footway paving.
export function filletAt(x,y){
  x*=unit;y*=unit;
  for(const f of filletCells.get(cellKey(Math.floor(x/cellSize),Math.floor(y/cellSize)))??[]){
    if(!f.cut.length||!f.triangles.some(t=>inTriangle(x,y,t)))continue;
    if(f.partial&&f.ramps.some(r=>Math.abs(along(r,x,y))<=r.half&&across(r,x,y)+r.depth/2>=0&&across(r,x,y)+r.depth/2<=r.depth))continue;
    return f;
  }
  return null;
}
const inPolygon=(x,z,poly)=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;
  }
  return inside;
};
export function pavingHeight(s,t,d){
  return roadLevel+s.rise*(s.kind==='ramp'?Math.max(0,Math.min(1,d/s.depth)):1);
}
// Render loops may supply a scratch result to query multiple contact points per actor.
export function surfaceAt(x,y,result){
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
    if(s.polys&&!s.polys.some(poly=>inPolygon(x,y,poly)))continue; // A25 rounded corners
    if(h>height){top=s;height=h;}
  }
  if(!ramp&&!top)return null;
  result??={};
  result.slab=ramp??top;
  result.height=ramp?rampHeight:height;
  return result;
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
export function curbContact(x,y,halfLength,halfWidth,heading,ramps=true){
  x*=unit;y*=unit;halfLength*=unit;halfWidth*=unit;
  const ux=Math.cos(heading),uz=Math.sin(heading);
  for(const s of [...nearby(cells,x,y),...nearby(footCells,x,y)]){ // A25 footways are pedestrian space
    if(!ramps&&s.kind==='ramp')continue; // A25 junction wedges: NPC lanes may clip a crosswalk landing
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
  return nearby(asphalt,x,y).some(r=>Math.abs(along(r,x,y))<=r.half+.01&&Math.abs(across(r,x,y))<=r.depth/2)||
    Boolean(filletAt(x/unit,y/unit)); // A25 rounded kerb corners are asphalt
}
// A25 point on an OSM footway strip (flush pedestrian paving).
export function footwayAt(x,y){
  x*=unit;y*=unit;
  return nearby(footCells,x,y).some(s=>Math.abs(along(s,x,y))<=s.half&&Math.abs(across(s,x,y))<=s.depth/2&&
    (!s.polys||s.polys.some(poly=>inPolygon(x,y,poly))));
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
