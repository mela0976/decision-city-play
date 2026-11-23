import {colliderRadius} from './collision.mjs?v=b0bdcee1';
import {metersPerUnit as unit,worldContact} from './world.mjs?v=b0bdcee1';

const specs={
  scooter:{mass:180,length:1.08,width:.40,height:.65},
  car:{mass:1800,length:2.48,width:.96,height:.86},
  bus:{mass:12000,length:5.43,width:1.27,height:1.60},
  truck:{mass:15000,length:2.94,width:1.07,height:1.55},
};
const limit=12;
// Both the fixture and renderer derive these coordinates from placeStreetLife.
export const parkedKey=(x,z)=>`${Math.round(x*100)}:${Math.round(z*100)}`;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const impactTarget=body=>body?.scooter||body?.type==='parked'?'scooter':
  body?.service==='bus'?'bus':body?.service&&body.service!=='taxi'?'truck':'car';

export function createImpact({contact=worldContact,avoidContact=contact}={}){ // A25 bypasses also respect kerbs
  const bodies=new Map(),parked=new Map(),missingParked=new Set(),bypasses=new WeakMap();
  function velocity(car){
    const p=bodies.get(car);
    if(p)return [p.vx,p.vy];
    if(car.trafficVX!==undefined)return [car.trafficVX*unit,car.trafficVY*unit];
    const speed=(car.speed??0)*unit;
    return [Math.cos(car.heading)*speed,Math.sin(car.heading)*speed];
  }

  function transfer(source,target,vx,vy,mass,{playerSpeed}={}){
    if(source===target||target.impact?.settled)return null;
    const kind=impactTarget(target),spec=specs[kind],heavy=spec.mass>=12000;
    const [tx,ty]=velocity(target);
    let dx=target.x-source.x,dy=target.y-source.y;
    const separation=Math.hypot(dx,dy);
    if(separation>.001){dx/=separation;dy/=separation;}
    else {const angle=Math.atan2(vy-ty,vx-tx);dx=Math.cos(angle);dy=Math.sin(angle);}
    const closing=(vx-tx)*dx+(vy-ty)*dy;
    const minimum=kind==='scooter'?.18:playerSpeed===undefined?1.35:.18;
    if(closing<minimum||(kind!=='scooter'&&playerSpeed!==undefined&&playerSpeed<25/3.6))return null;
    const launched=kind==='car'&&(playerSpeed??closing)>=45/3.6&&closing>=4;
    let p=bodies.get(target);
    if(!p){
      if(bodies.size>=limit)return null;
      p={spec,vx:tx,vy:ty,vz:0,air:0,pitch:0,roll:0,wx:0,wy:0,wz:0,settled:false,
        center:spec.height,age:0,launch:false,side:1};
      bodies.set(target,p);
      target.impact=p;
    }
    // Restitution and reduced mass determine impulse. Arcade gain makes a
    // passenger car visibly react to a much lighter rider.
    const impulse=1.35*closing/(1/mass+1/spec.mass);
    const kick=impulse/spec.mass;
    const side=Math.sin(Math.atan2(dy,dx)-target.heading);
    p.side=Math.sign(side)||1;
    p.vx+=dx*kick*(heavy?1.7:kind==='car'?3.8:1);
    p.vy+=dy*kick*(heavy?1.7:kind==='car'?3.8:1);
    p.wy+=p.side*clamp(kick*.64,.32,2.9);
    p.wx+=p.side*(launched?4.4:kind==='scooter'?5:.36);
    p.wz+=(Math.cos(target.heading)*dx+Math.sin(target.heading)*dy)*(launched?1.05:.13);
    p.launch||=launched;
    p.age=0;
    if(launched)p.vz=Math.max(p.vz,clamp(6.1+kick*.76,6.5,10));
    return {target:kind,launched,response:heavy?-.32:kind==='scooter'?.85:.68};
  }

  function strike(source,body,vx,vy){
    const speed=Math.hypot(vx,vy)*unit;
    let target=body;
    if(body.type==='parked'){
      if(missingParked.has(parkedKey(body.x*unit,body.y*unit)))return null;
      target={...body,scooter:true,parked:true,original:body,color:'#788b91',speed:0};
    }
    const result=transfer(source,target,vx*unit,vy*unit,source.mode==='car'?specs.car.mass:specs.scooter.mass,{playerSpeed:speed}); // A26
    if(result&&target!==body){
      parked.set(body,target);
      missingParked.add(parkedKey(body.x*unit,body.y*unit));
    }
    return result;
  }

  function extents(p,roll=p.roll,pitch=p.pitch){
    const {length,width,height}=p.spec;
    const cr=Math.abs(Math.cos(roll)),sr=Math.abs(Math.sin(roll));
    const cp=Math.abs(Math.cos(pitch)),sp=Math.abs(Math.sin(pitch));
    return {
      a:length*cp+height*sp,
      b:length*sr*sp+height*sr*cp+width*cr,
      vertical:length*cr*sp+height*cr*cp+width*sr,
    };
  }

  function blocked(p,x,y,heading,roll,pitch){
    const {a,b}=extents(p,roll,pitch);
    return contact(x,y,a/unit,b/unit,heading);
  }

  function step(car,p,dt,index,moveCollider){
    const x=car.x,y=car.y,heading=car.heading;
    const nx=x+p.vx/unit*dt,ny=y+p.vy/unit*dt;
    const angle=heading+p.wy*dt;
    const tip=p.launch||car.scooter;
    const goal=tip?p.side*Math.PI/2:0;
    const grounded=p.air<=0&&p.vz<=0;
    const restoring=grounded||!p.launch;
    if(restoring){
      const nearest=goal+Math.round((p.roll-goal)/(2*Math.PI))*2*Math.PI;
      p.wx+=(nearest-p.roll)*dt*(tip?22:36);
      p.wz-=p.pitch*dt*40;
    }
    const roll=p.roll+p.wx*dt,pitch=p.pitch+p.wz*dt;
    if(!blocked(p,nx,ny,angle,roll,pitch)){
      const hit=index?.(nx,ny,colliderRadius(car),car,p,angle);
      if(hit&&hit.kind==='vehicle'){
        const result=transfer(car,hit.body,p.vx,p.vy,p.spec.mass);
        const loss=result?(p.spec.mass/(p.spec.mass+specs[result.target].mass))*.82:-.42;
        p.vx*=loss;
        p.vy*=loss;
      }else if(!hit){
        Object.assign(car,{x:nx,y:ny,heading:angle});
        Object.assign(p,{roll,pitch});
        moveCollider?.(car);
      }else{
        p.vx*=-.36;
        p.vy*=-.36;
      }
    }else{
      const hitX=blocked(p,nx,y,heading,p.roll,p.pitch);
      const hitY=blocked(p,x,ny,heading,p.roll,p.pitch);
      p.vx*=hitX||!hitY?-.44:.8;
      p.vy*=hitY||!hitX?-.44:.8;
      p.wy*=-.38;
      p.wx*=.72;
      p.wz*=.72;
    }
    if(p.air>0||p.vz>0){
      p.vz-=9.81*dt;
      p.air+=p.vz*dt;
      if(p.air<=0){
        p.air=0;
        p.vz=p.vz<-1.65?-p.vz*.32:0;
        p.vx*=.65;p.vy*=.65;
      }
    }
    const drag=Math.exp(-dt*(p.air>0?.15:tip?2.4:2.8));
    p.vx*=drag;p.vy*=drag;
    const angular=Math.exp(-dt*(restoring?4.1:.33));
    p.wx*=angular;p.wz*=angular;p.wy*=drag;
    p.center=extents(p).vertical+p.air;
    p.age+=dt;
    if(p.age>1.45&&p.air===0&&p.vz===0&&Math.hypot(p.vx,p.vy,p.wx,p.wy,p.wz)<.18){
      p.settled=true;
      p.vx=p.vy=p.wx=p.wy=p.wz=0;
      p.age=0;
    }
  }

  function avoid(car,dt,space,{target=car.end,guard=()=>true,manual=false}={}){
    if(!bodies.size||!target||dt<=0)return false;
    const r=manual?1.03/unit:colliderRadius(car),existing=bypasses.get(car);
    const angle=existing?.angle??Math.atan2(target.y-car.y,target.x-car.x);
    const ux=Math.cos(angle),uy=Math.sin(angle);
    const width=(manual||car.scooter?.37:car.service==='bus'?1.25:1.03)/unit;
    const legal=(x,y,heading)=>guard(x,y,r,width,heading)&&!avoidContact(x,y,r,width,heading)&&
      !space.hit(x,y,r,{...car,heading,ignore:car});
    let route=existing;
    if(route&&!route.body.impact){
      bypasses.delete(car);
      route=null;
    }
    if(!route){
      let wreck;
      for(const [body,p] of bodies){
        if(p.air>=1)continue;
        const dx=body.x-car.x,dy=body.y-car.y;
        const ahead=dx*ux+dy*uy,side=dy*ux-dx*uy,reach=colliderRadius(body);
        if(ahead>0&&ahead<r+reach+11/unit&&Math.abs(side)<reach+width){
          // Confirm the wreck actually intersects the forward lane.
          const probe=space.hit(car.x+ux*ahead,car.y+uy*ahead,r,car);
          if(probe?.body===body||probe?.body?.body===body){wreck={body,ahead,side};break;}
        }
      }
      if(!wreck)return false;
      plan: for(const side of [wreck.side>=0?-1:1,wreck.side>=0?1:-1])for(const extra of [0,1,2]){
        const spec=wreck.body.impact.spec;
        const relative=wreck.body.heading-angle;
        const lateral=(Math.abs(Math.sin(relative))*spec.length+Math.abs(Math.cos(relative))*spec.width)/unit;
        const offset=wreck.side+side*(lateral+width+(.74+extra)/unit);
        const entry=Math.min(wreck.ahead*.3,2/unit);
        const x=car.x-uy*offset+ux*entry,y=car.y+ux*offset+uy*entry;
        const forward=wreck.ahead+colliderRadius(wreck.body)+r;
        const points=[{x,y},{x:x+ux*forward,y:y+uy*forward},
          {x:car.x+ux*(entry+forward+2.5/unit),y:car.y+uy*(entry+forward+2.5/unit)}];
        let from=car;
        if(points.every(point=>{
          const dx=point.x-from.x,dy=point.y-from.y,heading=Math.atan2(dy,dx);
          const count=Math.ceil(Math.hypot(dx,dy)/(0.5/unit));
          for(let i=1;i<=count;i++)if(!legal(from.x+dx*i/count,from.y+dy*i/count,heading))return false;
          from=point;
          return true;
        })){
          route={body:wreck.body,points,angle,speed:Math.max(car.speed,3.6/unit)};
          bypasses.set(car,route);
          break plan;
        }
      }
    }
    if(!route)return false;
    const point=route.points[0],dx=point.x-car.x,dy=point.y-car.y,len=Math.hypot(dx,dy);
    if(len>.05){
      const heading=Math.atan2(dy,dx);
      const cruise=car.cruise||12/unit;
      const cap=Math.min(10.5/unit,cruise);
      route.speed=Math.min(cap,route.speed+4.5/unit*dt);
      const ratio=Math.min(1,route.speed*dt/len);
      const x=car.x+dx*ratio,y=car.y+dy*ratio;
      if(!legal(x,y,heading)||!legal((x+car.x)/2,(y+car.y)/2,heading)){
        bypasses.delete(car);return false;
      }
      Object.assign(car,{x,y,heading,speed:route.speed,stuck:0});
    }else{
      route.points.shift();
      if(!route.points.length)bypasses.delete(car);
    }
    return true;
  }

  return {
    strike,avoid,
    hasWrecks:()=>bodies.size>0,
    cancelAvoid:car=>bypasses.delete(car),
    advance(dt,{hit,moveCollider}={}){
      const count=Math.max(1,Math.ceil(dt/(1/120)));
      for(const [car,p] of bodies){
        if(p.settled){p.age+=dt;continue;}
        for(let i=0;i<count&&!p.settled;i++)step(car,p,dt/count,hit,moveCollider);
      }
    },
    // Physics owns parked copies after contact. Originals remain suppressed
    // after off-screen retirement so an overturned scooter cannot pop back.
    parked,missingParked,
    parkedVehicles:()=>parked.values(),
    skipFixture:fixture=>fixture.type==='parked'&&missingParked.has(parkedKey(fixture.x*unit,fixture.y*unit)),
    retire(car,outsideView){
      const p=bodies.get(car);
      if(!p?.settled||p.age<8||!outsideView)return false;
      bodies.delete(car);
      if(car.parked){
        car.hidden=true;
        parked.delete(car.original);
      }
      delete car.impact;
      return true;
    },
    // Local-map units, with the original vehicle available to an occupancy
    // or avoidance consumer. Only grounded wrecks block single-lane traffic.
    obstacles(){
      return [...bodies.keys()].filter(car=>car.impact.air<1).map(body=>({
        x:body.x,y:body.y,r:colliderRadius(body),heading:body.heading,body,
        settled:body.impact.settled,
      }));
    },
  };
}
