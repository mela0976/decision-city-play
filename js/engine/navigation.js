import {carRoute,carParking} from './drive-car.mjs?v=5dbcfc52'; // A26
import {crossingForNode,gateAhead,waitSeconds,junctionById} from './street-crossings.mjs?v=5dbcfc52'; // A24
import {curbContact} from './sidewalks.mjs?v=5dbcfc52';
import {blocked,roadNodes,roadOptions,nearestOnRoad,metersPerUnit,worldContact} from './world.mjs?v=5dbcfc52';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const drivable=new Map(),edgeSignals=new Map();
function laneGate(key,a,b,edge){
  if(!edgeSignals.has(key)){
    const lane=rightLane(a,b,edge.w);
    edgeSignals.set(key,gateAhead({x:a.x+lane.x,y:a.y+lane.y},
      (b.x-a.x)/edge.d,(b.y-a.y)/edge.d,edge.d*metersPerUnit,1.03));
  }
  return edgeSignals.get(key);
}
export function clearPath(a,b) {
  const n=Math.max(1,Math.ceil(distance(a,b)/3.8));
  for(let i=0;i<=n;i++){
    const t=i/n;
    if(blocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,10))return false;
  }
  return true;
}

function heap() {
  const list=[];
  return {
    push(value) {
      let i=list.length;
      list.push(value);
      while(i>0){
        const p=(i-1)>>1;
        if(list[p].cost<=value.cost)break;
        list[i]=list[p];i=p;
      }
      list[i]=value;
    },
    pop() {
      if(!list.length)return null;
      const first=list[0],tail=list.pop();
      if(!list.length)return first;
      let i=0;
      while(i*2+1<list.length){
        let j=i*2+1;
        if(j+1<list.length&&list[j+1].cost<list[j].cost)j++;
        if(list[j].cost>=tail.cost)break;
        list[i]=list[j];i=j;
      }
      list[i]=tail;
      return first;
    },
  };
}
const localRoutes=new Map();
export function aroundObstacle(a,b,test=clearPath,foot=false){ // A27 sub-metre grid for narrow doorways
  const key=[a.x,a.y,b.x,b.y].map(n=>n.toFixed(2)).join(',');
  const cacheable=!foot&&test===clearPath; // A27 road routes use a different clearance grid
  if(cacheable&&localRoutes.has(key))return localRoutes.get(key);
  const cell=foot?6:cacheable?14:12,margin=foot?90:cacheable?145:46;
  const inside=(x,y)=>x>=Math.min(a.x,b.x)-margin&&x<=Math.max(a.x,b.x)+margin&&
    y>=Math.min(a.y,b.y)-margin&&y<=Math.max(a.y,b.y)+margin;
  const queue=heap(),seen=new Map(),start={x:a.x,y:a.y,g:0,cost:distance(a,b),from:null};
  queue.push(start);
  let end=null,n=0;
  while(n++<(foot?2300:cacheable?4000:350)){
    const item=queue.pop();
    if(!item)break;
    if(distance(item,b)<45&&test(item,b)){end=item;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=item.x+dx*cell,y=item.y+dy*cell,k=Math.round(x/cell)+','+Math.round(y/cell);
      const g=item.g+Math.hypot(dx,dy)*cell;
      if(!inside(x,y)||g>=(seen.get(k)??Infinity)||!test(item,{x,y}))continue;
      seen.set(k,g);
      queue.push({x,y,g,cost:g+distance({x,y},b)*1.15,from:item});
    }
  }
  const path=end?[b]:null;
  if(path)for(let p=end;p?.from;p=p.from)path.unshift({x:p.x,y:p.y});
  if(localRoutes.size>1200)localRoutes.clear();
  if(cacheable)localRoutes.set(key,path);
  return path;
}

