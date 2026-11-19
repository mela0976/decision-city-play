import {roadNodes,metersPerUnit as unit} from './world.mjs';

export const crossings=[];
const seen=new Set();
for(const node of roadNodes){
  const entries=node.out.filter(edge=>edge.w*unit>=7);
  if(new Set(entries.map(edge=>edge.way.id)).size<2)continue;
  const key=Math.floor(node.x*unit/20)+','+Math.floor(node.y*unit/20);
  if(seen.has(key))continue;
  seen.add(key);
  const edge=entries.find(edge=>edge.d*unit>=10)??entries[0];
  const to=roadNodes[edge.to];
  crossings.push({x:node.x,y:node.y,dx:(to.x-node.x)/edge.d,dy:(to.y-node.y)/edge.d,width:edge.w});
}
