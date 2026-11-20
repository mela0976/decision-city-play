import {roads,roadNodes,metersPerUnit as unit} from './world.mjs';

export const crossings=[];
const seen=new Set(), approachesByNode=new Map();
export const crossingForNode=new Map();
export const signalGroup=(crossing,dx,dy)=>crossing.diagonalPhases?
  Math.abs(crossing.dx*dx+crossing.dy*dy)>=Math.SQRT1_2:Math.abs(dx)>.8;
for(const [,,,,,edge] of roads){
  if(edge.w*unit<7||edge.way.kind==='pedestrian'||edge.way.layer!==0)continue;
  for(const [from,to,forward,reverse] of [[edge.a,edge.b,edge.forward,edge.reverse],[edge.b,edge.a,edge.reverse,edge.forward]]){
    const a=roadNodes[from],b=roadNodes[to];
    if(!approachesByNode.has(from))approachesByNode.set(from,[]);
    approachesByNode.get(from).push({dx:(b.x-a.x)/edge.d,dy:(b.y-a.y)/edge.d,
      width:edge.w,length:edge.d,forward,reverse,to});
  }
}
for(const node of roadNodes){
  const entries=node.out.filter(edge=>edge.w*unit>=7);
  if(new Set(entries.map(edge=>edge.way.id)).size<2)continue;
  const approaches=approachesByNode.get(node.index);
  // Two differently tagged arms on a bend do not make an intersection.
  if(!approaches.some(a=>approaches.some(b=>Math.abs(a.dx*b.dy-a.dy*b.dx)>.48)))continue;
  const key=Math.floor(node.x*unit/20)+','+Math.floor(node.y*unit/20);
  if(seen.has(key))continue;
  seen.add(key);
  const edge=entries.find(edge=>edge.d*unit>=10)??entries[0];
  for(const a of approaches){
    const clearance=approaches.reduce((max,b)=>{
      const sine=Math.abs(a.dx*b.dy-a.dy*b.dx);
      return sine<.55?max:Math.max(max,b.width*unit/(2*sine)+.35);
    },3.6);
    a.crosswalk=Math.ceil(clearance*4)/4;
    a.stop=a.crosswalk+2.6;
    a.box=a.stop+.6;
    a.arrow=a.box+4.2;
  }
  const direction=approaches.find(a=>a.to===edge.to);
  const crossing={node:node.index,x:node.x,y:node.y,dx:direction.dx,dy:direction.dy,width:edge.w,
    crosswalk:direction.crosswalk,diagonalPhases:!approaches.some(a=>Math.abs(a.dx)>.8),approaches};
  crossingForNode.set(node.index,crossing);
  crossings.push(crossing);
}

for(const crossing of crossings){
  for(const approach of crossing.approaches){
    const opposite=crossingForNode.get(approach.to);
    // Reserve a half-length on links between two independently painted intersections.
    approach.paintLength=approach.length*(opposite?.approaches.some(a=>
      a.to===crossing.node)? .5:1)*unit;
  }
}
