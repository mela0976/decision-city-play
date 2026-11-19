import {blocked,roadNodes,roadOptions,nearestOnRoad,metersPerUnit} from './world.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const drivable=new Map();
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
export function aroundObstacle(a,b,test=clearPath){
  const key=[a.x,a.y,b.x,b.y].map(n=>n.toFixed(2)).join(',');
  const cacheable=test===clearPath;
  if(cacheable&&localRoutes.has(key))return localRoutes.get(key);
  const cell=cacheable?14:12,margin=cacheable?145:46;
  const inside=(x,y)=>x>=Math.min(a.x,b.x)-margin&&x<=Math.max(a.x,b.x)+margin&&
    y>=Math.min(a.y,b.y)-margin&&y<=Math.max(a.y,b.y)+margin;
  const queue=heap(),seen=new Map(),start={x:a.x,y:a.y,g:0,cost:distance(a,b),from:null};
  queue.push(start);
  let end=null,n=0;
  while(n++<(cacheable?4000:350)){
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
  const offset=Math.min((scooter?2.3:1.45)/metersPerUnit,width*.27);
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
function findRide(origin,target,avoid=[]) {
  const from=roadOptions(origin.x,origin.y,28),to=roadOptions(target.x,target.y,28);
  const open=heap(),records=new Map(),finish=new Map();
  const clearConnector=(a,b)=>clearPath(a,b)?[b]:aroundObstacle(a,b);
  const hazard=(a,b)=>avoid.some(q=>nearestOnRoad(q.x,q.y,[a.x,a.y,b.x,b.y]).d<65)?420:0;
  for(const p of from)for(const e of endpoints(p,true)){
    const first=clearConnector(origin,p),second=first&&clearConnector(p,e.end);
    if(!second)continue;
    const cost=rideLength(origin,[...first,...second])+p.d*.25+hazard(origin,p)+hazard(p,e.end);
    if(cost>=(records.get(e.end.index)?.cost??Infinity))continue;
    const entry={index:e.end.index,cost,from:null,point:p,lane:e.lane,connector:[...first,...second]};
    records.set(entry.index,entry);open.push(entry);
  }
  for(const p of to)for(const e of endpoints(p,false)){
    const first=clearConnector(e.end,p),second=first&&clearConnector(p,target);
    if(!second)continue;
    const cost=rideLength(e.end,[...first,...second])+p.d*.25;
    if(cost<(finish.get(e.end.index)?.cost??Infinity))finish.set(e.end.index,{...e,point:p,cost,connector:[...first,...second]});
  }
  let winner,last,min=Infinity,entry;
  while((entry=open.pop())) {
    if(entry.cost>=min)break;
    if(records.get(entry.index)!==entry)continue;
    const end=finish.get(entry.index);
    if(end && entry.cost+end.cost<min){winner=entry;last=end;min=entry.cost+end.cost;}
    for(const edge of roadNodes[entry.index].out) {
      const k=entry.index*roadNodes.length+edge.to;
      const a=roadNodes[entry.index],b=roadNodes[edge.to];
      if(!drivable.has(k))drivable.set(k,clearConnector(a,b));
      const link=drivable.get(k);
      if(!link)continue;
      const caution=avoid.some(q=>nearestOnRoad(q.x,q.y,[a.x,a.y,b.x,b.y]).d<75);
      const cost=entry.cost+rideLength(a,link)+(caution?1400:0);
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
    const lane=next?rightLane(previous,next,42):null;
    let point=center;
    if(lane&&distance(center,previous)>24&&distance(center,next)>24){
      const candidate=add(center,lane);
      if(clearPath(previous,candidate)&&clearPath(candidate,next))point=candidate;
    }
    if(!clearPath(previous,point))return null;
    route.push({x:point.x,y:point.y});
    previous=point;
  }
  return route;

}
export function planRide(origin,target,avoid=[]){
  return findRide(origin,target,avoid);
}
export function trafficGreen(horizontal,time,x,y) {
  const phase=(time+((x*7+y*13)%15+15)%15)%24;
  return horizontal?phase<10:phase>=12&&phase<22;
}

// Leave headroom for easing into the destination and for dropped frames.
export const autoRideCruiseSeconds=69;

export const rideLength=(origin,route)=>route.reduce((sum,p,i)=>sum+distance(p,route[i-1]??origin),0);
export const rideCruiseSpeed=(length,topSpeed)=>Math.max(topSpeed,length/autoRideCruiseSeconds);
const destinationRate=.95;
const minimumPace=.45;
export const ridePace=(remaining,topSpeed,cruise)=>
  Math.min(cruise,Math.max(topSpeed*minimumPace,remaining*destinationRate));

export function estimateRideDuration(length,topSpeed){
  const cruise=rideCruiseSpeed(length,topSpeed),minimum=topSpeed*minimumPace;
  const easingEnd=minimum/destinationRate,easingStart=cruise/destinationRate;
  const minimumTime=Math.min(length,easingEnd)/minimum;
  const easingTime=length>easingEnd?Math.log(Math.min(length,easingStart)/easingEnd)/destinationRate:0;
  return minimumTime+easingTime+Math.max(0,length-easingStart)/cruise;
}
