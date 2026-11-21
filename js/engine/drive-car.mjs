// A26 passenger-car dimensions are half extents in simulation units.
import {metersPerUnit as unit, nearestOnRoad, roadAt, roadNodes, roadOptions, worldContact} from './world.mjs?v=83fdd04';
import {carriagewayAt, curbContact} from './sidewalks.mjs?v=83fdd04';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const carLength=2.35/unit, carWidth=.95/unit;
export function carTerrain(x,y,heading){
  const solid=worldContact(x,y,carLength,carWidth,heading);
  if(solid)return solid;
  if(curbContact(x,y,carLength,carWidth,heading)||!carriagewayAt(x,y))return 'curb';
  const fx=Math.cos(heading),fy=Math.sin(heading);
  for(const end of [-carLength,carLength])for(const side of [-carWidth,carWidth]){
    if(!carriagewayAt(x+fx*end-fy*side,y+fy*end+fx*side))return 'curb';
  }
  return null;
}

// Project onto a legal, nearby lane aligned with the vehicle, including at junctions.
export function carParking(point,clear,reach=12,minWidth=4){
  for(const {x,y,d,r} of roadOptions(point.x,point.y,18)){
    if(d*unit>reach||r[4]*unit<minWidth)continue;
    const axis=Math.atan2(r[3]-r[1],r[2]-r[0]);
    const forward=r[5].forward&&(!r[5].reverse||Math.cos(axis-(point.heading??axis))>=0);
    const heading=forward?axis:axis+Math.PI,fx=Math.cos(heading),fy=Math.sin(heading);
    for(const along of [0,3,-3,6,-6])for(const across of [Math.min(r[4]*.25,1.6/unit),0,-1/unit]){
      const px=x+fx*along/unit-fy*across,py=y+fy*along/unit+fx*across;
      if(Math.hypot(px-point.x,py-point.y)*unit<=reach&&!carTerrain(px,py,heading)&&clear(px,py,heading))
        return {x:px,y:py,heading};
    }
  }
  return null;
}

// Drive along the centre of narrow connecting lanes. Long curves are already split
// into OSM segments. Cache only static geometry; moving traffic is swept at runtime.
export const narrowLane=(x,y)=>roadAt(x,y)&&!roadAt(x,y,0,4/unit);
export function carLinkClear(a,b){
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  const heading=Math.atan2(b.y-a.y,b.x-a.x),steps=Math.max(1,Math.ceil(length*unit/2));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    if(narrowLane(x,y)||carTerrain(x,y,heading))return false;
  }
  return true;
}

