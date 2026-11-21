import * as T from '../vendor/three.module.min.js?v=da1d659';
import {makeEnvironment,makePanoramas} from './pbr.js?v=da1d659';
import {createBloom} from './bloom.js?v=da1d659';
import {random} from '../world.mjs?v=da1d659';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const palettes=[
  // time, low sky, zenith, haze, sun color, sun strength, ambient, night
  [0,'#39313d','#222636','#302c37','#aaa6bf',.37,1.44,1],
  [5,'#625360','#3b485e','#53505c','#c0b6c3',.34,1.04,.66],
  [6.5,'#dcc0ac','#819dbb','#b6b0af','#ffc89a',1.65,1.82,.13],
  [9,'#c8ccca','#6597c6','#c2d3e2','#fff0dc',3.25,1.45,0],
  [10.5,'#cbd0d0','#679acb','#c3d4e3','#fff4e8',4.02,2.17,0],
  [12,'#ccd3d5','#679acb','#c3d4e3','#fff6ea',3.36,1.50,0],
  [15,'#d8d2ca','#6695c0','#c2d1df','#ffedda',2.97,2.55,0],
  [16,'#dacbbb','#7598bd','#c4cbd4','#ffe2c1',2.78,1.00,.01],
  [16.9,'#e4ae90','#6577a3','#b8a7ae','#ffbf86',2.55,.88,.05],
  [17.5,'#e2b1b7','#6571a0','#a999ac','#ffad76',.70,1.32,.31],
  [19,'#51414e','#30364c','#494050','#dac4bd',.34,1.34,.83],
  [21,'#39313d','#252939','#332e39','#a9a5b9',.40,1.48,1],
  [24,'#39313d','#222636','#302c37','#aaa6bf',.37,1.44,1],
].map(([time,...values])=>[time,...values.map(v=>typeof v==='string'?new T.Color(v):v)]);

function daylight(time,result) {
  const hi=palettes.findIndex(p=>p[0]>time);
  const a=palettes[hi<0?palettes.length-2:hi-1],b=palettes[hi<0?palettes.length-1:hi];
  const t=T.MathUtils.smoothstep(time,a[0],b[0]);
  for (let i=1;i<=4;i++) result[i-1].copy(a[i]).lerp(b[i],t);
  for (let i=5;i<=7;i++) result[i-1]=T.MathUtils.lerp(a[i],b[i],t);
}
// Compass bearing and elevation in degrees for late November in Taipei.
const sunPath=[
  [0,300,-28],[5,108,-10],[6.25,112,0],[7,117,8],[9.5,142,35],
  [11.58,180,45],[15,232,24],[16.5,245,6],[17.1,248,0],[19,266,-21],[24,300,-28],
];

function solarDirection(time,direction) {
  const hi=sunPath.findIndex(([hour])=>hour>time);
  const a=sunPath[hi<0?sunPath.length-2:hi-1],b=sunPath[hi<0?sunPath.length-1:hi];
  const t=clamp((time-a[0])/(b[0]-a[0]),0,1);
  const bearing=T.MathUtils.degToRad(T.MathUtils.lerp(a[1],b[1],t));
  const elevation=T.MathUtils.degToRad(T.MathUtils.lerp(a[2],b[2],t));
  return direction.set(Math.sin(bearing)*Math.cos(elevation),Math.sin(elevation),-Math.cos(bearing)*Math.cos(elevation));
}

