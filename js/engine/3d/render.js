import {nearOfficeDoor,officePoint,officeDoor} from '../office-entrance.mjs?v=5dbcfc52';
import {createSkyLight,drawAtmosphereOverlay} from './sky-light.js?v=5dbcfc52';
import * as T from '../vendor/three.module.min.js?v=5dbcfc52';
import {mobileTextures} from './city-primitives.js?v=5dbcfc52'; // 手機降級
import {drawCockpit} from '../car-cockpit.js?v=5dbcfc52'; // A26
import {createMapRenderer,drawTouch,surface} from '../overlay.js?v=5dbcfc52';
import {placeLabel,landmarkLabel,playerLabel,uiLabel} from '../labels.mjs?v=5dbcfc52'; // i18n
import {buildings,landmarks,locations,scooterSpeed,toWorld,roads,civicWalkway} from '../world.mjs?v=5dbcfc52';
import {createActors} from './actors.js?v=5dbcfc52';
import {streetCrowds} from '../crowds.mjs?v=5dbcfc52';
import {xinyiBusBay} from './street-life.js?v=5dbcfc52';
import {createFarCity} from './far-city.js?v=5dbcfc52'; // A20 far-city
import {createOsmCity} from './osm-city.js?v=5dbcfc52';
import {drain,later,release,releaseAfter,setUploader} from './idle-work.js?v=5dbcfc52'; // P2 perf
import {metersPerUnit as unit} from '../world.mjs?v=5dbcfc52';
import {cameraFraction,cameraObstacles,planFlyover,streetSkylineView} from './camera.js?v=5dbcfc52';

