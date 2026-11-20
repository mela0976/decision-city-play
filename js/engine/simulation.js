import {fixtureColliders} from './fixtures.mjs';
import {streetCrowds} from './crowds.mjs';
import {occupancy,radius,colliderRadius,sweep} from './collision.mjs';
import {crossings} from './street-crossings.mjs';
import { blocked, byId, inBuilding, worldContact, toWorld, locations, metersPerUnit, nearestOnRoad, roadAt, random, scooterSpeed,roadNodes,roadOptions,roads } from './world.mjs';
import {planRide,aroundObstacle,rightLane,trafficGreen,rideLength,rideCruiseSpeed,ridePace,estimateRideDuration} from './navigation.js';
import { touchControls } from './overlay.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function corridorDistance(body,passage){
  let best=Infinity;
  for(const span of passage.spans)best=Math.min(best,nearestOnRoad(body.x,body.y,span).d);
  return best;
}
const keysForMove = new Map([
  ['ArrowUp',[0,-1]],['KeyW',[0,-1]],['ArrowDown',[0,1]],['KeyS',[0,1]],
  ['ArrowLeft',[-1,0]],['KeyA',[-1,0]],['ArrowRight',[1,0]],['KeyD',[1,0]],
]);
const actionKeys=new Set(['KeyF','KeyE','Enter','Space','KeyM','KeyG']);
const locationRadius=84;
const nearest=(list,n)=>list.reduce((a,b)=>Math.abs(a-n)<Math.abs(b-n)?a:b);
const carColors=['#9db4be','#f0d092','#d26f67','#7cbca9','#e7dfc8','#9097be'];

