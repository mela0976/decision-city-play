import {carriagewayAt,curbContact,laneTouchdown,pedestrianEntrance,surfaceAt} from './sidewalks.mjs'; // A24
import {towerBlocksHop} from './tower-structures.mjs'; // A23 towers: test aerial clearance only
import {nearOfficeDoor,officeDoor,officeLeaf} from './office-entrance.mjs';
import {createFeaturedTraffic} from './featured-traffic.mjs'; // A22 featured traffic
import {createImpact,impactTarget} from './impact.mjs';
import {eveningPlazaWalks,marketColliders,nightMarketOpen} from './night-market.mjs'; // A23 night
import {fixtureColliders} from './fixtures.mjs';
import {neonDistrict} from './neon-districts.mjs'; // A22 shopping-street foot traffic
import {entranceWindows,locationRadius,obstructsEntrance} from './actor-entrances.mjs';
import {districtWalks,pedestrianTarget,walkScheduled} from './actor-streets.mjs';
import {streetCrowds} from './crowds.mjs';
import {occupancy,radius,colliderRadius,sweep} from './collision.mjs';
import {crossings,crossingForNode,signalGroup,signalState,junctionById,gateAhead,waitSeconds} from './street-crossings.mjs';
import { blocked, byId, inBuilding, buildingHeightAt, worldContact, toWorld, locations, metersPerUnit, nearestOnRoad, roadAt, random, scooterSpeed,roadNodes,roadOptions,roads } from './world.mjs';
import {planRide,aroundObstacle,rightLane,rideLength,rideCruiseSpeed,ridePace,timedCruise} from './navigation.js';
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
const actionKeys=new Set(['KeyF','KeyE','Enter','Space','KeyM','KeyG','KeyT']);
const entranceObstacles=occupancy(); // A24 select accessible pedestrian endpoints once
for(const fixture of fixtureColliders())entranceObstacles.put(fixture,fixture.r,'static');
const entrances=new Map(locations.map(site=>[site.id,pedestrianEntrance(site,(x,y)=>
  !entranceObstacles.hit(x,y,radius.foot)&&!streetCrowds.some(p=>distance(p,{x,y})<radius.foot*2))]));
const nearest=(list,n)=>list.reduce((a,b)=>Math.abs(a-n)<Math.abs(b-n)?a:b);
const carColors=['#e2dfd6','#302f32','#9e9fa0','#56595c','#d1cbc2','#555a62','#793e38','#273c51'];
function localService(index,width){
  if(width>=8.5&&index%23===0)return 'bus';
  if(width>=5.7&&index%11===0)return 'delivery';
  return index%5===0?'taxi':null;
}

function serviceRoadWidth(car){
  if(car.service==='bus')return 8.5/metersPerUnit;
  if(car.service==='waste'||car.service==='recycling')return 6.4/metersPerUnit;
  if(car.service==='delivery')return 5.7/metersPerUnit;
  return 0;
}
const speedUnits=1/metersPerUnit;
const scooterReach=Math.hypot(radius.scooter,.37*speedUnits);
// Leave room for a following rider if the lead scooter stops at the junction.
const scooterStopReach=scooterReach+3.2*speedUnits;
const braking=7.1*speedUnits;
const isMajor=(kind,name)=>kind==='primary'||kind==='secondary'||name==='松仁路';
// A24 all participants read the same junction phase as the rendered head.
const signalForNode=crossingForNode;
function signalAt(car,node,hour,clock){
  const signal=signalForNode.get(node.index);
  if(!signal||signal===signalForNode.get(car.previous))return null;
  const light=signalState(signal,clock,hour)[signalGroup(signal,Math.cos(car.approach),Math.sin(car.approach))?'a':'b'];
  if(light==='yellow')return car.speed>0&&distance(car,car.end)-stopLine(car)<car.speed**2/(2*braking);
  return light!=='red';
}

function cruiseSpeed(car,{kind,name}){
  const variation=random(String(car.id).split('').reduce((sum,c)=>sum*31+c.charCodeAt(0),0)%997);
  const major=isMajor(kind,name);
  const low=major?59:kind==='tertiary'||kind==='unclassified'?35:20;
  return (low+variation*(major?7:10))/3.6*speedUnits;
}

function stopLine(car){
  const margin=car.stopMark!=null?car.stopMark+colliderRadius(car)*metersPerUnit+.25:
    Math.max(car.scooter?5.8:7,car.laneWidth*metersPerUnit*.5);
  return Math.min(margin*speedUnits,car.segmentLength*.76);
}

function nextTrafficEdge(car,junction){
  const eligible=junction.out.filter(e=>{
    if(e.w<Math.max(2.5*speedUnits,serviceRoadWidth(car)))return false;
    if(!car.scooter)return true;
    const dest=roadNodes[e.to],lane=trafficLane(junction,dest,e,car);
    const end={x:dest.x+lane.x,y:dest.y+lane.y};
    if(obstructsEntrance(end.x,end.y,scooterStopReach))return false;
    // A U-turn cuts diagonally across the oncoming lane. Keep that manoeuvre off an entrance.
    return e.to!==car.previous||!entranceWindows(car.end,end,scooterReach).length;
  });
  const through=eligible.filter(e=>e.to!==car.previous&&(e.way.kind!=='service'||e.way.name));
  // A24 a deterministic minority of scooters need a left turn on their commute.
  const incoming=car.turnEntry,j=crossingForNode.get(car.node);
  if(car.scooter&&j?.twoStage&&incoming?.turnBox&&random(car.node*19+(car.segments??0)*73)<.14){
    const left=through.find(e=>{
      const out=roadNodes[e.to];
      return crossingForNode.get(e.to)!==j&&
        ((out.x-junction.x)*incoming.dy-(out.y-junction.y)*incoming.dx)<-.65*e.d;
    });
    if(left)return left;
  }
  if(through.length&&isMajor(car.roadKind,car.roadName)){
    const straight=through.find(e=>{
      const dest=roadNodes[e.to];
      return Math.abs(angleDiff(Math.atan2(dest.y-junction.y,dest.x-junction.x),car.approach))<.3;
    });
    if(straight)return straight;
  }
  const forward=eligible.filter(e=>e.to!==car.previous);
  const choices=through.length?through:forward.length?forward:eligible;
  // Prefer smooth continuations at split OSM geometry, including one-way roads.
  const aligned=choices.filter(e=>{
    const dest=roadNodes[e.to];
    return Math.abs(angleDiff(Math.atan2(dest.y-junction.y,dest.x-junction.x),car.approach))<.42;
  });
  const sameStreet=aligned.filter(e=>car.roadName&&e.way.name===car.roadName);
  const pool=sameStreet.length?sameStreet:aligned.length?aligned:choices;
  return pool[Math.floor(random(car.node*19+car.previous*11+(car.segments??0)*73)*pool.length)];
}

function trafficLane(start,end,edge,car){
  if(car.queueColumn!=null&&edge.w*metersPerUnit>=5.8){
    const lane=edge.w*(edge.forward&&edge.reverse?.5:1);
    const center=edge.forward&&edge.reverse?lane*.5:0;
    const offset=center+car.queueColumn*Math.min(1.18*speedUnits,(lane-.88*speedUnits)*.43);
    const len=distance(start,end);
    return {x:-(end.y-start.y)*offset/len,y:(end.x-start.x)*offset/len};
  }
  if(!isMajor(edge.way.kind,edge.way.name))return rightLane(start,end,edge.w,car.scooter);
  const len=distance(start,end);
  // A mapped one-way carriageway already has its own centerline.
  const offset=(edge.forward&&edge.reverse?1.25:.35)*speedUnits;
  return {x:-(end.y-start.y)*offset/len,y:(end.x-start.x)*offset/len};
}

function driveSegment(car,edge) {
  const start=roadNodes[car.node],end=roadNodes[edge.to],lane=trafficLane(start,end,edge,car);
  car.laneWidth=edge.w;
  car.segmentLength=edge.d;
  car.roadEdge=edge;
  car.entranceWindows=null;
  const approach=crossingForNode.get(edge.to)?.approaches.find(a=>a.from===edge.to&&a.to===car.node&&a.reverse);
  car.stopMark=approach?(car.scooter?approach.box:approach.stop):null; // A24
  const incoming=crossingForNode.get(car.node),outgoing=crossingForNode.get(edge.to);
  car.turnEntry=approach??(incoming&&incoming===outgoing?car.turnEntry:null); // A24 retain the entry across a divided junction.
  car.entryArm=approach;
  car.roadKind=edge.way.kind;
  car.roadName=edge.way.name;
  car.cruise=cruiseSpeed(car,edge.way);
  car.approach=Math.atan2(end.y-start.y,end.x-start.x);
  car.nextEdge=null;
  car.bypass=null;
  car.exitBlocked=false;
  car.queuedAt=null;
  car.committed=false;
  car.segments=(car.segments??0)+1;
  car.previous=car.node;
  car.node=edge.to;
  car.end={x:end.x+lane.x,y:end.y+lane.y};
  return {x:start.x+lane.x,y:start.y+lane.y};
}
function buildTraffic() {
  const roadEdges=roads.filter(r=>r[4]>35 && r[5].d>75 && r[5].way.kind!=='pedestrian'&&r[5].way.kind!=='service'&&r[5].way.layer===0);
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
      speed:0,scooter,service};
    const a=driveSegment(car,{...e,to:flip?e.a:e.b}),t=.16+.68*random(i+926);
    car.heading=Math.atan2(car.end.y-a.y,car.end.x-a.x);
    car.x=a.x+(car.end.x-a.x)*t;
    car.y=a.y+(car.end.y-a.y)*t;
    return car;
  });
}
function nearbyStreetTraffic(player,peak=false){
  const result=[];
  const dx=Math.cos(player.heading),dy=Math.sin(player.heading);
  for(const [index,[ax,ay,bx,by,w,edge]] of roads.entries()){
    if(!edge.way.name||peak&&!isMajor(edge.way.kind,edge.way.name)&&index%3!==0||edge.way.kind==='pedestrian'||edge.way.layer!==0||edge.d*metersPerUnit<9||
      Math.hypot((ax+bx)/2-player.x,(ay+by)/2-player.y)>(peak?315:130)/metersPerUnit)continue;
    for(const [node,to,permitted] of [[edge.a,edge.b,edge.forward],[edge.b,edge.a,edge.reverse]]){
      if(!permitted||peak&&!roadNodes[to].out.length)continue;
      const major=isMajor(edge.way.kind,edge.way.name);
      const count=peak&&major?Math.max(1,Math.ceil(edge.d*metersPerUnit/15)):
        edge.d*metersPerUnit>=50?3:edge.d*metersPerUnit>=30?2:1;
      for(let variant=0;variant<count;variant++){
        const scooter=w*metersPerUnit<=5||(index+variant)%3!==0;
        const look=index+variant;
        const service=scooter||peak?null:localService(look,w*metersPerUnit);
        const car={id:'local-'+index+'-'+node+'-'+variant,node,x:0,y:0,heading:0,
          scooter,service,color:service==='taxi'?'#eab62f':carColors[look%carColors.length],speed:0};
        const entry=driveSegment(car,{...edge,to}),t=peak&&major?(variant+.5)/count:count===3?(variant+1)/4:variant===0?.35:.67;
        car.x=entry.x+(car.end.x-entry.x)*t;car.y=entry.y+(car.end.y-entry.y)*t;
        car.heading=Math.atan2(car.end.y-entry.y,car.end.x-entry.x);
        const r=Math.hypot(car.x-player.x,car.y-player.y)*metersPerUnit;
        if(r<8||r>(peak?290:110))continue;
        const ahead=(car.x-player.x)*dx+(car.y-player.y)*dy;
        const inbound=(player.x-car.x)*Math.cos(car.heading)+(player.y-car.y)*Math.sin(car.heading)>0;
        const lateral=Math.abs((car.x-player.x)*Math.sin(car.heading)-(car.y-player.y)*Math.cos(car.heading))*metersPerUnit;
        const arterialPenalty=isMajor(edge.way.kind)?0:major?36:150;
        result.push({car,score:peak?Math.abs(r-100)+arterialPenalty+Math.min(lateral,135)+(inbound?0:75):Math.abs(r-22)+(ahead<0?75:0)});
      }
    }
  }
  return result.sort((a,b)=>a.score-b.score).slice(0,peak?360:95).map(item=>item.car);
}
function nearbySidewalks(player,evening=false){ // A22 keep short shopfront walks within the existing sidewalk system
  const paths=evening?eveningPlazaWalks(player):[]; // A23 night: routes through the pedestrian plaza
  for(const [index,[ax,ay,bx,by,w,edge]] of roads.entries()){
    const length=edge.d*metersPerUnit;
    if(!edge.way.name||edge.way.layer!==0||length<5||Math.hypot((ax+bx)/2-player.x,(ay+by)/2-player.y)>105/metersPerUnit)continue;
    const ux=(bx-ax)/edge.d,uy=(by-ay)/edge.d,heading=Math.atan2(uy,ux);
    const dense=evening&&neonDistrict((ax+bx)/2,(ay+by)/2); // A22 only split paths on commercial blocks
    const sections=Math.max(1,Math.floor(length/(dense?9:16)));
    for(const side of [-1,1])for(let section=0;section<sections;section++){
      const start=(section+.18)/sections,span=.64/sections,phase=((index+section)%23)*1.83;
      const dx=(bx-ax)*span,dy=(by-ay)*span;
      for(const curb of [1.02,.60,1.43]){
        const offset=side*(w*.5+curb/metersPerUnit);
        const x=ax+(bx-ax)*start-uy*offset,y=ay+(by-ay)*start+ux*offset;
        const path={x,y,dx,dy},t=.5+.46*Math.sin(phase);
        const px=x+dx*t,py=y+dy*t,r=Math.hypot(px-player.x,py-player.y)*metersPerUnit;
        if(r<11||r>85||[0,.25,.5,.75,1].some(q=>worldContact(x+dx*q,y+dy*q,.26/metersPerUnit)||
          roadAt(x+dx*q,y+dy*q,-.16/metersPerUnit)))continue;
        const forward=(px-player.x)*Math.cos(player.heading)+(py-player.y)*Math.sin(player.heading);
        paths.push({walker:{x:px,y:py,path,heading,phase,localId:(dense?'evening:':'')+index+':'+side+':'+section, // A22 keep daytime identities stable
          skin:['npc_student','npc_colleague','npc_boss','npc_vendor'][(index+section)%4]},
          priority:Math.abs(r-26)+(forward<0?70:0)});
        break;
      }
    }
  }
  return paths.sort((a,b)=>a.priority-b.priority).map(entry=>entry.walker);
}
// Keep sparse approach descriptions in metre-sized cells. Materialize only an
// admitted approach's scooter rows, including the curbside cross-street wait.
const packCell=96*speedUnits,packGrid=new Map(),signalPacks=new Map();
function registerPack(pack){
  const key=Math.floor(pack.x/packCell)+','+Math.floor(pack.y/packCell);
  if(!packGrid.has(key))packGrid.set(key,[]);
  packGrid.get(key).push(pack);
  if(pack.signal){
    if(!signalPacks.has(pack.signal))signalPacks.set(pack.signal,[]);
    signalPacks.get(pack.signal).push(pack);
  }
}

