import * as T from '../vendor/three.module.min.js?v=b7b57ceb';
import {canvasTexture,shapes,mobileTextures} from './city-primitives.js?v=b7b57ceb';
import {crossings,signalState} from '../street-crossings.mjs?v=b7b57ceb';
import {placedPoles} from '../signal-poles.mjs?v=b7b57ceb';

// 燈桿位置見 signal-poles.mjs：落在車道上的會先移到路外，繪製和碰撞用同一份
const poles=placedPoles;
export const signalReflections=poles.map(p=>({x:p.x-p.dy*2.7,z:p.y+p.dx*2.7,crossing:p})); // A24
const names=[...new Map(poles.map(p=>[p.name,p])).values()];
const nameTile=new Map(names.map((p,i)=>[p.name,i]));
const cell=128,columns=16,sharp=mobileTextures?1:2; // 路名牌貼圖：繪製座標仍以 128 為一格，畫布放大兩倍，近看不糊
// 記憶體：手機不放大（兩張路名牌圖集原本 4096×3584 與 4096×2048，約 117 MB GPU，是手機最大宗的貼圖）
function atlas(doc,count,paint){
  const rows=Math.ceil(count/columns);
  const map=canvasTexture(doc,columns*cell*sharp,rows*cell*sharp,(ctx)=>{
    ctx.scale(sharp,sharp);
    for(let i=0;i<count;i++){
      ctx.save();ctx.translate((i%columns)*cell,Math.floor(i/columns)*cell);
      paint(ctx,i);ctx.restore();
    }
  });
  return {map,rows};
}
function faceBatch(doc,count,paint,multiplier=1){
  const {map,rows}=atlas(doc,count,paint);
  // Two back-to-back faces with independent, readable UVs on both sides.
  const geometry=new T.BufferGeometry();
  const front=shapes.plane.toNonIndexed();
  for(const key of ['position','normal','uv']){
    const attr=front.getAttribute(key),values=Array.from(attr.array);
    for(let i=0;i<attr.count;i++){
      if(key==='uv')values.push(attr.getX(i),attr.getY(i));
      else values.push(-attr.getX(i),attr.getY(i),-attr.getZ(i));
    }
    geometry.setAttribute(key,new T.Float32BufferAttribute(values,attr.itemSize));
  }
  front.dispose();
  const tile=new T.InstancedBufferAttribute(new Float32Array(poles.length*multiplier),1);
  geometry.setAttribute('tile',tile);
  const material=new T.MeshBasicMaterial({map,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float tile;\n'+shader.vertexShader.replace('#include <uv_vertex>',
      `#include <uv_vertex>
      vMapUv = (vec2(mod(tile,16.),${rows-1}. - floor(tile / 16.)) + clamp(uv,.005,.995)) / vec2(16.,${rows}.);`);
  };
  material.customProgramCacheKey=()=>'signal-atlas-'+rows;
  const mesh=new T.InstancedMesh(geometry,material,poles.length*multiplier);
  return {mesh,tile};
}
function vehicle(ctx,i){
  ctx.fillStyle='#202726';ctx.fillRect(0,0,128,128);
  for(let n=0;n<4;n++){
    const x=17+n*31;
    ctx.fillStyle=n===i&&n<3?['#ff4433','#ffce33','#49fa89'][n]:'#34413d';
    ctx.save();ctx.translate(x,64);ctx.scale(1,2.4);
    ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.restore();
    if(n===3){ctx.fillStyle='#63756b';ctx.font='bold 30px sans-serif';ctx.fillText('←',x-14,76);}
  }
}
function pedestrian(ctx,i){
  const walk=i>=2,lit=i!==1;
  ctx.fillStyle='#182020';ctx.fillRect(0,0,128,128);
  ctx.fillStyle=ctx.strokeStyle=walk?'#61ff95':lit?'#ff5144':'#38433e';
  ctx.beginPath();ctx.arc(32,27,10,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();
  ctx.moveTo(32,43);ctx.lineTo(32,75);
  for(const side of [-1,1]){
    ctx.moveTo(32,46);ctx.lineTo(32+side*(walk?17:11),63);
    ctx.moveTo(32,71);ctx.lineTo(32+side*(walk?17:7),99);
  }
  ctx.stroke();
  if(walk){
    ctx.fillStyle='#ffcd57';ctx.font='bold 52px monospace';ctx.textAlign='center';
    ctx.fillText(String(Math.floor((i-2)/2)),91,84,65);
    if(i%2){ctx.fillStyle='#182020';ctx.fillRect(0,0,55,128);}
  }
}
function plate(ctx,i){
  const p=names[i];ctx.fillStyle='#087756';ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='#eef9e8';ctx.lineWidth=3;ctx.strokeRect(3,5,122,118);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 54px sans-serif';ctx.fillText(p.name,64,p.en?72:85,112);
  if(p.en){ctx.font='bold 22px sans-serif';ctx.fillText(p.en,64,107,113);}
}
export function createSignalLayer(scene,doc){
  const group=new T.Group();scene.add(group);
  const metal=new T.MeshStandardMaterial({color:'#899793',roughness:.65});
  const posts=new T.InstancedMesh(shapes.cylinder,metal,poles.length);
  const brackets=new T.InstancedMesh(shapes.box,metal,poles.length);
  const heads=faceBatch(doc,4,vehicle),people=faceBatch(doc,122,pedestrian,2),signs=faceBatch(doc,names.length,plate);
  group.add(posts,brackets,heads.mesh,people.mesh,signs.mesh);
  for(const m of group.children){m.count=0;m.frustumCulled=false;}
  const transform=new T.Object3D();
  function set(mesh,index,x,y,z,w,h,d,yaw){
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.set(0,yaw,0);
    transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);
  }
  let lastX=Infinity,lastZ=Infinity,lastTick=-1,lastHour=-1,visible=[];
  return (x,z,clock,hour)=>{
    const moved=Math.hypot(x-lastX,z-lastZ)>7;
    if(moved){
      lastX=x;lastZ=z;visible=poles.filter(p=>Math.abs(x-p.x)<155&&Math.abs(z-p.y)<155);
      for(const [i,p] of visible.entries()){
        const yaw=Math.atan2(p.dx,p.dy),ax=-p.dy,az=p.dx;
        set(posts,i,p.x,2.7,p.y,.17,5.4,.17,0);
        set(brackets,i,p.x+ax*1.55,5.31,p.y+az*1.55,3.25,.12,.14,yaw);
        set(heads.mesh,i,p.x+ax*2.7+p.dx*.12,5.00,p.y+az*2.7+p.dy*.12,1.66,.51,1,yaw);
        set(people.mesh,2*i,p.x+p.dx*.36,2.65,p.y+p.dy*.36,.68,.69,1,yaw);
        set(people.mesh,2*i+1,p.x+ax*.36,2.65,p.y+az*.36,.68,.69,1,yaw-Math.PI/2);
        set(signs.mesh,i,p.x+ax*1.0+p.dx*.10,4.51,p.y+az*1.0+p.dy*.10,1.9,.53,1,yaw);
        signs.tile.setX(i,nameTile.get(p.name));
      }
      for(const mesh of group.children){mesh.count=visible.length;mesh.instanceMatrix.needsUpdate=true;}
      people.mesh.count=2*visible.length;
      signs.tile.needsUpdate=true;
    }
    const tick=Math.floor(clock*2);
    if(!moved&&tick===lastTick&&hour===lastHour)return;
    lastTick=tick;lastHour=hour;
    for(const [i,p] of visible.entries()){
      const s=signalState(p.junction,clock,hour),light=s[p.group?'a':'b'];
      heads.tile.setX(i,s.flashing?(tick%2?3:1):{red:0,yellow:1,green:2}[light]);
      const greenTile=2+2*s.countdown+(s.countdown<=10?tick%2:0);
      for(const [k,along] of [[0,p.group],[1,!p.group]]){
        people.tile.setX(2*i+k,s.flashing?1:s[along?'a':'b']==='green'?greenTile:0);
      }
    }
    heads.tile.needsUpdate=people.tile.needsUpdate=true;
  };
}
