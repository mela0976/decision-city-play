import * as T from '../vendor/three.module.min.js';
import {canvasTexture,shapes} from './city-primitives.js';
const {plane}=shapes;

export const windowKinds=['old','oldB','oldC','new','towerB','towerC','office'];
export function createNight({doc,group,enabled}) {
  const glow=canvasTexture(doc,64,64,ctx=>{
    const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'#fff');g.addColorStop(1,'#ffffff00');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  });
  const lampHalos=[],lampDecals=[];
  const decalMaterial=new T.MeshBasicMaterial({map:glow,color:'#ffb866',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0});
  function lampGlow(x,y,z){
    if(!enabled)return;
    const sprite=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffd797',transparent:true,depthWrite:false,
      blending:T.AdditiveBlending,opacity:0}));
    sprite.position.set(x,y,z);sprite.scale.set(2.8,2.8,1);
    group.add(sprite);lampHalos.push(sprite);
    const pool=new T.Mesh(plane,decalMaterial);
    pool.rotation.x=-Math.PI/2;pool.position.set(x,.09,z);pool.scale.set(9,9,1);pool.visible=false;
    group.add(pool);lampDecals.push(pool);
  }
  return {glow,lampGlow,lampHalos,lampDecals,decalMaterial};
}

export function updateNight({materials,lampHalos,lampDecals,decalMaterial,signCache,adMaterials},x,z,night,rain,clock,lamps) {
  materials.towerLights.color.setScalar(.12+night*3.4);
  materials.luminous.color.setScalar(.22+lamps*2.1);
  for(const kind of [...'abcdefghijkl'].map(letter=>'shop'+letter).concat('mall'))materials[kind].emissiveIntensity=lamps*1.62;
  materials.signalRed.color.setScalar(clock%24<12?1.65:.12);
  materials.signalGreen.color.setScalar(clock%24<12?.12:1.65);
  materials.window.color.setScalar(.13+night*1.1);
  materials.reflection.opacity=lamps*(rain?.52:.19);
  for(const sprite of lampHalos){
    sprite.visible=lamps>.06&&Math.hypot(sprite.position.x-x,sprite.position.z-z)<95;
    sprite.material.opacity=lamps*(rain?.52:.42);
  }
  decalMaterial.opacity=lamps*(rain?.62:.3);
  for(const pool of lampDecals)pool.visible=lamps>.06&&Math.hypot(pool.position.x-x,pool.position.z-z)<95;
  for(const kind of windowKinds)if(materials[kind].emissiveMap)materials[kind].emissiveIntensity=night*.6;
  for(const material of signCache.values())material.color.setScalar(.9+lamps*1.25);
  for(const mat of adMaterials.values())mat.emissiveIntensity=lamps*1.25;
}
