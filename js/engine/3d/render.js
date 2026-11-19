import {makeEnvironment,makePanoramas} from './pbr.js';
import * as T from '../vendor/three.module.min.js';
import {createMapRenderer,drawTouch,surface} from '../overlay.js';
import {buildings,landmarks,locations,random,scooterSpeed,toWorld} from '../world.mjs';
import {createBloom} from './bloom.js';
import {createActors} from './actors.js';
import {streetCrowds} from '../crowds.mjs';
import {xinyiBusBay} from './street-life.js';
import {createOsmCity} from './osm-city.js';
import {metersPerUnit as unit} from '../world.mjs';
import {cameraFraction,cameraObstacles,planFlyover} from './camera.js';

const officeBuilding=buildings.find(b=>b.shape==='office');
const xinyiView=toWorld(25.03291,121.56645);
const coreView=toWorld(25.0405,121.5685);
const coreFocus=toWorld(25.0355,121.5662);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const diff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const palettes=[
  // time, low sky, zenith, haze, sun color, sun strength, ambient, night, elevation
  [0,'#171d39','#0d1429','#1b2240','#89a5ef',.45,1.21,1,.25],
  [5,'#66566e','#26375c','#49445b','#a1b7f2',.45,.89,.66,.13],
  [6.5,'#e5ae87','#6185ac','#b2a4a6','#ffc992',1.82,1.35,.13,.22],
  [9,'#d8d9c6','#6b9ebf','#b9c2bf','#ffe9cb',2.8,1.63,0,.71],
  [12,'#e3e4d6','#79abc9','#cad1c8','#fff4e4',3.17,1.74,0,1.17],
  [15,'#e2c9ae','#759eb5','#c8baa9','#ffddb3',2.8,1.52,0,.69],
  [17.35,'#df9365','#657e9e','#a38a7c','#ffb36f',2.5,1.24,.07,.19],
  [19,'#88596f','#34385c','#614e64','#ffa979',.68,.83,.63,.08],
  [21,'#1d2340','#111c34','#262746','#8098c3',.48,1.28,1,.19],
  [24,'#171d39','#0d1429','#1b2240','#89a5ef',.45,1.21,1,.25],
].map(([time,...values])=>[time,...values.map(v=>typeof v==='string'?new T.Color(v):v)]);

