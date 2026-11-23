// The arcade and two shopping streets are designated OSM corridors (world coordinates).
import {byId,civicWalkway,metersPerUnit as unit,nearestOnRoad,roads,toWorld} from './world.mjs?v=51145f5b';

const west=toWorld(25.041,121.5638).x,east=toWorld(25.041,121.5705).x;
const entrance=byId.get('night_market');
const cell=80/unit,grid=new Map();
for(const road of roads){
  const [ax,ay,bx,by,w,edge]=road;
  if(edge.way.layer!==0)continue;
  const name=edge.way.name;
  const market=name==='臨江街'||(name==='通化街'&&
    nearestOnRoad(entrance.x,entrance.y,road).d*unit<105);
  const arterial=/^忠孝東路[四五]段$/.test(name)&&Math.max(ax,bx)>west&&Math.min(ax,bx)<east;
  if(!market&&!arterial)continue;
  const reach=w/2+(market?35:39)/unit;
  for(let ix=Math.floor((Math.min(ax,bx)-reach)/cell);ix<=Math.floor((Math.max(ax,bx)+reach)/cell);ix++)
    for(let iy=Math.floor((Math.min(ay,by)-reach)/cell);iy<=Math.floor((Math.max(ay,by)+reach)/cell);iy++){
      const key=ix+','+iy;
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push({road,reach,district:market?'market':'zhongxiao'});
    }
}

export function mallPromenade(x,y){
  return Math.abs(x-civicWalkway.x)<84/unit&&y>civicWalkway.y0-30/unit&&y<civicWalkway.y1+15/unit;
}

export function commercialDistrict(x,y){
  if(mallPromenade(x,y))return 'department';
  const candidates=grid.get(Math.floor(x/cell)+','+Math.floor(y/cell));
  return candidates?.find(({road,reach})=>nearestOnRoad(x,y,road).d<=reach)?.district;
}

export function neonDistrict(x,y){return !!commercialDistrict(x,y);}
