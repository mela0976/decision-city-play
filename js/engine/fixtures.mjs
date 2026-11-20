import {urbanInfill} from './infill.mjs';
import {placeStreetLife} from './3d/street-life.js';
import {placeEntrance} from './3d/frontage.js';
import {locations,metersPerUnit as unit,inBuilding} from './world.mjs';

let cached;
export function fixtureColliders(){
  if(cached)return cached;
  const result=[];
  const push=(x,y,r,width,heading,type)=>result.push({x:x/unit,y:y/unit,r:r/unit,width:width/unit,heading,type});
  function instance(kind,shape,color,x,y,z,w,h,d,turn=0){
    if(kind==='lobbyTrim'||kind==='lobbyLight'||!['box','cylinder'].includes(shape)||h<.045||y-h*.5>1.08||y+h*.5<.10||Math.min(w,d)<.035)return;
    const type=color==='#b8493a'?'chair':color==='#b09777'?'table':color==='#557760'?'utility':
      color==='#737a72'?'signal':color==='#796757'?'tree':kind==='glass'?'glass':shape==='cylinder'?'post':'fixture';
    push(x,z,w*.5,d*.5,-turn,type);
  }
  placeStreetLife({instance,paint:()=>{},sign:()=>{},parked:(x,z,heading)=>{
    push(x,z,.93,.39,heading,'parked');
    return true;
  }});
  for(const p of locations)placeEntrance(p,{instance,sign:()=>{}});
  for(const parcel of urbanInfill()){
    if(parcel.housing)result.push({x:parcel.x/unit,y:parcel.z/unit,r:parcel.width*.5/unit,
      width:parcel.depth*.5/unit,heading:parcel.heading??0,top:parcel.height,type:'infill'});
    else if(parcel.tree)result.push({x:parcel.x/unit,y:parcel.z/unit,r:.16/unit,width:.16/unit,
      top:parcel.height,heading:0,type:'tree'});
  }
  return cached=result.filter(prop=>!inBuilding(prop.x,prop.y));
}
