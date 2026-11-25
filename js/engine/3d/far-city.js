import * as T from '../vendor/three.module.min.js?v=267cd4de';
import {mobileTextures} from './city-primitives.js?v=267cd4de';
import data from '../data/far-city.json' with {type:'json'};
import {buildings,toWorld,roadAt,width as worldWidth,height as worldDepth,metersPerUnit as unit} from '../world.mjs?v=267cd4de';
import {isTowerBlock} from '../tower-structures.mjs?v=267cd4de'; // A23 towers
import {shellHeight,towerFacade} from './buildings-tower.js?v=267cd4de'; // A23 towers
import {oldFacade} from './buildings-old.js?v=267cd4de';
import {hash} from './city-primitives.js?v=267cd4de';
import {urbanInfill} from '../infill.mjs?v=267cd4de';

const origin=toWorld(...data.origin),ox=origin.x*unit,oz=origin.y*unit;
function unpack(row,start=0){
  const ring=[];
  let x=ox,z=oz;
  for(let i=start;i<row.length;i+=2){
    x+=row[i]*data.grid;z+=row[i+1]*data.grid;
    ring.push(new T.Vector2(x,z));
  }
  return ring;
}
function rectangle(x,z,w,d,angle=0){
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>
    new T.Vector2(x+a*w*cos/2-b*d*sin/2,z+a*w*sin/2+b*d*cos/2));
}
function groundMap(doc){
  const canvas=doc.createElement('canvas');
  canvas.width=canvas.height=mobileTextures?768:1536; // 手機貼圖減半
  const ctx=canvas.getContext('2d'),radius=data.radius;
  const scale=canvas.width/(2*radius);
  ctx.setTransform(scale,0,0,scale,(radius-ox)*scale,(radius-oz)*scale);
  ctx.fillStyle='#8e9184';
  ctx.fillRect(ox-radius,oz-radius,2*radius,2*radius);
  for(const type of [1,0,2]){
    for(const [kind,...rings] of data.land){
      if(kind!==type)continue;
      ctx.beginPath();
      for(const row of rings){
        const path=unpack(row);
        ctx.moveTo(path[0].x,path[0].y);
        for(const p of path.slice(1))ctx.lineTo(p.x,p.y);
        if(type!==0)ctx.closePath();
      }
      if(type===0){ctx.strokeStyle='#646966';ctx.lineWidth=15;ctx.stroke();}
      else{ctx.fillStyle=type===2?'#637f89':'#6d805c';ctx.fill('evenodd');}
    }
  }
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  return texture;
}
function facadeMap(doc,lights=false){
  const canvas=doc.createElement('canvas');
  canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=lights?'#000':'#eeeae2';ctx.fillRect(0,0,256,256);
  for(let y=0;y<8;y++)for(let x=0;x<16;x++){
    const hash=Math.sin(x*93.23+y*41.17)*24763.31;
    const lit=hash-Math.floor(hash)<.23;
    ctx.fillStyle=lights?(lit?'#fff':'#000'):(lit?'#88969d':'#647889');
    ctx.fillRect(x*16+2,y*32+7,12,14);
  }
  ctx.fillStyle=lights?'#000':'#adb0af';for(let y=0;y<8;y++)ctx.fillRect(0,y*32+29,256,3);
  const texture=new T.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.colorSpace=T.SRGBColorSpace;
  return texture;
}

