import {byId,civicWalkway,metersPerUnit as unit,random,roadAt,roads,toWorld,worldContact} from './world.mjs?v=96676fd2';
import {obstructsEntrance} from './actor-entrances.mjs?v=96676fd2';
import {occupancy} from './collision.mjs?v=96676fd2';
import {riversideCycleways} from './3d/terrain.js?v=96676fd2';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)*unit;

// The angled racks use the same parked bodies for drawing, collision and impact removal.
export function alleyParking(fixtures){
  const occupied=occupancy(),result=[];
  for(const prop of fixtures)occupied.put(prop,prop.r,'static');
  for(const [index,[ax,ay,bx,by,width,edge]] of roads.entries()){
    if(!/^吳興街.*[巷弄]/.test(edge.way.name)||edge.way.layer!==0)continue;
    const length=edge.d*unit,ux=(bx-ax)/edge.d,uy=(by-ay)/edge.d;
    for(const side of [-1,1])for(let along=5;along<length-5;along+=1.48){
      const seed=index*31+Math.round(along)*7+side;
      if(random(seed)<.12)continue;
      const setback=side*(width*unit*.5+1.05);
      const x=ax+(ux*along-uy*setback)/unit,y=ay+(uy*along+ux*setback)/unit;
      const heading=Math.atan2(uy,ux)+side*(1.01+random(seed+2)*.22);
      const body={type:'parked',alley:true,x,y,heading,r:.98/unit,width:.40/unit,look:seed};
      if(worldContact(x,y,body.r,body.width,heading)||occupied.hit(x,y,body.r,body)||
        roadAt(x,y,-.15/unit)||obstructsEntrance(x,y,Math.hypot(body.r,body.width)))continue;
      occupied.put(body,body.r,'static');
      result.push(body);
    }
  }
  return result;
}

const walkCell=75/unit,walks=new Map();
function registerWalk(walker){
  const key=Math.floor(walker.x/walkCell)+','+Math.floor(walker.y/walkCell);
  if(!walks.has(key))walks.set(key,[]);
  walks.get(key).push(walker);
}
function promenade(a,b,width,spacing,zone,way){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  const sections=Math.floor(length*unit/spacing);
  for(let i=0;i<sections;i++)for(const side of [-1,1]){
    const seed=way+i*97+side*29;
    const lane=side*(.35+.65*random(seed+5))*width/unit;
    const t=(i+.08+.1*random(seed))/sections;
    const span=.78/sections,phase=random(seed+7)*Math.PI*2;
    const path={x:a.x+dx*t-dy/length*lane,y:a.y+dy*t+dx/length*lane,dx:dx*span,dy:dy*span};
    const travel=.5+.46*Math.sin(phase),x=path.x+path.dx*travel,y=path.y+path.dy*travel;
    const role=zone==='river'?(i%2===(side+1)/2?'cyclist':'runner'):'shopper';
    const heading=Math.atan2(dy,dx)+(Math.cos(phase)<0?Math.PI:0);
    const r=(role==='cyclist'?.88:.29)/unit,halfWidth=.29/unit;
    if([0,.25,.5,.75,1].some(k=>worldContact(path.x+path.dx*k,path.y+path.dy*k,r,halfWidth,heading)))continue;
    registerWalk({x,y,path,phase,heading,role,zone,r,width:halfWidth,localId:`walk:${zone}:${way}:${i}:${side}`,
      skin:['npc_student','creative','npc_colleague','media'][Math.floor(random(seed+3)*4)]});
  }
}
for(const [i,[ax,ay,bx,by,w,e]] of roads.entries()){
  if(e.way.name==='臨江街'&&e.way.kind==='pedestrian')
    promenade({x:ax,y:ay},{x:bx,y:by},w*unit*.42,3.1,'market',i);
}
promenade({x:civicWalkway.x,y:civicWalkway.y0},{x:civicWalkway.x,y:civicWalkway.y1},4.4,4.6,'plaza',8421);
for(const [i,line] of riversideCycleways.entries())for(let j=1;j<line.length;j++)
  promenade(toWorld(...line[j-1]),toWorld(...line[j]),1.15,13,'river',10000+i*100+j);

export function walkScheduled(walker,hour){
  const evening=hour>=17&&hour<23,day=hour>=6&&hour<21;
  if(walker.zone==='river')return day;
  if(walker.zone==='market')return evening||walker.phase<.65;
  return evening||walker.phase<(day?3.3:.7);
}
export function districtWalks(focus,hour){
  const result=[],cx=Math.floor(focus.x/walkCell),cy=Math.floor(focus.y/walkCell);
  for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){
    for(const w of walks.get(x+','+y)??[]){
      if(distance(focus,w)<68&&walkScheduled(w,hour))result.push(w);
    }
  }
  return result.sort((a,b)=>distance(a,focus)-distance(b,focus));
}

export function pedestrianTarget(focus,hour,evening){
  if(evening)return 28;
  const commute=hour>=7&&hour<10||hour>=16&&hour<20;
  if(distance(focus,byId.get('mrt'))<105)return commute?22:12;
  if(distance(focus,byId.get('department'))<130)return hour>=11&&hour<21?15:7;
  return 7;
}