function skyMesh(scene) {
  const uniforms={zenith:{value:new T.Color()},horizon:{value:new T.Color()},sun:{value:new T.Vector3()},light:{value:new T.Color()},
    dusk:{value:0},overcast:{value:0},clearDay:{value:0},skyGain:{value:1.17},cloudTint:{value:new T.Color()},haze:{value:new T.Color()},
    eastDusk:{value:new T.Color('#d79aa4')},westDusk:{value:new T.Color('#f2b582')},
    panoA:{value:null},panoB:{value:null},panoMix:{value:0},panoWeight:{value:0}};
  const mesh=new T.Mesh(new T.SphereGeometry(820,22,14),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,fog:false,uniforms,
    vertexShader:`varying vec3 ray;
      void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 ray; uniform vec3 zenith; uniform vec3 horizon;
      uniform vec3 sun;uniform vec3 light;
      uniform vec3 cloudTint,eastDusk,westDusk,haze;
      uniform float dusk,overcast,clearDay,skyGain;
      uniform sampler2D panoA,panoB;uniform float panoMix,panoWeight;
      void main(){
        vec3 d=normalize(ray);
        float height=max(d.y,0.);
        float k=pow(clamp(height*1.22,0.,1.),mix(.64,.39,clearDay));
        float s=max(0.,dot(d,sun));
        float sunSide=smoothstep(-.85,.85,dot(d.xz,sun.xz));
        vec3 low=mix(horizon,mix(eastDusk,westDusk,sunSide),dusk);
        vec3 col=mix(low,zenith,k);
        float bands=sin(d.x*18.+d.z*12.+height*76.+sin(d.z*13.));
        float strands=sin(d.x*33.-d.z*22.+height*114.);
        float field=bands*.60+strands*.27;
        float clouds=smoothstep(.13,.86,field)
          *smoothstep(.025,.19,height)*(1.-smoothstep(.55,.92,height));
        float warmEdge=dusk*sunSide*(1.-smoothstep(.50,.83,field));
        col=mix(col,mix(cloudTint,westDusk,warmEdge),clouds*mix(.13,.55,overcast));
        col+=light*(pow(s,12.)*.58+smoothstep(.99986,.99994,s)*1.1);
        if(panoWeight>0.){
          vec2 uv=vec2(atan(d.z,d.x)*.15915494+.5,asin(clamp(d.y,-1.,1.))*.31830989+.5);
          col=mix(col,mix(texture2D(panoA,uv).rgb,texture2D(panoB,uv).rgb,panoMix),panoWeight);
        }
        gl_FragColor=vec4(col*skyGain,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // Built-in material fog is blended after tone mapping and output conversion.
        float skyAboveHaze=smoothstep(.002,mix(.085,.052,clearDay),d.y);
        vec3 fogOutput=linearToOutputTexel(vec4(haze,1.)).rgb;
        gl_FragColor.rgb=mix(fogOutput,gl_FragColor.rgb,skyAboveHaze);
      }`,
  }));
  mesh.renderOrder=-100;
  mesh.frustumCulled=false;
  scene.add(mesh);
  return {mesh,uniforms};
}