function daylight(time,result) {
  const hi=palettes.findIndex(p=>p[0]>time);
  const a=palettes[hi<0?palettes.length-2:hi-1],b=palettes[hi<0?palettes.length-1:hi];
  const t=T.MathUtils.smoothstep(time,a[0],b[0]);
  for (let i=1;i<=4;i++) result[i-1].copy(a[i]).lerp(b[i],t);
  for (let i=5;i<=8;i++) result[i-1]=T.MathUtils.lerp(a[i],b[i],t);
}
function skyMesh(scene) {
  const uniforms={zenith:{value:new T.Color()},horizon:{value:new T.Color()},sun:{value:new T.Vector3()},light:{value:new T.Color()},
    panoA:{value:null},panoB:{value:null},panoMix:{value:0},panoWeight:{value:0}};
  const mesh=new T.Mesh(new T.SphereGeometry(820,22,14),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,fog:false,uniforms,
    vertexShader:`varying vec3 ray;
      void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 ray; uniform vec3 zenith; uniform vec3 horizon;
      uniform vec3 sun;uniform vec3 light;
      uniform sampler2D panoA,panoB;uniform float panoMix,panoWeight;
      void main(){
        vec3 d=normalize(ray),col=vec3(0.);
        if(panoWeight<1.){
          float k=pow(clamp(d.y*1.28,0.,1.),.58);
          float s=max(0.,dot(d,sun));col=mix(horizon,zenith,k);
          float layers=sin(d.x*12.+sin(d.z*9.))*sin(d.z*16.+d.y*82.);
          float streaks=smoothstep(.30,.89,layers*.53+sin(d.x*27.+d.y*143.)*.25);
          float lowCloud=sin(d.x*13.+sin(d.z*17.+d.y*64.))*sin(d.z*22.-d.y*112.);
          float cloud=smoothstep(.18,.78,streaks*.58+lowCloud*.34)*smoothstep(.02,.24,d.y);
          col=mix(col,col*.75+light*.34,cloud*.68);
          col+=light*(pow(s,15.)*.44+smoothstep(.9991,.9996,s)*2.3+streaks*.14*k);
        }
        if(panoWeight>0.){
          vec2 uv=vec2(atan(d.z,d.x)*.15915494+.5,asin(clamp(d.y,-1.,1.))*.31830989+.5);
          col=mix(col,mix(texture2D(panoA,uv).rgb,texture2D(panoB,uv).rgb,panoMix),panoWeight);
        }
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  mesh.renderOrder=-100;
  mesh.frustumCulled=false;
  scene.add(mesh);
  return {mesh,uniforms};
}
function tag(ctx,text,x,y,kind='site') {
  ctx.font=`600 ${kind==='speech'?15:12}px system-ui, sans-serif`;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  const w=Math.min(290,ctx.measureText(text).width+18), h=kind==='speech'?28:21;
  ctx.fillStyle=kind==='speech'?'#e9d9bd':'#151c23dc';
  ctx.fillRect(x-w/2,y-h/2,w,h);
  ctx.strokeStyle=kind==='marker'?'#efbb6d':'#d9bc883e';
  ctx.strokeRect(x-w/2+.5,y-h/2+.5,w-1,h-1);
  ctx.fillStyle=kind==='speech'?'#242029':kind==='marker'?'#f5c97f':'#f6e8ce';
  ctx.fillText(text,x,y,w-13);
}
function rainFx(ctx,w,h,clock) {
  ctx.lineWidth=.8;
  ctx.strokeStyle='#e7e0e243';
  ctx.beginPath();
  for (let i=0;i<118;i++) {
    const x=(random(i+6)*w+clock*196)%w,y=(random(i+93)*h+clock*515)%h;
    const length=6+random(i+201)*20;
    ctx.moveTo(x,y);
    ctx.lineTo(x-length*.26,y+length);
  }
  ctx.stroke();
  for(let i=0;i<28;i++) {
    const phase=(clock*2+random(i)*12)%1;
    if(phase>.42) continue;
    const scale=phase/.42;
    const x=w*(.14+random(i+Math.floor(clock*2+random(i)*12)*71)*.72);
    const y=h*(.59+random(i+20)*.4);
    ctx.strokeStyle=`rgba(213,222,227,${.35*(1-scale)})`;
    ctx.beginPath();ctx.ellipse(x,y,1+scale*6,.6+scale*1.6,0,0,2*Math.PI);ctx.stroke();
  }
}

export function createRenderer(canvas,minimapCanvas,overlay,context,createGoogleLayer,forceGoogle=false) {
  const view=new T.WebGLRenderer({canvas,context,alpha:false});
  view.outputColorSpace=T.SRGBColorSpace;
  view.toneMapping=T.ACESFilmicToneMapping;
  view.toneMappingExposure=1.11;
  view.shadowMap.enabled=true;
  view.info.autoReset=false;
  view.shadowMap.type=T.PCFShadowMap;
  const bloom=context.getExtension('EXT_color_buffer_float')?createBloom(view):null;
  const scene=new T.Scene();
  const environment=makeEnvironment(canvas.ownerDocument,view);
  const panoramas=makePanoramas(canvas.ownerDocument,view);
  scene.environment=environment.texture;
  scene.fog=new T.FogExp2('#a68973',.0094);
  const camera=new T.PerspectiveCamera(66,1,.12,850);
  const sky=skyMesh(scene);
  const hemi=new T.HemisphereLight('#c2cbe1','#917467',1);
  const sun=new T.DirectionalLight('#fff0df',2.32);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=sun.shadow.camera.bottom=-28;
  sun.shadow.camera.right=sun.shadow.camera.top=28;
  sun.shadow.camera.near=1;
  sun.shadow.camera.far=158;
  sun.shadow.normalBias=.089;
  sun.shadow.bias=-.0003;
  scene.add(hemi,sun,sun.target);
  const city=createOsmCity(scene,canvas.ownerDocument,view.capabilities.getMaxAnisotropy());
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
  const actors=createActors(scene,city.glow,city.parkedScooters);
  const map=createMapRenderer(minimapCanvas);
  const ctx=overlay.getContext('2d');
  const colors=[new T.Color(),new T.Color(),new T.Color(),new T.Color()];
  const projected=new T.Vector3(),base=new T.Vector3(),position=new T.Vector3(),aim=new T.Vector3(),offset=new T.Vector3(),arm=new T.Vector3(),desired=new T.Vector3();
  const dark=new T.Color('#626780'),rainCloud=new T.Color('#6a7182'),ambientWhite=new T.Color('#d8d4cd');
  const spots=new Map(locations.map(site=>[site.id,site]));
  let sizeW=0,sizeH=0,dpr=0,quality=2,pressure=0,lastClock=0,lastView=-1;
  let heading=0,roll=0,lastHeading=0,statsClock=-1;
  let frameWidth=0,frameHeight=0;
  function project(x,y,z) {
    projected.set(x*unit,y,z*unit).project(camera);
    if (projected.z<-1 || projected.z>1 || Math.abs(projected.x)>1 || Math.abs(projected.y)>1) return null;
    return [(projected.x*.5+.5)*frameWidth,(.5-projected.y*.5)*frameHeight];
  }
  function adjustQuality(dt) {
    if (dt>.0195) pressure+=dt;
    else pressure=Math.max(0,pressure-dt*.65);
    if (pressure<.9 || quality===0) return;
    quality--;pressure=0;
    sun.shadow.map?.dispose();sun.shadow.map=null;
    sun.shadow.mapSize.set(quality===1?768:512,quality===1?768:512);
  }
  let orbit=null,orbitKey=null;
  const draw=state=>{
    const {player,weather,clock,filter,time,viewRevision}=state;
    const aerial=Boolean(state.flyover||state.largeMap);
    const useTiles=forceGoogle||aerial;
    canvas.dataset.aerial=String(aerial);
    if(useTiles)loadTiles();
    if(!useTiles)tiles?.hide();
    const dimensions=surface(overlay,ctx);
    if(!dimensions) return;
    const {w,h}=dimensions;
    const snap=lastView!==viewRevision||Boolean(canvas.dataset.flyoverCamera)&&!state.flyover;
    const dt=clamp(clock-lastClock,0,.05);
    if(!snap) adjustQuality(dt);
    lastClock=clock;
    const requestedDpr=Math.min(devicePixelRatio||1,quality===2?2:quality===1?1.25:.85);
    if (w!==sizeW||h!==sizeH||dpr!==requestedDpr) {
      dpr=requestedDpr;sizeW=w;sizeH=h;
      view.setPixelRatio(dpr);view.setSize(w,h,false);
    }
    frameWidth=w;frameHeight=h;
    const x=player.x*unit,z=player.y*unit;
    const riding=player.mode==='scooter';
    const viewSpeed=clamp(player.speed/scooterSpeed,0,1);
    const site=spots.get(player.locationId);
    const stopped=player.speed<3 && !riding;
    const arrival=!state.roadReturn && stopped && site && (site.id!=='home'||viewRevision>0);
    const detail=canvas.dataset.cameraDetail;
    const landmark=detail==='twist'?landmarks.find(b=>b.shape==='twist'):null;
    const core=detail==='core'&&!useTiles;
    let servicePortrait=null,previewBus=null;
    if(detail==='bus'){
      servicePortrait=previewBus=xinyiBusBay(0,-1.66);
    }else if(detail==='waste'){
      const home=spots.get('home'),a=home.viewHeading;
      servicePortrait={x:home.x*unit-Math.sin(a)*3.8+Math.cos(a)*.95,
        z:home.y*unit+Math.cos(a)*3.8+Math.sin(a)*.95,heading:a-Math.PI/2};
    }
    const officePortrait=detail==='a25';
    const xinyiPortrait=detail==='xinyi';
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
    if(player.speed>3) heading+=diff(player.heading,heading)*(1-Math.exp(-dt*6.5));
    const turn=clamp(diff(player.heading,lastHeading)/Math.max(.015,dt)*.11,-1,1);
    if(dt>0 || snap) lastHeading=player.heading;
    roll+=(turn*.054-roll)*(1-Math.exp(-dt*6));
    const direction=detail==='peak'?(site?.viewHeading??heading)+Math.PI/2:detail==='skyline'?-1.98:arrival?site.viewHeading:heading;
    const fx=Math.cos(direction),fz=Math.sin(direction);
    const showcase=Boolean(arrival || landmark);
    const chase=detail==='streetLife'?11:detail==='skyline'?16:landmark?12:detail==='rider'?3.3:detail==='person'?2.85:
      showcase?(narrow?9.8:8.1):(narrow?7.4:5.65)+viewSpeed*.85;
    arm.set(x,riding?1.35:1.05,z);
    const bounds=cameraObstacles(x,z,unit,forceGoogle?56:39);
    if(!aerial){
      for(const object of [...state.cars,...(state.staticColliders??[])]){
        if(object.hidden||Math.hypot(object.x*unit-x,object.y*unit-z)>15)continue;
        const xx=object.x*unit,zz=object.y*unit,r=object.r?object.r*unit:object.scooter?.58:1.42;
        bounds.push({minX:xx-r,maxX:xx+r,minZ:zz-r,maxZ:zz+r,top:object.top??(object.scooter?1.75:1.6)});
      }
    }
    if(standingPortrait){
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
      desired.set(x-fx*chase-fz*side,detail==='skyline'?10.2:detail==='streetLife'?4.1:showcase?3.1:narrow?3.7:3.25,z-fz*chase+fx*side);
      let fraction=cameraFraction(bounds,arm,desired);
      if(fraction<.64) {
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
      if(fraction<.39) {
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
    const alpha=snap||showcase||landmark||aerial||officePortrait||evPortrait||walkerPortrait||queuePortrait||servicePortrait||xinyiPortrait?1:1-Math.exp(-dt*12);
    position.lerp(base,alpha);
    if(!landmark && !core && !aerial && !officePortrait && !evPortrait && !walkerPortrait && !queuePortrait && !servicePortrait && !xinyiPortrait) {
      const safe=cameraFraction(bounds,arm,position);
      if(safe<1) position.copy(arm).lerp(position,safe);
    }
    const shake=state.shake*.16;
    camera.position.copy(position);
    if(!showcase && !core && !aerial && !officePortrait && !evPortrait && !walkerPortrait && !queuePortrait && !servicePortrait && !xinyiPortrait && arm.distanceTo(position)>2) {
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
    camera.lookAt(aim);
    if(!showcase&&!core&&!aerial&&!officePortrait&&!evPortrait&&!walkerPortrait&&!queuePortrait&&!servicePortrait&&!xinyiPortrait)camera.rotateZ(-roll);
    camera.fov=state.flyover?orbit.fov+(w/h<1?10:0):(landmark?69:showcase?64:58)+viewSpeed*13+(narrow?13:w/h<1.15?8:0)+(state.rideBoost??0)*4;
    camera.aspect=w/h;
    camera.near=state.flyover?5:.12;
    camera.far=state.flyover?1500:850;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    projected.set(x,riding?1.2:.92,z).project(camera);
    canvas.dataset.engineCamera=JSON.stringify({x:projected.x,y:projected.y,z:projected.z,
      clear:cameraFraction(bounds,arm,camera.position)===1,showcase});

    daylight(time,colors);
    const [horizon,zenith,haze,sunTint,sunPower,ambient,night,elevation]=colors;
    const raining=weather==='rain';
    if(raining) {
      horizon.lerp(rainCloud,.35);zenith.lerp(dark,.23);haze.lerp(rainCloud,.44);
    }
    sky.mesh.position.copy(camera.position);
    sky.uniforms.horizon.value.copy(horizon);
    sky.uniforms.zenith.value.copy(zenith);
    sky.uniforms.light.value.copy(sunTint).multiplyScalar((1-night)*(raining?.09:.34));
    scene.fog.color.copy(haze);
    scene.fog.density=state.flyover?(raining?.0023:.00085+night*.0011):raining?.0068:.002+night*.0023;
    const lamps=Math.max(night,time>16.6?clamp((time-16.6)/2.2,0,1)*.74:0);
    const bearing=(18-time)*Math.PI/12;
    const lightDir=sky.uniforms.sun.value.set(Math.cos(bearing)*Math.cos(elevation),Math.sin(elevation),-Math.sin(bearing)*Math.cos(elevation));
    sun.target.position.set(x,0,z);
    const shadowSpan=time>16&&time<19?64:34;
    if(sun.shadow.camera.right!==shadowSpan){
      sun.shadow.camera.left=sun.shadow.camera.bottom=-shadowSpan;
      sun.shadow.camera.right=sun.shadow.camera.top=shadowSpan;
      sun.shadow.camera.updateProjectionMatrix();
    }
    sun.position.copy(sun.target.position).addScaledVector(lightDir,61);
    sun.color.copy(sunTint);
    sun.intensity=sunPower*(raining?.72:1);
    hemi.color.copy(zenith).lerp(ambientWhite,.53+night*.26);
    hemi.intensity=ambient*(raining?1.23:1.68);
    // The texture transition is continuous in the sky and quantized for cached reflections.
    const pano=panoramas.at(time);
    sky.uniforms.panoWeight.value=pano?(raining?.48:1):0;
    if(pano){
      sky.uniforms.panoA.value=pano.a;sky.uniforms.panoB.value=pano.b;sky.uniforms.panoMix.value=pano.mix;
    }
    scene.environment=pano?.reflection??environment.texture;
    scene.environmentIntensity=.54-night*.32;
    view.toneMappingExposure=1.13-night*.08;
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
    city.group.visible=!tileView?.ready;
    state.staticColliders=tileView?.ready?[]:city.collisionProps;
    canvas.dataset.tileCount=String(tileView?.count??0);
    if(tileView)canvas.dataset.googleDiagnostics=JSON.stringify({
      sources:tileView.sources,errorTarget:tileView.errorTarget,maxDepth:tileView.maxDepth,visibleDepth:tileView.visibleDepth,
      distance:tiles?.distance??0,height:+camera.position.y.toFixed(1),
      pitch:+(Math.atan2(camera.position.y-aim.y,Math.hypot(camera.position.x-aim.x,camera.position.z-aim.z))*180/Math.PI).toFixed(1),
    });
    state.googleInset=tileView?.ready?36:0;
    const portrait=roadPortrait||deliveryPortrait?xinyiBusBay():servicePortrait;
    const portraitFocus=portrait&&{x:portrait.x/unit,y:portrait.z/unit};
    const focus=state.flyover?.location??walkerPortrait??portraitFocus??player;
    city.update(focus.x*unit,focus.y*unit,night,raining,quality,clock,lamps,Boolean(state.flyover));
    state.inActorView=(body,padded=false)=>{
      projected.set(body.x*unit,1,body.y*unit).project(camera);
      const margin=padded?1.32:1;
      return projected.z>=-1&&(padded||projected.z<=1)&&Math.abs(projected.x)<=margin&&Math.abs(projected.y)<=margin;
    };
    state.cameraInside=camera.position.y<.12||(!aerial&&cameraFraction(bounds,camera.position,camera.position)===0);
    actors(state,unit,Math.max(night,lamps*.69),raining,turn,tileView?.ready,walkerPortrait,camera.position,previewBus,deliveryPortrait?xinyiBusBay(0,-1.66):null);
    view.info.reset();
    if(bloom && quality===2 && lamps>.10) bloom.render(scene,camera,lamps*.28);
    else view.render(scene,camera);

    ctx.clearRect(0,0,w,h);
    if(time>15 && time<19) {
      ctx.fillStyle=`rgba(203,117,65,${Math.sin((time-15)*Math.PI/4)*.055})`;
      ctx.fillRect(0,0,w,h);
    }
    if(tileView?.ready){
      const dusk=1-Math.min(1,Math.abs(time-17.8)/1.65);
      if(dusk>0){
        const tint=ctx.createLinearGradient(0,0,0,h);
        tint.addColorStop(0,`rgba(208,115,68,${dusk*.17})`);
        tint.addColorStop(1,`rgba(103,62,98,${dusk*.09})`);
        ctx.fillStyle=tint;ctx.fillRect(0,0,w,h);
      }
      if(night>.02){ctx.fillStyle=`rgba(26,38,72,${night*.34})`;ctx.fillRect(0,0,w,h);}
    }
    if(raining) rainFx(ctx,w,h,clock);
    const vignette=ctx.createRadialGradient(w*.5,h*.51,h*.12,w*.5,h*.51,Math.hypot(w,h)*.57);
    vignette.addColorStop(0,'#120f1b00');
    vignette.addColorStop(.63,'#120f1b0d');
    vignette.addColorStop(1,filter==='flashback'?'#110c1bb6':'#140e2258');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    if(filter==='grandma') {
      ctx.fillStyle='#e6ab5525';ctx.fillRect(0,0,w,h);
    } else if(filter==='flashback') {
      ctx.fillStyle='#a9957939';ctx.fillRect(0,0,w,h);
    }
    const cssFilter=filter==='grandma'?'sepia(.17) saturate(.93) blur(.36px)':filter==='flashback'?'saturate(.52) contrast(.91)':'none';
    if(canvas.style.filter!==cssFilter) canvas.style.filter=cssFilter;
    if(state.flyover){
      const at=project(orbit.cx/unit,orbit.roof+8,orbit.cz/unit);
      if(at)tag(ctx,state.flyover.location.name,...at);
    }
    if(!state.flyover&&(aerial||tileView?.ready)) for (const site of locations) {
      if(!aerial&&Math.hypot(site.x-player.x,site.y-player.y)>246) continue;
      const at=project(site.x,aerial?11:2.95,site.y+20);
      if(at) tag(ctx,site.name,...at);
    }
    if(!state.flyover&&tileView?.ready) for(const landmark of landmarks) {
      const cx=landmark.x+landmark.w/2,cz=landmark.y+landmark.h/2;
      const gap=Math.hypot(cx-player.x,cz-player.y);
      if(gap>(landmark.shape==='twist'?3600:325))continue;
      const at=project(cx,landmark.shape==='twist'?56:landmark.shape==='construction'?77:9.1,cz);
      if(at)tag(ctx,landmark.name,...at);
    }
    if(!state.flyover&&detail==='skyline') {
      const tower=spots.get('client_hq'),point=project(tower.x,129,tower.y-130);
      if(point) tag(ctx,tower.name,...point);
    }
    if(aerial&&!state.flyover){
      const here=project(player.x,6,player.y);
      if(here)tag(ctx,'◆ 玩家',...here,'marker');
    }
    if(!state.flyover)for (const marker of state.markers) {
      const site=spots.get(marker.locationId);
      if(!site || (!aerial&&Math.hypot(site.x-player.x,site.y-player.y)>510)) continue;
      const at=project(site.x,4.16,site.y+18);
      if(at) tag(ctx,'◇ '+(marker.label||site.name),...at,'marker');
    }
    if(!state.flyover&&evPortrait){const at=project(evPortrait.x,1.98,evPortrait.y);if(at)tag(ctx,'自動駕駛中',...at);}
    if(!aerial)for(const car of state.cars){
      if(car.hidden||car.scooter||car.service||((car.node*13+Math.floor(clock*.25))%5)!==0)continue;
      const gap=Math.hypot(car.x-player.x,car.y-player.y);
      if(gap<24||gap>155)continue;
      const at=project(car.x,1.91,car.y);
      if(at)tag(ctx,'自動駕駛中',...at);
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
      ctx.fillText('底圖：Google Maps　遊戲角色與道路：本作／OSM',left+10,top+hBox-4,max-20);
    }
    if(state.flyover?.retreat){
      ctx.fillStyle=`rgba(15,23,32,${state.flyover.retreat*.96})`;
      ctx.fillRect(0,0,w,h-(state.googleInset??0)-bottom);
    }
    drawTouch(ctx,w,h,state);
    map(state);
    if(snap||clock-statsClock>.5) {
      const {calls,triangles}=view.info.render;
      canvas.dataset.engineStats=JSON.stringify({calls,triangles,dpr,quality,textures:city.loadedTextures.length,panoramas:panoramas.keys(),ads:city.loadedAds,models:actors.loaded(),modelBounds:actors.bounds()});
      statsClock=clock;
    }
  };
  draw.dispose=()=>{disposed=true;tiles?.dispose();actors.dispose();panoramas.dispose();environment.dispose();view.dispose();};
  return draw;
}