export function rightLane(a,b,width,scooter=true) {
  const len=distance(a,b);
  let offset=Math.min((scooter?2.3:1.45)/metersPerUnit,width*.27);
  // 8 公尺以下的巷子：機車盡量靠右，車身右緣離路邊約 0.4 公尺（半個車寬 0.37 加 0.38 餘裕）
  if(scooter&&width*metersPerUnit<=8)offset=Math.max(offset,Math.min(2.3/metersPerUnit,width/2-.75/metersPerUnit));
  return len>0?{x:-(b.y-a.y)*offset/len,y:(b.x-a.x)*offset/len}:{x:0,y:0};
}
const add=(p,v)=>({x:p.x+v.x,y:p.y+v.y});
function endpoints(candidate,outgoing) {
  const {r}=candidate,e=r[5],a=roadNodes[e.a],b=roadNodes[e.b];
  return [
    ...(e.forward?[{end:outgoing?b:a,lane:rightLane(a,b,e.w),width:e.w}]:[]),
    ...(e.reverse?[{end:outgoing?a:b,lane:rightLane(b,a,e.w),width:e.w}]:[]),
  ];
}
function findRide(origin,target,avoid=[],timing,turns=Boolean(timing),car=Boolean(timing?.car)) {
  const from=roadOptions(origin.x,origin.y,28),to=roadOptions(target.x,target.y,28);
  const open=heap(),records=new Map(),finish=new Map();
  const clearConnector=(a,b)=>clearPath(a,b)?[b]:aroundObstacle(a,b);
  const hazard=(a,b)=>avoid.some(q=>nearestOnRoad(q.x,q.y,[a.x,a.y,b.x,b.y]).d<65)?420:0;
  const eligible=p=>!car||p.r[4]*metersPerUnit>=4; // A26 motor lanes for both endpoints and every graph edge
  for(const p of from.filter(eligible))for(const e of endpoints(p,true)){
    const first=clearConnector(origin,p),second=first&&clearConnector(p,e.end);
    if(!second)continue;
    const cost=rideLength(origin,[...first,...second])+p.d*.25+hazard(origin,p)+hazard(p,e.end);
    if(cost>=(records.get(e.end.index)?.cost??Infinity))continue;
    const entry={index:e.end.index,cost,from:null,point:p,lane:e.lane,connector:[...first,...second]};
    records.set(entry.index,entry);open.push(entry);
  }
  for(const p of to.filter(eligible))for(const e of endpoints(p,false)){ // A26
    const first=clearConnector(e.end,p),second=first&&clearConnector(p,target);
    if(!second)continue;
    const cost=rideLength(e.end,[...first,...second])+p.d*.25;
    if(cost<(finish.get(e.end.index)?.cost??Infinity))finish.set(e.end.index,{...e,point:p,cost,connector:[...first,...second]});
  }
  // A24 compare junction waiting time and travel time in the same cost units.
  const speed=timing?.cruise;
  let winner,last,min=Infinity,entry;
  while((entry=open.pop())) {
    if(entry.cost>=min)break;
    if(records.get(entry.index)!==entry)continue;
    const end=finish.get(entry.index);
    if(end && entry.cost+end.cost<min){winner=entry;last=end;min=entry.cost+end.cost;}
    for(const edge of roadNodes[entry.index].out) {
      if(car&&edge.w*metersPerUnit<4)continue; // A26
      const k=entry.index*roadNodes.length+edge.to;
      const a=roadNodes[entry.index],b=roadNodes[edge.to];
      if(!drivable.has(k))drivable.set(k,clearConnector(a,b));
      const link=drivable.get(k);
      if(!link)continue;
      const caution=avoid.some(q=>nearestOnRoad(q.x,q.y,[a.x,a.y,b.x,b.y]).d<75);
      let cost=entry.cost+rideLength(a,link)+(caution?1400:0);
      if(timing){
        const gate=laneGate(k,a,b,edge);
        if(gate){
          const arrival=timing.clock+(entry.cost+gate.distance/metersPerUnit)/speed;
          const wait=waitSeconds(gate.j,gate.a.group,arrival,timing.hour);
          cost+=speed*(timing.quiet?gate.j.cycle*.6:wait);
        }
        const junction=crossingForNode.get(a.index);
        if(timing.quiet&&junction&&junction!==crossingForNode.get(edge.to))cost+=speed*junction.cycle*.25;
        const approach=junction?.twoStage&&junction.approaches.find(arm=>arm.from===a.index&&arm.to===entry.from?.index);
        if(approach&&(b.x-a.x)*approach.dy-(b.y-a.y)*approach.dx<-.45*edge.d){
          cost+=speed*waitSeconds(junction,!approach.group,timing.clock+entry.cost/speed,timing.hour);
        }
      }
      if(cost>=(records.get(edge.to)?.cost??Infinity))continue;
      const next={index:edge.to,cost,from:entry,lane:rightLane(a,b,edge.w),link};
      records.set(next.index,next);open.push(next);
    }
  }
  if(!winner)return null;
  const chain=[];
  for(let current=winner;current;current=current.from)chain.unshift(current);
  const spine=[...chain[0].connector,...chain.slice(1).flatMap(step=>step.link),...last.connector];
  const route=[];
  let previous=origin;
  for(let i=0;i<spine.length;i++){
    const center=spine[i],next=spine[i+1];
    if(distance(center,previous)<.1)continue;
    // 偏移量依實際路寬（路口取相交道路中最窄的一條）；原本寫死 42 單位（4.4 公尺），每條路都套到 8 公尺以下巷子的靠右規則，
    // 3～4 公尺的窄巷車身右緣會壓到路緣
    const roadWidth=Math.min(42,...roadOptions(center.x,center.y,4).filter(o=>o.d<6).map(o=>o.r[4]));
    const lane=next?rightLane(previous,next,roadWidth,!car):null; // A26
    let point=center;
    if(lane&&distance(center,previous)>24&&distance(center,next)>24){
      const orientation=Math.atan2(next.y-previous.y,next.x-previous.x);
      // 機車：OSM 路寬常比實際路緣間距寬，靠右偏移後整段車身可能壓到路緣或建築；放不下就減半，再不行就走中心線
      for(const scale of car?[1]:[1,.5]){
        const candidate=add(center,{x:lane.x*scale,y:lane.y*scale});
        if(!worldContact(candidate.x,candidate.y,1.03/metersPerUnit,.37/metersPerUnit,orientation)&&
          (car||!curbContact(candidate.x,candidate.y,1.03/metersPerUnit,.37/metersPerUnit,orientation)&&bodyFree(previous,candidate,2/metersPerUnit))&&
          clearPath(previous,candidate)&&clearPath(candidate,next)){point=candidate;break;}
      }
    }
    if(!clearPath(previous,point))return null;
    const previousNode=spine[i-1],junction=crossingForNode.get(center.index);
    const entryArm=junction?.approaches.find(a=>a.from===center.index&&a.to===previousNode?.index&&a.reverse);
    if(!car&&turns&&junction?.twoStage&&entryArm?.turnBox&&next){ // A26
      let exit=i+1;
      while(exit<spine.length-1&&crossingForNode.get(spine[exit].index)===junction)exit++;
      const lastNode=spine[exit-1],out=spine[exit];
      const turn=(out.x-lastNode.x)*entryArm.dy-(out.y-lastNode.y)*entryArm.dx;
      const box={x:entryArm.turnBox.x/metersPerUnit,y:entryArm.turnBox.y/metersPerUnit};
      if(turn < -.45*distance(lastNode,out)&&clearPath(previous,box)&&clearPath(box,out)){
        route.push({...box,turnSignal:junction.id,turnGroup:!entryArm.group});previous=box;i=exit-1;continue;
      }
    }
    route.push({x:point.x,y:point.y});
    previous=point;
  }
  return car?route:pullTight(origin,route);

}
// 出發／抵達接線與繞障礙用的格狀路徑（aroundObstacle，每格 14 單位、可走對角）會在路口切成 45 度斜角，
// 而且格點容許超出路面 1.3 公尺，結果機車在路口前就斜切進彎角內側、擦到路緣或建築停住。
// 這裡把連續的短間距點拉直：只有整段機車車身（含 0.15 公尺餘裕）都碰不到路緣與建築時才省略中間點，
// 拉不直就保留原本的點。間距 24 單位以上的車道點（含右側偏移的轉角點）與兩段式左轉點一律保留。
const bodyFree=(a,b,skip=0)=>{
  const len=distance(a,b),heading=Math.atan2(b.y-a.y,b.x-a.x),half=1.03/metersPerUnit,width=.52/metersPerUnit;
  for(let s=skip;s<=len;s+=3){
    const x=a.x+(b.x-a.x)*s/Math.max(len,1e-6),y=a.y+(b.y-a.y)*s/Math.max(len,1e-6);
    if(curbContact(x,y,half,width,heading)||worldContact(x,y,half,width,heading))return false;
  }
  return true;
};
// 撞到路緣或建築的格點：拉回最近道路中心線上（拉回後車身放得下才採用）。終點前 3 點保留，因為終點常在路外。
function snapGrid(route){
  return route.map((p,i)=>{
    if(p.turnSignal||i>=route.length-3)return p;
    const prev=route[i-1],next=route[i+1];
    if(!(prev&&distance(prev,p)<24||next&&distance(p,next)<24))return p;
    const heading=next?Math.atan2(next.y-p.y,next.x-p.x):0,half=1.03/metersPerUnit,width=.52/metersPerUnit;
    if(!curbContact(p.x,p.y,half,width,heading)&&!worldContact(p.x,p.y,half,width,heading))return p;
    for(const option of roadOptions(p.x,p.y,3)){
      if(option.d>3.5/metersPerUnit)break;
      if(!curbContact(option.x,option.y,half,width,heading)&&!worldContact(option.x,option.y,half,width,heading))return {x:option.x,y:option.y};
    }
    return p;
  });
}
function pullTight(origin,input){
  const route=snapGrid(input),out=[];
  let anchor=origin;
  for(let i=0;i<route.length;){
    let j=i;
    // 只在短間距的格狀點串裡往前找；遇到長段或轉彎號誌點就停
    while(j+1<route.length&&!route[j+1].turnSignal&&!route[j].turnSignal&&distance(route[j],route[j+1])<24&&distance(anchor,route[j+1])<120&&bodyFree(anchor,route[j+1]))j++;
    out.push(route[j]);anchor=route[j];i=j+1;
  }
  return out;
}
export function planRide(origin,target,avoid=[],timing){
  if(timing?.car){ // A26 retain the same red-light timing and trip-duration contract.
    const path=carRoute(origin,target,avoid,heap,endpoints);
    if(path?.length){
      const start=path.mount??origin;
      const usual=rideCruiseSpeed(rideLength(start,path),timing.speed);
      const option=timedCruise(start,path,usual,timing.speed,timing.clock,timing.hour);
      return Object.assign(path,{cruise:option.speed,usual,seconds:option.seconds+(path.mount?distance(origin,start)*metersPerUnit/1.39:0),signalCount:option.signals,reserve:option.reserve});
    }
    // A26 an isolated departure can need the existing obstacle-recovery route.
    // Its endpoint must also be a motor lane wide enough for the car.
    const stop=carParking(target,()=>true,145);
    if(!stop)return null;
    target=stop;
  }
  const direct=findRide(origin,target,avoid,null,Boolean(timing),Boolean(timing?.car)); // A26
  if(!timing||!direct)return direct;
  // Signals split short playable trips into green windows. Use the existing
  // dynamic long-trip cruise budget to compare arrival through the road graph.
  const base=rideCruiseSpeed(rideLength(origin,direct),timing.speed);
  let best=null;
  const candidates=[direct];
  for(const [factor,quiet] of [[1,false],[1.5,false],[2,false],[1,true],[1.7,true]]){
    const path=findRide(origin,target,avoid,{...timing,cruise:base*factor,quiet});
    if(path)candidates.push(path);
  }
  for(const path of candidates){
    const usual=rideCruiseSpeed(rideLength(origin,path),timing.speed);
    const option=timedCruise(origin,path,usual,timing.speed,timing.clock,timing.hour);
    if(!best||option.score<best.score)best={...option,path,usual};
  }
  if(!best)return null;
  best.path.cruise=best.speed;best.path.seconds=best.seconds;best.path.signalCount=best.signals;best.path.usual=best.usual;best.path.reserve=best.reserve;
  return best.path;
}
export const trafficFlashing=hour=>hour!=null&&(hour>=23||hour<6);

