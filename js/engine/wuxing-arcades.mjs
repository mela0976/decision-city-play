// A23 alleys. Distances in metres. The same street-facing bays supply the roof, posts and fixture colliders.
import {buildings,inWuxing,locations,metersPerUnit as unit,random,roadAt,inBuilding} from './world.mjs?v=1dff2833';
import {urbanInfill} from './infill.mjs?v=1dff2833';

let cached;
export function wuxingArcades(){ // A24 shared arcade deck footprints
  if(cached)return cached;
  const bays=[];
  function frontage(x,z,dx,dz,nx,nz,length,seed){
    if(length<2.8)return;
    const count=Math.max(1,Math.round(length/4.5)),span=length/count;
    for(let i=0;i<count;i++){
      const cx=x+dx*(i+.5)*span,cz=z+dz*(i+.5)*span;
      // A facade must face an actual road. Probe both ends so the roof stops short of a crossing.
      let depth=6,facesRoad=false;
      for(const along of [-.49,0,.49]){
        const bx=cx+dx*along*span,bz=cz+dz*along*span;
        for(let d=.25;d<=8;d+=.25){
          const px=(bx+nx*d)/unit,py=(bz+nz*d)/unit;
          if(inBuilding(px,py)){depth=Math.min(depth,d-.25);break;}
          if(roadAt(px,py,-.3/unit)){depth=Math.min(depth,d-.25);facesRoad=true;break;}
        }
      }
      if(!facesRoad||depth<1.15)continue;
      const nearEntrance=locations.some(site=>Math.hypot(site.x*unit-cx,site.y*unit-cz)<depth+9);
      bays.push({cx,cz,dx,dz,nx,nz,span,depth:Math.min(depth,4.8),seed:seed+17*i,nearEntrance});
    }
  }
  for(const b of buildings){
    if(!inWuxing(b.x+b.w/2,b.y+b.h/2)||!b.residential||b.elevation<4)continue;
    const points=b.polygon;
    const winding=Math.sign(points.reduce((sum,p,i)=>{
      const q=points[(i+1)%points.length];
      return sum+p.x*q.y-p.y*q.x;
    },0));
    for(let i=0;i<points.length;i++){
      const a=points[i],end=points[(i+1)%points.length],length=Math.hypot(end.x-a.x,end.y-a.y);
      if(length*unit<2.8)continue;
      const dx=(end.x-a.x)/length,dz=(end.y-a.y)/length;
      frontage(a.x*unit,a.y*unit,dx,dz,dz*winding,-dx*winding,length*unit,b.osmId+31*i);
    }
  }
  for(const p of urbanInfill()){
    if(!p.street||!inWuxing(p.x/unit,p.z/unit))continue;
    const dx=Math.cos(p.heading),dz=Math.sin(p.heading),nx=-dz*p.streetSide,nz=dx*p.streetSide;
    frontage(p.x+nx*p.depth/2-dx*p.width/2,p.z+nz*p.depth/2-dz*p.width/2,
      dx,dz,nx,nz,p.width,Math.round(p.x*31+p.z));
  }
  return cached=bays;
}

export function visitWuxingArcades(instance,solid=()=>{}){
  for(const {cx,cz,dx,dz,nx,nz,span,depth,seed,nearEntrance} of wuxingArcades()){
    const turn=-Math.atan2(dz,dx),ledge=depth-.22;
    const tint=random(seed)>.54?'#a69b84':'#b5b1a0';
    instance('concrete','box',tint,cx+nx*depth/2,3.47,cz+nz*depth/2,span,.22,depth,turn);
    if(nearEntrance)continue;
    const px=cx+dx*(span/2-.23)+nx*ledge,pz=cz+dz*(span/2-.23)+nz*ledge;
    instance('concrete','box',tint,px,1.68,pz,.32,3.36,.32,turn);
    solid(px,pz,.16,.16,-turn,'arcade-post');
    if(depth<2.1||random(seed+9)>.24)continue;
    const x=px-dx*.52,z=pz-dz*.52;
    instance('concrete','cylinder','#92634b',x,.24,z,.44,.48,.44);
    instance('concrete','crown','#566d48',x,.58,z,.51,.46,.47,turn);
    solid(x,z,.25,.24,-turn,'planter');
  }
}