function serviceRoadWidth(car){
  if(car.service==='bus')return 8.5/metersPerUnit;
  if(car.service==='waste'||car.service==='recycling')return 6.4/metersPerUnit;
  if(car.service==='delivery')return 5.7/metersPerUnit;
  return 0;
}
function driveSegment(car,edge) {
  const start=roadNodes[car.node],end=roadNodes[edge.to],lane=rightLane(start,end,edge.w,car.scooter);
  car.laneWidth=edge.w;
  car.previous=car.node;
  car.node=edge.to;
  car.end={x:end.x+lane.x,y:end.y+lane.y};
  return {x:start.x+lane.x,y:start.y+lane.y};
}
function buildTraffic() {
  const roadEdges=roads.filter(r=>r[4]>35 && r[5].d>75 && r[5].way.kind!=='pedestrian'&&r[5].way.layer===0);
  const business=byId.get('mrt');
  const rushHour=roadEdges.filter(r=>r[4]>66&&r[5].way.name&&
    Math.hypot(r[0]-business.x,r[1]-business.y)<710/metersPerUnit);
  return Array.from({length:1180},(_,i)=>{
    const candidates=i%3===0&&rushHour.length?rushHour:roadEdges;
    const e=candidates[Math.floor(random(i+872)*candidates.length)][5];
    const flip=e.reverse&&(!e.forward||i%2===0);
    const node=flip?e.b:e.a;
    const scooter=i%9!==0;
    const service=scooter?null:i%63===0?'waste':i%81===0?'recycling':i%45===0?'bus':i%36===0?'delivery':i%27===0?'taxi':null;
    const car={id:i,node,x:0,y:0,heading:0,color:service==='taxi'?'#e3b542':carColors[i%carColors.length],
      speed:42+random(i+30)*41,scooter,service};
    const a=driveSegment(car,{to:flip?e.a:e.b,w:e.w}),t=random(i+926);
    car.heading=Math.atan2(car.end.y-a.y,car.end.x-a.x);
    car.x=a.x+(car.end.x-a.x)*t;
    car.y=a.y+(car.end.y-a.y)*t;
    return car;
  });
}
function nearbyStreetTraffic(player){
  const result=[];
  const dx=Math.cos(player.heading),dy=Math.sin(player.heading);
  for(const [index,[ax,ay,bx,by,w,edge]] of roads.entries()){
    if(!edge.way.name||edge.way.kind==='pedestrian'||edge.way.layer!==0||edge.d*metersPerUnit<9||
      Math.hypot((ax+bx)/2-player.x,(ay+by)/2-player.y)>130/metersPerUnit)continue;
    for(const [node,to,permitted] of [[edge.a,edge.b,edge.forward],[edge.b,edge.a,edge.reverse]]){
      if(!permitted)continue;
      for(let variant=0;variant<(edge.d*metersPerUnit>=30?2:1);variant++){
        const scooter=(index+variant)%3!==0;
        const car={id:'local-'+index+'-'+node+'-'+variant,node,x:0,y:0,heading:0,
          scooter,service:null,color:carColors[(index+variant)%carColors.length],speed:48+random(index+variant)*21};
        const entry=driveSegment(car,{to,w}),t=variant===0?.35:.67;
        car.x=entry.x+(car.end.x-entry.x)*t;car.y=entry.y+(car.end.y-entry.y)*t;
        car.heading=Math.atan2(car.end.y-entry.y,car.end.x-entry.x);
        const r=Math.hypot(car.x-player.x,car.y-player.y)*metersPerUnit;
        if(r<8||r>110)continue;
        const ahead=(car.x-player.x)*dx+(car.y-player.y)*dy;
        result.push({car,score:Math.abs(r-22)+(ahead<0?75:0)});
      }
    }
  }
  return result.sort((a,b)=>a.score-b.score).slice(0,95).map(item=>item.car);
}
function nearbySidewalks(player){
  const paths=[];
  for(const [index,[ax,ay,bx,by,w,edge]] of roads.entries()){
    const length=edge.d*metersPerUnit;
    if(!edge.way.name||edge.way.layer!==0||length<9||Math.hypot((ax+bx)/2-player.x,(ay+by)/2-player.y)>105/metersPerUnit)continue;
    const ux=(bx-ax)/edge.d,uy=(by-ay)/edge.d,heading=Math.atan2(uy,ux);
    for(const side of [-1,1]){
      const offset=side*(w*.5+1.02/metersPerUnit);
      const x=ax+(bx-ax)*.18-uy*offset,y=ay+(by-ay)*.18+ux*offset;
      const dx=(bx-ax)*.64,dy=(by-ay)*.64,phase=(index%23)*1.83;
      const path={x,y,dx,dy},t=.5+.46*Math.sin(phase);
      const px=x+dx*t,py=y+dy*t,r=Math.hypot(px-player.x,py-player.y)*metersPerUnit;
      if(r<11||r>85||[0,.5,1].some(q=>worldContact(x+dx*q,y+dy*q,.26/metersPerUnit)||
        roadAt(x+dx*q,y+dy*q,.16/metersPerUnit)))continue;
      const forward=(px-player.x)*Math.cos(player.heading)+(py-player.y)*Math.sin(player.heading);
      paths.push({walker:{x:px,y:py,path,heading,phase,localId:index+':'+side,skin:['npc_student','npc_colleague','npc_boss','npc_vendor'][index%4]},
        priority:Math.abs(r-26)+(forward<0?70:0)});
    }
  }
  return paths.sort((a,b)=>a.priority-b.priority).map(entry=>entry.walker);
}
function buildSignalQueues(){
  const key=(x,y)=>x.toFixed(1)+','+y.toFixed(1);
  const atSignal=new Set(crossings.map(c=>key(c.x,c.y))),seen=new Set(),queues=[];
  for(const [,,, ,w,e] of roads){
    if(w*metersPerUnit<7.5||e.d*metersPerUnit<27||e.way.layer!==0)continue;
    for(const [origin,end,allowed] of [[e.a,e.b,e.forward],[e.b,e.a,e.reverse]]){
      if(!allowed)continue;
      const node=roadNodes[end],a=roadNodes[origin];
      if(!atSignal.has(key(node.x,node.y)))continue;
      const heading=Math.atan2(node.y-a.y,node.x-a.x);
      const approach=end+':'+Math.round(heading/(Math.PI/5));
      if(seen.has(approach))continue;
      seen.add(approach);
      for(let j=0;j<8;j++){
        const scooter=j<5,lane=rightLane(a,node,w,scooter);
        const distance=(scooter?8.3+j*2.9:12.9+(j-5)*6.5)/metersPerUnit;
        if(distance+15>=e.d)continue;
        const x=node.x+lane.x-Math.cos(heading)*distance,y=node.y+lane.y-Math.sin(heading)*distance;
        queues.push({id:'q'+queues.length,previous:origin,node:end,laneWidth:w,x,y,heading,scooter,
          end:{x:node.x+lane.x,y:node.y+lane.y},speed:scooter?59:49,
          service:!scooter&&j===2?'taxi':null,color:!scooter&&j===2?'#e3b542':carColors[j%carColors.length]});
      }
    }
  }
  return queues;
}
function advanceCar(car,dt,player,clock,space,passage) {
  const {x,y}=car.end,heading=Math.atan2(y-car.y,x-car.x);
  const aheadX=player.x-car.x,aheadY=player.y-car.y;
  const ahead=aheadX*Math.cos(heading)+aheadY*Math.sin(heading);
  const across=aheadX*Math.sin(heading)-aheadY*Math.cos(heading);
  const yielding=player.skin==='grandma'&&ahead>0&&ahead<124&&Math.abs(across)<37;
  const junction=roadNodes[car.node],gap=Math.hypot(x-car.x,y-car.y);
  const red=junction.out.length>2&&!trafficGreen(Math.abs(Math.cos(heading))>.8,clock,junction.x,junction.y);
  const near=passage&&Math.hypot(car.x-passage.x,car.y-passage.y)<280;
  const inPassage=near&&(car===passage.blocker||corridorDistance(car,passage)<3.2/metersPerUnit);
  if(car.yieldMove&&car.yieldMove.until<=clock)car.yieldMove=null;
  if(car.yieldMove&&car.yieldMove.until>clock&&near){
    const clear=corridorDistance(car,passage);
    if(clear>=3.4/metersPerUnit)return;
    const step=dt*27,move=car.yieldMove;
    const x=car.x+step*move.dx,y=car.y+step*move.dy;
    if(!blocked(x,y,16)&&!space.hit(x,y,colliderRadius(car),car)){
      car.x=x;car.y=y;
      return;
    }
    car.yieldMove=null;
  }
  // Cars already occupying the player corridor keep advancing. Cars outside
  // it yield before entering, which stops new traffic from filling the gap.
  const waitLine=(car.scooter?7.6:9.1)/metersPerUnit;
  const travel=red&&gap>=waitLine?Math.min(car.speed*dt,gap-waitLine):car.speed*dt;
  const step=Math.min(gap,travel*(yielding?clamp((ahead-34)/90,0,1):1));
  const priorHeading=car.heading;
  car.heading=heading;
  const r=colliderRadius(car);
  if(inPassage&&passage.priority&&passage.blocker===car&&!car.yieldMove){
    car.heading=priorHeading;
    const base=corridorDistance(car,passage);
    let action=null,high=0;
    for(const offset of [Math.PI/2,-Math.PI/2,Math.PI*.32,-Math.PI*.32,Math.PI,0]){
      const angle=priorHeading+offset,dx=Math.cos(angle),dy=Math.sin(angle);
      const target={x:car.x+dx*34,y:car.y+dy*34};
      const end=sweep(car.x,car.y,target.x,target.y,(x,y)=>blocked(x,y,16)||space.hit(x,y,r,car));
      const gap=corridorDistance(end,passage)-base;
      if(gap>high&&distance(car,end)>10){high=gap;action={dx,dy,until:clock+3.1};}
    }
    if(action){car.yieldMove=action;return;}
    car.heading=heading;
  }
  if(inPassage&&passage.priority){
      const clearance=corridorDistance(car,passage);
      const ux=Math.cos(priorHeading),uy=Math.sin(priorHeading),step=dt*32;
      for(const [dx,dy] of [[-uy,ux],[uy,-ux],[-ux,-uy],[ux,uy]]){
        const ex=car.x+dx*step,ey=car.y+dy*step;
        const away=(ex-car.x)*(car.x-passage.x)+(ey-car.y)*(car.y-passage.y);
        if(!blocked(ex,ey,16)&&!space.hit(ex,ey,r,car)&&
          (corridorDistance({x:ex,y:ey},passage)>clearance+.005||away>.04)){
          car.heading=priorHeading;car.x=ex;car.y=ey;car.yieldMove={dx,dy,until:clock+3.1};return;
        }
      }
    }
  const nx=car.x+Math.cos(heading)*step,ny=car.y+Math.sin(heading)*step;
  if((near&&!inPassage&&corridorDistance({x:nx,y:ny},passage)<3/metersPerUnit)||
    worldContact(nx,ny,r,(car.scooter?.37:car.service?1.02:.95)/metersPerUnit,heading)||
    space.hit(car.x,car.y,r,car)||space.hit(nx,ny,r+2,car)){
    car.heading=priorHeading;
    return;
  }
  if(gap<=step) {
    car.x=x;car.y=y;
    const eligible=junction.out.filter(e=>e.w>=serviceRoadWidth(car));
    const choices=eligible.filter(e=>e.to!==car.previous);
    const pool=choices.length?choices:eligible;
    if(pool.length){
      const next=pool[Math.floor(random(clock+car.node*19)*pool.length)];
      const destination=roadNodes[next.to],turn=angleDiff(Math.atan2(destination.y-y,destination.x-x),heading);
      car.signal=Math.abs(turn)>.32&&Math.abs(turn)<2.75?Math.sign(turn):0;
      car.signalUntil=clock+1.15;
      driveSegment(car,next);
    }
  } else {
    car.x+=Math.cos(heading)*step;
    car.y+=Math.sin(heading)*step;
  }
}