export function trafficGreen(horizontal,time,x,y,hour) {
  if(trafficFlashing(hour))return true; // Flashing-yellow operation uses junction priority.
  const offset=x*metersPerUnit/15;
  const phase=((time-offset)%48+48)%48;
  return horizontal?phase<33:phase>=35&&phase<46;
}

// Leave headroom for easing into the destination and for dropped frames.
export const autoRideCruiseSeconds=69;

export const rideLength=(origin,route)=>route.reduce((sum,p,i)=>sum+distance(p,route[i-1]??origin),0);
export const rideCruiseSpeed=(length,topSpeed)=>Math.max(topSpeed,length/autoRideCruiseSeconds);
const destinationRate=.95;
const minimumPace=.45;
export const ridePace=(remaining,topSpeed,cruise)=>
  Math.min(cruise,Math.max(topSpeed*minimumPace,remaining*destinationRate));

export function estimateRideDuration(length,topSpeed,cruise=rideCruiseSpeed(length,topSpeed)){
  const minimum=topSpeed*minimumPace;
  const easingEnd=minimum/destinationRate,easingStart=cruise/destinationRate;
  const minimumTime=Math.min(length,easingEnd)/minimum;
  const easingTime=length>easingEnd?Math.log(Math.min(length,easingStart)/easingEnd)/destinationRate:0;
  return minimumTime+easingTime+Math.max(0,length-easingStart)/cruise;
}