// 遠景外殼換成近景模型的那一刻顏色不能跳：照 buildings.js 的同一套決定性算法取 tint，
// 乘上近景立面貼圖的平均色（assets/tex 量測值），再補上「近景有打光、遠景外殼不打光且自帶淺色立面貼圖」的差
// （係數用 probe-lod-pair 同鏡頭近／遠兩張截圖對色量出來）。
const nearTexture={new:'#436373',towerB:'#33484c',towerC:'#727370',old:'#756d65',oldB:'#6e6d61',oldC:'#847c73'};
const NEAR_LIGHT=4,nearRoof=new T.Color('#c7c1b8').multiply(new T.Color('#837e76')).multiplyScalar(1.4);
function nearTone(b,out){
  const variant=Math.min(2,Math.floor(hash(b.osmId,7)*3));
  const tint=new T.Color(b.color).lerp(new T.Color('#ebe6dc'),.68);
  const {material}=b.modern?towerFacade(variant,tint,(hash(b.osmId,19)-.5)*.1,false):oldFacade(variant,tint,b.osmId);
  return out.copy(tint).multiply(new T.Color(nearTexture[material])).multiplyScalar(NEAR_LIGHT);
}
function infillTone(q,out){ // 與 buildings-old.js addInfill 同一套
  const seed=Math.round(q.x*31+q.z),tint=new T.Color('#e0d8c8');
  const {material}=q.civic?{material:'new'}:oldFacade(Math.floor(hash(seed,2)*3),tint,seed);
  return out.copy(tint).multiply(new T.Color(nearTexture[material])).multiplyScalar(NEAR_LIGHT);
}