export function createSkyLight(view,context,doc,enabled){
  view.outputColorSpace=T.SRGBColorSpace;
  view.toneMapping=T.ACESFilmicToneMapping;
  view.toneMappingExposure=1.11;
  view.shadowMap.enabled=true;
  view.info.autoReset=false;
  view.shadowMap.type=T.PCFShadowMap;
  const bloom=enabled&&context.getExtension('EXT_color_buffer_float')?createBloom(view):null;
  const scene=new T.Scene();
  let environment=makeEnvironment(doc,view);
  const panoramas=makePanoramas(doc,view);
  scene.environment=environment.texture;
  scene.fog=new T.FogExp2('#a68973',.0094);
  const sky=skyMesh(scene);
  sky.mesh.visible=enabled;
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
  if(!enabled){
    scene.fog=null;
    scene.environment=null;
    sun.castShadow=false;
    sun.position.set(4,8,3);
    sun.color.set('#ffffff');
    hemi.color.set('#ffffff');
  }
  const colors=[new T.Color(),new T.Color(),new T.Color(),new T.Color()];
  const rainHorizon=new T.Color('#b7bec7'),rainZenith=new T.Color('#a4acb8');
  const dayCloud=new T.Color('#b9c2ca'),nightCloud=new T.Color('#4a3f3c');
  const ambientWhite=new T.Color('#dcd0c1'),goldTint=new T.Color('#ffb684');
  return {scene,sun,bloom,panoramas,update(camera,x,z,time,weather,aerial){
    if(!enabled){
      daylight(time,colors);
      const night=colors[6];
      return {night,raining:weather==='rain',lamps:Math.max(night,time>16.25?clamp((time-16.25)/1.35,0,1)*.87:0)};
    }
    daylight(time,colors);
    const [horizon,zenith,haze,sunTint,sunPower,ambient,night]=colors;
    const raining=weather==='rain';
    const overcast=weather==='overcast'||raining;
    const cloudCover=overcast?1:0;
    if(overcast) {
      const dayWeight=1-night;
      horizon.lerp(rainHorizon,dayWeight*.94);
      zenith.lerp(rainZenith,dayWeight*.95);
      haze.lerp(rainZenith,dayWeight*.82);
    }
    const golden=T.MathUtils.smoothstep(time,15.8,16.85)*(1-T.MathUtils.smoothstep(time,17.05,18.4));
    const twilight=T.MathUtils.smoothstep(time,16,17.05)*(1-T.MathUtils.smoothstep(time,17.4,19.15));
    const lightDir=solarDirection(time,sky.uniforms.sun.value);
    sky.mesh.position.copy(camera.position);
    sky.uniforms.horizon.value.copy(horizon);
    sky.uniforms.zenith.value.copy(zenith);
    sky.uniforms.dusk.value=twilight*(1-cloudCover);
    sky.uniforms.overcast.value=cloudCover;
    const clearDay=(1-night)*(1-golden)*(1-cloudCover);
    sky.uniforms.clearDay.value=clearDay;
    sky.uniforms.skyGain.value=1.08+clearDay*.29+golden*.32+twilight*.26;
    sky.uniforms.cloudTint.value.copy(dayCloud).lerp(nightCloud,night);
    const sunVisible=T.MathUtils.smoothstep(lightDir.y,-.035,.018);
    sky.uniforms.light.value.copy(sunTint).multiplyScalar(sunVisible*(overcast?.025:.68));
    sky.uniforms.haze.value.copy(haze);
    scene.fog.color.copy(haze);
    // High viewpoints look over the densest part of the basin's daytime haze.
    // Keep about 27–46% contrast at 2.5 km before material-specific fog adjustments.
    const aboveBasin=T.MathUtils.smoothstep(camera.position.y,8,145);
    const daylightDensity=T.MathUtils.lerp(.00046,.00035,aboveBasin);
    const duskDensity=aerial?.00112+night*.0007:.00164+night*.00075;
    const duskHaze=Math.max(golden,twilight,night);
    scene.fog.density=overcast
      ?(aerial?.0023:.0036)
      :T.MathUtils.lerp(daylightDensity,duskDensity,duskHaze);
    const lamps=Math.max(night,time>16.25?clamp((time-16.25)/1.35,0,1)*.87:0);
    sun.target.position.set(x,0,z);
    const shadowSpan=time>16&&time<19?64:34;
    if(sun.shadow.camera.right!==shadowSpan){
      sun.shadow.camera.left=sun.shadow.camera.bottom=-shadowSpan;
      sun.shadow.camera.right=sun.shadow.camera.top=shadowSpan;
      sun.shadow.camera.updateProjectionMatrix();
    }
    // Keep moon/overcast fill above the ground when the sun is below the horizon.
    sun.position.copy(sun.target.position).addScaledVector(lightDir,61);
    if(lightDir.y<0) sun.position.y=12*night;
    sun.color.copy(sunTint).lerp(goldTint,golden*.23).lerp(ambientWhite,cloudCover*.86);
    // Early evening emphasises signs and windows while preserving unlit street contrast.
    const earlyNight=T.MathUtils.smoothstep(night,.76,.86)*(1-T.MathUtils.smoothstep(night,.86,.91));
    const eveningGrade=overcast?0:earlyNight;
    sun.intensity=sunPower*(overcast?.065:1)*(1-eveningGrade*.43);
    sun.castShadow=!overcast;
    hemi.color.copy(zenith).lerp(ambientWhite,.76+night*.13);
    const nightGrade=T.MathUtils.smoothstep(night,.66,.96);
    hemi.intensity=overcast
      ?T.MathUtils.lerp(2.32,1.69,night)
      :ambient*(1-eveningGrade*.53-nightGrade*.22);
    // Keep the panorama for reflections and use a soft contribution in the visible sky.
    const pano=panoramas.at(time);
    sky.uniforms.panoWeight.value=pano&&!overcast?.075*(1-night):0;
    if(pano){
      sky.uniforms.panoA.value=pano.a;sky.uniforms.panoB.value=pano.b;sky.uniforms.panoMix.value=pano.mix;
    }
    scene.environment=pano?.reflection??environment.texture;
    scene.environmentIntensity=((overcast?.32:.29)-night*.12)*(1-eveningGrade*.43);
    const lowSunGlare=T.MathUtils.smoothstep(time,15.55,16)*(1-T.MathUtils.smoothstep(time,16.02,16.65));
    view.toneMappingExposure=1.28-lowSunGlare*.14+nightGrade*(raining?.07:.16)+eveningGrade*1.45;
    return {night,raining,lamps};
  },restore(){ // E3 context 還回來：重做環境反射圖，天空全景的反射用到時重算
    environment.dispose();
    environment=makeEnvironment(doc,view);
    if(enabled)scene.environment=environment.texture;
    panoramas.reset();
  },dispose(){panoramas.dispose();environment.dispose();}};
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

export function drawAtmosphereOverlay(ctx,canvas,{w,h,time,clock,filter,raining,night,googleReady,enabled}){
  if(googleReady){
    const dusk=1-Math.min(1,Math.abs(time-17.8)/1.65);
    if(dusk>0){
      const tint=ctx.createLinearGradient(0,0,0,h);
      tint.addColorStop(0,`rgba(208,115,68,${dusk*.17})`);
      tint.addColorStop(1,`rgba(103,62,98,${dusk*.09})`);
      ctx.fillStyle=tint;ctx.fillRect(0,0,w,h);
    }
    if(night>.02){ctx.fillStyle=`rgba(26,38,72,${night*.34})`;ctx.fillRect(0,0,w,h);}
  }
  if(enabled){
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
  }
  const cssFilter=filter==='grandma'?'sepia(.17) saturate(.93) blur(.36px)':filter==='flashback'?'saturate(.52) contrast(.91)':'none';
  if(canvas.style.filter!==cssFilter) canvas.style.filter=cssFilter;
}
