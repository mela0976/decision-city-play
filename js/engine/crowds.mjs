import {byId,inBuilding,metersPerUnit as unit,roadAt} from './world.mjs';

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
