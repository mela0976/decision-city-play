import {alleyParking} from './actor-streets.mjs?v=83fdd04'; // A23 actors
import {visitWuxingArcades} from './wuxing-arcades.mjs?v=83fdd04'; // A23 alleys
import {urbanInfill} from './infill.mjs?v=83fdd04';
import {placeStreetLife} from './3d/street-life.js?v=83fdd04';
import {visitLandscapeTrees,visitLandscapeHedges} from './3d/vegetation.js?v=83fdd04'; // A19 vegetation hook
import {placeEntrance} from './3d/frontage.js?v=83fdd04';
// A19 terrain-landmarks hook
import {placeFloodDefenses} from './3d/terrain.js?v=83fdd04';
import {placeArcadeColumns} from './3d/songshan-heritage.js?v=83fdd04'; // A23 landmarks2: mapped factory arcade.
import {placeTempleCourt} from './3d/landmarks.js?v=83fdd04';
import {locations,metersPerUnit as unit,inBuilding} from './world.mjs?v=83fdd04';

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
  placeStreetLife({instance,obstacle:(x,z,r,h,kind)=>{if(kind==='signal')push(x,z,r,r,0,'signal');}, // A24
    paint:()=>{},sign:()=>{},parked:(x,z,heading)=>{
    push(x,z,.93,.39,heading,'parked');
    return true;
  }});
  // A19 vegetation hook
  visitLandscapeTrees(({x,z,width})=>push(x,z,width/2,width/2,0,'tree'));
  visitLandscapeHedges(({x,z,length,heading})=>push(x,z,length*1.07/2,.95/2,-heading,'hedge')); // 綠籬擋人
  const entrySolids=new Set(); // A27 keep the exposed end of a wall whose centre overlaps an OSM footprint
  for(const p of locations)placeEntrance(p,{sign:()=>{},instance:(...args)=>{
    const count=result.length;
    instance(...args);
    if(result.length>count){
      const prop=result.at(-1);prop.top=args[4]+args[7]/2;
      const [,shape,,x,,z,w,,d,turn=0]=args; // A27 keep rotated walls clear of the camera aisle
      if(shape==='box'){
        const c=Math.cos(turn),s=Math.sin(turn);
        prop.footprint=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>
          [x+a*w*c/2+b*d*s/2,z-a*w*s/2+b*d*c/2]);
      }
      entrySolids.add(prop);
    }
  }});
  visitWuxingArcades(()=>{},push); // A23 alleys: register the same posts and pots as the renderer.
  placeFloodDefenses(instance);
  placeArcadeColumns(instance); // A23 landmarks2
  placeTempleCourt(locations.find(p=>p.shape==='temple'),instance);
  for(const parcel of urbanInfill()){
    if(parcel.housing)result.push({x:parcel.x/unit,y:parcel.z/unit,r:parcel.width*.5/unit,
      width:parcel.depth*.5/unit,heading:parcel.heading??0,top:parcel.height,type:'infill'});
    else if(parcel.tree)result.push({x:parcel.x/unit,y:parcel.z/unit,r:.16/unit,width:.16/unit,
      top:parcel.height,heading:0,type:'tree'});
  }
  cached=result.filter(prop=>entrySolids.has(prop)||!inBuilding(prop.x,prop.y));
  cached.push(...alleyParking(cached)); // A23 actors register the parked row before use.
  return cached;
}