for(const [index,[,,,,w,e]] of roads.entries()){
  if(e.way.layer!==0||w*metersPerUnit<5.8||e.d*metersPerUnit<14)continue;
  for(const [origin,end,allowed] of [[e.a,e.b,e.forward],[e.b,e.a,e.reverse]]){
    const node=roadNodes[end],start=roadNodes[origin];
    const major=isMajor(e.way.kind,e.way.name);
    if(!allowed||node.around.length<3&&!major)continue;
    const signal=signalForNode.get(end);
    if(!signal&&!major&&e.way.name!=='吳興街')continue;
    const heading=Math.atan2(node.y-start.y,node.x-start.x);
    const cols=(e.forward&&e.reverse?w*.5:w)*metersPerUnit>=3.7?3:2;
    const slots=9+index%7,edge={...e,to:end};
    const guide={node:origin,scooter:true,id:'guide',queueColumn:0};
    driveSegment(guide,edge);
    const stop=stopLine(guide)*metersPerUnit+.20;
    const size=Math.min(slots,cols*Math.ceil((e.d*metersPerUnit-1.1-stop)/2.82));
    if(size<4)continue;
    const middle=Math.floor(size/2),column=middle%cols;
    const lane=trafficLane(start,node,edge,{scooter:true,queueColumn:column*2/(cols-1)-1});
    for(let upstream=0;upstream===0||upstream+24<e.d*metersPerUnit;upstream+=38){
      const back=(stop+upstream+Math.floor(middle/cols)*2.82+column*.16)*speedUnits;
      registerPack({x:node.x+lane.x-Math.cos(heading)*back,y:node.y+lane.y-Math.sin(heading)*back,
        heading,edge,origin,cols,size,stop,upstream,index,signal:upstream===0?signal:null});
    }
  }
}

function packScooter(pack,j,turnPocket=false,openCarriageway=false){
  const {edge,origin,stop,index,heading,upstream}=pack;
  const span=edge.w*metersPerUnit;
  // A free one-way carriageway can take a broad front row. During peak flow
  // leave the adjacent through lane free, and use the compact queue instead.
  const broad=openCarriageway&&!turnPocket&&edge.forward!==edge.reverse&&span>=6.15;
  const cols=broad?Math.min(12,Math.floor(span/.77)):pack.cols,col=j%cols,look=index*17+j;
  const id='q'+index+':'+edge.to+':'+j+(upstream?'@'+upstream:'')+(turnPocket?':turn':'');
  const car={id,node:origin,heading,scooter:true,service:null,speed:0,look,
    color:carColors[look%carColors.length],queueColumn:turnPocket?1:col*2/(cols-1)-1,turnPocket};
  driveSegment(car,edge);
  if(broad){
    const compact=Math.min(1.18,(span-.88)*.43);
    const extra=car.queueColumn*((span-.78)*.5-compact)*speedUnits;
    // Keep the waiting row parallel through the junction. driveSegment chooses
    // normal travelling lanes on the next edge.
    car.end={x:car.end.x-Math.sin(heading)*extra,y:car.end.y+Math.cos(heading)*extra};
  }
  const back=(turnPocket?stop+j*2.62:stop+upstream+Math.floor(j/cols)*2.82+col*.16)*speedUnits;
  if(back+1.1*speedUnits>=edge.d)return null;
  car.x=car.end.x-Math.cos(heading)*back;
  car.y=car.end.y-Math.sin(heading)*back;
  const stopX=car.end.x-Math.cos(heading)*stop*speedUnits,stopY=car.end.y-Math.sin(heading)*stop*speedUnits;
  if(obstructsEntrance(car.x,car.y,scooterReach)||obstructsEntrance(stopX,stopY,scooterReach))return null;
  return car;
}