export function createSimulation(canvas,draw,minimapCanvas) {
  const home=byId.get('home');
  const facing=id=>(byId.get(id)?.viewHeading??Math.PI/2)+Math.PI;
  const player={x:home.x,y:home.y,heading:facing('home'),speed:0,mode:'foot',skin:'ae',locationId:null};
  const camera={x:home.x,y:home.y-22,zoom:1};
  const pool=buildTraffic(),signalQueues=buildSignalQueues();
  const space=occupancy(),staticSpace=occupancy();
  const trafficSpace={hit(x,y,r,body){return space.hit(x,y,r,body)??staticSpace.hit(x,y,r,body);}};
  const fixtures=fixtureColliders();
  let staticRegistry;

  const options=new URLSearchParams(canvas.ownerDocument.defaultView?.location.search);
  const auditEnabled=options.has('collisionAudit'),rideDebug=auditEnabled||options.has('rideDebug');
  const audit={visibleDiscontinuities:0,visibleBirths:0,visibleRemovals:0,visibleJumps:0,frames:0,playerVehicle:0,playerPerson:0,playerStatic:0,carCar:0,personVehicle:0,camera:0,hiddenCars:0,hiddenPeople:0,blockedAutoFrames:0};
  const people=[];
  let streetTraffic=[],nextTrafficRefresh=0,nextPedestrianRefresh=0;
  const presentCars=new Set(),pendingWalkers=[];
  let previousView=new Map(),previousRoster=new Set(),previousAuditRevision=-1,priming=false;
  let trafficConfigured=false,trafficTarget=0,spawnCursor=0,waiting=0,nextReroute=0,nextNetworkReplan=0,rideWait=0;
  const congestion=[];
  for(const [i,[ax,ay,bx,by,w,{way,d}]] of roads.entries()){
    if(i%9!==0||d*metersPerUnit<12||(!way.name&&way.kind!=='pedestrian'))continue;
    const ux=(bx-ax)/d,uy=(by-ay)/d;
    const side=(i%2?-1:1)*(w*.5+.78/metersPerUnit);
    const x=ax+(bx-ax)*.23-uy*side,y=ay+(by-ay)*.23+ux*side;
    const dx=(bx-ax)*.54,dy=(by-ay)*.54;
    if([0,.25,.5,.75,1].some(t=>inBuilding(x+dx*t,y+dy*t)||roadAt(x+dx*t,y+dy*t,.30/metersPerUnit)))continue;
    people.push({x,y,dx,dy});
  }
  const keys=new Set();
  const listeners=new Map();
  const reached=new Map();
  const joy={x:0,y:0};
  const state={player,camera,joy,staticColliders:fixtures,npcs:[],markers:[],speech:new Map(),cars:[],walkers:[],target:null,
    time:17.35,viewRevision:0,weather:'clear',filter:'none',clock:0,shake:0,touch:matchMedia('(pointer: coarse)').matches,largeMap:false};
  let enabled=true,paused=false,running=false,frame=0,last=null,crashCooldown=0;
  let joystick=null,waypoint=null,density=.55,velocityX=0,velocityY=0,flight=null;
  let escapeAfter=0,rideAnchor=null,rideStarted=0;
  let route=null,cruise=0,rideRemaining=0,detour=null,blocker=null,manualUntil=0,inputMode='keyboard',context={action:null,targetId:null,targetName:null},resizer=null;
  function setInputMode(mode) {
    if(inputMode===mode) return;
    inputMode=mode;
    emit('input:mode',{mode});
  }
  function clearPose(x,y,mode,heading){
    const r=mode==='scooter'?radius.rider:radius.foot;
    const pose={mode,heading,ignore:player};
    return !worldContact(x,y,r,mode==='scooter'?.37/metersPerUnit:r,mode==='scooter'?heading:0)&&
      !trafficSpace.hit(x,y,r,pose)&&
      (staticRegistry===state.staticColliders||!state.staticColliders?.some(prop=>
        distance(prop,{x,y})<Math.min(prop.r,prop.width??prop.r)+r));
  }
  function legalNear(point,mode,heading,onRoad=false,limit=360){
    const legal=(x,y)=>clearPose(x,y,mode,heading)&&(!onRoad||roadAt(x,y));
    if(legal(point.x,point.y))return {x:point.x,y:point.y};
    for(let step=3;step<=limit;step+=3)for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,x=point.x+step*Math.cos(angle),y=point.y+step*Math.sin(angle);
      if(legal(x,y))return {x,y};
    }
    return null;
  }
  const ridingSpeed=()=>scooterSpeed*(player.skin==='grandma'?.4:1);
  function setRide(on,reason=on?'started':'cancelled') {
    if(on) {
      if(route || !state.target || distance(player,state.target)<2)return;
      const mount=legalNear(player,'scooter',player.heading,false,33);
      if(!mount)return;
      route=planRide(mount,state.target);
      if(!route?.length){route=null;return;}
      Object.assign(player,mount);
      rideRemaining=rideLength(player,route);
      cruise=rideCruiseSpeed(rideRemaining,ridingSpeed());
      rideStarted=state.clock;
      rideAnchor={goal:distance(player,state.target),time:state.clock};
      waiting=0;escapeAfter=0;nextReroute=0;nextNetworkReplan=0;rideWait=0;congestion.length=0;
      setMode('scooter');
    } else {
      if(!route)return;
      route=null;detour=null;blocker=null;
      state.rideBoost=0;
      velocityX=velocityY=0;
      player.speed=0;
    }
    emit('autoride:change',{on,reason});
  }
  const emit=(event,payload)=>{for (const handler of [...listeners.get(event)??[]]) handler(payload);};
  const refresh=()=>{if (running && !paused) draw(state);};
  function clearInput() {
    keys.clear();
    joy.x=0;
    joy.y=0;
    if (joystick!==null && canvas.hasPointerCapture(joystick)) canvas.releasePointerCapture(joystick);
    joystick=null;
  }
  function updateTarget() {
    const previous=state.target;
    state.target=byId.get(state.markers.find(m=>m.id===waypoint)?.locationId)??null;
    if(state.target!==previous && route) setRide(false);
  }
  function updateLocation() {
    const next=locations.find(location=>distance(location,player)<=locationRadius)?.id??null;
    if (next!==player.locationId) {
      const previous=player.locationId;
      player.locationId=next;
      reached.clear();
      if (previous) emit('location:leave',{locationId:previous});
      if (next) emit('location:enter',{locationId:next});
    }
    if (player.locationId!==next) return;
    for (const marker of state.markers) if (next===marker.locationId && reached.get(marker.id)!==next) {
      reached.set(marker.id,next);
      emit('marker:reach',{markerId:marker.id,locationId:next});
      if (player.locationId!==next) break;
    }
  }
  function sidewalkStand(){
    if(state.roadReturn||!player.locationId||!roadAt(player.x,player.y,-.22/metersPerUnit))return;
    const site=byId.get(player.locationId),a=site.viewHeading;
    const others=[...state.npcs,...streetCrowds,...state.walkers];
    for(const depth of [1,2,3,4,5,6,7,8])for(const side of [0,1.3,-1.3,2.6,-2.6,3.9,-3.9]){
      const x=site.x+(Math.cos(a)*depth+Math.sin(a)*side)/metersPerUnit;
      const y=site.y+(Math.sin(a)*depth-Math.cos(a)*side)/metersPerUnit;
      if(distance(player,{x,y})>9/metersPerUnit||roadAt(x,y,-.28/metersPerUnit)||inBuilding(x,y)||
        others.some(person=>distance(person,{x,y})<.9/metersPerUnit)||
        state.staticColliders?.some(prop=>distance(prop,{x,y})<prop.r+radius.foot))continue;
      return {x,y};
    }
  }
  function setMode(mode) {
    if(player.mode===mode)return;
    if(mode==='scooter'&&!clearPose(player.x,player.y,mode,player.heading))return;
    player.mode=mode;
    if(mode==='scooter')state.roadReturn=false;
    if (player.mode==='foot') {
      velocityX=0;
      velocityY=0;
      player.speed=0;
      state.standingPoint=sidewalkStand();
    }
    emit('mode:change',{mode:player.mode});
  }
  function updateContext() {
    let next={action:null,targetId:null,targetName:null}, gap=67;
    for (const npc of state.npcs) {
      const d=distance(player,npc);
      if(d<=gap){gap=d;next={action:'talk',targetId:npc.id,targetName:npc.name};}
    }
    if(!next.action) {
      const mark=state.markers.find(m=>m.locationId===player.locationId);
      if(mark) next={action:'enter',targetId:mark.id,targetName:mark.label??byId.get(mark.locationId).name};
    }
    if(next.action!==context.action || next.targetId!==context.targetId || next.targetName!==context.targetName) {
      context=next;
      emit('context:change',{...next});
    }
  }
  function interact() {
    updateContext();
    if(context.action) emit('interact',{kind:context.action==='talk'?'npc':'marker',id:context.targetId});
  }
  function resize() {
    const styles=canvas.ownerDocument.defaultView.getComputedStyle(canvas);
    state.insets=['top','right','bottom','left'].map(side=>parseFloat(styles.getPropertyValue('--dc-safe-'+side))||0);
    if(running) draw(state);
  }
  function mapClick(event) {
    if(!enabled || paused)return;
    if(event.pointerType==='touch') setInputMode('touch');
    toggleMap();
  }
  function toggleMap(){
    if(flight)return;
    state.largeMap=!state.largeMap;
    clearInput();
    refresh();
  }
  const actionKeysOnly=new Set(['KeyE','Space','Enter']);
  function finishFlight(){
    if(!flight)return;
    const {location,skipped,resolve}=flight;
    flight=null;
    state.flyover=null;
    emit('flyover:end',{locationId:location.id,skipped});
    resolve();
  }
  function beginFlightReturn(skipped){
    if(!flight||flight.returnAt!==null)return;
    flight.skipped=skipped;
    flight.returnAt=state.clock;
  }
  function updateFlight(){
    if(!flight)return;
    const elapsed=state.clock-flight.start;
    if(elapsed>=flight.seconds)beginFlightReturn(false);
    const retreat=flight.returnAt===null?0:Math.min(1,(state.clock-flight.returnAt)/.65);
    state.flyover={location:flight.location,angle:elapsed*.43,retreat};
    if(retreat===1)finishFlight();
  }
  let walkSelected=false;
  function keyDown(event) {
    const {code,target}=event;
    if ((!enabled&&!flight) || paused || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey ||
      target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target?.tagName??'') ||
      (!keysForMove.has(code) && !actionKeys.has(code))) return;
    event.preventDefault();
    setInputMode('keyboard');
    if(flight){
      if(actionKeysOnly.has(code))beginFlightReturn(true);
      return;
    }
    if(state.largeMap && code!=='KeyM')return;
    if (keysForMove.has(code)) {
      setRide(false);
      keys.add(code);
    }
    if (event.repeat) return;
    if (code==='KeyF') {
      manualUntil=state.clock+3;
      walkSelected=player.mode!=='foot';
      setMode(walkSelected?'foot':'scooter');
    }
    if (code==='KeyG') setRide(!route);
    if (code==='KeyE' || code==='Space' || code==='Enter') interact();
    if (code==='KeyM') toggleMap();
  }
  function keyUp(event) {keys.delete(event.code);}
  function setJoy(x,y,control) {
    const dx=x-control.x,dy=y-control.y;
    const divisor=Math.max(control.radius,Math.hypot(dx,dy));
    joy.x=dx/divisor;
    joy.y=dy/divisor;
  }
  function pointer(event) {
    if (event.pointerType!=='touch' || (!enabled&&!flight) || paused) return;
    const rect=canvas.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    const control=touchControls(rect.width,rect.height,state.insets,state.googleInset);
    state.touch=true;
    setInputMode('touch');
    if(flight||state.largeMap){
      if(event.type==='pointerdown'&&Math.hypot(x-control.interact,y-control.y)<control.big+4){
        if(flight)beginFlightReturn(true);else toggleMap();
      }
      return;
    }
    if (event.type==='pointerdown') {
      if (Math.hypot(x-control.x,y-control.y)<51 && joystick===null) {
        setRide(false);
        joystick=event.pointerId;
        canvas.setPointerCapture(joystick);
        setJoy(x,y,control);
      } else if (Math.hypot(x-control.auto,y-control.y)<control.small+4) setRide(!route);
      else if (Math.hypot(x-control.interact,y-control.y)<control.big+4) interact();
    }
    if (event.pointerId!==joystick) return;
    if (event.type==='pointermove') setJoy(x,y,control);
    if (['pointerup','pointercancel','lostpointercapture'].includes(event.type)) {
      joystick=null;
      joy.x=0;
      joy.y=0;
    }
  }
  function resetTiming() {
    last=null;
    clearInput();
  }
  const pointerEvents=['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'];
  const originalTouch=canvas.style.touchAction;
  function bind() {
    canvas.style.touchAction='none';
    window.addEventListener('keydown',keyDown);
    window.addEventListener('keyup',keyUp);
    window.addEventListener('blur',resetTiming);
    canvas.ownerDocument.addEventListener('visibilitychange',resetTiming);
    for (const name of pointerEvents) canvas.addEventListener(name,pointer);
    minimapCanvas.addEventListener('click',mapClick);
    resizer=new ResizeObserver(resize);
    resizer.observe(canvas);
    resizer.observe(minimapCanvas);
    canvas.ownerDocument.addEventListener('fullscreenchange',resize);
  }
  function unbind() {
    canvas.style.touchAction=originalTouch;
    window.removeEventListener('keydown',keyDown);
    window.removeEventListener('keyup',keyUp);
    window.removeEventListener('blur',resetTiming);
    canvas.ownerDocument.removeEventListener('visibilitychange',resetTiming);
    for (const name of pointerEvents) canvas.removeEventListener(name,pointer);
    resizer?.disconnect();
    minimapCanvas.removeEventListener('click',mapClick);
    canvas.ownerDocument.removeEventListener('fullscreenchange',resize);
    resetTiming();
  }
  function followMap(dt) {
    const chase=1-Math.exp(-dt*6);
    camera.x+=(player.x+velocityX*.48-camera.x)*chase;
    camera.y+=(player.y+velocityY*.48-19-camera.y)*chase;
    camera.zoom+=(1-.19*Math.min(1,player.speed/scooterSpeed)-(state.rideBoost??0)*.055-camera.zoom)*chase;
  }
  function trafficLookahead(meters=190){
    if(!route?.length)return null;
    let remaining=meters/metersPerUnit,previous=player;
    for(const point of route){
      const length=distance(point,previous);
      if(length>remaining){
        const t=remaining/length;
        return {x:previous.x+(point.x-previous.x)*t,y:previous.y+(point.y-previous.y)*t,
          heading:Math.atan2(point.y-previous.y,point.x-previous.x)};
      }
      remaining-=length;previous=point;
    }
    return null;
  }
  function update(dt) {
    state.clock+=dt;
    if(flight){updateFlight();return;}
    if(state.largeMap)return;
    crashCooldown=Math.max(0,crashCooldown-dt);
    state.shake=Math.max(0,state.shake-dt*2.9);
    for (const [id,bubble] of state.speech) if (bubble.until<=state.clock) state.speech.delete(id);
    space.clear();
    const activeCars=[];
    const playerRadius=player.mode==='scooter'?radius.rider:radius.foot;
    space.put(player,playerRadius,'player');
    for(const person of [...state.npcs,...streetCrowds])space.put(person,radius.foot,'person');
    if(staticRegistry!==state.staticColliders){
      staticRegistry=state.staticColliders;staticSpace.clear();
      for(const prop of staticRegistry??[])staticSpace.put(prop,prop.r,'static');
    }
    const outsideView=body=>distance(body,player)>165/metersPerUnit&&
      !state.inActorView?.(body,true);
    for(const walker of state.walkers){
      walker.nearby=distance(walker,player)<300/metersPerUnit;
      walker.collider=space.put(walker,radius.foot,'person');
    }
    let excess=state.cars.length-trafficTarget;
    state.cars=state.cars.filter(car=>{
      if(!outsideView(car)||(excess<=0&&distance(car,player)<300/metersPerUnit))return true;
      excess--;
      presentCars.delete(car.id);
      return false;
    });
    for(const car of state.cars)activeCars.push([car,space.put(car,colliderRadius(car),'vehicle')]);
    const canSpawn=body=>priming||outsideView(body);
    const addCar=(car,headway,local=false)=>{
      const quietSide=local&&distance(car,player)>51/metersPerUnit&&state.inActorView&&!state.inActorView(car,true);
      if(presentCars.has(car.id)||car.laneWidth<serviceRoadWidth(car)||distance(car,player)>(local?315:275)/metersPerUnit||
        !(canSpawn(car)||quietSide)||worldContact(car.x,car.y,colliderRadius(car),(car.scooter?.37:car.service?1.02:.95)/metersPerUnit,car.heading)||
        trafficSpace.hit(car.x,car.y,colliderRadius(car)+headway,car))return;
      presentCars.add(car.id);state.cars.push(car);
      activeCars.push([car,space.put(car,colliderRadius(car),'vehicle')]);
    };
    if(priming&&density>=.40&&density<.95)for(const seed of streetTraffic){
      if(state.cars.length>=Math.ceil(trafficTarget*.57))break;
      addCar(seed,8);
    }
    if(priming&&density>=.45)for(const seed of signalQueues){
      if(seed.scooter&&random(seed.id.slice(1)*11+741)>density)continue;
      if(state.cars.length>=trafficTarget)break;
      addCar(seed,3);
    }
    if(!priming&&density>=.40&&density<.95&&state.clock>=nextTrafficRefresh){
      nextTrafficRefresh=state.clock+1.45;
      const ahead=trafficLookahead(98),far=trafficLookahead(),focus=ahead??player;
      const close=state.cars.filter(car=>distance(car,focus)<(ahead?82:115)/metersPerUnit).length;
      if(close<15){
        const goal=state.cars.length+Math.min(ahead?9:5,15-close);
        for(const seed of [...(far?nearbyStreetTraffic(far):[]),...nearbyStreetTraffic(focus)]){
          if(state.cars.length>=goal||state.cars.length>trafficTarget+10)break;
          addCar(seed,8,true);
        }
      }
    }
    for(let attempts=0;attempts<32&&state.cars.length<trafficTarget;attempts++)addCar(pool[spawnCursor++%pool.length],14);
    if(density>=.40&&density<.95&&(priming?state.clock===0:state.clock>=nextPedestrianRefresh)){
      nextPedestrianRefresh=state.clock+1.55;
      if(!priming&&state.inActorView){
        state.walkers=state.walkers.filter(walker=>!walker.localId||distance(walker,player)<425/metersPerUnit||
          state.inActorView(walker,true));
      }
      const ahead=priming?null:trafficLookahead(74),far=priming?null:trafficLookahead(158),focus=ahead??player;
      const close=state.walkers.filter(walker=>distance(walker,focus)<58/metersPerUnit).length;
      if(close<12){
        const localIds=new Set(state.walkers.map(walker=>walker.localId));
        let remaining=12-close;
        for(const walker of [...(far?nearbySidewalks(far):[]),...nearbySidewalks(focus)]){
          if(!remaining)break;
          if(localIds.has(walker.localId)||(!priming&&(distance(walker,player)<40/metersPerUnit||
              !state.inActorView||state.inActorView(walker,true)))||trafficSpace.hit(walker.x,walker.y,radius.foot+2,walker))continue;
          walker.collider=space.put(walker,radius.foot,'person');
          state.walkers.push(walker);remaining--;
        }
      }
    }
    for(let i=pendingWalkers.length-1;i>=0;i--){
      const walker=pendingWalkers[i];
      if(!canSpawn(walker)||worldContact(walker.x,walker.y,radius.foot)||trafficSpace.hit(walker.x,walker.y,radius.foot+2,walker))continue;
      pendingWalkers.splice(i,1);
      walker.collider=space.put(walker,radius.foot,'person');
      state.walkers.push(walker);
    }
    let passage=null;
    if(route){
      const spans=[];
      let previous=player,left=210;
      for(const next of [detour,...route].filter(Boolean)){
        const gap=distance(previous,next);
        if(gap<.1)continue;
        const part=Math.min(gap,left)/gap;
        spans.push([previous.x,previous.y,previous.x+(next.x-previous.x)*part,previous.y+(next.y-previous.y)*part]);
        left-=gap;
        if(left<=0||spans.length>=5)break;
        previous=next;
      }
      if(spans.length)passage={x:player.x,y:player.y,priority:waiting>=2,spans,blocker};
    }
    for(const [car,c] of activeCars){
      space.remove(c);
      advanceCar(car,dt,player,state.clock,trafficSpace,passage);
      space.put(car,colliderRadius(car),'vehicle');
    }
    const moveWalker=(walker,x,y)=>{
      if(walker.collider)space.remove(walker.collider);
      walker.movingSpeed=0;
      const step=dt*1.45/metersPerUnit,len=Math.hypot(x-walker.x,y-walker.y);
      if(len>step&&step>0){x=walker.x+(x-walker.x)*step/len;y=walker.y+(y-walker.y)*step/len;}
      if(!worldContact(x,y,radius.foot)&&!trafficSpace.hit(x,y,radius.foot,walker)){
        walker.movingSpeed=dt>0?Math.min(2.2,Math.hypot(x-walker.x,y-walker.y)*metersPerUnit/dt):0;
        walker.x=x;walker.y=y;
      }
      space.put(walker,radius.foot,'person');
    };
    for (const walker of state.walkers) {
      if(!walker.nearby)continue;
      if(walker.crossing) {
        const {x,y,dx,dy,width}=walker.crossing;
        const crossingClock=state.clock+((x*7+y*13)%15+15)%15;
        const phase=crossingClock%24,direction=Math.floor(crossingClock/24)%2===0?1:-1;
        const side=(clamp((phase-12)/10,0,1)-.5)*direction*(width+1.2/metersPerUnit);
        moveWalker(walker,x+dx*4.6/metersPerUnit-dy*side,y+dy*4.6/metersPerUnit+dx*side);
        walker.heading=Math.atan2(dx,-dy);
        continue;
      }
      const {x,y,dx,dy}=walker.path;
      const phase=state.clock*1.3/(Math.max(4,Math.hypot(dx,dy)*metersPerUnit)*.46)+walker.phase;
      const travel=.5+.46*Math.sin(phase);
      moveWalker(walker,x+dx*travel,y+dy*travel);
      walker.heading=Math.atan2(dy,dx)+(Math.cos(phase)<0?Math.PI:0);
    }
    let dx=enabled?joy.x:0,dy=enabled?joy.y:0;
    for (const key of keys) {
      const [mx,my]=keysForMove.get(key);
      dx+=mx;
      dy+=my;
    }
    const magnitude=Math.hypot(dx,dy);
    const input=Math.min(1,magnitude);
    if(input>.035&&!route&&!walkSelected&&player.mode==='foot'){
      const mount={...player,mode:'scooter',ignore:player};
      if(!worldContact(mount.x,mount.y,radius.rider,.37/metersPerUnit,mount.heading)&&
        !trafficSpace.hit(mount.x,mount.y,radius.rider,mount))setMode('scooter');
    }
    const scooter=player.mode==='scooter';
    const maxSpeed=scooter?ridingSpeed():1.39/metersPerUnit;
    if (input>.035 && !route) {
      const desired=Math.atan2(dy,dx);
      const turn=angleDiff(desired,player.heading);
      const reverse=scooter&&Math.abs(turn)>2.43;
      const turnLimit=(scooter?Math.max(.9,4.6-player.speed*.018):8)*dt;
      const angle=reverse?player.heading:player.heading+clamp(turn,-turnLimit,turnLimit);
      state.reversing=reverse;
      const r=scooter?radius.rider:radius.foot;
      if(!worldContact(player.x,player.y,r,scooter?.37/metersPerUnit:r,scooter?angle:0)&&
        !trafficSpace.hit(player.x,player.y,r,{...player,heading:angle,ignore:player}))player.heading=angle;
    }
    if(input<=.035||route)state.reversing=false;
    const targetSpeed=input>.035?(state.reversing?-1.35/metersPerUnit:maxSpeed)*input:0;
    const blend=scooter?1-Math.exp(-dt*(input>0?4.9:3.4)):1;
    velocityX+=(Math.cos(player.heading)*targetSpeed-velocityX)*blend;
    velocityY+=(Math.sin(player.heading)*targetSpeed-velocityY)*blend;
    const r=scooter?radius.rider:radius.foot;
    const contact=(x,y)=>trafficSpace.hit(x,y,r,player);
    const terrain=(x,y)=>worldContact(x,y,r,scooter?.37/metersPerUnit:r,scooter?player.heading:0);
    const wall=(x,y)=>Boolean(terrain(x,y)||contact(x,y));
    if(route && enabled) {
      if(state.clock-rideStarted>75&&distance(player,state.target)<locationRadius*.90&&
        clearPose(player.x,player.y,'foot',player.heading)){
        setRide(false,'arrived');
        setMode('foot');followMap(dt);updateLocation();updateContext();
        return;
      }
      if(!rideAnchor||distance(player,state.target)<rideAnchor.goal-145)rideAnchor={goal:distance(player,state.target),time:state.clock};
      if(state.target&&distance(player,state.target)<310&&route.length>1){
        const goal=state.target,heading=Math.atan2(goal.y-player.y,goal.x-player.x);
        if(clearPose(player.x,player.y,'scooter',heading)&&clearPose(goal.x,goal.y,'scooter',heading)){
          const path=sweep(player.x,player.y,goal.x,goal.y,(x,y)=>!clearPose(x,y,'scooter',heading),2.5);
          if(path.x===goal.x&&path.y===goal.y){
            route=[goal];detour=null;rideRemaining=distance(player,goal);
          }
        }
      }
      const pace=ridePace(rideRemaining,maxSpeed,cruise*(1+Math.min(.40,rideWait/55)));
      let budget=pace*dt;
      let travelled=0;
      while(route.length && budget>0){
        const next=detour??route[0],gap=distance(player,next);
        const step=Math.min(gap,budget);
        if(gap>.001){
          const previousHeading=player.heading;
          const angle=Math.atan2(next.y-player.y,next.x-player.x);
          player.heading=angle;
          if(wall(player.x,player.y))player.heading=previousHeading;
          const nx=player.x+(next.x-player.x)*step/gap,ny=player.y+(next.y-player.y)*step/gap;
          let obstruction,hitBody;
          const allowed=sweep(player.x,player.y,nx,ny,(x,y)=>{
            const hit=contact(x,y),kind=hit?.kind??terrain(x,y);
            if(!kind)return false;
            hitBody=hit;obstruction=kind;
            return true;
          },2);
          if(allowed.x!==nx||allowed.y!==ny||contact(player.x,player.y)){
            const obstacle=hitBody??contact(player.x,player.y);
            if(obstacle?.kind==='vehicle')blocker=obstacle.body;
            if(rideDebug){
              const body=obstacle?.body;
              state.blockedRide={kind:obstruction??contact(player.x,player.y)?.kind,next:{x:next.x,y:next.y},
                body:body&&{id:body.id,x:body.x,y:body.y,service:body.service??null,scooter:body.scooter,heading:body.heading}};
            }
            if(state.target&&waiting>=2&&distance(player,state.target)<48){
              route.length=0;break;
            }
            player.heading=previousHeading;
            if(auditEnabled)audit.blockedAutoFrames++;
            if((waiting>=7||state.clock-rideAnchor.time>=7)&&state.clock>=escapeAfter&&state.target){
              escapeAfter=state.clock+2.8;
              const start={x:player.x,y:player.y};
              const options=route.slice(0,48).map((point,i)=>({point,i}))
                .filter(({point})=>distance(start,point)>57&&distance(start,point)<286).reverse();
              const direction=Math.atan2(next.y-start.y,next.x-start.x);
              const goal=Math.atan2(state.target.y-start.y,state.target.x-start.x);
              if(distance(start,state.target)<260)options.unshift({i:-2,point:state.target});
              for(const yaw of [goal,direction,goal+.65,goal-.65])for(const distance of [246,188,130,78])
                options.push({i:-1,point:{x:start.x+Math.cos(yaw)*distance,y:start.y+Math.sin(yaw)*distance}});

              if(rideDebug)state.recoveryChecks=(state.recoveryChecks??0)+1;
              let recovery=null;
              for(const {point,i} of options){
                const heading=Math.atan2(point.y-start.y,point.x-start.x);
                const landing=legalNear(point,'scooter',heading,true,65);
                if(!landing||distance(start,landing)<50||distance(start,landing)>330)continue;
                const arrived=i===-2&&distance(landing,state.target)<locationRadius;
                const remaining=arrived?[]:i<0?planRide(landing,state.target,congestion):route.slice(i+1);
                if(!arrived&&!remaining?.length)continue;
                recovery={landing,heading,remaining};
                break;
              }
              if(recovery){
                if(rideDebug)state.recoveryMoves=(state.recoveryMoves??0)+1;
                Object.assign(player,recovery.landing,{heading:recovery.heading,speed:0});
                route=recovery.remaining;
                detour=null;blocker=null;waiting=0;state.viewRevision++;
                rideAnchor={goal:distance(player,state.target),time:state.clock};
                rideRemaining=rideLength(player,route);
                break;
              }
            }
            if(waiting>=2&&state.clock>=nextReroute&&!detour){
              nextReroute=state.clock+.65;
              const original=route[0],len=distance(player,original);
              const candidate=len>105?{x:player.x+(original.x-player.x)*105/len,
                y:player.y+(original.y-player.y)*105/len}:original;
              const safe=(a,b)=>{
                const result=sweep(a.x,a.y,b.x,b.y,wall);
                return result.x===b.x&&result.y===b.y;
              };
              let chosen=null;
              for(const offset of [0,-22,22,-42,42]){
                const lane=offset?{x:candidate.x-Math.sin(angle)*offset,y:candidate.y+Math.cos(angle)*offset}:candidate;
                if(wall(lane.x,lane.y))continue;
                const bypass=aroundObstacle(player,lane,safe);
                if(bypass){chosen={bypass,skip:!offset&&candidate===original};break;}
              }
              if(chosen){
                if(chosen.skip)route.shift();
                route.unshift(...chosen.bypass);
                break;
              }
            }
            if(waiting>=4&&state.clock>=nextNetworkReplan&&state.target){
              nextNetworkReplan=state.clock+6;
              congestion.push({x:next.x,y:next.y});
              if(congestion.length>4)congestion.shift();
              const alternate=planRide(player,state.target,congestion);
              if(alternate?.length&&distance(alternate[0],next)>13){
                route=alternate;detour=null;
                rideRemaining=rideLength(player,route);
                cruise=Math.max(cruise,rideCruiseSpeed(rideRemaining,maxSpeed));
                break;
              }
            }
            if(detour)detour=null;
            else{
              // OSM splits paths into many tiny links. A blocked intermediate
              // sample need not hold the whole trip if the next link is clear.
              for(let i=1;i<Math.min(9,route.length);i++){
                const future=route[i],length=distance(player,future);
                if(length>92)break;
                const facing=Math.atan2(future.y-player.y,future.x-player.x);
                player.heading=facing;
                const clear=sweep(player.x,player.y,future.x,future.y,wall);
                if(clear.x===future.x&&clear.y===future.y&&!contact(player.x,player.y)){
                  route.splice(0,i);break;
                }
              }
              if(route[0]===next)for(const delta of [.78,-.78,1.12,-1.12,1.48,-1.48]){
                const a=angle+delta;
                const choice={x:player.x+Math.cos(a)*32,y:player.y+Math.sin(a)*32};
                player.heading=a;
                const clear=sweep(player.x,player.y,choice.x,choice.y,wall);
                if(clear.x!==choice.x||clear.y!==choice.y||contact(player.x,player.y))continue;
                const resume=route.findIndex(future=>distance(choice,future)<56&&
                  distance(player,future)>gap+12&&!wall(future.x,future.y));
                if(resume>=1){detour={...choice,resume};break;}
              }
              player.heading=previousHeading;
            }
            break;
          }
          player.x=nx;
          player.y=ny;
        }
        budget-=step;
        if(step>=gap){
          if(detour){route.splice(0,detour.resume);detour=null;}
          else route.shift();
        }
        travelled+=step;
      }
      const congested=travelled<pace*dt*.42;
      if(!congested)blocker=null;
      if(congested)rideWait+=dt;
      waiting=congested?waiting+dt:Math.max(0,waiting-dt*3);
      rideRemaining=Math.max(0,rideRemaining-travelled);
      if(!route.length){
        setRide(false,'arrived');
        setMode('foot');
      }else{
        player.speed=dt>0?travelled/dt:0;
        state.rideBoost=clamp((pace/maxSpeed-1)/3,0,1);
        velocityX=Math.cos(player.heading)*player.speed;
        velocityY=Math.sin(player.heading)*player.speed;
      }
      followMap(dt);
      updateLocation();
      updateContext();
      return;
    }
    const lastSpeed=player.speed;
    const nx=player.x+velocityX*dt,ny=player.y+velocityY*dt;
    const speed=Math.hypot(velocityX,velocityY);
    let crash=false;
    const first=sweep(player.x,player.y,nx,ny,wall,1.9);
    player.x=first.x;player.y=first.y;
    if(first.x!==nx||first.y!==ny){
      const ox=player.x,oy=player.y;
      const sideX=sweep(ox,oy,nx,oy,wall,1.9),sideY=sweep(ox,oy,ox,ny,wall,1.9);
      const xSlide=Math.abs(sideX.x-ox)>Math.abs(sideY.y-oy);
      Object.assign(player,xSlide?sideX:sideY);
      if(xSlide){velocityY*=-.12;velocityX*=.59;}
      else{velocityX*=-.12;velocityY*=.59;}
      crash=true;
    }
    if(crash&&speed>8&&crashCooldown===0){
      velocityX*=.36;
      velocityY*=.36;
      crashCooldown=.42;
      state.shake=Math.max(state.shake,clamp(speed/maxSpeed,.15,.85));
      emit('crash',{speed});
    }
    player.speed=Math.hypot(velocityX,velocityY);
    state.acceleration=dt>0?(player.speed-lastSpeed)*metersPerUnit/dt:0;
    followMap(dt);
    updateLocation();
    updateContext();
    if(input<=.035 && state.clock>=manualUntil && player.speed<1.8 && (player.locationId || context.action==='talk')) setMode('foot');
  }
  function recordAudit(){
    const sample=occupancy();
    for(const walker of [...state.walkers,...state.npcs,...streetCrowds]){
      if(!walker.hidden)sample.put(walker,radius.foot,'person');else audit.hiddenPeople++;
    }
    for(const car of state.cars){
      if(car.hidden){audit.hiddenCars++;continue;}
      const r=colliderRadius(car),hit=sample.hit(car.x,car.y,r,car);
      if(hit?.kind==='vehicle')audit.carCar++;
      if(hit?.kind==='person')audit.personVehicle++;
      sample.put(car,r,'vehicle');
    }
    const size=player.mode==='scooter'?radius.rider:radius.foot;
    const hit=sample.hit(player.x,player.y,size,player)??staticSpace.hit(player.x,player.y,size,player);
    if(hit?.kind==='vehicle')audit.playerVehicle++;
    if(hit?.kind==='person')audit.playerPerson++;
    if(hit?.kind==='static'||worldContact(player.x,player.y,size,player.mode==='scooter'?.37/metersPerUnit:size,player.mode==='scooter'?player.heading:0))audit.playerStatic++;
    if(state.cameraInside)audit.camera++;
    const current=new Map(),roster=new Set([...state.cars,...state.walkers]);
    for(const object of roster){
      if(object.hidden||state.inActorView&&!state.inActorView(object))continue;
      current.set(object,{x:object.x,y:object.y});
      const last=previousView.get(object);
      if(previousAuditRevision===state.viewRevision){
        if(!previousRoster.has(object)&&state.inActorView?.(object)){audit.visibleBirths++;audit.lastBirth={kind:object.id==null?'walker':'vehicle',id:object.id??null,x:object.x,y:object.y,frame:audit.frames};}
        if(last&&distance(last,object)>1.6/metersPerUnit)audit.visibleJumps++;
      }
    }
    if(previousAuditRevision===state.viewRevision)for(const [body,point] of previousView){
      if(!current.has(body)&&state.inActorView?.(point)&&(body.hidden||!roster.has(body)))audit.visibleRemovals++;
    }
    audit.visibleDiscontinuities=audit.visibleBirths+audit.visibleRemovals+audit.visibleJumps;
    previousView=current;previousRoster=roster;previousAuditRevision=state.viewRevision;
    audit.frames++;
    if(audit.frames%30===0)canvas.dataset.collisionAudit=JSON.stringify(audit);
  }
  function loop(now) {
    if (!running) return;
    const dt=last===null?0:Math.min(.05,(now-last)/1000);
    last=now;
    if (!paused && !canvas.ownerDocument.hidden) {
      update(dt);
      draw(state);
      if(auditEnabled)recordAudit();
    }
    if (running) frame=requestAnimationFrame(loop);
  }
  function relocate(location,heading,roadReturn=false){
    setRide(false);
    manualUntil=0;walkSelected=false;
    const position=legalNear(location,'foot',heading,roadReturn);
    if(!position)return;
    Object.assign(player,position,{speed:0,heading});
    state.viewRevision++;
    state.roadReturn=roadReturn;
    Object.assign(camera,{x:location.x,y:location.y-19,zoom:1});
    velocityX=0;
    velocityY=0;
    updateLocation();
    setMode('foot');
    state.standingPoint=sidewalkStand();
    updateContext();
    refresh();
  }
  const engine={
    start() {
      if (running) return;
      if(!trafficConfigured)engine.setTrafficDensity(density);
      const page=canvas.ownerDocument.defaultView?.location;
      const position=page?.pathname?.endsWith('/engine/demo.html')&&options.get('streetPreview');
      if(position&&state.clock===0){
        const [lat,lon,bearing]=position.split(',').map(Number);
        if(Number.isFinite(lat)&&Number.isFinite(lon)&&Number.isFinite(bearing)){
          const heading=(bearing-90)*Math.PI/180;
          const point=toWorld(lat,lon),road=roadOptions(point.x,point.y,1)[0];
          const lane=road?Math.min(road.r[4]*.21,1.65/metersPerUnit):0;
          const anchor=road?{x:road.x-Math.sin(heading)*lane,y:road.y+Math.cos(heading)*lane}:point;
          const spawn=legalNear(anchor,'scooter',heading,true,150);
          if(spawn){relocate(spawn,heading,true);setMode('scooter');manualUntil=state.clock+12;}
        }
      }
      running=true;
      bind();
      const start=legalNear(player,'foot',player.heading);
      if(start)Object.assign(player,start);
      updateLocation();
      state.standingPoint=sidewalkStand();
      updateContext();
      if (running) {
        draw(state);
        if(state.clock===0){
          priming=true;
          if(density>=.40&&density<.95)streetTraffic=nearbyStreetTraffic(player);
          for(let i=0;i<8;i++)update(0);
          streetTraffic=[];
          priming=false;
          draw(state);
        }
        frame=requestAnimationFrame(loop);
      }
    },
    stop() {
      if (!running) return;
      running=false;
      cancelAnimationFrame(frame);
      unbind();
      if(flight){flight.skipped=true;finishFlight();}
      if (state.largeMap) toggleMap();
    },
    setPaused(value) {
      paused=Boolean(value);
      resetTiming();
    },
    setInputEnabled(value) {
      enabled=Boolean(value);
      clearInput();
      if (!enabled) {
        velocityX=0;
        velocityY=0;
        player.speed=0;
      }
    },
    setAutoRide(value) {setRide(Boolean(value));},
    get aerial(){return Boolean(flight||state.largeMap);},
    flyover(locationId,{seconds=4}={}){
      const location=byId.get(locationId);
      if(!location||!running)return Promise.resolve();
      if(flight){flight.skipped=true;finishFlight();}
      if(state.largeMap)toggleMap();
      clearInput();
      setRide(false);
      velocityX=velocityY=player.speed=0;
      const duration=Number.isFinite(seconds)?Math.max(.15,seconds):4;
      return new Promise(resolve=>{
        flight={location,start:state.clock,seconds:duration,returnAt:null,skipped:false,resolve};
        updateFlight();refresh();
      });
    },
    get autoRide() {return Boolean(route);},
    get inputMode() {return inputMode;},
    get player() {return Object.freeze({...player});},
    setPlayerSkin(skin) {
      if (typeof skin==='string') player.skin=skin;
      refresh();
    },
    estimateRideSeconds(id) {
      const target=byId.get(id);
      if(!target)return null;
      if(distance(player,target)<2)return 0;
      const path=planRide(player,target);
      return path?.length?estimateRideDuration(rideLength(player,path),ridingSpeed()):null;
    },
    nearestRoadTeleport() {
      let best=null;
      for(const road of roads){
        if(road[5].way.kind==='pedestrian'||road[5].way.layer!==0)continue;
        const point=nearestOnRoad(player.x,player.y,road);
        if(point.d>=(best?.d??Infinity)||blocked(point.x,point.y))continue;
        best={...point,road};
      }
      if(!best)return;
      const [ax,ay,bx,by,,{forward,reverse}]=best.road;
      let direction=Math.atan2(by-ay,bx-ax);
      if(!forward || (reverse&&Math.cos(direction-player.heading)<0))direction+=Math.PI;
      relocate(best,direction,true);
    },
    teleportTo(id) {
      const location=byId.get(id);
      if(location)relocate(location,facing(id));
    },
    setTimeOfDay(hours) {
      if (Number.isFinite(hours)) state.time=clamp(hours,0,24);
      refresh();
    },
    setWeather(kind) {
      if (kind==='clear' || kind==='rain') state.weather=kind;
      refresh();
    },
    setTrafficDensity(n) {
      trafficConfigured=true;
      if (Number.isFinite(n)) density=clamp(n,0,1);
      trafficTarget=Math.round(128*density**1.35);
      if(state.clock===0){
        pendingWalkers.length=0;
        const choices=people.filter((_,i)=>random(i*31+12)<density).map((path,i)=>({
          path,x:path.x,y:path.y,phase:i*1.93,skin:['npc_elder','npc_student','npc_boss','npc_colleague'][i%4],
        }));
        for(const [i,crossing] of crossings.entries()){
          if(random(i*561+16)>=density*.35)continue;
          const {x,y,dx,dy,width}=crossing,side=(width+1.2/metersPerUnit)/2;
          choices.push({x:x+dx*4.6/metersPerUnit+dy*side,y:y+dy*4.6/metersPerUnit-dx*side,
            crossing,heading:0,skin:'npc_student'});
        }
        pendingWalkers.push(...choices);
      }
      refresh();
    },
    setMarkers(list) {
      state.markers=list.filter(m=>byId.has(m.locationId)).map(m=>({...m}));
      for (const id of reached.keys()) if (!state.markers.some(m=>m.id===id && m.locationId===reached.get(id))) reached.delete(id);
      updateTarget();
      updateContext();
      refresh();
    },
    setWaypoint(id) {
      waypoint=id;
      updateTarget();
      refresh();
    },
    setNpcs(list) {
      const counts=new Map();
      state.npcs=list.filter(n=>byId.has(n.locationId)).map(n=>{
        const loc=byId.get(n.locationId);
        const slot=counts.get(loc.id)??0;
        counts.set(loc.id,slot+1);
        const side=(slot%2?-1:1)*(1.9+Math.floor(slot/2)*1.02),a=loc.viewHeading;
        for(const d of [3.1,3.8,4.5,5.2,2.6]){
          const x=loc.x+(Math.cos(a)*d+Math.sin(a)*side)/metersPerUnit;
          const y=loc.y+(Math.sin(a)*d-Math.cos(a)*side)/metersPerUnit;
          if(!inBuilding(x,y)&&!roadAt(x,y,-.34/metersPerUnit))return {...n,x,y};
        }
        for(let radius=1;radius<=24;radius++)for(let step=0;step<16;step++){
          const angle=a+step*Math.PI/8;
          const x=loc.x+Math.cos(angle)*radius/metersPerUnit,y=loc.y+Math.sin(angle)*radius/metersPerUnit;
          if(!inBuilding(x,y)&&!roadAt(x,y,-.34/metersPerUnit))return {...n,x,y};
        }
        return {...n,x:loc.x,y:loc.y};
      });
      updateContext();
      for (const id of state.speech.keys()) if (!state.npcs.some(n=>n.id===id)) state.speech.delete(id);
      refresh();
    },
    say(id,text,ms=2500) {
      if (state.npcs.some(n=>n.id===id)) state.speech.set(id,{text:String(text),until:state.clock+Math.max(0,ms)/1000});
      refresh();
    },
    setFilter(name) {
      if (['none','grandma','flashback'].includes(name)) state.filter=name;
      refresh();
    },
    shake(strength) {
      if (Number.isFinite(strength)) state.shake=clamp(strength,0,1);
    },
    getLocations() {return locations.map(location=>({...location}));},
    on(event,handler) {
      if (!listeners.has(event)) listeners.set(event,new Set());
      listeners.get(event).add(handler);
    },
    off(event,handler) {listeners.get(event)?.delete(handler);},
  };
  engine.setTrafficDensity(density);
  return engine;
}
