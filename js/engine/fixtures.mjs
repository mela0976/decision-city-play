import {alleyParking} from './actor-streets.mjs?v=c7fd08ae'; // A23 actors
import {visitWuxingArcades} from './wuxing-arcades.mjs?v=c7fd08ae'; // A23 alleys
import {urbanInfill} from './infill.mjs?v=c7fd08ae';
import {placeStreetLife} from './3d/street-life.js?v=c7fd08ae';
import {visitLandscapeTrees,visitLandscapeHedges} from './3d/vegetation.js?v=c7fd08ae'; // A19 vegetation hook
import {placeEntrance} from './3d/frontage.js?v=c7fd08ae';
// A19 terrain-landmarks hook
import {placeFloodDefenses} from './3d/terrain.js?v=c7fd08ae';
import {placeArcadeColumns} from './3d/songshan-heritage.js?v=c7fd08ae'; // A23 landmarks2: mapped factory arcade.
import {placeTempleCourt} from './3d/landmarks.js?v=c7fd08ae';
import {placeLocationDressing} from './3d/location-dressing.js?v=c7fd08ae';
import {byId,locations,metersPerUnit as unit,inBuilding} from './world.mjs?v=c7fd08ae';

// 家門口（吳興街租屋處）的垃圾車：畫面（3d/actors.js）、預覽（3d/render.js）與碰撞共用這一個車身。
// 原本停在門口這一側的路緣（side -3.8、depth .95），只畫不擋：出門按 G 在門口上機車後，往晨會、捷運等目的地
// 的路線斜切過這段路緣，主角直接穿過車身；車身也壓到路邊的桌椅。
// 改停到門口斜對面的路緣（莊敬路寬 12.4 公尺，車道到 depth -9.5），heading 朝 -side（往那個方向靠右停），
// 離開家的機車路線與兩向車流都碰不到，也不擋 tools/map 的 home 鏡頭（站在路中往對街看，side -3.3 附近）；
// 再登記成固定物，主角步行、騎車、開車與鏡頭都把它當實體，不會再穿模。
// side／depth 與 venue-entrances.mjs 相同：side 沿門面，depth 從道路往屋內（負值是對街）。
const home=byId.get('home'),homeAngle=home.viewHeading,truckSide=7,truckDepth=-8.2;
export const homeTruck={
  x:home.x+(truckSide*Math.sin(homeAngle)+truckDepth*Math.cos(homeAngle))/unit,
  y:home.y+(truckDepth*Math.sin(homeAngle)-truckSide*Math.cos(homeAngle))/unit,
  // 碰撞照寫實模型 garbage_truck.glb 的大小：縮成長 6.5 公尺（model-assets.js）時寬 2.66、高 3.1。
  // 模型還沒載入或載入失敗時，畫的是 actors.js 的方塊車 serviceTruck，只有約 4.0 x 1.8 公尺（零件 x -2.29 到 1.75），
  // 這時主角會在車頭車尾外約 1.2 公尺、車側外約 0.4 公尺就停住。可以接受：garbage_truck 列在 assets/manifest.json，
  // 引擎一建立就開始下載，方塊車只在慢速網路剛開局、模型還沒下載完或模型壞掉時出現；
  // 寧可那時擋早一點，也不要模型載入後主角陷進車身。
  heading:homeAngle+Math.PI/2,r:3.25/unit,width:1.33/unit,top:3.1,type:'fixture'
};

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
  for(const p of locations)placeLocationDressing(p,{instance}); // Forecourt, promenade and lawn props.
  for(const parcel of urbanInfill()){
    if(parcel.housing)result.push({x:parcel.x/unit,y:parcel.z/unit,r:parcel.width*.5/unit,
      width:parcel.depth*.5/unit,heading:parcel.heading??0,top:parcel.height,type:'infill'});
    else if(parcel.tree)result.push({x:parcel.x/unit,y:parcel.z/unit,r:.16/unit,width:.16/unit,
      top:parcel.height,heading:0,type:'tree'});
  }
  result.push(homeTruck); // 主角步行、騎車、開車與鏡頭都把它當實體
  cached=result.filter(prop=>entrySolids.has(prop)||!inBuilding(prop.x,prop.y));
  cached.push(...alleyParking(cached)); // A23 actors register the parked row before use.
  return cached;
}