function localPacks(player){
  const ux=Math.cos(player.heading),uy=Math.sin(player.heading),ranked=[];
  const cx=Math.floor(player.x/packCell),cy=Math.floor(player.y/packCell);
  for(let ix=cx-3;ix<=cx+3;ix++)for(let iy=cy-3;iy<=cy+3;iy++){
    for(const pack of packGrid.get(ix+','+iy)??[]){
      const ahead=((pack.x-player.x)*ux+(pack.y-player.y)*uy)*metersPerUnit;
      const side=Math.abs((pack.y-player.y)*ux-(pack.x-player.x)*uy)*metersPerUnit;
      if(ahead< -48||ahead>240||side>110)continue;
      ranked.push({pack,score:Math.abs(ahead-16)+side*3+(ahead<8?80:0)+(pack.signal?0:4)});
    }
  }
  return ranked.sort((a,b)=>a.score-b.score||a.pack.index-b.pack.index).map(r=>r.pack);
}
function scooterWindows(car){
  if(!car.entranceWindows){
    // At turns the previous lane ends off the new centreline. Follow the actual trajectory.
    car.entranceWindows=entranceWindows(car,car.end,scooterReach);
  }
  return car.entranceWindows;
}
function clearWalkingPath(walker){
  let start=walker.path,end;
  if(start)end={x:start.x+start.dx,y:start.y+start.dy};
  else if(walker.crossing){
    const {x,y,dx,dy,width,crosswalk}=walker.crossing,side=(width+1.2*speedUnits)/2;
    const cx=x+dx*(crosswalk+1)*speedUnits,cy=y+dy*(crosswalk+1)*speedUnits;
    start={x:cx+dy*side,y:cy-dx*side};end={x:cx-dy*side,y:cy+dx*side};
  }else return true;
  const reach=Math.hypot(walker.r??radius.foot,walker.width??radius.foot);
  return entranceWindows(start,end,reach).length===0;
}
function advanceCar(car,dt,player,clock,space,passage,flow) {
  const {x,y}=car.end,heading=Math.atan2(y-car.y,x-car.x);
  const aheadX=player.x-car.x,aheadY=player.y-car.y;
  const ahead=aheadX*Math.cos(heading)+aheadY*Math.sin(heading);
  const across=aheadX*Math.sin(heading)-aheadY*Math.cos(heading);
  const yielding=player.skin==='grandma'&&ahead>0&&ahead<124&&Math.abs(across)<37;
  const junction=roadNodes[car.node],gap=Math.hypot(x-car.x,y-car.y);
  const r=colliderRadius(car);
  if(car.roadKind==null){
    // Actor fixtures can supply a fixed heading and destination without a road route.
    const step=Math.min(gap,car.speed*dt);
    const end=sweep(car.x,car.y,car.x+Math.cos(heading)*step,car.y+Math.sin(heading)*step,
      (x,y)=>curbContact(x,y,r,.95*speedUnits,car.heading)||worldContact(x,y,r,.95*speedUnits,car.heading)||space.hit(x,y,r,car));
    car.x=end.x;car.y=end.y;
    return;
  }
  if(car.turnStage){ // A24 keep clearance and occupancy checks on both legs.
    const turn=car.turnStage;
    const len=distance(car,turn.box);
    if(len>.4*speedUnits){
      const step=Math.min(len,3*speedUnits*dt),yaw=Math.atan2(turn.box.y-car.y,turn.box.x-car.x);
      const moved=sweep(car.x,car.y,car.x+Math.cos(yaw)*step,car.y+Math.sin(yaw)*step,
        (x,y)=>worldContact(x,y,r,.37*speedUnits,yaw)||space.hit(x,y,r,car));
      car.heading=yaw;car.speed=dt?distance(car,moved)/dt:0;car.x=moved.x;car.y=moved.y;return;
    }
    if(waitSeconds(turn.j,turn.group,clock,flow.time)>0){car.speed=0;car.redWait=true;return;}
    car.turnStage=null;driveSegment(car,turn.next);return;
  }
  const windows=car.scooter?scooterWindows(car):[];
  let line=stopLine(car);
  for(const span of windows)if(line>=span.far&&line<=span.near)line=span.near+.1*speedUnits;
  const halfWidth=(car.scooter?.37:car.service==='bus'?1.25:car.service?1.02:.95)*speedUnits;
  const contact=(x,y)=>curbContact(x,y,r,halfWidth,car.heading)||worldContact(x,y,r,halfWidth,car.heading)||space.hit(x,y,r,car); // A24
  if(car.bypass){
    const target=car.bypass.target,len=distance(car,target),step=Math.min(len,dt*3.2*speedUnits);
    if(step>0){
      const end=sweep(car.x,car.y,car.x+(target.x-car.x)*step/len,car.y+(target.y-car.y)*step/len,contact);
      if(distance(car,end)>.02){
        car.speed=distance(car,end)/dt;
        car.x=end.x;car.y=end.y;
        if(distance(end,target)<.02){
          car.end=car.bypass.end;car.entranceWindows=null;car.bypass=null;car.stuck=0;
        }
        return;
      }
      car.bypass=null;
    }else return;
  }
  const green=signalAt(car,junction,flow.time,clock);
  const controlled=green!=null,red=green===false;
  const reservationKey=flow.key(car.node); // A24 one FIFO reservation for the merged flashing junction.
  const major=isMajor(car.roadKind,car.roadName);
  const internal=signalForNode.has(junction.index)&&signalForNode.get(junction.index)===signalForNode.get(car.previous);
  const intersection=junction.around.length>2&&!internal;
  car.redWait=false;
  car.exitBlocked=false;
  let room=Infinity;
  if(!car.committed&&(controlled||intersection)){
    const remaining=gap-line;
    const decisionDistance=car.speed**2/(2*braking)+Math.max(2*speedUnits,car.speed*.12);
    if(red)room=Math.max(0,remaining);
    if(remaining<decisionDistance){
      room=Math.max(0,remaining);
      car.queuedAt??=clock;
      const queued=flow.queues.get(reservationKey);
      const active=flow.crossing.get(reservationKey);
      const next=car.nextEdge??=nextTrafficEdge(car,junction);
      let exit=false;
      if(next){
        const dest=roadNodes[next.to],lane=trafficLane(junction,dest,next,car);
        const h=Math.atan2(dest.y-junction.y,dest.x-junction.x);
        const probe=Math.min(next.d*.7,8*speedUnits);
        const occupied=space.hit(junction.x+lane.x+Math.cos(h)*probe,junction.y+lane.y+Math.sin(h)*probe,r+speedUnits,{...car,heading:h,ignore:car});
        exit=!occupied||occupied.kind==='vehicle'&&!occupied.body.impact&&occupied.body.speed>3*speedUnits&&
          Math.abs(angleDiff(occupied.body.heading,h))<.3;
      }
      car.exitBlocked=!exit;
      const compatible=!active||Math.abs(angleDiff(active.approach,car.approach))<.32&&active.next===next?.to;
      const first=!queued||queued===car||Math.abs(angleDiff(queued.approach,car.approach))<.32||
        !controlled&&major&&!isMajor(queued.roadKind,queued.roadName)&&clock-queued.queuedAt<2.5;
      if(!red&&exit&&compatible&&first){
        room=Infinity;
        if(remaining<=speedUnits){
          car.committed=true;
          flow.crossing.set(reservationKey,{approach:car.approach,next:next.to});
        }
      }
      car.redWait=red&&remaining<2*speedUnits;
    }
  }
  const near=passage&&Math.hypot(car.x-passage.x,car.y-passage.y)<280;
  const inPassage=near&&(car===passage.blocker||corridorDistance(car,passage)<3.2/metersPerUnit);
  if(car.yieldMove&&car.yieldMove.until<=clock)car.yieldMove=null;
  if(car.yieldMove&&car.yieldMove.until>clock&&near){
    const clear=corridorDistance(car,passage);
    if(clear>=3.4/metersPerUnit)return;
    const step=dt*27,move=car.yieldMove;
    const x=car.x+step*move.dx,y=car.y+step*move.dy;
    if(!blocked(x,y,16)&&!contact(x,y)){
      car.x=x;car.y=y;
      return;
    }
    car.yieldMove=null;
  }
  // Cars already occupying the player corridor keep advancing. Cars outside
  // it yield before entering, which stops new traffic from filling the gap.
  const priorHeading=car.heading;
  const ux=Math.cos(heading),uy=Math.sin(heading);
  // An elongated probe finds physical headway, including obstacles feeding in from A14.
  const look=Math.min(gap+2*speedUnits,(2.2*speedUnits)+car.speed*.65+car.speed**2/(2*braking));
  // Before entering a keep-clear area, look for a queue all the way to its exit.
  const reservation=windows.findLast(span=>gap>=span.near&&gap-span.near<look);
  const hitAhead=length=>space.hit(car.x+ux*length/2,car.y+uy*length/2,r+length/2,{...car,heading,ignore:car});
  let holdingEntrance=false;
  if(reservation){
    const clearance=gap-reservation.far+2*r+speedUnits;
    // Check the entire swept lane, including static world geometry and the exit pocket.
    if(hitAhead(clearance)||worldContact(car.x+ux*clearance/2,car.y+uy*clearance/2,r+clearance/2,halfWidth,heading)){
      holdingEntrance=true;
      room=Math.min(room,Math.max(0,gap-reservation.near));
    }
  }
  let leadSpeed=0;
  if(look>0){
    const lead=hitAhead(look);
    if(lead){
      let low=0,high=look;
      for(let i=0;i<4;i++){
        const mid=(low+high)/2;
        if(hitAhead(mid))high=mid;else low=mid;
      }
      if(lead.kind==='vehicle'&&Math.abs(angleDiff(heading,lead.body.heading))<.32){
        leadSpeed=lead.body.speed;
        car.redWait||=lead.body.redWait;
      }
      // Match the moving leader instead of braking as though it were stationary.
      const spacing=low-(.65*speedUnits+car.speed*.18);
      const safeSpeed=Math.sqrt(Math.max(0,leadSpeed**2+2*braking*spacing));
      leadSpeed=Math.min(leadSpeed,safeSpeed);
      room=Math.min(room,Math.max(0,low-.42*speedUnits));
      if(holdingEntrance)leadSpeed=0;
    }
  }
  const next=car.nextEdge??=nextTrafficEdge(car,junction)??false;
  const turn=next?Math.abs(angleDiff(Math.atan2(roadNodes[next.to].y-junction.y,roadNodes[next.to].x-junction.x),car.approach)):Math.PI;
  const cornerPace=(next?(turn<1.1?11:5):0)*speedUnits;
  const cornerSpeed=turn>.55&&gap<20*speedUnits?Math.sqrt(cornerPace**2+2*braking*gap):Infinity;
  if(!next&&gap<.35*speedUnits){
    car.terminal=true;car.speed=0;
    return;
  }
  const flashing=controlled&&(flow.time>=23||flow.time<6)&&gap<30*speedUnits; // A24
  const target=Math.min(car.cruise,flashing?6*speedUnits:Infinity,cornerSpeed,Math.sqrt(leadSpeed**2+2*braking*room))*
    (yielding?clamp((ahead-34)/90,0,1):1);
  const acceleration=(!major?(car.scooter?3.6:2.5):
    car.roadName==='松仁路'?(car.scooter?8.6:7.15):(car.scooter?8:6.6))*speedUnits;
  car.speed+=clamp(target-car.speed,-braking*dt,acceleration*dt);
  // A24 short OSM segments can put a painted stop line on the preceding edge.
  if(!car.committed&&room>0){
    const guard=gateAhead(car,ux,uy,Math.min(30,car.speed*dt*metersPerUnit+2),colliderRadius(car)*metersPerUnit);
    if(guard){
      const phase=signalState(guard.j,clock,flow.time)[guard.a.groupName];
      const extra=car.scooter?guard.a.stop-guard.a.box:0;
      if(phase==='red'||phase==='yellow'&&guard.distance*speedUnits>=car.speed**2/(2*braking)){
        room=Math.min(room,(guard.distance+extra)*speedUnits);
        car.redWait=room<2*speedUnits;
      }
    }
  }
  const step=Math.min(gap,room,car.speed*dt);
  car.heading=priorHeading+clamp(angleDiff(heading,priorHeading),-dt*2.6,dt*2.6);
  if(inPassage&&passage.priority&&passage.blocker===car&&!car.yieldMove){
    car.heading=priorHeading;
    const base=corridorDistance(car,passage);
    let action=null,high=0;
    for(const offset of [Math.PI/2,-Math.PI/2,Math.PI*.32,-Math.PI*.32,Math.PI,0]){
      const angle=priorHeading+offset,dx=Math.cos(angle),dy=Math.sin(angle);
      const target={x:car.x+dx*34,y:car.y+dy*34};
      const end=sweep(car.x,car.y,target.x,target.y,(x,y)=>blocked(x,y,16)||contact(x,y));
      const gap=corridorDistance(end,passage)-base;
      if(gap>high&&distance(car,end)>10){high=gap;action={dx,dy,until:clock+3.1};}
    }
    if(action){car.yieldMove=action;return;}
    car.heading=priorHeading+clamp(angleDiff(heading,priorHeading),-dt*2.6,dt*2.6);
  }
  if(inPassage&&passage.priority){
      const clearance=corridorDistance(car,passage);
      const ux=Math.cos(priorHeading),uy=Math.sin(priorHeading),step=dt*32;
      for(const [dx,dy] of [[-uy,ux],[uy,-ux],[-ux,-uy],[ux,uy]]){
        const ex=car.x+dx*step,ey=car.y+dy*step;
        const away=(ex-car.x)*(car.x-passage.x)+(ey-car.y)*(car.y-passage.y);
        if(!blocked(ex,ey,16)&&!contact(ex,ey)&&
          (corridorDistance({x:ex,y:ey},passage)>clearance+.005||away>.04)){
          car.heading=priorHeading;car.x=ex;car.y=ey;car.yieldMove={dx,dy,until:clock+3.1};return;
        }
      }
    }
  const moved=step>0?sweep(car.x,car.y,car.x+ux*step,car.y+uy*step,(x,y)=>
    (near&&!inPassage&&corridorDistance({x,y},passage)<3*speedUnits)||contact(x,y)):car;
  const progress=distance(car,moved);
  if(progress>.02){
    car.x=moved.x;car.y=moved.y;
    if(progress<step-.02||step===room)car.speed=progress/dt;
    car.stuck=0;
    car.reversed=0;
    if(gap-progress<.02&&next){
      const reservation=car.committed?{node:car.node,approach:car.approach,next:next.to}:null;
      car.signal=Math.abs(turn)>.32&&Math.abs(turn)<2.75?
        Math.sign(angleDiff(Math.atan2(roadNodes[next.to].y-junction.y,roadNodes[next.to].x-junction.x),heading)):0;
      car.signalUntil=clock+1.15;
      const j=crossingForNode.get(car.node),a=car.turnEntry;
      const exit=roadNodes[next.to];
      const left=a&&((exit.x-junction.x)*a.dy-(exit.y-junction.y)*a.dx)<-.45*next.d;
      if(car.scooter&&j?.twoStage&&a?.turnBox&&left&&crossingForNode.get(next.to)!==j){
        car.turnStage={j,group:!a.group,next,box:{x:a.turnBox.x*speedUnits,y:a.turnBox.y*speedUnits}};
        car.committed=false;car.leaving=null;car.speed=0;
      }else driveSegment(car,next);
      if(reservation&&!car.turnStage)car.leaving=reservation;
    }
    return;
  }
  car.heading=priorHeading;
  if(dt===0)return;
  car.speed=0;
  car.stuck=car.redWait?0:(car.stuck??0)+dt;
  if(holdingEntrance||car.stuck<3)return;

  // Move laterally to a clear strip and keep that strip until the next road edge.
  const sideX=-Math.sin(car.approach),sideY=Math.cos(car.approach);
  if(gap>line+5*speedUnits&&!car.bypass){
    for(const offset of [-2.15,2.15]){
      const dx=sideX*offset*speedUnits,dy=sideY*offset*speedUnits;
      const target={x:car.x+dx,y:car.y+dy};
      const ahead={x:target.x+Math.cos(car.approach)*4*speedUnits,y:target.y+Math.sin(car.approach)*4*speedUnits};
      if(car.scooter&&obstructsEntrance(target.x,target.y,scooterReach))continue;
      if(!roadAt(target.x,target.y,-halfWidth)||!roadAt(ahead.x,ahead.y,-halfWidth)||contact(ahead.x,ahead.y))continue;
      const shift=sweep(car.x,car.y,target.x,target.y,(x,y)=>contact(x,y));
      if(distance(shift,target)>.02)continue;
      car.bypass={target,end:{x:car.end.x+dx,y:car.end.y+dy}};
      return;
    }
  }
  // A short reverse gives a car pinned against a corner space to turn again.
  const backX=car.x-Math.cos(car.heading)*dt*1.3*speedUnits;
  const backY=car.y-Math.sin(car.heading)*dt*1.3*speedUnits;
  if(car.scooter&&obstructsEntrance(backX,backY,scooterReach))return;
  if(!roadAt(backX,backY,-halfWidth)||contact(backX,backY)||car.reversed>=2.2*speedUnits)return;
  car.reversed=(car.reversed??0)+Math.hypot(backX-car.x,backY-car.y);
  car.x=backX;car.y=backY;
  car.speed=1.3*speedUnits;
}

