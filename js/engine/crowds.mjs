import {fixtureColliders} from './fixtures.mjs';
import {byId,inBuilding,metersPerUnit as unit,roadAt,roads,worldContact} from './world.mjs';

const wardrobe=['npc_student','npc_colleague','npc_vendor','npc_elder','npc_client','npc_grandma','media','creative'];
export const streetCrowds=[];
for(const id of ['home','night_market','client_hq']){
  const site=byId.get(id),a=site.viewHeading;
  for(const [i,skin] of wardrobe.entries()){
    const side=(i-3.5)*.84;
    for(const distance of [2.3,2.8,3.35,3.9,4.5,5.15]){
      const x=site.x+(Math.sin(a)*side+Math.cos(a)*distance)/unit;
      const y=site.y+(-Math.cos(a)*side+Math.sin(a)*distance)/unit;
      if(inBuilding(x,y)||roadAt(x,y,-.34/unit)||streetCrowds.some(p=>Math.hypot(p.x-x,p.y-y)<.72/unit))continue;
      streetCrowds.push({x,y,skin,heading:a+Math.PI/2,standing:true});
      break;
    }
  }
}

// Residents on the two quieter lanes, including the forecourt at 忠孝東路五段236巷.
const props=fixtureColliders();
const residentialLanes=new Set(['忠孝東路五段236巷','信義路五段91巷15弄']);
for(const [ax,ay,bx,by,w,edge] of roads){
  if(!residentialLanes.has(edge.way.name)||edge.way.layer!==0||edge.d*unit<11)continue;
  const dx=(bx-ax)/edge.d,dy=(by-ay)/edge.d;
  for(const side of [-1,1]){
    const lateral=side*(w*.5+1.1/unit);
    const t=side===1?.25:.67;
    const x=ax+(bx-ax)*t-dy*lateral,y=ay+(by-ay)*t+dx*lateral;
    if(worldContact(x,y,.35/unit)||roadAt(x,y,-.35/unit)||streetCrowds.some(p=>Math.hypot(p.x-x,p.y-y)<.9/unit)||
      props.some(p=>Math.hypot(p.x-x,p.y-y)<Math.max(p.r,p.width)+.35/unit))continue;
    streetCrowds.push({x,y,skin:side===1?'npc_elder':'npc_colleague',
      heading:Math.atan2(-dx*side,dy*side),standing:true});
  }
}