// A26 use actual passenger-car clearance on graph edges and on the two short lane joins.
const carEdges=new Map(),carStops=new WeakMap();
export function carRoute(origin,target,avoid,queue,endpoints,transfer=false){
  const open=queue();
  const parking=target;
  const best=new Map(),ends=new Map();
  function anchors(point,outgoing){
    const result=[];
    for(const projection of roadOptions(point.x,point.y,outgoing?32:105)){
      if(projection.d*unit>(outgoing?12:145)||projection.r[4]*unit<4)continue;
      for(const {end} of endpoints(projection,outgoing)){
        if(outgoing){
          if(distance(point,end)*unit>100||!carLinkClear(point,end))continue;
          result.push({node:end,projection:point,cost:distance(point,end)});
        }else{
          // Stop at the nearest reachable point on the last road. Prefer parking
          // close to the door even when a farther intersection cuts the drive short.
          for(const along of [0,.15,.4,.7,1]){
            const stop={x:projection.x+(end.x-projection.x)*along,y:projection.y+(end.y-projection.y)*along};
            const walk=distance(stop,target);
            if(walk*unit>145)continue;
            const [ax,ay,bx,by,width,edge]=projection.r;
            const dx=(bx-ax)/edge.d,dy=(by-ay)/edge.d;
            const side=(target.y-stop.y)*dx-(target.x-stop.x)*dy>=0?1:-1;
            const offset=width/2-carWidth-.3/unit;
            let parked=false;
            for(const sign of [side,-side]){
              const curb={x:stop.x-dy*offset*sign,y:stop.y+dx*offset*sign};
              if(!carLinkClear(end,curb))continue;
              result.push({node:end,projection:curb,cost:distance(end,curb)+distance(curb,target)*12});
              parked=true;break;
            }
            if(parked)break;
          }
        }
      }
    }
    return result;
  }
  if(!carStops.has(target))carStops.set(target,anchors(parking,false));
  for(const end of carStops.get(target)){
    if(end.cost<(ends.get(end.node.index)?.cost??Infinity))ends.set(end.node.index,end);
  }
  function enqueue(start,mount=null){
    const g=start.cost+(mount?16000+distance(origin,mount)*8:0);
    if(g>=(best.get(start.node.index)??Infinity))return;
    best.set(start.node.index,g);
    open.push({...start,g,cost:g+distance(start.node,parking),previous:null,mount});
  }
  for(const start of anchors(origin,true))enqueue(start);
  // Some venues sit behind a 3.4 m alley. Walk out to a public lane if the car
  // would otherwise have to use that alley; keep the same livery when reboarding.
  for(const projection of transfer?roadOptions(origin.x,origin.y,100):[]){
    if(projection.d*unit<8||projection.d*unit>145||projection.r[4]*unit<4)continue;
    for(const {end} of endpoints(projection,true)){
      const heading=Math.atan2(end.y-projection.y,end.x-projection.x);
      const mount={x:projection.x,y:projection.y,heading};
      if(!carLinkClear(mount,end)||carTerrain(mount.x,mount.y,heading))continue;
      enqueue({node:end,projection:mount,cost:distance(mount,end)},mount);
    }
  }
  let winner=null,finish=null,limit=Infinity;
  while(true){
    const current=open.pop();
    if(!current||current.cost>=limit)break;
    if(current.g!==best.get(current.node.index))continue;
    const end=ends.get(current.node.index);
    if(end&&current.g+end.cost<limit){limit=current.g+end.cost;winner=current;finish=end;}
    for(const edge of current.node.out){
      if(edge.w*unit<4)continue;
      const node=roadNodes[edge.to],g=current.g+edge.d+
        (avoid.some(p=>nearestOnRoad(p.x,p.y,[current.node.x,current.node.y,node.x,node.y]).d<65)?1400:0);
      if(g>=(best.get(edge.to)??Infinity))continue;
      const key=current.node.index*roadNodes.length+edge.to;
      if(!carEdges.has(key))carEdges.set(key,carLinkClear(current.node,node));
      if(!carEdges.get(key))continue;
      best.set(edge.to,g);
      open.push({node,g,cost:g+distance(node,parking),previous:current});
    }
  }
  if(!winner)return transfer?null:carRoute(origin,target,avoid,queue,endpoints,true);
  const path=[finish.projection];
  let mount=null;
  for(let item=winner;item;item=item.previous){
    path.unshift(item.node);
    if(!item.previous){path.unshift(item.projection);mount=item.mount;}
  }
  const route=path.filter((point,i)=>distance(point,path[i-1]??mount??origin)>.02).map(({x,y})=>({x,y}));
  if(mount)route.mount=mount;
  return route;
}

// A26 use the original lane itinerary when live traffic traps the car. Sample
// through long OSM edges as well as short ones, without revisiting passed nodes.
export function forwardCarSpace(player,itinerary,clear,red){
  const {points}=itinerary;
  let first=itinerary.next;
  if(first>=points.length)return null;
  let bestDistance=Infinity,projection=null;
  for(let i=Math.max(1,first);i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(i>itinerary.next+1&&distance(player,a)*unit>45)break;
    if(distance(a,b)<.01)continue;
    const near=nearestOnRoad(player.x,player.y,[a.x,a.y,b.x,b.y]);
    if(near.d<bestDistance){bestDistance=near.d;projection=near;first=i;}
    if(near.d*unit<.3)break;
  }
  if(!projection||bestDistance*unit>30)return null;
  let from=projection,travel=0,choice=null;
  for(let i=first;i<points.length&&travel<20;i++){
    const end=points[i],length=distance(from,end)*unit;
    if(length<.01){from=end;continue;}
    const heading=Math.atan2(end.y-from.y,end.x-from.x),fx=Math.cos(heading),fy=Math.sin(heading);
    const reach=Math.min(length,20-travel);
    if(red(from,fx,fy,reach))break;
    const steps=Math.ceil(reach/1.5);
    for(let step=1;step<=steps;step++){
      const m=reach*step/steps,x=from.x+fx*m/unit,y=from.y+fy*m/unit;
      if(travel+m<4||!clear(x,y,heading))continue;
      choice={x,y,heading,next:m>=length-.01?i+1:i};
    }
    from=end;travel+=length;
  }
  return choice;
}