export function createFarCity(group,doc){
  const chunks=new Map(),focus={value:new T.Vector2()},near={value:340},dark={value:0};
  const facade=facadeMap(doc),lights=facadeMap(doc,true),cover=groundMap(doc);
  const material=new T.MeshBasicMaterial({vertexColors:true,map:facade,side:T.DoubleSide});
  // 高度只會被「脫離玩家的鏡頭」壓低（cameraGap）：劇照與截圖工具把鏡頭擺到別的街廓、焦點仍在玩家身上，
  // 鏡頭旁的外殼會擋住畫面，才依鏡頭到外殼的距離把外殼壓低。一般騎車、走路、開車的追尾鏡頭離焦點不到 20 m，
  // 若照樣壓，剛出近景圈（265／340 m）的大樓會先矮一截（外框大的高樓甚至整棟壓平）、進圈時近景模型才整棟冒出來；
  // 所以鏡頭離焦點 30 m 內不壓、60 m 外照舊（detached）。
  // 何時畫（fcFade，看 owner.z）：
  //   < 0  永遠畫（近景資料矩形外、玩家碰不到、也不壓到近景內容）；
  //   = 0  owned：焦點離所在 100 m 格中心超過 fcNear 才畫，與近景區塊同一格同時換手（近景模型同高，換手看不出來）；
  //   > 0  要讓位的非 owned（壓到近景內容，或外框在地圖內、玩家騎得進去）：焦點離中心超過 fcNear+owner.z 才開始出現，
  //        再往外 60 m 用網點漸顯、顏色從霧色過渡回原色（只有 fadeMaterial 有這段 discard）。
  //        不再垂直壓扁：看起來是從霧裡淡出來，不是長高或變矮；位置在近景圈外，離玩家 265 m 以上。
  // （GLSL 字串裡只放 ASCII 註解）
  const lod=s=>{
    Object.assign(s.uniforms,{fcFocus:focus,fcNear:near,fcNight:dark,fcLights:{value:lights}});
    s.vertexShader=s.vertexShader.replace('void main() {',
      'attribute vec4 owner; uniform vec2 fcFocus; uniform float fcNear; varying float fcFade; void main() {')
      .replace('#include <project_vertex>',`#include <project_vertex>
      float d=distance(fcFocus,owner.xy);
      // Camera protection only for a camera detached from the focus (portraits, capture tool).
      float detached=smoothstep(30.,60.,distance(cameraPosition.xz,fcFocus));
      float cameraGap=length(vec2(max(0.,distance(cameraPosition.xz,owner.xy)-owner.w),cameraPosition.y));
      float scale=mix(1.,smoothstep(155.,225.,cameraGap),detached);
      fcFade=owner.z<0. ? 1. : owner.z<.5 ? step(fcNear,d) : smoothstep(fcNear+owner.z,fcNear+owner.z+60.,d);
      if(scale<=0. || fcFade<=0.)gl_Position=vec4(2.,2.,2.,1.);
      else gl_Position=projectionMatrix*(mvPosition-viewMatrix[1]*position.y*(1.-scale));`);
    s.fragmentShader=s.fragmentShader.replace('void main() {',`uniform float fcNight; uniform sampler2D fcLights;
      #ifdef FC_FADE
      varying float fcFade;
      float fcBayer2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
      #endif
      void main() {
      #ifdef FC_FADE
      // 8x8 ordered dither: screen-door fade-in, no height change.
      if(fcFade<1.){vec2 p=gl_FragCoord.xy;if(fcBayer2(.25*p)*.0625+fcBayer2(.5*p)*.25+fcBayer2(p)>=fcFade)discard;}
      #endif`)
      .replace('#include <map_fragment>',`vec3 surface=texture2D(map,vMapUv).rgb;
      diffuseColor.rgb*=mix(surface,vec3(1.),float(vMapUv.y<0.));
      diffuseColor.rgb*=1.-fcNight*.78;`)
      .replace('#include <opaque_fragment>',`if(fcNight>.05 && vMapUv.y>=0.)
        outgoingLight+=vec3(.88,.58,.31)*fcNight*texture2D(fcLights,vMapUv).r;
      #include <opaque_fragment>`)
      .replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replaceAll('vFogDepth','(vFogDepth*mix(.75,.42,fcNight))')+`
      #if defined(FC_FADE) && defined(USE_FOG)
      gl_FragColor.rgb=mix(fogColor,gl_FragColor.rgb,fcFade); // emerge from the haze: low-contrast dots while sparse
      #endif`);
  };
  material.onBeforeCompile=lod;
  // 要讓位的建物集中成一個網格、另用一份帶 FC_FADE 的材質（discard 只在這一份，其餘外殼的 early-Z 不受影響；多 1 個 draw call）
  const fadeMaterial=material.clone();
  fadeMaterial.defines={FC_FADE:''};fadeMaterial.onBeforeCompile=lod;
  material.userData.lod=fadeMaterial.userData.lod={focus,near}; // 給 probe-lod-ride 讀實際的焦點與近景半徑
  const floor=new T.MeshBasicMaterial({map:cover,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  floor.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{fcFocus:focus,fcNear:near,fcNight:dark});
    s.vertexShader='varying vec2 fcXZ;\n'+s.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nfcXZ=(modelMatrix*vec4(position,1.)).xz;');
    s.fragmentShader='varying vec2 fcXZ; uniform vec2 fcFocus; uniform float fcNear; uniform float fcNight;\n'+s.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\nif(distance(fcXZ,fcFocus)<fcNear+75. || length(vec3(fcXZ-cameraPosition.xz,cameraPosition.y))<225.)discard; diffuseColor.rgb*=1.-.78*fcNight;');
  };
  const plane=new T.Mesh(new T.PlaneGeometry(2*data.radius,2*data.radius),floor);
  plane.rotation.x=-Math.PI/2;plane.position.set(ox,-.072,oz);
  group.add(plane);
  // 非 owned 的遠景建物（近景資料矩形外的 OSM 輪廓與外圍街廓）沒有近景模型接手。原本一律在焦點 560–620 m 內壓扁，
  // 往地圖邊緣騎時整排樓先變矮再消失。現在只有兩種要讓位，其餘一直保持原高：
  //   conflict：外框碰到近景建物或補樓（owned 外殼，都在這之前加入），或牆邊 2 m 內有地圖內的道路；
  //   inMap：外框在地圖範圍內（再放寬 12 m 給追尾鏡頭）。近景資料沒蓋到的角落（西北角八德路三段以北、南京東路五段西段）
  //          是一片沒有路也沒有碰撞的空地，機車從巷底、行人從路邊都能直接走進去；外殼若留著，人和鏡頭會穿進沒有碰撞的盒子裡。
  // 兩種都等整棟離開近景圈才淡入（見 lod 的 owner.z > 0）；地圖外的建物玩家到不了（worldContact 的 boundary），維持一直畫。
  const ownedCells=new Map(),ownedBounds=new T.Box2(),reach=12,mapW=worldWidth*unit,mapD=worldDepth*unit;
  const reachable=(x,z)=>x>-reach&&z>-reach&&x<mapW+reach&&z<mapD+reach;
  const inMap=box=>box.max.x>-reach&&box.max.y>-reach&&box.min.x<mapW+reach&&box.min.y<mapD+reach;
  function overlapsNear(box,ring){
    if(box.intersectsBox(ownedBounds)){
      for(let i=Math.floor(box.min.x/100);i<=Math.floor(box.max.x/100);i++)
        for(let j=Math.floor(box.min.y/100);j<=Math.floor(box.max.y/100);j++)
          for(const other of ownedCells.get(i*65536+j)??[])if(other.intersectsBox(box))return true;
    }
    if(!inMap(box))return false;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],steps=Math.max(1,Math.ceil(a.distanceTo(b)/3));
      for(let k=0;k<steps;k++){
        const x=a.x+(b.x-a.x)*k/steps,z=a.y+(b.y-a.y)*k/steps;
        if(reachable(x,z)&&roadAt(x/unit,z/unit,-2/unit))return true;
      }
    }
    return false;
  }
  function add(ring,h,owned,seed,coarse=false,curtain=false,color=null){
    if(ring.length<3)return;
    const box=new T.Box2().setFromPoints(ring),center=box.getCenter(new T.Vector2());
    const {x,y:z}=center;
    const conflict=!owned&&overlapsNear(box,ring),hold=conflict?'conflict':!owned&&inMap(box)?'map':null;
    const ix=Math.floor((x-ox)/1500),iz=Math.floor((z-oz)/1500),key=hold?'fade':ix+','+iz;
    if(!chunks.has(key))chunks.set(key,[]);
    const modern=x-ox>-160&&x-ox<1050&&z-oz>-750&&z-oz<520;
    if(owned){
      ownedBounds.union(box);
      for(let i=Math.floor(box.min.x/100);i<=Math.floor(box.max.x/100);i++)
        for(let j=Math.floor(box.min.y/100);j<=Math.floor(box.max.y/100);j++){
          const cell=i*65536+j;
          if(!ownedCells.has(cell))ownedCells.set(cell,[]);
          ownedCells.get(cell).push(box);
        }
    }
    chunks.get(key).push({ring,h,x,z,owned,modern,seed,coarse,curtain,color,hold,
      primary:owned||h>=25||seed%3===0});
  }
  for(const b of buildings){
    if(b.shape||[228920407,228920409,441377762,1131522120].includes(b.osmId))continue;
    const curtain=isTowerBlock(b);
    // 與近景模型同高（buildings.js 用 shellHeight(b)，最低 3 m），換手時才不會差一截
    add(b.polygon.map(p=>new T.Vector2(p.x*unit,p.y*unit)),shellHeight(b),true,b.osmId,false,curtain,curtain?null:nearTone(b,new T.Color()));
  }
  for(const q of urbanInfill())if(q.housing){
    add(rectangle(q.x,q.z,q.width,q.depth,q.heading),q.tin?Math.min(q.height,5.4):q.height,true,Math.abs(Math.round(q.x*31+q.z)),false,false,infillTone(q,new T.Color()));
  }
  for(const [i,row] of data.buildings.entries())add(unpack(row,1),row[0],false,i);
  for(const [i,[h,x,z,w,d]] of data.blocks.entries())add(rectangle(ox+2*x+w,oz+2*z+d,2*w,2*d),h,false,i,true);
  const meshes=[];
  for(const [key,items] of chunks){
    const pos=[],uv=[],colors=[],owner=[],indices=[];
    let mobileCount=0;
    const tone=new T.Color();let roofTone=null;
    function vertex(p,y,u,v,shade){
      pos.push(p.x,y,p.y);uv.push(u,v);colors.push(tone.r*shade,tone.g*shade,tone.b*shade);
    }
    function shell(ring,bottom,top,roofOnly=false,seed=0){
      const faces=T.ShapeUtils.triangulateShape(ring,[]);
      const base=pos.length/3;
      if(roofTone){const wall=tone.clone();tone.copy(roofTone);for(const p of ring)vertex(p,top,0,-1,1);tone.copy(wall);}
      else for(const p of ring)vertex(p,top,0,-1,1.08);
      for(const [a,b,c] of faces)indices.push(base+a,base+b,base+c);
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],w=a.distanceTo(b);
        if(w<.1)continue;
        const k=pos.length/3,shade=.77+.15*(b.x-a.x)/w;
        const u0=(seed%16)/16,v0=roofOnly?-1:(seed%8)/8+.001,v1=roofOnly?-1:v0+(top-bottom)/26.4;
        vertex(a,bottom,u0,v0,shade);vertex(b,bottom,u0+w/40,v0,shade);
        vertex(b,top,u0+w/40,v1,shade);vertex(a,top,u0,v1,shade);
        indices.push(k,k+1,k+2,k,k+2,k+3);
      }
    }
    for(const item of items.sort((a,b)=>Number(b.primary)-Number(a.primary))){
      const {ring,h,x,z,owned,seed,modern,coarse}=item;
      tone.set((modern?['#8199a5','#a0aeb1','#8e9ca5','#9caaa9']:['#c2b6a8','#c4bbae','#bab6ac','#b7ada2'])[seed%4]);
      if(item.curtain)tone.set(['#667d87','#70838c','#788b91','#647b84'][seed%4]); // A23 towers
      if(item.color)tone.copy(item.color); // 與近景同色
      roofTone=item.color?nearRoof:null;
      const start=pos.length;
      shell(ring,0,h,false,seed);
      if(!coarse&&seed%4===0&&ring.length>=4&&ring[0].distanceTo(ring[1])>8){
        // Put equipment inside a roof triangle, including concave footprints.
        const [a,b,c]=T.ShapeUtils.triangulateShape(ring,[])[0]??[];
        if(a!==undefined){
          const roof=ring[a].clone().add(ring[b]).add(ring[c]).multiplyScalar(1/3);
          tone.set(seed%8?'#b8b7ac':'#989fa3');
          const equipment=seed%8?Array.from({length:6},(_,i)=>new T.Vector2(roof.x+Math.cos(i*Math.PI/3),roof.y+Math.sin(i*Math.PI/3))):rectangle(roof.x,roof.y,3.8,2);
          shell(equipment,h,h+(seed%8?1.8:2.6),true);
        }
      }
      const cx=owned?(Math.floor(x/100)+.5)*100:x,cz=owned?(Math.floor(z/100)+.5)*100:z;
      const radius=Math.max(...ring.map(p=>Math.hypot(p.x-cx,p.y-cz)));
      // owner.z = 焦點要比近景半徑再遠幾公尺才開始畫：owned 與近景同一個 100 m 格同時換手（0）；
      // conflict 要等底下可能重疊的近景區塊都收起來（自身半徑＋近景物件與區塊半對角線的餘裕 120 m）；
      // inMap 等整棟都在近景圈外（自身半徑）；其餘 -1 不讓位。
      const hide=owned?0:item.hold==='conflict'?radius+120:item.hold==='map'?Math.max(1,radius):-1;
      for(let j=start;j<pos.length;j+=3)owner.push(cx,cz,hide,radius);
      if(item.primary)mobileCount=indices.length;
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geo.setAttribute('owner',new T.Float32BufferAttribute(owner,4));
    geo.setIndex(indices);geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,key==='fade'?fadeMaterial:material);
    group.add(mesh);meshes.push({mesh,mobileCount});
  }
  return {
    update(x,z,night,quality,aerial,mobile,nearRadius){
      focus.value.set(x,z);near.value=nearRadius??(aerial?535:quality===2?340:265);dark.value=night;
      for(const {mesh,mobileCount} of meshes){
        const geo=mesh.geometry,{center,radius}=geo.boundingSphere;
        const distant=Math.hypot(center.x-x,center.z-z)-radius>2500;
        geo.setDrawRange(0,quality===2&&!mobile&&!distant?Infinity:mobileCount);
      }
    },
    dispose(){
      for(const {mesh} of meshes)mesh.geometry.dispose();
      plane.geometry.dispose();floor.dispose();cover.dispose();facade.dispose();lights.dispose();material.dispose();fadeMaterial.dispose();
    },
  };
}
