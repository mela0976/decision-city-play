// OSM curb poses on Songzhi Rd and Tonghua St, in the simulation's map units.
// The photo points are 2.5 m farther towards the sidewalk, clear of fixtures.
const curbPoses=[
  [13011.60,19957.35,-1.55260,13035.41,19957.78],
  [1951.91,29044.81,1.84974,1929.02,29038.26],
  [1903.73,29213.04,1.84974,1880.84,29206.49],
];

export function createFeaturedTraffic(){
  const parked=curbPoses.map(([x,y,heading,photoX,photoY],style)=>({
    id:'curb-wrap-'+style,x,y,heading,photoX,photoY,featuredStyle:style,scooter:false,speed:0,
    hidden:true,color:['#455cab','#187a79','#983b62'][style],
  }));
  let nextArrival=0,arrival=0;
  return {
    parked,
    photoWalkers(unit){
      return parked.map(car=>{
        const path={x:car.photoX,y:car.photoY,dx:3*Math.cos(car.heading)/unit,dy:3*Math.sin(car.heading)/unit};
        return {x:path.x,y:path.y,path,phase:car.featuredStyle,skin:'npc_student',heading:car.heading};
      });
    },
    dressArrival(car,clock){
      if(clock<nextArrival||car.scooter||car.service)return;
      car.featuredStyle=arrival%3;
      nextArrival=clock+[147,172,132][arrival++%3];
    },
    indexParked(state,space,staticSpace,radius,impact,outsideView){
      const night=state.time>=18||state.time<5.5;
      for(const car of parked){
        if(car.impact){
          if(impact.retire(car,outsideView(car)))car.hidden=car.retired=true;
          else if(car.impact.air<1)car.collider=space.put(car,radius.car,'vehicle');
          continue;
        }
        if(car.retired){car.hidden=true;continue;}
        if(!night){car.hidden=true;continue;}
        if(car.hidden&&(space.hit(car.x,car.y,radius.car,car)||staticSpace.hit(car.x,car.y,radius.car,car)||
          state.cars.some(other=>Math.hypot(other.x-car.x,other.y-car.y)<radius.car*2)))continue;
        car.hidden=false;
        car.collider=space.put(car,radius.car,'vehicle');
      }
    },
    approach(state,unit){
      if(state.clock<nextArrival)return;
      // Dense queues can have no new admissions for minutes. Reuse an ordinary
      // approaching car outside the view so a visible livery never changes.
      let candidate=null,best=Infinity;
      for(const car of state.cars){
        if(car.featuredStyle!=null||car.scooter||car.service||car.impact||car.hidden)continue;
        const dx=state.player.x-car.x,dy=state.player.y-car.y;
        const gap=Math.hypot(dx,dy)*unit;
        if(gap<30||state.inActorView?.(car,true))continue;
        const approaching=dx*Math.cos(car.heading)+dy*Math.sin(car.heading)>0;
        const score=gap+(approaching?0:150);
        if(score<best){candidate=car;best=score;}
      }
      if(candidate)this.dressArrival(candidate,state.clock);
    },
    photoTarget(walker,clock,unit){
      // Phase is tied to the car so people go back to their routes between shots.
      for(const car of parked){
        if(car.hidden||car.impact||(clock+[11,22,2][car.featuredStyle])%43>12)continue;
        if(Math.hypot(walker.x-car.photoX,walker.y-car.photoY)*unit<5)
          return car;
      }
      return null;
    },
  };
}