const officeBuilding=buildings.find(b=>b.shape==='office');
const xinyiView=toWorld(25.03291,121.56645);
const coreView=toWorld(25.0405,121.5685);
const coreFocus=toWorld(25.0355,121.5662);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const diff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function tag(ctx,text,x,y,kind='site') {
  ctx.font=`600 ${kind==='speech'?15:12}px system-ui, sans-serif`;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  const w=Math.min(290,ctx.measureText(text).width+18), h=kind==='speech'?28:21;
  ctx.fillStyle=kind==='speech'?'#e9d9bd':'#151c23dc';
  ctx.fillRect(x-w/2,y-h/2,w,h);
  ctx.strokeStyle=kind==='marker'?'#efbb6d':'#d9bc883e';
  ctx.strokeRect(x-w/2+.5,y-h/2+.5,w-1,h-1);
  ctx.fillStyle=kind==='speech'?'#242029':kind==='marker'?'#f5c97f':kind==='side'?'#59e2cf':'#f6e8ce';
  ctx.fillText(text,x,y,w-13);
}
// P2 perf：鏡頭 15 m 內的車輛與固定物外框（A23 alleys／A27 外框照舊）
function pushBound(bounds,object,x,z){
  const xx=object.x*unit,zz=object.y*unit,dx=xx-x,dz=zz-z;
  if(object.hidden||dx*dx+dz*dz>225)return;
  const r=object.r?object.r*unit:object.scooter?.58:1.42;
  const width=object.width?object.width*unit:r,h=object.heading??0;
  const halfX=r*Math.abs(Math.cos(h))+width*Math.abs(Math.sin(h));
  const halfZ=r*Math.abs(Math.sin(h))+width*Math.abs(Math.cos(h));
  bounds.push({minX:xx-halfX,maxX:xx+halfX,minZ:zz-halfZ,maxZ:zz+halfZ,
    footprint:object.footprint,top:object.top??(object.scooter?1.75:1.6)}); // A27 use the rotated wall outline
}
// 固定物不會移動：依 16 m 格子記下索引（陣列換了或長度變了就重建）。回傳附近格子的索引，由小到大，與原本掃描順序一致。
const staticGrids=new WeakMap(),gridCell=16,nearIndex=[];
function nearStatics(objects,x,z){
  let grid=staticGrids.get(objects);
  if(!grid||grid.length!==objects.length){
    grid={length:objects.length,cells:new Map()};
    for(let i=0;i<objects.length;i++){
      const key=Math.floor(objects[i].x*unit/gridCell)*65536+Math.floor(objects[i].y*unit/gridCell);
      let list=grid.cells.get(key);
      if(!list)grid.cells.set(key,list=[]);
      list.push(i);
    }
    staticGrids.set(objects,grid);
  }
  nearIndex.length=0;
  const i0=Math.floor((x-15)/gridCell),i1=Math.floor((x+15)/gridCell),j0=Math.floor((z-15)/gridCell),j1=Math.floor((z+15)/gridCell);
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){
    const list=grid.cells.get(i*65536+j);
    if(list)for(let k=0;k<list.length;k++)nearIndex.push(list[k]);
  }
  if(nearIndex.length>1)nearIndex.sort((a,b)=>a-b);
  return nearIndex;
}
export function createRenderer(canvas,minimapCanvas,overlay,context,createGoogleLayer,forceGoogle=false,capture=null) {
  const view=new T.WebGLRenderer({canvas,context,alpha:false});
  const has=capture?.has??(()=>true);
  const atmosphere=createSkyLight(view,context,canvas.ownerDocument,has('sky-light'));
  const {scene,sun,bloom,panoramas}=atmosphere;
  const camera=new T.PerspectiveCamera(66,1,.12,850);
  // P2 perf：一般遊戲把由貼圖衍生的貼圖延到開始騎乘後才算；截圖工具（capture）照舊當場算
  const city=createOsmCity(scene,canvas.ownerDocument,view.capabilities.getMaxAnisotropy(),has,!capture);
  if(!capture){releaseAfter(30000);setUploader(texture=>view.initTexture(texture));}
  // A20 far-city。P2 perf：一般遊戲時遠景排在上街後的第一件背景工作（截圖工具照舊當場建）
  const wantFarCity=has('far-city');
  let farCity=null;
  if(wantFarCity&&capture)farCity=createFarCity(city.group,canvas.ownerDocument);
  else if(wantFarCity)later(()=>{if(!disposed)farCity=createFarCity(city.group,canvas.ownerDocument);},true);
  let tiles=null,sessionStarted=false,disposed=false;
  function loadTiles(){
    if(!createGoogleLayer||sessionStarted)return;
    sessionStarted=true;
    canvas.dataset.engineReason='Google 圖磚載入中';
    createGoogleLayer(canvas,scene,camera,view).then(layer=>{
      if(disposed){layer?.dispose();return;}
      tiles=layer;
    }).catch(()=>{canvas.dataset.engineReason='Google 圖磚載入器不可使用';});
  }
  const actorLayer=capture?new T.Group():scene;
  if(capture)scene.add(actorLayer);
  const actors=createActors(actorLayer,city.glow,city.parkedScooters);
  const map=createMapRenderer(minimapCanvas);
  const ctx=overlay.getContext('2d');
  const projected=new T.Vector3(),base=new T.Vector3(),position=new T.Vector3(),aim=new T.Vector3(),offset=new T.Vector3(),arm=new T.Vector3(),desired=new T.Vector3();
  const spots=new Map(locations.map(site=>[site.id,site]));
  let sizeW=0,sizeH=0,dpr=0,quality=capture?.quality??2,pressure=0,meanFrame=1/60,lastClock=0,lastView=-1;
  const maxQuality=capture?.quality??2;
  let calm=0,raisedAt=-Infinity,raiseBlockedUntil=0,elapsed=0,nearRadius=0;
  let heading=0,roll=0,lastHeading=0,statsClock=-1;
  let frameWidth=0,frameHeight=0;
  function project(x,y,z) {
    projected.set(x*unit,y,z*unit).project(camera);
    if (projected.z<-1 || projected.z>1 || Math.abs(projected.x)>1 || Math.abs(projected.y)>1) return null;
    return [(projected.x*.5+.5)*frameWidth,(.5-projected.y*.5)*frameHeight];
  }
  function adjustQuality(dt) {
    // At 60 Hz, a few missed presentation slots can drop below 55 fps even
    // while most individual frames still fit the previous per-frame threshold.
    meanFrame+=(Math.min(dt,.05)-meanFrame)*Math.min(1,dt*4);
    if(meanFrame>1/55)pressure+=dt;
    else pressure=Math.max(0,pressure-dt*.65);
    // 畫質也要能升回來：卡過一次就永遠停在最低畫質，換到大螢幕或電腦閒下來後畫面仍然模糊。
    // 連續 6 秒都很順就升一級；剛升級 10 秒內又被降回來，接下來 60 秒不再嘗試。
    elapsed+=dt;
    calm=meanFrame<1/72?calm+dt:0;
    if(quality<maxQuality&&calm>6&&elapsed>raiseBlockedUntil){
      quality++;calm=0;pressure=0;raisedAt=elapsed;setShadow();return;
    }
    if (pressure<.9 || quality===0) return;
    quality--;pressure=0;calm=0;
    if(elapsed-raisedAt<10)raiseBlockedUntil=elapsed+60;
    setShadow();
  }
  function setShadow(){
    sun.shadow.map?.dispose();sun.shadow.map=null;
    const size=quality===2?1024:quality===1?768:512;
    sun.shadow.mapSize.set(size,size);
  }
  let orbit=null,orbitKey=null,wuxingView=null;
  const scenicRoads=new Map([['wuxingSouth',toWorld(25.02892,121.56282)],
    ['songrenSouth',toWorld(25.0322,121.56815)]]);
  for(const [key,point] of scenicRoads){
    const street=key==='wuxingSouth'?'吳興街':'松仁路';
    const nearest=roads.filter(r=>r[5].way.name===street).map(([x,y,a,b])=>({
      x:(x+a)/2,y:(y+b)/2,heading:Math.atan2(b-y,a-x),
      score:Math.hypot((x+a)/2-point.x,(y+b)/2-point.y),
    })).sort((a,b)=>a.score-b.score)[0];
    if(nearest){
      if(Math.sin(nearest.heading)<0)nearest.heading+=Math.PI;
      scenicRoads.set(key,nearest);
    }
  }
  // 用的是畫面當下的相機，與原本每幀新建的閉包行為相同
  const inActorView=(body,padded=false)=>{
    projected.set(body.x*unit,1,body.y*unit).project(camera);
    const margin=padded?1.32:1;
    return projected.z>=-1&&(padded||projected.z<=1)&&Math.abs(projected.x)<=margin&&Math.abs(projected.y)<=margin;
  };
  const draw=state=>{
    const {player,weather,clock,filter,time,viewRevision}=state;
    const aerial=Boolean(state.flyover||state.largeMap);
    const useTiles=forceGoogle||aerial||Boolean(capture?.google);
    canvas.dataset.aerial=String(aerial);
    if(useTiles)loadTiles();
    if(!useTiles)tiles?.hide();
    const dimensions=surface(overlay,ctx);
    if(!dimensions) return;
    const {w,h}=dimensions;
    const snap=lastView!==viewRevision||Boolean(canvas.dataset.flyoverCamera)&&!state.flyover;
    const dt=clamp(clock-lastClock,0,.05);
    if(!snap&&!capture) adjustQuality(dt);
    if(dt>0&&!capture)release(); // P2 perf：模擬開始走（玩家上街）才做延後的工作
    lastClock=clock;
    // 記憶體：手機（觸控）最高畫質的解析度上限壓到 1.5（DPR 3 的手機原本是 2），drawing buffer 與後製緩衝約少 44%
    const requestedDpr=Math.min(devicePixelRatio||1,quality===2?(mobileTextures?1.5:2):quality===1?1.25:.85);
    if (w!==sizeW||h!==sizeH||dpr!==requestedDpr) {
      dpr=requestedDpr;sizeW=w;sizeH=h;
      view.setPixelRatio(dpr);view.setSize(w,h,false);
    }
    frameWidth=w;frameHeight=h;
    const x=player.x*unit,z=player.y*unit;
    const driving=player.mode==='car',riding=driving||player.mode==='scooter'; // A26
    const viewSpeed=clamp(player.speed/scooterSpeed,0,1);
    const site=spots.get(player.locationId);
    const stopped=player.speed<3 && !riding;
    const arrival=!state.roadReturn&&stopped&&site&&Boolean(canvas.dataset.cameraDetail);
    const detail=canvas.dataset.cameraDetail;
    const landmark=detail==='twist'?landmarks.find(b=>b.shape==='twist'):null;
    const core=detail==='core'&&!useTiles;
    let servicePortrait=null,previewBus=null,scalePortrait=null;
    if(detail==='bus'){
      servicePortrait=previewBus=xinyiBusBay(0,-1.66);
    }else if(detail==='waste'){
      const home=spots.get('home'),a=home.viewHeading;
      servicePortrait={x:home.x*unit-Math.sin(a)*3.8+Math.cos(a)*.95,
        z:home.y*unit+Math.cos(a)*3.8+Math.sin(a)*.95,heading:a-Math.PI/2};
    }
    const officePortrait=detail==='a25';
    const xinyiPortrait=detail==='xinyi';
    const wuxingPortrait=detail==='wuxingSkyline';
    const scenicRoad=scenicRoads.get(detail);
    const walkwayPortrait=detail==='walkway';
    if(detail==='scaleLineup'){
      const rider=xinyiBusBay(-6,-1.66);
      previewBus=xinyiBusBay(1.8,-1.72);
      scalePortrait={...rider,car:xinyiBusBay(-11.3,-4.65),walker:xinyiBusBay(-5,-10.1)};
    }
    const roadPortrait=detail==='road-forward'||detail==='road-reverse';
    const deliveryPortrait=detail==='delivery';
    const standingPortrait=detail==='standingQueue'?streetCrowds[1]:null;
    let queuePortrait=null,queueCount=-1,queueDirections=0;
    if(detail==='trafficQueue'||detail==='trafficQueueReverse'){
      const nearby=state.cars.filter(car=>Math.hypot(car.x-player.x,car.y-player.y)<174/unit);
      for(const car of nearby){
        const cluster=nearby.filter(other=>Math.hypot(other.x-car.x,other.y-car.y)<23/unit);
        const approaches=new Set(cluster.filter(vehicle=>vehicle.scooter)
          .map(vehicle=>Math.round((vehicle.heading+Math.PI)/(Math.PI/4))%8));
        if(cluster.length+approaches.size*2>queueCount+queueDirections*2){
          queueDirections=approaches.size;queueCount=cluster.length;queuePortrait=car;
        }
      }
    }
    let evPortrait=null,evGap=Infinity;
    let walkerPortrait=null,walkerGap=Infinity;
    if(detail==='ev')for(const car of state.cars){
      if(car.hidden||car.scooter||car.service)continue;
      const gap=Math.hypot(car.x-player.x,car.y-player.y);
      if(gap<evGap){evPortrait=car;evGap=gap;}
    }
    if(detail==='walker_m'||detail==='walker_f')for(const walker of state.walkers){
      if(walker.hidden)continue;
      const female=walker.skin==='npc_student'||walker.skin==='npc_grandma';
      if(female!==(detail==='walker_f'))continue;
      const gap=Math.hypot(walker.x-player.x,walker.y-player.y);
      if(gap<walkerGap){walkerPortrait=walker;walkerGap=gap;}
    }
    const narrow=w/h<.8;
    if(snap) {
      heading=arrival?site.viewHeading:player.heading;
      lastView=viewRevision;
      lastHeading=player.heading;
    }
    // A25 rider-relative controls: the chase camera stays behind the rider, also while turning in place.
    heading+=diff(player.heading,heading)*(1-Math.exp(-dt*(player.speed>3?6.5:4.2)));
    const turn=clamp(diff(player.heading,lastHeading)/Math.max(.015,dt)*.11,-1,1);
    if(dt>0 || snap) lastHeading=player.heading;
    roll+=(turn*.054-roll)*(1-Math.exp(-dt*6));
    const direction=detail==='peak'?(site?.viewHeading??heading)+Math.PI/2:detail==='skyline'?-1.98:arrival?site.viewHeading:heading;
    const fx=Math.cos(direction),fz=Math.sin(direction);
    const showcase=Boolean(arrival || landmark);
    const chase=driving?9.7:detail==='streetLife'?11:detail==='skyline'?16:landmark?12:detail==='rider'?3.3:detail==='person'?2.85: // A26
      showcase?(narrow?9.8:8.1):(narrow?7.4:5.65)+viewSpeed*.85;
    arm.set(x,riding?1.35:1.26,z);
    const bounds=cameraObstacles(x,z,unit,forceGoogle?56:39);
    if(!aerial){
      // A23 alleys: scan the same 15 m camera range without copying thousands of posts on every frame.
      // P2 perf：靜態碰撞物約 4 萬個，改用格子索引只看附近的格子；放進 bounds 的物件與順序和逐一掃描相同。
      const cars=state.cars;
      for(let i=0;i<cars.length;i++)pushBound(bounds,cars[i],x,z);
      const statics=state.staticColliders;
      if(statics){
        const near=nearStatics(statics,x,z);
        for(let i=0;i<near.length;i++)pushBound(bounds,statics[near[i]],x,z);
      }
    }
    if(scenicRoad){
      const dx=Math.cos(scenicRoad.heading??Math.PI/2),dz=Math.sin(scenicRoad.heading??Math.PI/2);
      base.set(scenicRoad.x*unit,2.65,scenicRoad.y*unit);
      aim.set(scenicRoad.x*unit+dx*92,11,scenicRoad.y*unit+dz*92);
    }else if(wuxingPortrait){
      const tower=buildings.find(b=>b.id==='client_hq'),home=spots.get('home');
      if(!wuxingView){
        const choices=roads.filter(r=>r[5].way.name==='吳興街'&&Math.hypot(r[0]-home.x,r[1]-home.y)<1770)
          .flatMap(r=>[.14,.37,.67,.88].map(t=>({x:r[0]+(r[2]-r[0])*t,y:r[1]+(r[3]-r[1])*t,heading:Math.atan2(r[3]-r[1],r[2]-r[0])})));
        wuxingView=streetSkylineView(home,tower,choices,unit);
      }
      base.set(wuxingView.x,4.4,wuxingView.z);
      aim.set((tower.x+tower.w*.5)*unit,130,(tower.y+tower.h*.5)*unit);
    }else if(walkwayPortrait){
      base.set(civicWalkway.x*unit-2.5,5.5,civicWalkway.y*unit+20);
      aim.set(civicWalkway.x*unit,3,civicWalkway.y*unit-65);
    }else if(scalePortrait){
      const a=scalePortrait.heading-1.2,center=xinyiBusBay(-4,-1.4);
      base.set(center.x+Math.cos(a)*18,7.5,center.z+Math.sin(a)*18);
      aim.set(center.x,1.4,center.z);
    }else if(standingPortrait){
      const {x,z}={x:standingPortrait.x*unit,z:standingPortrait.y*unit};
      const heading=standingPortrait.heading-Math.PI*.30;
      base.set(x+Math.cos(heading)*3.7,2.2,z+Math.sin(heading)*3.7);
      aim.set(x,1.05,z);
    }else if(roadPortrait||deliveryPortrait){
      const lane=xinyiBusBay(roadPortrait?10:0,-1.66,detail==='road-reverse');
      const fx=Math.cos(lane.heading),fz=Math.sin(lane.heading);
      if(deliveryPortrait){
        base.set(lane.x-6.2*fx-5*fz,3.6,lane.z-6.2*fz+5*fx);
        aim.set(lane.x,1,lane.z);
      }else{
        base.set(lane.x-6*fx,3,lane.z-6*fz);
        aim.set(lane.x+5*fx,0,lane.z+5*fz);
      }
    }else if(xinyiPortrait){
      const xx=xinyiView.x*unit,zz=xinyiView.y*unit;
      base.set(xx+14,3.7,zz-2.5);aim.set(xx-31,2.8,zz);
    }else if(servicePortrait){
      const p=servicePortrait,d=previewBus?13.5:7.4,eyeY=previewBus?7.2:3.5;
      const target=previewBus?xinyiBusBay(2.8,-.7):p;
      aim.set(target.x,previewBus?1.5:1.2,target.z);
      const around=cameraObstacles(p.x,p.z,unit,24);
      for(const turn of (previewBus?[-.97,-1.45,.97,1.45,-2.05,2.05]:[.97,-.97,1.45,-1.45,2.05,-2.05])){
        const angle=p.heading+turn;
        base.set(p.x+Math.cos(angle)*d,eyeY,p.z+Math.sin(angle)*d);
        if(cameraFraction(around,aim,base)===1)break;
      }
    }else if(queuePortrait){
      const cx=queuePortrait.x*unit,cz=queuePortrait.y*unit,yaw=queuePortrait.heading;
      const side=detail==='trafficQueueReverse'?-1:1;
      base.set(cx-Math.cos(yaw)*13*side,31,cz-Math.sin(yaw)*13*side);
      aim.set(cx+Math.cos(yaw)*4,.2,cz+Math.sin(yaw)*4);
      canvas.dataset.queueCount=String(queueCount);
      canvas.dataset.queueDirections=String(queueDirections);
    }else if(walkerPortrait){
      const cx=walkerPortrait.x*unit,cz=walkerPortrait.y*unit;
      const yaw=(walkerPortrait.heading??0)+.6;
      base.set(cx+Math.cos(yaw)*2.65,1.98,cz+Math.sin(yaw)*2.65);
      aim.set(cx,.99,cz);
    }else if(evPortrait){
      const cx=evPortrait.x*unit,cz=evPortrait.y*unit;
      const yaw=evPortrait.heading+.55;
      base.set(cx+Math.cos(yaw)*6,2.7,cz+Math.sin(yaw)*6);
      aim.set(cx,.95,cz);
    }else if(officePortrait&&officeBuilding){
      const ox=(officeBuilding.x+officeBuilding.w*.5)*unit,oz=(officeBuilding.y+officeBuilding.h*.5)*unit;
      base.set(ox+219,136,oz+285);
      aim.set(ox,135,oz);
    }else if(core){
      base.set(coreView.x*unit,32,coreView.y*unit);
      aim.set(coreFocus.x*unit,49,coreFocus.y*unit);
    }else if(forceGoogle && tiles && !landmark) {
      const distance=tiles.distance;
      const height=distance*.57+3.1;
      desired.set(x-fx*distance,height,z-fz*distance);
      let fraction=cameraFraction(bounds,arm,desired);
      if(fraction<1){
        for(const angle of [.57,-.57,1.02,-1.02,1.5,-1.5]){
          offset.set(x-Math.cos(direction+angle)*distance,height,z-Math.sin(direction+angle)*distance);
          const room=cameraFraction(bounds,arm,offset);
          if(room>fraction+.03){desired.copy(offset);fraction=room;}
          if(fraction===1)break;
        }
      }
      if(fraction<.75){
        offset.copy(desired);offset.y+=7;
        const room=cameraFraction(bounds,arm,offset);
        if(room>fraction){desired.copy(offset);fraction=room;}
      }
      base.copy(arm).lerp(desired,fraction);
      if(fraction<.4){
        offset.set(x,Math.min(height,12),z);
        if(cameraFraction(bounds,arm,offset)===1)base.copy(offset);
      }
      aim.set(x+fx*2.5,Math.min(6.1,1.5+base.distanceTo(arm)*.11),z+fz*2.5);
    } else
    if(landmark) {
      const lx=(landmark.x+landmark.w/2)*unit,lz=(landmark.y+landmark.h/2)*unit;
      desired.set(lx-55,13,lz-87);aim.set(lx,50,lz);
      base.copy(desired);
    } else {
      const side=arrival?1.5:detail==='rider'?1.4:.43;
      desired.set(x-fx*chase-fz*side,driving?4.1:detail==='skyline'?10.2:detail==='streetLife'?4.1:showcase?3.1:narrow?2.79:2.66,z-fz*chase+fx*side); // A26
      let fraction=cameraFraction(bounds,arm,desired);
      if(!riding&&!showcase&&fraction<.72){
        for(const turn of [.38,-.38,.78,-.78,1.18,-1.18,1.57,-1.57]){
          offset.set(x-Math.cos(direction+turn)*3.3,2.04,z-Math.sin(direction+turn)*3.3);
          const room=cameraFraction(bounds,arm,offset);
          if(room>fraction+.05){desired.copy(offset);fraction=room;}
        }
      }
      if(fraction<.64 && (riding||showcase)) {
        for(const height of [4.4,6.2,8.9]) {
          offset.copy(desired);offset.y=height;
          const alternative=cameraFraction(bounds,arm,offset);
          if(alternative>fraction+.11){desired.copy(offset);fraction=alternative;}
        }
      }
      if(fraction<.47) {
        for(const turn of [.43,-.43,.86,-.86,1.31,-1.31]) {
          const a=direction+turn;
          offset.set(x-Math.cos(a)*chase,3.4,z-Math.sin(a)*chase);
          const room=cameraFraction(bounds,arm,offset)-Math.abs(turn)*.07;
          if(room>fraction+.07){desired.copy(offset);fraction=cameraFraction(bounds,arm,desired);}
        }
      }
      base.copy(arm).lerp(desired,fraction);
      if(fraction<.39 && (riding||showcase)) {
        offset.set(x,arm.y+Math.min(3.8,2.8+viewSpeed),z);
        const safe=cameraFraction(bounds,arm,offset);
        if(safe>.45)base.copy(arm).lerp(offset,safe);
      }
      // Compose the player below center, including when the arm collapses against a wall.
      const forward=showcase?Math.min(2.25,arm.distanceTo(base)*.29):arm.distanceTo(base)*.26;
      aim.set(x+fx*forward,detail==='skyline'?18:showcase?Math.min(3.35,1.54+arm.distanceTo(base)*.16):riding?1.42:1.33,z+fz*forward);
    }
    if(state.flyover){
      const {location,angle,retreat}=state.flyover;
      const key=location.id+':'+Math.round(w/h*10);
      if(key!==orbitKey){orbit=planFlyover(location,unit,w/h);orbitKey=key;}
      const yaw=orbit.angle+Math.min(angle*.57,1);
      base.set(orbit.cx+Math.cos(yaw)*orbit.radius,orbit.high,orbit.cz+Math.sin(yaw)*orbit.radius);
      aim.set(orbit.cx,orbit.aim,orbit.cz);
      canvas.dataset.flyoverCamera=JSON.stringify({...orbit,id:location.id,angle,yaw,retreat});
    }else if(state.largeMap){
      base.set(x+Math.cos(heading)*48,315,z+Math.sin(heading)*48);
      aim.set(x,7,z);
    }else{
      delete canvas.dataset.flyoverCamera;
    }
    const alpha=snap||showcase||landmark||aerial||officePortrait||evPortrait||walkerPortrait||queuePortrait||servicePortrait||xinyiPortrait||scenicRoad||wuxingPortrait||walkwayPortrait||scalePortrait?1:1-Math.exp(-dt*12);
    position.lerp(base,alpha);
    if(!landmark && !core && !aerial && !officePortrait && !evPortrait && !walkerPortrait && !queuePortrait && !servicePortrait && !xinyiPortrait && !scenicRoad && !wuxingPortrait && !walkwayPortrait && !scalePortrait) {
      const safe=cameraFraction(bounds,arm,position);
      if(safe<1) position.copy(arm).lerp(position,safe);
    }
    const shake=state.shake*.16;
    camera.position.copy(position);
    if(!showcase && !core && !aerial && !officePortrait && !evPortrait && !walkerPortrait && !queuePortrait && !servicePortrait && !xinyiPortrait && !scenicRoad && !wuxingPortrait && !walkwayPortrait && !scalePortrait && arm.distanceTo(position)>2) {
      offset.copy(position);
      offset.x+=Math.sin(clock*99)*shake;
      offset.y+=Math.cos(clock*81)*shake;
      if(cameraFraction(bounds,arm,offset)===1) camera.position.copy(offset);
    }
    camera.position.y=Math.max(.15,camera.position.y);
    if(!aerial&&!queuePortrait&&cameraFraction(bounds,camera.position,camera.position)===0){
      offset.set(x,Math.max(3.8,camera.position.y+.5),z);
      for(let lift=0;lift<20;lift++){
        offset.y+=lift*.65;
        if(cameraFraction(bounds,offset,offset)!==1)continue;
        camera.position.copy(offset);break;
      }
    }
    if(!showcase&&!aerial&&!officePortrait&&!state.largeMap&&nearOfficeDoor(player,4)){
      const threshold=officePoint();
      const fx=-Math.sin(officeDoor.heading),fz=Math.cos(officeDoor.heading);
      const depth=(camera.position.x-threshold.x*unit)*fx+(camera.position.z-threshold.y*unit)*fz;
      if(depth>-.4){
        offset.copy(camera.position);
        offset.x-=(depth+.4)*fx;
        offset.z-=(depth+.4)*fz;
        const safe=cameraFraction(bounds,arm,offset); // A27 keep the outer-door clamp below the canopy
        camera.position.copy(arm).lerp(offset,safe);
      }
    }
    if(!aerial&&player.vehicle==='flyingTesla'){
      const altitude=player.altitude??0;
      camera.position.y+=altitude;
      aim.y+=altitude+.55;
    }
    if(driving&&state.cockpit&&!aerial){ // A26 omit the outside shell and anchor the eye in the driver's seat.
      const fx=Math.cos(player.heading),fz=Math.sin(player.heading);
      camera.position.set(x+fx*.38+fz*.32,1.24,z+fz*.38-fx*.32);
      aim.set(camera.position.x+fx*26,1.02,camera.position.z+fz*26);
    }
    camera.lookAt(aim);
    if(!showcase&&!core&&!aerial&&!officePortrait&&!evPortrait&&!walkerPortrait&&!queuePortrait&&!servicePortrait&&!xinyiPortrait)camera.rotateZ(-roll);
    camera.fov=state.flyover?orbit.fov+(w/h<1?10:0):(landmark?69:showcase?64:58)+viewSpeed*13+(narrow?13:w/h<1.15?8:0)+(state.rideBoost??0)*4;
    if(capture){
      const {pos,lookAt,fov}=capture.shot;
      camera.position.set(...pos);
      camera.lookAt(...lookAt);
      camera.fov=fov;
    }
    camera.aspect=w/h;
    camera.near=state.flyover?5:.12;
    camera.far=wantFarCity&&!forceGoogle&&!capture?.google&&canvas.dataset.engine!=='google'?5500:state.flyover?2200:2500; // A20 far-city
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    projected.set(x,riding?1.2:.92,z).project(camera);
    canvas.dataset.engineCamera=JSON.stringify({x:projected.x,y:projected.y,z:projected.z,
      clear:cameraFraction(bounds,arm,camera.position)===1,showcase});

    const {night,raining,lamps}=atmosphere.update(camera,x,z,time,weather,Boolean(state.flyover));
    const tileView=useTiles?tiles?.update(quality):null;
    if(!useTiles)canvas.dataset.engine='stylized';
    if(tileView?.fail) {
      canvas.dataset.engine='stylized';
      canvas.dataset.engineReason=tileView.fail;
      tiles.dispose();tiles=null;
    }
    if(tileView && !tileView.ready && !tileView.fail) canvas.dataset.engine='stylized';
    if(tileView?.ready) {
      canvas.dataset.engine='google';
      canvas.dataset.engineReason='Google Photorealistic 3D Tiles';
    }
    city.group.visible=!tileView?.ready&&!capture?.google;
    if(capture){
      city.replacements.visible=!capture.google;
      actorLayer.visible=!capture.google&&(has('actors')||has('furniture'));
    }
    canvas.dataset.tileCount=String(tileView?.count??0);
    if(tileView)canvas.dataset.googleDiagnostics=JSON.stringify({
      sources:tileView.sources,errorTarget:tileView.errorTarget,maxDepth:tileView.maxDepth,visibleDepth:tileView.visibleDepth,
      distance:tiles?.distance??0,height:+camera.position.y.toFixed(1),
      pitch:+(Math.atan2(camera.position.y-aim.y,Math.hypot(camera.position.x-aim.x,camera.position.z-aim.z))*180/Math.PI).toFixed(1),
    });
    state.googleInset=tileView?.ready?36:0;
    const portrait=scalePortrait??(scenicRoad?{x:scenicRoad.x*unit,z:scenicRoad.y*unit}:null)??(wuxingPortrait?wuxingView:walkwayPortrait?{x:civicWalkway.x*unit,z:civicWalkway.y*unit}:roadPortrait||deliveryPortrait?xinyiBusBay():servicePortrait);
    const portraitFocus=portrait&&{x:portrait.x/unit,y:portrait.z/unit};
    const focus=state.flyover?.location??walkerPortrait??portraitFocus??player;
    city.updateOfficeDoor(state.officeDoorProgress,state.shopDoorProgress); // A27
    // 近景 OSM 模型與遠景外殼的交界圈。畫質升降時半徑不再一口氣跳 75 公尺（整圈建築同時換樣子），
    // 而是每秒最多推 40 公尺，讓區塊一個一個換；近景與遠景用同一個值，交界不重疊也不留空。
    const radiusTarget=state.flyover?535:quality===2?340:265;
    nearRadius=snap||capture||!nearRadius||state.flyover?radiusTarget:nearRadius+clamp(radiusTarget-nearRadius,-40*dt,40*dt);
    city.update(focus.x*unit,focus.y*unit,night,raining,quality,clock,lamps,Boolean(state.flyover),time,nearRadius);
    farCity?.update(focus.x*unit,focus.y*unit,has('night')?night:0,quality,Boolean(state.flyover),w<650,nearRadius); // A20 far-city
    state.inActorView=inActorView; // P2 perf：同一個函式，不必每幀新建
    state.cameraInside=camera.position.y<.12||(!aerial&&cameraFraction(bounds,camera.position,camera.position)===0);
    if(!capture||actorLayer.visible)actors(state,unit,has('night')?Math.max(night,lamps*.69):0,raining,turn,tileView?.ready,walkerPortrait,camera.position,previewBus,deliveryPortrait?xinyiBusBay(0,-1.66):null,scalePortrait,!has('actors'));
    if(clock-statsClock>.5&&canvas.ownerDocument.location?.pathname?.endsWith('/engine/demo.html')){
      const near=actor=>Math.hypot(actor.x-player.x,actor.y-player.y)*unit<72&&state.inActorView(actor);
      canvas.dataset.streetActors=JSON.stringify({cars:state.cars.filter(near).length,
        people:[...state.walkers,...state.npcs,...streetCrowds].filter(near).length,
        time});
    }
    canvas.dataset.avatarModel=state.avatarModel;
    if(!canvas.dataset.textUv)canvas.dataset.textUv=JSON.stringify(city.textUv);
    view.info.reset();
    if(bloom && has('night') && quality===2 && lamps>.10) bloom.render(scene,camera,lamps*.28);
    else view.render(scene,camera);

    ctx.clearRect(0,0,w,h);
    drawAtmosphereOverlay(ctx,canvas,{w,h,time,clock,filter,raining,night,googleReady:tileView?.ready,enabled:has('sky-light')});
    if(!capture){
      if(state.flyover){
        const at=project(orbit.cx/unit,orbit.roof+8,orbit.cz/unit);
        if(at)tag(ctx,placeLabel(state.flyover.location),...at); // i18n
      }
      if(!state.flyover&&(aerial||tileView?.ready)) for (const site of locations) {
        if(!aerial&&Math.hypot(site.x-player.x,site.y-player.y)>246) continue;
        const at=project(site.x,aerial?11:2.95,site.y+20);
        if(at) tag(ctx,placeLabel(site),...at); // i18n
      }
      if(!state.flyover&&tileView?.ready) for(const landmark of landmarks) {
        const cx=landmark.x+landmark.w/2,cz=landmark.y+landmark.h/2;
        const gap=Math.hypot(cx-player.x,cz-player.y);
        if(gap>(landmark.shape==='twist'?3600:325))continue;
        const at=project(cx,landmark.shape==='twist'?56:landmark.shape==='construction'?77:9.1,cz);
        if(at)tag(ctx,landmarkLabel(landmark),...at); // i18n
      }
      if(!state.flyover&&detail==='skyline') {
        const tower=spots.get('client_hq'),point=project(tower.x,129,tower.y-130);
        if(point) tag(ctx,placeLabel(tower),...point); // i18n
      }
      if(aerial&&!state.flyover){
        const here=project(player.x,6,player.y);
        if(here)tag(ctx,playerLabel(),...here,'marker'); // i18n
      }
      if(!state.flyover){
        const sides=new Map();
        const markerAnchor=(site,height,offset)=>project(site.x,height,site.y+18)??(
          player.locationId===site.id?[w*.5,Math.max(56,h*.25)+offset]:null);
        for(const marker of state.markers){
          const site=spots.get(marker.locationId);
          if(!site)continue;
          const gap=Math.hypot(site.x-player.x,site.y-player.y)*unit;
          const side=marker.kind==='side';
          if(side){
            if(gap>45)continue;
            if(sides.has(site.id)){sides.get(site.id).count++;continue;}
            sides.set(site.id,{site,label:marker.label,gap,count:1});
          }else if(aerial||gap<54){
            const at=markerAnchor(site,4.5,0);
            if(at)tag(ctx,'◇ '+(marker.label||placeLabel(site)),...at,'marker'); // i18n
          }
        }
        for(const {site,label,gap,count} of sides.values()){
          const at=markerAnchor(site,3.25,27);
          if(!at)continue;
          ctx.globalAlpha=clamp((45-gap)/12,0,1);
          const badge=count>1?'▲ '+count:'▲';
          tag(ctx,gap<19?badge+' '+(label||placeLabel(site)):badge,...at,'side'); // i18n
          ctx.globalAlpha=1;
        }
      }
      const autopilot=uiLabel('autopilot'); // i18n
      if(!state.flyover&&evPortrait){const at=project(evPortrait.x,1.98,evPortrait.y);if(at)tag(ctx,autopilot,...at);}
      if(!aerial)for(const car of state.cars){
        if(car.hidden||car.scooter||car.service||((car.node*13+Math.floor(clock*.25))%5)!==0)continue;
        const gap=Math.hypot(car.x-player.x,car.y-player.y);
        if(gap<24||gap>155)continue;
        const at=project(car.x,1.91,car.y);
        if(at)tag(ctx,autopilot,...at);
      }
      if(!state.flyover)for (const npc of state.npcs) {
        if(Math.hypot(npc.x-player.x,npc.y-player.y)>74) continue;
        const at=project(npc.x,2.26,npc.y);
        if(!at) continue;
        tag(ctx,npc.name,...at);
        const bubble=state.speech.get(npc.id);
        if(bubble) tag(ctx,bubble.text,at[0],at[1]-29,'speech');
      }
      if(!state.flyover&&state.target && !project(state.target.x,3.4,state.target.y)) {
        const direction=diff(Math.atan2(state.target.y-player.y,state.target.x-player.x),heading);
        const edgeX=w*.5+Math.sin(direction)*(w*.5-38);
        const edgeY=Math.cos(direction)<0?h-44:34;
        ctx.save();
        ctx.translate(edgeX,edgeY);
        ctx.rotate(Math.cos(direction)<0?Math.PI-direction:direction);
        ctx.fillStyle='#f1c77c';
        ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(9,9);ctx.lineTo(0,5);ctx.lineTo(-9,9);ctx.closePath();ctx.fill();
        ctx.restore();
      }
    }
    const bottom=state.insets?.[2]??0,right=state.insets?.[1]??0;
    ctx.font='11px system-ui';
    ctx.textAlign='left';ctx.textBaseline='middle';
    const creditX=9+(state.insets?.[3]??0);
    const compactCredit=Boolean(tileView?.ready&&w<560);
    const creditW=compactCredit?110:167;
    const osmLines=compactCredit?['© OpenStreetMap','contributors']:['© OpenStreetMap contributors'];
    const creditH=compactCredit?28:17;
    const creditY=h-bottom-creditH-6;
    ctx.fillStyle='#101a22e0';ctx.fillRect(creditX,creditY,creditW,creditH);
    ctx.fillStyle='#fff';
    osmLines.forEach((line,i)=>ctx.fillText(line,creditX+5,creditY+9+i*12));
    overlay.style.zIndex=tileView?.ready?'50':'';
    if(tileView?.ready){
      const img=tiles.image,logoW=img.naturalWidth*17/img.naturalHeight;
      const max=Math.min(w-creditX-creditW-right-22,520);
      const lines=[];
      for(const word of tileView.sources.split(/\s+/)){
        const i=lines.length-1;
        const next=i<0?word:lines[i]+' '+word;
        if(i<0||ctx.measureText(next).width>max-20)lines.push(word);else lines[i]=next;
      }
      const hBox=35+lines.length*13;
      const left=w-right-max-9,top=h-bottom-hBox-6;
      state.googleInset=hBox+6;
      ctx.fillStyle='#101a22f5';ctx.fillRect(left,top,max,hBox);
      ctx.drawImage(img,left+10,top+7,logoW,17);
      ctx.fillStyle='#fff';
      lines.forEach((line,i)=>ctx.fillText(line,left+10,top+31+i*13,max-20));
      ctx.font='10px system-ui';
      ctx.fillText(uiLabel('credit'),left+10,top+hBox-4,max-20); // i18n
    }
    if(state.flyover?.retreat){
      ctx.fillStyle=`rgba(15,23,32,${state.flyover.retreat*.96})`;
      ctx.fillRect(0,0,w,h-(state.googleInset??0)-bottom);
    }
    if(driving&&state.cockpit&&!aerial&&!capture)drawCockpit(ctx,w,h,player.speed*unit,state.carSteer??0); // A26
    if(!capture){drawTouch(ctx,w,h,state);map(state);}
    if(capture||snap||clock-statsClock>.5) {
      const {calls,triangles}=view.info.render;
      canvas.dataset.engineStats=JSON.stringify({calls,triangles,dpr,quality,textures:city.loadedTextures.length,panoramas:panoramas.keys(),ads:city.loadedAds,models:actors.loaded(),modelBounds:actors.bounds()});
      statsClock=clock;
    }
  };
  draw.ready=actors.ready;
  // P2 perf：測試用。立刻建完延後的區塊、遠景與貼圖衍生圖；scene 供場景雜湊比對
  draw.finishStreaming=()=>{city.finishAll();drain();};
  draw.scene=scene;
  draw.info=view.info; // 記憶體量測用
  // E3 WebGL context 還回來：Three.js 會自己重傳貼圖與幾何，這裡補做渲染器算出來的貼圖
  draw.restore=()=>{atmosphere.restore();sun.shadow.map?.dispose();sun.shadow.map=null;lastView=-1;};
  draw.dispose=()=>{disposed=true;setUploader(null);farCity?.dispose();tiles?.dispose();actors.dispose();atmosphere.dispose();view.dispose();};
  return draw;
}
