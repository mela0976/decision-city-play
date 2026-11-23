import * as T from '../vendor/three.module.min.js?v=1448599f';
import {mobileTextures} from './city-primitives.js?v=1448599f';
import data from '../data/far-city.json' with {type:'json'};
import {buildings,toWorld,metersPerUnit as unit} from '../world.mjs?v=1448599f';
import {isTowerBlock} from '../tower-structures.mjs?v=1448599f'; // A23 towers
import {shellHeight,towerFacade} from './buildings-tower.js?v=1448599f'; // A23 towers
import {oldFacade} from './buildings-old.js?v=1448599f';
import {hash} from './city-primitives.js?v=1448599f';
import {urbanInfill} from '../infill.mjs?v=1448599f';

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
  material.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{fcFocus:focus,fcNear:near,fcNight:dark,fcLights:{value:lights}});
    s.vertexShader=s.vertexShader.replace('void main() {',
      'attribute vec4 owner; uniform vec2 fcFocus; uniform float fcNear; void main() {')
      .replace('#include <project_vertex>',`#include <project_vertex>
      float d=distance(fcFocus,owner.xy);
      // A detached street-level camera can be in a different chunk than the player.
      float cameraGap=length(vec2(max(0.,distance(cameraPosition.xz,owner.xy)-owner.w),cameraPosition.y));
      float scale=min(smoothstep(155.,225.,cameraGap),owner.z>.5 ? step(fcNear,d) : smoothstep(560.,620.,d));
      if(scale<=0.)gl_Position=vec4(2.,2.,2.,1.);
      else gl_Position=projectionMatrix*(mvPosition-viewMatrix[1]*position.y*(1.-scale));`);
    s.fragmentShader=s.fragmentShader.replace('void main() {','uniform float fcNight; uniform sampler2D fcLights; void main() {')
      .replace('#include <map_fragment>',`vec3 surface=texture2D(map,vMapUv).rgb;
      diffuseColor.rgb*=mix(surface,vec3(1.),float(vMapUv.y<0.));
      diffuseColor.rgb*=1.-fcNight*.78;`)
      .replace('#include <opaque_fragment>',`if(fcNight>.05 && vMapUv.y>=0.)
        outgoingLight+=vec3(.88,.58,.31)*fcNight*texture2D(fcLights,vMapUv).r;
      #include <opaque_fragment>`)
      .replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replaceAll('vFogDepth','(vFogDepth*mix(.75,.42,fcNight))'));
  };
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
  function add(ring,h,owned,seed,coarse=false,curtain=false,color=null){
    if(ring.length<3)return;
    const box=new T.Box2().setFromPoints(ring),center=box.getCenter(new T.Vector2());
    const {x,y:z}=center;
    const ix=Math.floor((x-ox)/1500),iz=Math.floor((z-oz)/1500),key=ix+','+iz;
    if(!chunks.has(key))chunks.set(key,[]);
    const modern=x-ox>-160&&x-ox<1050&&z-oz>-750&&z-oz<520;
    chunks.get(key).push({ring,h,x,z,owned,modern,seed,coarse,curtain,color,
      primary:owned||h>=25||seed%3===0});
  }
  for(const b of buildings){
    if(b.shape||[228920407,228920409,441377762,1131522120].includes(b.osmId))continue;
    const curtain=isTowerBlock(b);
    add(b.polygon.map(p=>new T.Vector2(p.x*unit,p.y*unit)),shellHeight(b,0),true,b.osmId,false,curtain,curtain?null:nearTone(b,new T.Color()));
  }
  for(const q of urbanInfill())if(q.housing){
    add(rectangle(q.x,q.z,q.width,q.depth,q.heading),q.tin?Math.min(q.height,5.4):q.height,true,Math.abs(Math.round(q.x*31+q.z)),false,false,infillTone(q,new T.Color()));
  }
  for(const [i,row] of data.buildings.entries())add(unpack(row,1),row[0],false,i);
  for(const [i,[h,x,z,w,d]] of data.blocks.entries())add(rectangle(ox+2*x+w,oz+2*z+d,2*w,2*d),h,false,i,true);
  const meshes=[];
  for(const items of chunks.values()){
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
      for(let j=start;j<pos.length;j+=3)owner.push(cx,cz,Number(owned),radius);
      if(item.primary)mobileCount=indices.length;
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geo.setAttribute('owner',new T.Float32BufferAttribute(owner,4));
    geo.setIndex(indices);geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,material);
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
      plane.geometry.dispose();floor.dispose();cover.dispose();facade.dispose();lights.dispose();material.dispose();
    },
  };
}