// Along-route distances let candidate speeds share the exact same stop-line tests.
function routeGates(origin,path){
  let p=origin,along=0;
  const gates=[];
  for(const q of path){
    const length=distance(p,q);
    if(length<.01)continue;
    const ux=(q.x-p.x)/length,uy=(q.y-p.y)/length;
    const gate=gateAhead(p,ux,uy,length*metersPerUnit,1.03);
    if(gate)gates.push({j:gate.j,group:gate.a.group,along:along+gate.distance/metersPerUnit});
    along+=length;
    if(q.turnSignal)gates.push({j:junctionById.get(q.turnSignal),group:q.turnGroup,along});
    p=q;
  }
  return gates;
}

export function timedCruise(origin,path,usual,topSpeed,clock,hour){
  const gates=routeGates(origin,path),length=rideLength(origin,path);
  let best;
  for(let slot=0;slot<=(gates.length?32:0);slot++){
    const factor=slot===0?1:.82+slot*.043,speed=usual*factor;
    const free=estimateRideDuration(length,topSpeed,speed);
    let delay=0,reserve=0,risk=0;
    for(const g of gates){
      const arrival=clock+g.along/speed+delay;
      const wait=waitSeconds(g.j,g.group,arrival,hour);
      delay+=wait;
      // A marginal green is easily lost at peak density when a vehicle exits ahead.
      if(!wait&&!trafficFlashing(hour)&&waitSeconds(g.j,g.group,arrival+2,hour)>0)risk+=5;
      // A traffic queue or obstruction can consume the next green window.
      // Include one missed green when quoting the peak-traffic mission budget.
      reserve=Math.max(reserve,g.j.cycle-(g.group?g.j.greenA:g.j.greenB));
    }
    const seconds=free+delay,score=seconds+Math.abs(factor-1)*2+gates.length*4+risk;
    if(!best||score<best.score)best={speed,score,seconds,signals:gates.length,reserve};
  }
  return best;
}