export function createSimulation(canvas,draw,minimapCanvas,options={}) {
  const home=byId.get('home');
  const facing=id=>(byId.get(id)?.viewHeading??Math.PI/2)+Math.PI;
  const player={x:home.x,y:home.y,heading:facing('home'),speed:0,mode:'foot',skin:'ae',locationId:null};
  const camera={x:home.x,y:home.y-22,zoom:1};
  const pool=buildTraffic();
  let packClock=0,primedPacks=false;
  const space=occupancy(),staticSpace=occupancy(),doorSpace=occupancy(),obstacleSpace=occupancy();
  const trafficSpace={hit(x,y,r,body){return space.hit(x,y,r,body)??staticSpace.hit(x,y,r,body)??doorSpace.hit(x,y,r,body);}};
  let hasTrafficObstacles=false;
  const npcTrafficSpace={hit(x,y,r,body){return trafficSpace.hit(x,y,r,body)??(hasTrafficObstacles?obstacleSpace.hit(x,y,r,body):null);}};
  const fixtures=fixtureColliders();
  const eveningFixtures=fixtures.concat(marketColliders); // A23 night: physics and the camera read the same bodies.
  const doorLeaves=[-1,1].map(side=>({side,r:officeDoor.halfLeaf/metersPerUnit,
    width:.065/metersPerUnit,heading:officeDoor.heading,type:'officeDoor'}));
  let officeParking=false;
  let finalWalk=null,finalWalkSince=0,approachingEntrance=false; // A24 last metres of automatic navigation
  let staticRegistry;
  // A14 impact
  const featured=createFeaturedTraffic(); // A22 curb cars share A14 occupancy.
  const impact=createImpact(),parkedColliders=new Map();

  const params=new URLSearchParams(canvas.ownerDocument.defaultView?.location.search);
  const auditEnabled=params.has('collisionAudit'),rideDebug=auditEnabled||params.has('rideDebug');
  const audit={visibleDiscontinuities:0,visibleBirths:0,visibleRemovals:0,visibleJumps:0,frames:0,playerVehicle:0,playerPerson:0,playerStatic:0,carCar:0,personVehicle:0,camera:0,hiddenCars:0,hiddenPeople:0,blockedAutoFrames:0};
  const people=[];
  let streetTraffic=[],peakSeedOrigin=null,peakSeeds=[],nextTrafficRefresh=0,nextPedestrianRefresh=0;
  const presentCars=new Set(),pendingWalkers=[],crossingPaths=new Map(); // A24
  let previousView=new Map(),previousRoster=new Set(),previousAuditRevision=-1,priming=false;
  let trafficConfigured=false,trafficTarget=0,spawnCursor=0,waiting=0,nextReroute=0,nextNetworkReplan=0,rideWait=0;
  const congestion=[];
  let followedCar=null,followedSince=0,lastLeadContact=-Infinity;
  const followingDelay=()=>state.clock-lastLeadContact<.8?state.clock-followedSince:0;
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
  const state={featuredParked:featured.parked,player,camera,joy,staticColliders:fixtures,npcs:[],markers:[],speech:new Map(),cars:[],walkers:[],target:null,
    officeDoorProgress:0,time:17.35,viewRevision:0,weather:'clear',filter:'none',clock:0,shake:0,touch:matchMedia('(pointer: coarse)').matches,largeMap:false};
  state.impact=impact; // A14 impact
  let enabled=true,paused=false,running=false,frame=0,last=null,crashCooldown=0;
  let joystick=null,waypoint=null,density=.55,velocityX=0,velocityY=0,flight=null;
  let teslaHop=null,teslaBody=player;
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
    if(mode==='scooter'&&curbContact(x,y,r,.37*speedUnits,heading))return false; // A24
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
  const teslaLength=2.4*speedUnits,teslaWidth=1.06*speedUnits;
  function teslaContact(x,y,heading){
    const pose={width:teslaWidth,heading,ignore:teslaBody};
    return curbContact(x,y,teslaLength,teslaWidth,heading)||worldContact(x,y,teslaLength,teslaWidth,heading)||trafficSpace.hit(x,y,teslaLength,pose);
  }
  function incidentGuard(body,heading=body.heading){
    const fx=Math.cos(heading),fy=Math.sin(heading);
    const edge=body.roadEdge;
    const street=edge?[roadNodes[edge.a].x,roadNodes[edge.a].y,roadNodes[edge.b].x,roadNodes[edge.b].y,edge.w,edge]:
      roadOptions(body.x,body.y,4).find(({r,d})=>d<r[4]*.5&&
        Math.abs((r[2]-r[0])*fx+(r[3]-r[1])*fy)>r[5].d*.88)?.r;
    if(!street)return ()=>false;
    const [ax,ay,bx,by,w,e]=street;
    const positive=(bx-ax)*fx+(by-ay)*fy>=0;
    if(!(positive?e.forward:e.reverse))return ()=>false;
    const dx=(bx-ax)/e.d*(positive?1:-1),dy=(by-ay)/e.d*(positive?1:-1);
    const x0=positive?ax:bx,y0=positive?ay:by,to=positive?e.b:e.a,from=positive?e.a:e.b;
    const junction=crossingForNode.get(to),mark=junction?.approaches.find(a=>a.to===from);
    const red=junction&&signalState(junction,state.clock,state.time)[signalGroup(junction,dx,dy)?'a':'b']==='red';
    return (x,y,length,width,yaw)=>{
      const lateral=(y-y0)*dx-(x-x0)*dy,along=(x-x0)*dx+(y-y0)*dy;
      const parallel=Math.cos(yaw)*dx+Math.sin(yaw)*dy,cross=Math.sin(yaw)*dx-Math.cos(yaw)*dy;
      const side=Math.abs(cross)*length+Math.abs(parallel)*width;
      const front=Math.abs(parallel)*length+Math.abs(cross)*width;
      const bound=e.forward&&e.reverse?0:-w/2;
      return lateral-side>=bound&&lateral+side<=w/2&&along>=0&&
        along+front<=e.d-(red?(mark?.stop??6.2)*speedUnits:0);
    };
  }
  function setFlyingTesla(active){
    if(Boolean(active)===(player.vehicle==='flyingTesla'))return true;
    if(teslaHop)return false;
    if(active){
      let parking=null;
      for(const site of roadOptions(player.x,player.y,5)){
        const {r}=site,axis=Math.atan2(r[3]-r[1],r[2]-r[0]);
        if(distance(player,site)>18*speedUnits||r[4]<3*speedUnits)continue;
        const heading=r[5].forward&&(!r[5].reverse||Math.abs(angleDiff(axis,player.heading))<Math.PI/2)?axis:axis+Math.PI;
        const offset=r[5].forward&&r[5].reverse?Math.min(r[4]*.25,1.5*speedUnits):0;
        const x=site.x-Math.sin(heading)*offset,y=site.y+Math.cos(heading)*offset;
        if(!teslaContact(x,y,heading)){parking={x,y,heading};break;}
      }
      if(!parking)return false;
      setRide(false);
      Object.assign(player,parking,{vehicle:'flyingTesla',altitude:0});
      state.viewRevision++;
      setMode('foot');
    }else{
      teslaBody=player;
      delete player.vehicle;
      delete player.altitude;
    }
    velocityX=velocityY=player.speed=0;
    updateLocation();updateContext();refresh();
    return true;
  }
  function planTeslaHop(heading,obstacleAt){
    const fx=Math.cos(heading),fy=Math.sin(heading);
    let clearance=5.5;
    for(let meters=1;meters<=36;meters++){
      const x=player.x+fx*meters*speedUnits,y=player.y+fy*meters*speedUnits;
      const obstruction=worldContact(x,y,teslaLength,teslaWidth,heading);
      if(obstruction==='boundary')return null;
      if(obstruction==='building'){
        clearance=Math.max(clearance,buildingHeightAt(x,y,teslaLength,teslaWidth,heading)+1.8);
        if(clearance>20)return null;
      }
      const pose={width:teslaWidth,heading,ignore:teslaBody};
      const traffic=trafficSpace.hit(x,y,teslaLength,pose)?.body;
      if(traffic?.service==='bus')clearance=Math.max(clearance,6.5);
      if(meters>=obstacleAt+5&&!obstruction&&!traffic){
        // A24 choose the nearest clear lane when the projected touchdown is on paving.
        const landing=laneTouchdown(x,y,heading,teslaLength,teslaWidth,(cx,cy)=>!teslaContact(cx,cy,heading));
        if(!landing||towerBlocksHop(player.x,player.y,landing.x,landing.y,teslaLength,teslaWidth,heading,clearance))continue; // A23 towers / A24 projected landing
        return {x:landing.x,y:landing.y,fromX:player.x,fromY:player.y,clearance,time:0,travel:meters/14};
      }
    }
    return null;
  }
  function steerTesla(dt,dx,dy){
    const hop=teslaHop;
    if(hop){
      const rise=.72,fall=.8,end=rise+hop.travel;
      const easing=t=>t*t*(3-2*t);
      hop.time+=dt;
      const fraction=clamp((hop.time-rise)/hop.travel,0,1);
      const blockedLanding=hop.time>=end&&teslaContact(hop.x,hop.y,player.heading);
      if(blockedLanding){
        hop.time=end;
        player.altitude=hop.clearance;
      }else{
        player.altitude=hop.clearance*(hop.time<rise?easing(hop.time/rise):1-easing(clamp((hop.time-end)/fall,0,1)));
      }
      player.x=hop.fromX+(hop.x-hop.fromX)*fraction;
      player.y=hop.fromY+(hop.y-hop.fromY)*fraction;
      player.speed=fraction>0&&fraction<1?14*speedUnits:0;
      if(hop.time>=end+fall)teslaHop=null;
      return;
    }
    player.speed=0;
    const input=Math.min(1,Math.hypot(dx,dy));
    if(input<.035)return;
    const desired=Math.atan2(dy,dx);
    const heading=player.heading+clamp(angleDiff(desired,player.heading),-2.7*dt,2.7*dt);
    if(!teslaContact(player.x,player.y,heading))player.heading=heading;
    const fx=Math.cos(player.heading),fy=Math.sin(player.heading);
    if(Math.abs(angleDiff(desired,player.heading))<.48){
      for(let meters=1;meters<=9;meters++){
        const x=player.x+fx*meters*speedUnits,y=player.y+fy*meters*speedUnits;
        if(!teslaContact(x,y,player.heading))continue;
        teslaHop=planTeslaHop(player.heading,meters);
        if(teslaHop)return;
        break;
      }
    }
    const step=10.5*input*speedUnits*dt;
    const next=sweep(player.x,player.y,player.x+fx*step,player.y+fy*step,(x,y)=>
      teslaContact(x,y,player.heading),1.9);
    player.speed=dt?distance(player,next)/dt:0;
    Object.assign(player,next);
  }
  const ridingSpeed=()=>scooterSpeed*(player.skin==='grandma'?.4:1);
  const routeTo=(p,q,avoid=[])=>planRide(p,q,avoid,{clock:state.clock,hour:state.time,speed:ridingSpeed()}); // A24
  let waitStarted=0,waitSignal=null,nextPaceCheck=0;
  function notifySignal(j,seconds){
    if(waitSignal?.id===j?.id)return;
    const previous=waitSignal;
    waitSignal=j;waitStarted=state.clock;
    const payload={junctionId:(j??previous).id,seconds};
    emit('signal:wait',payload); // A24 public event and hint refresh use one transition.
    if(canvas.dispatchEvent&&typeof CustomEvent==='function')canvas.dispatchEvent(new CustomEvent('signal:wait',{bubbles:true,detail:payload}));
    emit('context:change',{...context,signalWait:j?payload:null});
  }
  // A24 quote the route from the same legal mounting position used at departure.
  function planDeparture(target){
    let mount=null;
    const tries=[];
    for(const reach of [33,90,200])tries.push([player.heading,false,reach]);
    for(let k=0;k<4;k++)tries.push([player.heading+k*Math.PI/2,true,300]);
    for(const [heading,onRoad,reach] of tries){
      const spot=legalNear(player,'scooter',heading,onRoad,reach);
      if(!spot)continue;
      mount??=spot;
      const plan=routeTo(spot,target);
      if(plan?.length)return {mount:spot,plan};
    }
    return {mount,plan:null};
  }
  function setRide(on,reason=on?'started':'cancelled') {
    if(on) {
      if(player.vehicle==='flyingTesla'||route || !state.target || distance(player,state.target)<2){state.rideFail=route?'busy':!state.target?'target':'other';return;}
      // 身邊被停放的機車或路邊物件擋住、或某個上車點規劃不出路線時，換更遠的點與不同方向再試，不要讓 G 默默失效
      const {mount,plan}=planDeparture(state.target);
      if(!mount||!plan){state.rideFail=mount?'route':'mount';return;}
      route=plan;
      state.rideFail=null;
      Object.assign(player,mount);
      rideRemaining=rideLength(player,route);
      cruise=route.cruise??rideCruiseSpeed(rideRemaining,ridingSpeed());
      rideStarted=state.clock;nextPaceCheck=state.clock+6;
      rideAnchor={goal:distance(player,state.target),time:state.clock};
      followedCar=null;lastLeadContact=-Infinity;
      waiting=0;escapeAfter=0;nextReroute=0;nextNetworkReplan=0;rideWait=0;congestion.length=0;
      setMode('scooter');
    } else {
      if(!route)return;
      route=null;detour=null;blocker=null;finalWalk=null;approachingEntrance=false; // A24
      if(waitSignal)notifySignal(null,0); // A24
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
    if(state.target!==previous){
      curbWalkHint=null; // A24 a newly selected destination can give its own curb prompt.
      if(route)setRide(false);
    }
  }
  function updateOfficeDoor(dt){
    const want=nearOfficeDoor(player,5)?1:0;
    const position=state.officeDoorProgress;
    const progress=position+clamp(want-position,-dt/officeDoor.seconds,dt/officeDoor.seconds);
    if(progress===position&&doorLeaves[0].x!==undefined)return;
    state.officeDoorProgress=progress;
    doorSpace.clear();
    for(const leaf of doorLeaves){
      Object.assign(leaf,officeLeaf(leaf.side,progress));
      doorSpace.put(leaf,leaf.r,'static');
    }
  }
  updateOfficeDoor(0);
  function updateLocation() {
    const goal=entrances.get(state.target?.id); // A24 wait for the actual pedestrian arrival before notifying the game
    const pending=goal&&!player.vehicle&&(player.mode==='scooter'||finalWalk&&(distance(player,goal)>=.06*speedUnits||!surfaceAt(player.x,player.y)));
    const atGoal=goal&&!pending&&player.mode==='foot'&&distance(player,goal)<.16*speedUnits; // A24 prefer the active entrance in overlapping location radii
    const next=atGoal?state.target.id:nearOfficeDoor(player,5)&&!pending?'office':
      locations.find(location=>(!pending||location!==state.target)&&distance(location,player)<=locationRadius)?.id??null;
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
  let curbWalkHint=null; // A24 show the manual dismount hint once per destination and contact.
  function besideCurb(heading){ // A24 street furniture can cover the last metre of the lip.
    return curbContact(player.x,player.y,radius.rider+1.3*speedUnits,1.67*speedUnits,heading);
  }
  function curbDistance(site,entrance){ // A24 both coordinates are valid arrival points.
    return Math.min(distance(player,site),entrance?distance(player,entrance):Infinity);
  }
  function parkAtCurb(auto){
    const sites=state.target?[state.target]:state.markers.map(m=>byId.get(m.locationId));
    let goal=null,nearest=Infinity;
    for(const site of sites){
      const entrance=entrances.get(site?.id);
      if(!entrance)continue;
      const gap=curbDistance(site,entrance);
      if(gap<=15*speedUnits&&gap<nearest){nearest=gap;goal=entrance;}
    }
    if(!goal)return false;
    walkSelected=true;setMode('foot');state.standingPoint=null;
    if(auto){finalWalk=goal;finalWalkSince=state.clock;route=[goal];detour=null;blocker=null;nextReroute=0;}
    emit('curb:hint',{kind:'parked'});
    return true;
  }
  function manualCurb(){ // A24 one hint per contact with the selected destination nearby.
    if(parkAtCurb(false))return;
    const site=state.target;
    if(!site||curbWalkHint===site.id||curbDistance(site,entrances.get(site.id))>25*speedUnits)return;
    curbWalkHint=site.id;
    emit('curb:hint',{kind:'walk'});
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
    if(player.mode==='foot'&&nearOfficeDoor(player,3)){
      next={action:'enter',targetId:'office',targetName:byId.get('office').name};
    }
    for (const npc of next.action?[]:state.npcs) {
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
    if(context.action==='enter'&&player.mode==='foot'&&nearOfficeDoor(player,3)){
      const mark=state.markers.find(m=>m.locationId==='office');
      emit('interact',{kind:'marker',id:mark?.id??null,locationId:'office',entrance:true});
      return;
    }
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
    if(code==='KeyT'){setFlyingTesla(player.vehicle!=='flyingTesla');return;}
    if(player.vehicle==='flyingTesla'&&(code==='KeyF'||teslaHop&&actionKeys.has(code)))return;
    if (code==='KeyF') {
      if(player.mode==='foot'&&(!carriagewayAt(player.x,player.y)||surfaceAt(player.x,player.y))){ // A24
        emit('curb:hint',{kind:'road'});return;
      }
      if(finalWalk)setRide(false); // A24 explicit mount cancels the walking leg
      if(player.mode==='foot'&&!clearPose(player.x,player.y,'scooter',player.heading))return;
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
      } else if(Math.hypot(x-control.auto,y-control.flightY)<control.small+4)setFlyingTesla(player.vehicle!=='flyingTesla');
      else if (Math.hypot(x-control.auto,y-control.y)<control.small+4) setRide(!route);
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
    updateOfficeDoor(dt);
    if(!nearOfficeDoor(player,6))officeParking=false;
    if(!route&&player.mode==='scooter'&&nearOfficeDoor(player,3)){
      officeParking=true;
      setMode('foot');emit('curb:hint',{kind:'parked'}); // A24
    }
    crashCooldown=Math.max(0,crashCooldown-dt);
    state.shake=Math.max(0,state.shake-dt*2.9);
    for (const [id,bubble] of state.speech) if (bubble.until<=state.clock) state.speech.delete(id);
    space.clear();
    const activeCars=[];
    const playerRadius=player.mode==='scooter'?radius.rider:radius.foot;
    if((player.altitude??0)<1.2){
      if(player.vehicle==='flyingTesla'){
        teslaBody={...player,mode:undefined,width:teslaWidth};
        space.put(teslaBody,teslaLength,'player');
      }
      else space.put(player,playerRadius,'player');
    }
    for(const person of [...state.npcs,...streetCrowds])space.put(person,radius.foot,'person');
    if(staticRegistry!==state.staticColliders){
      staticRegistry=state.staticColliders;staticSpace.clear();
      // A14 impact
      parkedColliders.clear();
      for(const prop of staticRegistry??[]){
        if(impact.skipFixture(prop))continue;
        const item=staticSpace.put(prop,prop.r,'static');
        if(prop.type==='parked')parkedColliders.set(prop,item);
      }
    }
    const outsideView=body=>distance(body,player)>165/metersPerUnit&&
      !state.inActorView?.(body,true);
    featured.indexParked(state,space,staticSpace,radius,impact,outsideView); // A22
    for(const walker of state.walkers){
      walker.nearby=distance(walker,player)<300/metersPerUnit;
      walker.collider=space.put(walker,walker.r??radius.foot,'person');
    }
    obstacleSpace.clear();
    const obstacles=[...(options.extraObstacles?.()??[]),...impact.obstacles()];
    hasTrafficObstacles=obstacles.length>0;
    for(const obstacle of obstacles)obstacleSpace.put(obstacle,obstacle.r,'obstacle');
    const flash=state.time>=23||state.time<6;
    const flow={time:state.time,queues:new Map(),crossing:new Map(),
      key:node=>flash?(crossingForNode.get(node)?.node??node):node}; // A24
    const target=!route&&density>=.95?Math.min(trafficTarget,110):trafficTarget;
    let excess=state.cars.length-target;
    state.cars=state.cars.filter(car=>{
      // A14 impact
      if(car.impact){
        if(!impact.retire(car,outsideView(car)))return true;
        presentCars.delete(car.id);
        return false;
      }
      if(car.terminal&&outsideView(car)){
        presentCars.delete(car.id);
        return false;
      }
      if(car.stuck>6&&car!==blocker&&(state.inActorView?!state.inActorView(car,true):outsideView(car))){
        state.trafficRecycles=(state.trafficRecycles??0)+1;
        presentCars.delete(car.id);
        return false;
      }
      if(!outsideView(car)||(excess<=0&&distance(car,player)<300/metersPerUnit))return true;
      excess--;
      presentCars.delete(car.id);
      return false;
    });
    for(const car of state.cars)activeCars.push([car,space.put(car,colliderRadius(car),'vehicle')]);
    const canSpawn=body=>priming||outsideView(body);
    const offCamera=body=>{
      const dx=body.x-player.x,dy=body.y-player.y;
      if(Math.hypot(dx,dy)<55*speedUnits)return false;
      if(state.inActorView)return !state.inActorView(body,true);
      return dx*Math.cos(player.heading)+dy*Math.sin(player.heading)<-35*speedUnits;
    };
    const addCar=(seed,headway,local=false)=>{
      const car={...seed};
      // An ambient scooter needs a safe waiting point at the next junction.
      if(car.scooter&&(obstructsEntrance(car.x,car.y,scooterReach)||
        obstructsEntrance(car.end.x,car.end.y,scooterStopReach)))return;
      const quietSide=local&&offCamera(car);
      if(car.scooter&&!String(car.id).startsWith('q')&&state.cars.some(other=>other.scooter&&
        other.previous===car.previous&&other.node===car.node&&distance(other,car)<11*speedUnits))return;
      if(roadNodes[car.node].around.length>2&&distance(car,car.end)<stopLine(car)||
        roadNodes[car.previous].around.length>2&&distance(car,roadNodes[car.previous])<Math.min(5*speedUnits,car.segmentLength*.2)||
        presentCars.has(car.id)||car.laneWidth<serviceRoadWidth(car)||distance(car,player)>(local?315:275)/metersPerUnit||
        curbContact(car.x,car.y,colliderRadius(car),(car.scooter?.37:car.service==='bus'?1.25:car.service?1.02:.95)*speedUnits,car.heading)|| // A24
        !(canSpawn(car)||quietSide)||worldContact(car.x,car.y,colliderRadius(car),(car.scooter?.37:car.service?1.02:.95)/metersPerUnit,car.heading)||
        npcTrafficSpace.hit(car.x,car.y,colliderRadius(car)+headway,car))return;
      featured.dressArrival(car,state.clock); // A22 skin an admitted traffic body.
      presentCars.add(car.id);state.cars.push(car);
      activeCars.push([car,space.put(car,colliderRadius(car),'vehicle')]);
    };
    if(density>=.45&&(priming?!primedPacks:state.clock>=packClock)){
      primedPacks=priming;
      packClock=state.clock+4;
      for(const pack of state.cars.length<target?localPacks(player):[]){
        if(!priming&&(!pack.signal||!outsideView(pack)))continue;
        if(density>=.95&&!pack.signal)continue;
        const limit=Math.min(target,state.cars.length+Math.max(8,Math.round(pack.size*density)));
        const initial=state.cars.length;
        for(let j=0;j<pack.size&&state.cars.length<limit;j++){
          const seed=packScooter(pack,j,false,density<.95);
          if(!seed)continue;
          if(priming&&distance(seed,player)<6*speedUnits)continue;
          addCar(seed,.08*speedUnits);
        }
        if(state.cars.length-initial<4)continue;
        // Riders that finished the first stage wait at the outer edge of the
        // perpendicular approach and depart on its own ordinary signal phase.
        const turn=(signalPacks.get(pack.signal)??[]).find(arm=>
          Math.abs(angleDiff(arm.heading,pack.heading)+Math.PI/2)<.36&&
          arm.signal?.twoStage&&waitSeconds(arm.signal,signalGroup(arm.signal,Math.cos(arm.heading),Math.sin(arm.heading)),state.clock,state.time)>0);
        if(turn)for(let j=0;j<3&&state.cars.length<target;j++){
          const seed=packScooter(turn,j,true);
          if(seed&&distance(seed,player)>6*speedUnits)addCar(seed,.08*speedUnits);
        }
        break;
      }
    }
    if(priming&&density>=.40)for(const seed of streetTraffic){
      if(state.cars.length>=Math.ceil(target*(density>=.95?.77:.57)))break;
      addCar(seed,8);
    }
    if(!priming&&!route&&density>=.95&&state.clock>=nextTrafficRefresh){
      nextTrafficRefresh=state.clock+.8;
      const goal=Math.min(target,state.cars.length+9);
      if(!peakSeedOrigin||distance(peakSeedOrigin,player)>16*speedUnits||
        Math.abs(angleDiff(player.heading,peakSeedOrigin.heading))>.45){
        peakSeedOrigin={x:player.x,y:player.y,heading:player.heading};
        peakSeeds=nearbyStreetTraffic(player,true);
      }
      for(const seed of peakSeeds){
        if(state.cars.length>=goal)break;
        addCar(seed,1.5*speedUnits,true);
      }
    }
    if(!priming&&density>=.40&&density<.95&&state.clock>=nextTrafficRefresh){
      nextTrafficRefresh=state.clock+1.45;
      const focuses=route?[112,202,265].map(m=>trafficLookahead(m)).filter(Boolean):[player];
      for(const focus of focuses){
        const close=state.cars.filter(car=>distance(car,focus)<46/metersPerUnit).length;
        const goal=Math.min(trafficTarget+12,state.cars.length+Math.min(3,7-close));
        if(state.cars.length>=goal)continue;
        for(const seed of nearbyStreetTraffic(focus)){
          if(state.cars.length>=goal)break;
          addCar(seed,8,true);
        }
      }
    }
    for(let attempts=0;attempts<32&&state.cars.length<target;attempts++)addCar(pool[spawnCursor++%pool.length],1.5*speedUnits);
    const neonEvening=(state.time>=18||state.time<5)&&neonDistrict(player.x,player.y); // A22 night crowd
    if(density>0)featured.approach(state,metersPerUnit); // A22 service the cadence in stable queues.
    if(density>=.2&&(priming?state.clock===0:state.inActorView&&state.clock>=nextPedestrianRefresh)){
      nextPedestrianRefresh=state.clock+1.55;
      if(!priming&&state.inActorView){
        state.walkers=state.walkers.filter(walker=>{
          // A22 retire extra evening routes after dawn or district exit once out of view.
          if(walker.zone&&!walkScheduled(walker,state.time))return state.inActorView(walker,true);
          if(!neonEvening&&walker.localId?.startsWith('evening:'))return state.inActorView(walker,true);
          return !walker.localId||distance(walker,player)<425/metersPerUnit||state.inActorView(walker,true);
        });
      }
      const focuses=priming?[0,52,105].map(m=>({
        x:player.x+Math.cos(player.heading)*m/metersPerUnit,
        y:player.y+Math.sin(player.heading)*m/metersPerUnit,heading:player.heading,
      })):route?[56,117,178,242].map(m=>trafficLookahead(m)).filter(Boolean):[player];
      const localIds=new Set(state.walkers.map(walker=>walker.localId));
      for(const focus of focuses){
        const promenades=districtWalks(focus,state.time);
        const target=pedestrianTarget(focus,state.time,neonEvening&&neonDistrict(focus.x,focus.y));
        let remaining=target-state.walkers.filter(walker=>distance(walker,focus)<41/metersPerUnit).length;
        if(remaining<=0)continue;
        const sidewalk=density>=.4&&(density<.95||neonEvening||target>7)?nearbySidewalks(focus,neonEvening):[];
        for(const seed of [...promenades,...sidewalk]){
          const walker={...seed};
          if(priming&&distance(walker,player)<6*speedUnits)continue;
          if(!remaining)break;
          if(localIds.has(walker.localId)||(!priming&&(distance(walker,player)<40/metersPerUnit||
              !state.inActorView||state.inActorView(walker,true)))||trafficSpace.hit(walker.x,walker.y,(walker.r??radius.foot)+2,walker))continue;
          if(!clearWalkingPath(walker))continue;
          walker.collider=space.put(walker,walker.r??radius.foot,'person');
          state.walkers.push(walker);localIds.add(walker.localId);remaining--;
        }
      }
    }
    for(let i=pendingWalkers.length-1;i>=0;i--){
      const walker=pendingWalkers[i];
      if(walker.crossing&&!walker.arm){ // A24 find a clear start at either real curb.
        if(distance(walker.crossing,player)>320*speedUnits||!canSpawn(walker))continue;
        let paths=crossingPaths.get(walker.crossing);
        if(!paths){
          paths=[];
          for(const a of walker.crossing.approaches.filter(a=>a.walk)){
            const w=a.walk,side=w.span/2+.55;
            for(const shift of [0,.45,-.45]){
              const cx=w.x+w.dx*shift,cy=w.y+w.dy*shift;
              const point=s=>({x:(cx-w.dy*s)*speedUnits,y:(cy+w.dx*s)*speedUnits});
              const legal=s=>{const p=point(s);return !worldContact(p.x,p.y,radius.foot)&&!staticSpace.hit(p.x,p.y,radius.foot);};
              if(![-side,-side+.5,0,side-.5,side].every(legal))continue;
              for(const sign of [-1,1])paths.push({...point(sign*side),shift,arm:a,toSide:-sign});
              break;
            }
          }
          crossingPaths.set(walker.crossing,paths);
        }
        const path=paths.find(p=>canSpawn(p)&&!trafficSpace.hit(p.x,p.y,radius.foot+2,walker));
        if(!path)continue;
        Object.assign(walker,path);
      }
      if(!canSpawn(walker)||worldContact(walker.x,walker.y,radius.foot)||trafficSpace.hit(walker.x,walker.y,(walker.r??radius.foot)+2,walker))continue;
      pendingWalkers.splice(i,1);
      walker.collider=space.put(walker,walker.r??radius.foot,'person');
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
      if(spans.length){
        const slowLead=rideWait>4&&followingDelay()>2;
        passage={x:player.x,y:player.y,priority:waiting>=1.2||slowLead,spans,blocker:slowLead?followedCar:blocker};
      }
    }
    for(const [car] of activeCars){
      if(car.leaving&&distance(car,roadNodes[car.leaving.node])>9*speedUnits)car.leaving=null;
      if(car.leaving)flow.crossing.set(flow.key(car.leaving.node),car.leaving);
      if(car.committed)flow.crossing.set(flow.key(car.node),{approach:car.approach,next:car.nextEdge?.to});
      if(car.queuedAt==null||car.committed||car.exitBlocked||signalAt(car,roadNodes[car.node],state.time,state.clock)===false)continue;
      const oldest=flow.queues.get(flow.key(car.node));
      if(!oldest||car.queuedAt<oldest.queuedAt)flow.queues.set(flow.key(car.node),car);
    }
    // A14 impact
    const impactColliders=new Map();
    const indexImpact=car=>{
      space.remove(impactColliders.get(car));
      if(car.impact.air>=1){impactColliders.delete(car);return;}
      impactColliders.set(car,space.put(car,colliderRadius(car),'vehicle'));
    };
    for(const [car,c] of activeCars){
      impactColliders.set(car,c);
      if(car.impact)indexImpact(car);
    }
    for(const car of featured.parked)if(car.impact)impactColliders.set(car,car.collider); // A22
    for(const car of impact.parkedVehicles()){
      if(car.impact&&!impact.retire(car,outsideView(car)))indexImpact(car);
    }
    impact.advance(dt,{hit:(x,y,r,car,p,heading)=>p.air>=1?null:
      space.hit(x,y,r,{...car,heading,ignore:car}),moveCollider:indexImpact});
    for(const [car,c] of activeCars){
      if(car.impact){
        space.remove(c);
        if(impactColliders.get(car)===c&&car.impact.air<1)indexImpact(car);
        continue;
      }
      space.remove(c);
      const x=car.x,y=car.y;
      // A14 impact：先讓車避開翻覆的車，避不開才照 A15 的車流規則行駛
      if(!impact.avoid(car,dt,npcTrafficSpace,car.roadEdge&&impact.hasWrecks()?{guard:incidentGuard(car,car.approach)}:undefined))advanceCar(car,dt,player,state.clock,npcTrafficSpace,passage,flow);
      // A24 enforce the stop plane on the final sweep, including A14 bypass and yield.
      const moved=Math.hypot(car.x-x,car.y-y);
      if(moved>.001){
        const ux=(car.x-x)/moved,uy=(car.y-y)/moved;
        const front=colliderRadius(car)*metersPerUnit-(car.scooter?.825:0);
        const gate=gateAhead({x,y},ux,uy,moved*metersPerUnit+.015,front);
        if(gate&&signalState(gate.j,state.clock,state.time)[gate.a.groupName]==='red'&&gate.distance<moved*metersPerUnit){
          const step=Math.max(0,gate.distance-.025)*speedUnits;
          car.x=x+ux*step;car.y=y+uy*step;car.speed=0;car.redWait=true;
        }
      }
      car.trafficVX=dt>0?(car.x-x)/dt:0;
      car.trafficVY=dt>0?(car.y-y)/dt:0;
      space.put(car,colliderRadius(car),'vehicle');
    }
    const moveWalker=(walker,x,y)=>{
      if(walker.collider)space.remove(walker.collider);
      walker.movingSpeed=0;
      const step=dt*(walker.role==='cyclist'?4.6:walker.role==='runner'?2.8:1.45)/metersPerUnit,len=Math.hypot(x-walker.x,y-walker.y);
      if(step===0){x=walker.x;y=walker.y;} // A24 keep priming stationary
      else if(len>step){x=walker.x+(x-walker.x)*step/len;y=walker.y+(y-walker.y)*step/len;}
      if(!worldContact(x,y,walker.r??radius.foot,walker.width??radius.foot,walker.heading)&&!trafficSpace.hit(x,y,walker.r??radius.foot,walker)){
        walker.movingSpeed=dt>0?Math.min(2.2,Math.hypot(x-walker.x,y-walker.y)*metersPerUnit/dt):0;
        walker.x=x;walker.y=y;
      }
      space.put(walker,walker.r??radius.foot,'person');
    };
    for (const walker of state.walkers) {
      if(!walker.nearby)continue;
      const photo=!walker.crossing&&featured.photoTarget(walker,state.clock,metersPerUnit); // A22
      walker.takingPhoto=Boolean(photo);
      if(photo){
        walker.heading=Math.atan2(photo.y-walker.y,photo.x-walker.x);
        walker.movingSpeed=0;
        continue;
      }
      if(walker.crossing) {
        // A24 persist the trip once a foot steps onto the zebra.
        const {walk,groupName}=walker.arm,side=(walk.span/2+.55)/metersPerUnit;
        const lights=signalState(walker.crossing,state.clock,state.time);
        const allowed=lights[groupName==='a'?'b':'a']==='green';
        if(!walker.onZebra&&!allowed)continue;
        const sign=walker.toSide??1;
        const x=(walk.x+walk.dx*walker.shift)*speedUnits-walk.dy*side*sign;
        const y=(walk.y+walk.dy*walker.shift)*speedUnits+walk.dx*side*sign;
        moveWalker(walker,x,y);
        if(walker.movingSpeed>0)walker.onZebra=true;
        if(Math.hypot(x-walker.x,y-walker.y)<.1){walker.onZebra=false;walker.toSide=-sign;}
        walker.heading=Math.atan2(walk.dx*sign,-walk.dy*sign);
        continue;
      }
      const {x,y,dx,dy}=walker.path;
      const pace=walker.role==='cyclist'?4.2:walker.role==='runner'?2.6:1.3;
      const phase=state.clock*pace/(Math.max(4,Math.hypot(dx,dy)*metersPerUnit)*.46)+walker.phase;
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
    if(player.vehicle==='flyingTesla'){
      if(enabled||teslaHop)steerTesla(dt,dx,dy);
      followMap(dt);
      if(!teslaHop){updateLocation();updateContext();}
      return;
    }
    const magnitude=Math.hypot(dx,dy);
    const input=Math.min(1,magnitude);
    if(input>.035&&!route&&!walkSelected&&!officeParking&&player.mode==='foot'){
      const mount={...player,mode:'scooter',ignore:player};
      if(!worldContact(mount.x,mount.y,radius.rider,.37/metersPerUnit,mount.heading)&&
        !trafficSpace.hit(mount.x,mount.y,radius.rider,mount))setMode('scooter');
    }
    if(finalWalk&&route&&enabled){ // A24 foot-only final leg, retaining autoride cancellation and arrival events
      const goal=finalWalk, next=route[0]??goal, gap=distance(player,next);
      const heading=Math.atan2(next.y-player.y,next.x-player.x),step=Math.min(gap,1.39*speedUnits*dt);
      const clear=(x,y)=>!clearPose(x,y,'foot',heading);
      const pos=sweep(player.x,player.y,player.x+Math.cos(heading)*step,player.y+Math.sin(heading)*step,clear,2);
      player.speed=dt?distance(player,pos)/dt:0;
      Object.assign(player,pos,{heading});
      if(distance(player,next)<.12*speedUnits)route.shift();
      if(distance(player,goal)<.06*speedUnits&&surfaceAt(player.x,player.y))setRide(false,'arrived');
      // 終點被人或物件占住時不要一直走：步行 8 秒後已在地點範圍內就算抵達
      else if(state.clock-finalWalkSince>8&&state.target&&distance(player,state.target)<=locationRadius)setRide(false,'arrived');
      else if(step>0&&player.speed<.1*speedUnits&&state.clock>=nextReroute){
        nextReroute=state.clock+.6;
        const path=aroundObstacle(player,goal,(a,b)=>{
          const end=sweep(a.x,a.y,b.x,b.y,clear,2);
          return distance(end,b)<.01;
        });
        if(path)route=path;
      }
      followMap(dt);updateLocation();updateContext();return;
    }
    const scooter=player.mode==='scooter';
    const maxSpeed=scooter?ridingSpeed():1.39/metersPerUnit;
    let blockedTurn=false;
    if (input>.035 && !route) {
      const desired=Math.atan2(dy,dx);
      const turn=angleDiff(desired,player.heading);
      const reverse=scooter&&Math.abs(turn)>2.43;
      const turnLimit=(scooter?Math.max(.9,4.6-player.speed*.018):8)*dt;
      const angle=reverse?player.heading:player.heading+clamp(turn,-turnLimit,turnLimit);
      state.reversing=reverse;
      const r=scooter?radius.rider:radius.foot;
      if(!scooter)player.heading=desired;
      else if(!curbContact(player.x,player.y,r,.37*speedUnits,angle)&& // A24 rotating scooter footprint
        !worldContact(player.x,player.y,r,.37/metersPerUnit,angle)&&
        !trafficSpace.hit(player.x,player.y,r,{...player,heading:angle,ignore:player}))player.heading=angle;
      else blockedTurn=Math.abs(turn)>.5;

    }
    if(input<=.035||route)state.reversing=false;
    if(blockedTurn&&player.speed<1.4/metersPerUnit){
      const retreat=.25/metersPerUnit;
      const x=player.x-Math.cos(player.heading)*retreat,y=player.y-Math.sin(player.heading)*retreat;
      if(!worldContact(x,y,radius.rider,.37/metersPerUnit,player.heading)&&
        !trafficSpace.hit(x,y,radius.rider,player))state.reversing=true;
    }
    let targetSpeed=input>.035?(state.reversing?-1.35/metersPerUnit:maxSpeed)*input:0;
    if(scooter&&!route&&targetSpeed>0){
      const fx=Math.cos(player.heading),fy=Math.sin(player.heading);
      let lead=null,clearance=Infinity;
      for(const car of state.cars){
        const x=car.x-player.x,y=car.y-player.y;
        const along=x*fx+y*fy;
        if(along<=0||along>30*speedUnits||Math.abs(y*fx-x*fy)>(car.scooter?.85:1.45)*speedUnits)continue;
        const gap=along-colliderRadius(car)-radius.rider;
        if(gap<clearance){clearance=gap;lead=car;}
      }
      if(lead){
        const leadSpeed=Math.max(0,lead.speed*Math.cos(lead.heading-player.heading));
        const safe=Math.max(0,clearance-1.65*speedUnits);
        const cap=Math.min(leadSpeed+safe*1.9,Math.sqrt(leadSpeed**2+2*braking*safe));
        targetSpeed=Math.min(targetSpeed,cap);
        if(targetSpeed<maxSpeed*.7&&clearance>2*speedUnits){
          const road=roadOptions(player.x,player.y,1)[0];
          const edge=road?.r;
          const aligned=edge&&Math.abs((edge[2]-edge[0])*fx+(edge[3]-edge[1])*fy)>edge[5].d*.91;
          if(aligned&&road.d<edge[4]*.48){
            const side=(player.x-road.x)*-fy+(player.y-road.y)*fx;
            const lateral=Math.min(.62*speedUnits,edge[4]/2-side-.75*speedUnits);
            const probe=Math.min(clearance,4.5*speedUnits);
            const x=player.x+fx*probe-fy*lateral,y=player.y+fy*probe+fx*lateral;
            if(lateral>.24*speedUnits&&side>=-.15*speedUnits&&clearPose(x,y,'scooter',player.heading)){
              const turn=Math.min(.65*dt,Math.atan2(lateral,probe));
              if(clearPose(player.x,player.y,'scooter',player.heading+turn))player.heading+=turn;
            }
          }
        }
        const current=Math.hypot(velocityX,velocityY);
        if(current>cap){velocityX*=cap/current;velocityY*=cap/current;}
      }
    }
    const blend=scooter?1-Math.exp(-dt*(input>0?4.9:3.4)):1;
    velocityX+=(Math.cos(player.heading)*targetSpeed-velocityX)*blend;
    velocityY+=(Math.sin(player.heading)*targetSpeed-velocityY)*blend;
    const r=scooter?radius.rider:radius.foot;
    const contact=(x,y)=>trafficSpace.hit(x,y,r,player);
    const terrain=(x,y)=>scooter&&curbContact(x,y,r,.37*speedUnits,player.heading)?'curb':worldContact(x,y,r,scooter?.37/metersPerUnit:r,scooter?player.heading:0);
    const wall=(x,y)=>Boolean(terrain(x,y)||contact(x,y));
    if(scooter&&enabled&&impact.hasWrecks()&&(route||input>.035&&!state.reversing)){
      const next=route?.find(point=>distance(player,point)>2*speedUnits);
      const heading=next?Math.atan2(next.y-player.y,next.x-player.x):Math.atan2(dy,dx);
      const target={x:player.x+Math.cos(heading)*18*speedUnits,y:player.y+Math.sin(heading)*18*speedUnits};
      if(impact.avoid(player,dt,trafficSpace,{target,manual:true,guard:incidentGuard(player,heading)})){
        if(route){
          const index=route.findIndex(point=>distance(player,point)<1.2*speedUnits);
          if(index>=0&&index<route.length-1)route.splice(0,index+1);
          rideRemaining=rideLength(player,route);
        }
        waiting=0;
        velocityX=Math.cos(player.heading)*player.speed;velocityY=Math.sin(player.heading)*player.speed;
        followMap(dt);updateLocation();updateContext();
        return;
      }
    }else impact.cancelAvoid(player);
    if(route && enabled) {
      if(!entrances.get(state.target?.id)&&state.clock-rideStarted>75&&distance(player,state.target)<locationRadius*.90&&
        clearPose(player.x,player.y,'foot',player.heading)){
        setRide(false,'arrived');
        setMode('foot');followMap(dt);updateLocation();updateContext();
        return;
      }
      if(!rideAnchor||distance(player,state.target)<rideAnchor.goal-145)rideAnchor={goal:distance(player,state.target),time:state.clock};
      if(!approachingEntrance&&state.target&&distance(player,state.target)<310&&route.length>1){
        const goal=state.target,heading=Math.atan2(goal.y-player.y,goal.x-player.x);
        if(clearPose(player.x,player.y,'scooter',heading)&&clearPose(goal.x,goal.y,'scooter',heading)){
          const path=sweep(player.x,player.y,goal.x,goal.y,(x,y)=>!clearPose(x,y,'scooter',heading),2.5);
          if(path.x===goal.x&&path.y===goal.y){
            route=[goal];detour=null;rideRemaining=distance(player,goal);
          }
        }
      }
      // A24 queues and short detours move the rider into a different green window.
      if(route.usual&&!waitSignal&&!detour&&state.clock>=nextPaceCheck){
        const option=timedCruise(player,route,route.usual,maxSpeed,state.clock,state.time);
        if(option.signals)cruise=option.speed;
        nextPaceCheck=state.clock+6;
      }
      const pace=ridePace(rideRemaining,maxSpeed,route.usual?cruise:cruise*(1+Math.min(.40,rideWait/55)));
      let budget=pace*dt;
      let travelled=0,heldAtSignal=false; // A24
      while(route.length && budget>0){
        const next=detour??route[0],gap=distance(player,next);
        let step=Math.min(gap,budget);
        if(gap>.001){
          const ux=(next.x-player.x)/gap,uy=(next.y-player.y)/gap;
          const flash=state.time>=23||state.time<6;
          const g=gateAhead(player,ux,uy,flash?30:step*metersPerUnit+.05,1.03);
          if(flash&&g){
            budget=Math.min(budget,6*speedUnits*dt);
            step=Math.min(step,budget);
            const crossTraffic=state.cars.some(car=>!car.impact&&
              (car.committed&&crossingForNode.get(car.node)===g.j||
               car.leaving&&crossingForNode.get(car.leaving.node)===g.j)&&
              Math.abs(ux*Math.cos(car.approach)+uy*Math.sin(car.approach))<.7);
            if(crossTraffic&&g.distance<=step*metersPerUnit){
              step=Math.min(step,g.distance*speedUnits);budget=step;
            }
          }
          if(g){
            const delay=waitSeconds(g.j,g.a.group,state.clock,state.time);
            if(delay>0){
              if(waitSignal===g.j&&state.clock-waitStarted>2*g.j.cycle){
                congestion.push({x:g.x*speedUnits,y:g.y*speedUnits});
                const alternate=routeTo(player,state.target,congestion);
                if(alternate){route=alternate;detour=null;rideRemaining=rideLength(player,route);cruise=route.cruise;}
                waitStarted=state.clock;
              }
              step=Math.min(step,g.distance*speedUnits);
              heldAtSignal=true;
              notifySignal(g.j,delay);
              budget=step;
            }
          }
        }
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
            // A24 parked street furniture can occupy the last metre beside the lip.
            if((obstruction==='curb'||approachingEntrance&&besideCurb(angle))&&parkAtCurb(true)){
              followMap(dt);updateLocation();updateContext();return;
            }
            const obstacle=hitBody??contact(player.x,player.y);
            if(obstacle?.kind==='vehicle'&&!obstacle.body.impact){
              blocker=obstacle.body;
              // A slowly moving leader repeatedly releases and catches the rider.
              // Preserve its identity across those brief gaps so it can yield.
              if(blocker!==followedCar||state.clock-lastLeadContact>=.8)followedSince=state.clock;
              followedCar=blocker;lastLeadContact=state.clock;
            }
            if(rideDebug){
              const body=obstacle?.body;
              state.blockedRide={kind:obstruction??contact(player.x,player.y)?.kind,next:{x:next.x,y:next.y},
                body:body&&{id:body.id,x:body.x,y:body.y,service:body.service??null,scooter:body.scooter,heading:body.heading}};
            }
            if(!approachingEntrance&&state.target&&waiting>=2&&distance(player,state.target)<48){
              route.length=0;break;
            }
            player.heading=previousHeading;
            if(auditEnabled)audit.blockedAutoFrames++;
            if(obstacle?.body?.impact||obstacle?.body?.body?.impact){
              if(waiting>=3&&state.clock>=nextNetworkReplan&&state.target){
                nextNetworkReplan=state.clock+5;
                congestion.push({x:next.x,y:next.y});
                if(congestion.length>4)congestion.shift();
                const alternate=routeTo(player,state.target,congestion);
                if(alternate?.length&&distance(alternate[0],next)>13){
                  route=alternate;detour=null;
                  rideRemaining=rideLength(player,route);
                }
              }
              break;
            }
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
                const remaining=arrived?[]:i<0?routeTo(landing,state.target,congestion):route.slice(i+1);
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
            if((waiting>=2||rideWait>6&&followingDelay()>3)&&state.clock>=nextReroute&&!detour){
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
              const alternate=routeTo(player,state.target,congestion);
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
          if(next.turnSignal){
            const j=junctionById.get(next.turnSignal),delay=waitSeconds(j,next.turnGroup,state.clock,state.time);
            if(delay>0){
              heldAtSignal=true;notifySignal(j,delay);break;
            }
          }
          if(detour){route.splice(0,detour.resume);detour=null;}
          else route.shift();
        }
        travelled+=step;
      }
      if(!heldAtSignal&&waitSignal){
        notifySignal(null,0);
        if(route?.usual){
          const option=timedCruise(player,route,route.usual,maxSpeed,state.clock,state.time);
          if(option.signals)cruise=option.speed;
        }
      } // A24 resume against the actual downstream green windows.
      if(heldAtSignal&&rideAnchor)rideAnchor.time=state.clock;
      const congested=!heldAtSignal&&travelled<pace*dt*.42;
      if(!congested)blocker=null;
      if(congested)rideWait+=dt;
      waiting=congested?waiting+dt:Math.max(0,waiting-dt*3);
      rideRemaining=Math.max(0,rideRemaining-travelled);
      if(!route.length&&!approachingEntrance&&entrances.get(state.target?.id)){ // A24 continue from the lane anchor to the lip
        const entrance=entrances.get(state.target.id);
        approachingEntrance=true;route=[entrance];rideRemaining=distance(player,entrance);
      }else if(!route.length){
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
    // A14 impact
    let crash=false,hitAtContact,terrainAtContact,reaction;
    const first=sweep(player.x,player.y,nx,ny,(x,y)=>{
      const surface=terrain(x,y),hit=contact(x,y);
      if(!surface&&!hit)return false;
      terrainAtContact=surface;hitAtContact=hit;
      return true;
    },1.9);
    player.x=first.x;player.y=first.y;
    if(first.x!==nx||first.y!==ny){
      // A14 impact
      const body=hitAtContact?.body;
      if(scooter&&!terrainAtContact&&(hitAtContact?.kind==='vehicle'||body?.type==='parked')){
        reaction=impact.strike(player,body,velocityX,velocityY);
        if(reaction&&body.type==='parked'){
          staticSpace.remove(parkedColliders.get(body));
          parkedColliders.delete(body);
          indexImpact(impact.parked.get(body));
        }
      }
      if(reaction){
        velocityX*=reaction.response;velocityY*=reaction.response;
      }else{
        const ox=player.x,oy=player.y;
        const sideX=sweep(ox,oy,nx,oy,wall,1.9),sideY=sweep(ox,oy,ox,ny,wall,1.9);
        const xSlide=Math.abs(sideX.x-ox)>Math.abs(sideY.y-oy);
        Object.assign(player,xSlide?sideX:sideY);
        if(xSlide){velocityY*=-.12;velocityX*=.59;}
        else{velocityX*=-.12;velocityY*=.59;}
      }
      if(terrainAtContact==='curb')manualCurb(); // A24 slide and damp without a building crash
      else{
        const curbsideFixture=scooter&&state.target&&hitAtContact?.kind==='static'&&body?.type!=='parked'&&besideCurb(player.heading);
        crash=!(curbsideFixture&&parkAtCurb(false)); // A24 same curbside furniture as the autoride approach.
      }
    }
    // A24 allow a fresh hint after the rider backs away from the lip.
    if(curbWalkHint&&(player.mode!=='scooter'||!curbContact(player.x,player.y,r+.15*speedUnits,.52*speedUnits,player.heading)))curbWalkHint=null;
    // A14 impact
    if(crash&&(reaction||speed>8)&&crashCooldown===0){
      if(!reaction){velocityX*=.36;velocityY*=.36;}
      crashCooldown=.42;
      state.shake=Math.max(state.shake,clamp(speed/maxSpeed,.15,.85));
      const body=hitAtContact?.body;
      const target=reaction?.target??(!terrainAtContact&&(hitAtContact?.kind==='vehicle'||body?.type==='parked')?
        impactTarget(body):'building');
      emit('crash',{speed,target,launched:reaction?.launched??false});
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
      if(!walker.hidden)sample.put(walker,walker.r??radius.foot,'person');else audit.hiddenPeople++;
    }
    for(const car of state.cars){
      if(car.impact?.air>=1)continue; // A14 impact
      if(car.hidden){audit.hiddenCars++;continue;}
      const r=colliderRadius(car),hit=sample.hit(car.x,car.y,r,car);
      if(hit?.kind==='vehicle')audit.carCar++;
      if(hit?.kind==='person')audit.personVehicle++;
      sample.put(car,r,'vehicle');
    }
    const size=player.mode==='scooter'?radius.rider:radius.foot;
    const hit=sample.hit(player.x,player.y,size,player)??staticSpace.hit(player.x,player.y,size,player)??doorSpace.hit(player.x,player.y,size,player);
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
    manualUntil=0;walkSelected=false;officeParking=false;curbWalkHint=null; // A24
    teslaHop=null;teslaBody=player;impact.cancelAvoid(player);
    delete player.vehicle;delete player.altitude;
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
    ...(options.capture ? {captureFrame(id,time,weather,traffic) {
      engine.setTimeOfDay(time);
      engine.setWeather(weather);
      engine.setTrafficDensity(traffic);
      engine.teleportTo(id);
      priming=true;
      if(traffic>=.40)streetTraffic=nearbyStreetTraffic(player,traffic>=.95);
      for(let i=0;i<8;i++)update(0);
      priming=false;
      return state;
    }} : {}),
    start() {
      if (running) return;
      if(!trafficConfigured)engine.setTrafficDensity(density);
      const page=canvas.ownerDocument.defaultView?.location;
      const position=page?.pathname?.endsWith('/engine/demo.html')&&params.get('streetPreview');
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
          if(density>=.40)streetTraffic=nearbyStreetTraffic(player,density>=.95);
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
    setFlyingTesla,
    // A24 debug API returns copies, so callers cannot mutate the signal network.
    junctions(){return crossings.map(j=>({id:j.id,x:j.x,y:j.y,members:[...j.members],cycle:j.cycle,
      twoStage:j.twoStage,names:[...new Set(j.approaches.map(a=>a.way.name).filter(Boolean))]}));},
    signalAt(id){const j=junctionById.get(id);return j?signalState(j,state.clock,state.time):null;},
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
      const {plan}=planDeparture(target);
      if(!plan)return null;
      const flash=state.time>=23||state.time<6;
      // A24 peak queues can also delay release after the green (one headway per signal).
      return plan.seconds+density*(2+(flash?0:plan.reserve+Math.min(plan.signalCount,12)*1.2));
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
      if (Number.isFinite(hours)){
        state.time=clamp(hours,0,24);
        // A23 night: preserve custom fixture registries supplied by other simulations.
        if(state.staticColliders===fixtures||state.staticColliders===eveningFixtures)
          state.staticColliders=nightMarketOpen(state.time)?eveningFixtures:fixtures;
      }
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
          if(random(i*561+16)>=density*.75)continue;
          choices.push({x:crossing.x,y:crossing.y,crossing,heading:0,skin:'npc_student'});
        }
        if(density>0)choices.push(...featured.photoWalkers(metersPerUnit)); // A22 use ordinary sidewalk walkers.
        pendingWalkers.push(...choices.filter(clearWalkingPath));
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
      const counts=new Map(),ids=new Set();
      state.npcs=list.filter(n=>{
        if(!byId.has(n.locationId)||n.id!=null&&ids.has(n.id))return false;
        ids.add(n.id);
        return true;
      }).map(n=>{
        const loc=byId.get(n.locationId);
        const slot=counts.get(loc.id)??0;
        counts.set(loc.id,slot+1);
        const side=(slot%2?-1:1)*(1.9+Math.floor(slot/2)*1.6),a=loc.viewHeading;
        for(const depth of [3.1,3.8,4.5,5.2,2.6]){
          const d=depth+(slot?random(slot+41)*2.8:0);
          const x=loc.x+(Math.cos(a)*d+Math.sin(a)*side)/metersPerUnit;
          const y=loc.y+(Math.sin(a)*d-Math.cos(a)*side)/metersPerUnit;
          if(!inBuilding(x,y)&&!roadAt(x,y,-.34/metersPerUnit)&&
            !streetCrowds.some(p=>distance(p,{x,y})<.9/metersPerUnit))return {...n,x,y,heading:a+Math.PI+slot*.93};
        }
        for(let radius=1;radius<=24;radius++)for(let step=0;step<16;step++){
          const angle=a+step*Math.PI/8;
          const x=loc.x+Math.cos(angle)*radius/metersPerUnit,y=loc.y+Math.sin(angle)*radius/metersPerUnit;
          if(!inBuilding(x,y)&&!roadAt(x,y,-.34/metersPerUnit)&&
            !streetCrowds.some(p=>distance(p,{x,y})<.9/metersPerUnit))return {...n,x,y,heading:a+Math.PI+slot*.93};
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
