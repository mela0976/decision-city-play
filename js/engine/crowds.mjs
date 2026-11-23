import {obstructsEntrance} from './actor-entrances.mjs?v=dbaa7c29'; // A23 actors
import {occupancy,radius} from './collision.mjs?v=dbaa7c29'; // A23 actors test the actual oriented pavement fixtures.
import {fixtureColliders} from './fixtures.mjs?v=dbaa7c29';
import {byId,random,metersPerUnit as unit,roadAt,roads,worldContact} from './world.mjs?v=dbaa7c29';

// A23 actors: fixed neighbours use distinct pavement pockets, headings and stable identities.
const neighbours={
  home:['npc_elder','npc_colleague','creative','npc_student'],
  night_market:['npc_vendor','npc_grandma','media','npc_student','creative'],
  client_hq:['npc_client','planner','media','ae','creative'],
};
const props=fixtureColliders(),pedestrianReach=radius.foot*Math.SQRT2;
export const streetCrowds=[];
for(const [district,skins] of Object.entries(neighbours)){
  const site=byId.get(district),a=site.viewHeading;
  const nearby=occupancy();
  for(const prop of props)if(Math.hypot(prop.x-site.x,prop.y-site.y)<32/unit+Math.hypot(prop.r,prop.width??prop.r))nearby.put(prop,prop.r,'static');
  for(const [i,skin] of skins.entries()){
    for(let tryNo=0;tryNo<96;tryNo++){
      const seed=i*137+tryNo*31+district.length*11;
      const spread=tryNo<32?1:1.65;
      const side=(random(seed+1)-.5)*26*spread;
      const depth=(i%3===0||tryNo%4===3?-1:1)*(2.1+random(seed+3)*10.5)*spread;
      const x=site.x+(Math.sin(a)*side+Math.cos(a)*depth)/unit;
      const y=site.y+(-Math.cos(a)*side+Math.sin(a)*depth)/unit;
      if(obstructsEntrance(x,y,pedestrianReach)||worldContact(x,y,.34/unit)||roadAt(x,y,-.34/unit)||
        nearby.hit(x,y,.37/unit,{})||
        streetCrowds.some(p=>Math.hypot(p.x-x,p.y-y)<1.7/unit))continue;
      streetCrowds.push({x,y,skin,district,heading:a+Math.PI*(random(seed+7)*1.85-.93),
        standing:true,localId:'neighbour:'+district+':'+i});
      break;
    }
  }
}

// Residents on the two quieter lanes, including the forecourt at 忠孝東路五段236巷.
const residentialLanes=new Set(['忠孝東路五段236巷','信義路五段91巷15弄']);
for(const [ax,ay,bx,by,w,edge] of roads){
  if(!residentialLanes.has(edge.way.name)||edge.way.layer!==0||edge.d*unit<11)continue;
  const dx=(bx-ax)/edge.d,dy=(by-ay)/edge.d;
  for(const side of [-1,1]){
    const lateral=side*(w*.5+1.1/unit);
    const t=side===1?.25:.67;
    const x=ax+(bx-ax)*t-dy*lateral,y=ay+(by-ay)*t+dx*lateral;
    if(obstructsEntrance(x,y,pedestrianReach)||worldContact(x,y,.35/unit)||roadAt(x,y,-.35/unit)||streetCrowds.some(p=>Math.hypot(p.x-x,p.y-y)<.9/unit)||
      props.some(p=>Math.hypot(p.x-x,p.y-y)<Math.max(p.r,p.width)+.35/unit))continue;
    streetCrowds.push({x,y,skin:side===1?'npc_elder':'npc_colleague',
      heading:Math.atan2(-dx*side,dy*side),standing:true});
  }
}
