// Night vendors line the pedestrian-only section of the mapped Linjiang Street.
import {byId,civicWalkway,metersPerUnit as unit,random,roadAt,roadDistance,roads,worldContact} from './world.mjs?v=3b36a303';

export const nightMarketOpen=hour=>hour>=18||hour<5;
export const marketCarts=[];
// The existing market service truck is parked across the third-person camera arm.
const site=byId.get('night_market'),angle=site.viewHeading;
export const marketTruck={
  x:site.x+(-3.8*Math.sin(angle)+.95*Math.cos(angle))/unit,
  y:site.y+(3.8*Math.cos(angle)+.95*Math.sin(angle))/unit,
  heading:angle-Math.PI/2,r:2.34/unit,width:1.03/unit,top:2.16,type:'fixture'
};
export const marketColliders=[marketTruck];
for(const [ax,az,bx,bz,width,edge] of roads){
  if(edge.way.name!=='臨江街'||edge.way.kind!=='pedestrian'||edge.way.layer!==0)continue;
  const length=edge.d*unit, dx=(bx-ax)/edge.d, dz=(bz-az)/edge.d;
  for(let along=5;along<length-3;along+=9){
    for(const side of [-1,1]){
      const distance=along+(side>0?2:0), lateral=side*(width*unit/2+.66);
      const x=ax*unit+dx*distance-dz*lateral, z=az*unit+dz*distance+dx*lateral;
      const heading=Math.atan2(dz,dx);
      const prop=(px,pz,r,w,top)=>({x:px/unit,y:pz/unit,r:r/unit,width:w/unit,heading,top,type:'fixture'});
      const cart=prop(x,z,1.14,.59,2.4);
      const stool=prop(x+dx*1.65,z+dz*1.65,.21,.21,.49);
      const clear=p=>!worldContact(p.x,p.y,p.r,p.width,heading)&&!roads.some(r=>
        r[5].way.layer===0&&r[5].way.kind!=='pedestrian'&&
        Math.abs((r[0]+r[2])/2-p.x)<r[5].d/2+80&&Math.abs((r[1]+r[3])/2-p.y)<r[5].d/2+80&&
        roadDistance(p.x,p.y,r)<r[4]/2+Math.hypot(p.r,p.width));
      if(!clear(cart)||!clear(stool))continue;
      marketCarts.push({x,z,dx,dz,side,heading});
      marketColliders.push(cart,stool);
    }
  }
}

// The OSM civic walkway is a plaza, so the road-derived sidewalk sampler has no paths here.
// Supply candidates only; the actor system owns the count, movement, admission and collisions.
const plazaRoutes=[];
for(let z=civicWalkway.y0*unit+6,i=0;z<civicWalkway.y1*unit-7;z+=3.9,i++){
  const side=i%2?1:-1,x=civicWalkway.x*unit+side*(.55+random(i+9)*1.69);
  const dx=side*.25,dy=(3.2+random(i+17)*1.6)*(i%3?1:-1),phase=random(i+41)*6.28;
  if([0,.5,1].some(t=>worldContact((x+dx*t)/unit,(z+dy*t)/unit,.36/unit)||
    roadAt((x+dx*t)/unit,(z+dy*t)/unit,-.36/unit)))continue;
  const path={x:x/unit,y:z/unit,dx:dx/unit,dy:dy/unit};
  plazaRoutes.push({path,phase,heading:Math.atan2(dy,dx),localId:'evening:plaza:'+i,
    skin:['npc_student','npc_colleague','npc_vendor','creative','npc_elder'][i%5]});
}
export function eveningPlazaWalks(player){
  if(Math.abs(player.x-civicWalkway.x)*unit>52||
    player.y<civicWalkway.y0-50/unit||player.y>civicWalkway.y1+50/unit)return [];
  const paths=[];
  for(const person of plazaRoutes){
    const {path,phase}=person,t=.5+.46*Math.sin(phase);
    const x=path.x+path.dx*t,y=path.y+path.dy*t,dx=x-player.x,dy=y-player.y,r=Math.hypot(dx,dy)*unit;
    if(r<9||r>78)continue;
    const ahead=dx*Math.cos(player.heading)+dy*Math.sin(player.heading);
    paths.push({walker:{...person,x,y},priority:Math.abs(r-23)+(ahead<0?70:0)});
  }
  return paths;
}
