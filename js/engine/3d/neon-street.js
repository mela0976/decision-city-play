// Projecting blades, enamel fascias and illustrated lightboxes share one printed atlas.
import * as T from '../vendor/three.module.min.js?v=1448599f';
import {createSignLayout,mallFaces} from './sign-layout.mjs?v=1448599f';
import {shapes,TextureLoader} from './city-primitives.js?v=1448599f';

const tradeLights=['#ffa259','#ffe8ca','#91b4ff','#ffd56e','#ff9d87','#dce7ff','#92d8be','#9abaff'];
const boutiqueLights=['#ff8a85','#7fd9cd','#ffad6c','#b8a5ec','#ff8e9b','#aad493','#edbf77','#82ccd9'];

function signMaterial(){
  const material=new T.MeshBasicMaterial();
  material.userData.phase={value:0};
  material.onBeforeCompile=shader=>{
    // Every case samples the entire printed plate, including the previously scrolling name.
    shader.vertexShader='attribute float plate; varying vec2 vTile; varying float vFace; varying float vLed;\n'+
      shader.vertexShader.replace('#include <uv_vertex>', `
        #include <uv_vertex>
        vTile=vec2(mod(plate,8.0),5.0-floor(plate/8.0));
        vLed=(plate>=16.0 && plate<27.0 && mod(plate,3.0)<.5)?1.0:0.0;
        vFace=abs(normal.z);`);
    shader.uniforms.neonPhase=material.userData.phase;
    shader.fragmentShader='uniform float neonPhase; varying vec2 vTile; varying float vFace; varying float vLed;\n'+
      shader.fragmentShader.replace('#include <map_fragment>',`
        #ifdef USE_MAP
          // Move a mild LED highlight over the printed name without moving or wrapping its letters.
          if(vLed>.5 && vMapUv.y>.32 && vMapUv.y<.95)
            diffuseColor.rgb *= 1.0+.09*cos(6.283*(vMapUv.x-neonPhase));
          vec2 cellUv=(vec2(.5)+vMapUv*255.0)/256.0;
          diffuseColor.rgb *= vFace<.5 ? vec3(.054,.061,.071)
            : texture2D(map,(vTile+cellUv)/vec2(8.0,6.0)).rgb;
        #endif`);
  };
  return material;
}

export function createNeonStreet({group,scene,groupOf,available,anisotropy,nightEnabled,instance}){
  let layout=createSignLayout();
  const buckets=new Map(),sources=new Map();
  const material=signMaterial();
  const light=new T.PointLight('#ffd5ae',0,21,2);
  // The nearest fixture lights glossy moving vehicles using their existing PBR materials.
  if(nightEnabled)group.add(light);
  const cell=22;
  function put(x,y,z,w,h,d,angle,plate){
    const chunk=groupOf(x,z);
    if(!buckets.has(chunk))buckets.set(chunk,[]);
    buckets.get(chunk).push({x,y,z,w,h,d,angle,plate});
  }
  function registerLight(x,y,z,tint){
    if(!nightEnabled)return;
    const key=Math.floor(x/cell)+','+Math.floor(z/cell);
    if(!sources.has(key))sources.set(key,[]);
    sources.get(key).push({x,y,z,tint});
  }
  // Reuse one draw call across visible chunks, including old streets outside the original districts.
  // Matrices and atlas indices are copied only when the active set of 100 m chunks changes.
  let mesh,active=[];
  const tiles=[];
  function attach(){
    const obj=new T.Object3D();
    for(const [chunk,items] of buckets){
      const matrices=new Float32Array(items.length*16),plates=new Float32Array(items.length);
      items.forEach(({x,y,z,w,h,d,angle,plate},i)=>{
        obj.position.set(x,y,z);obj.scale.set(w,h,d);obj.rotation.set(0,angle,0);
        obj.updateMatrix();obj.matrix.toArray(matrices,i*16);plates[i]=plate;
      });
      tiles.push({x:chunk.x,z:chunk.z,matrices,plates});
    }
    buckets.clear();
    const geometry=shapes.box.clone();
    // The largest active circle spans at most five by five chunks.
    const capacity=tiles.map(t=>t.plates.length).sort((a,b)=>b-a).slice(0,25).reduce((a,b)=>a+b,0);
    geometry.setAttribute('plate',new T.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(T.DynamicDrawUsage));
    mesh=new T.InstancedMesh(geometry,material,capacity);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.count=0;mesh.frustumCulled=false;mesh.name='Storefront signs';
    scene.add(mesh);
  }
  let lastViewX,lastViewZ,lastRadius;
  function visibleSigns(x,z,radius){
    if(!mesh)return;
    if(x===lastViewX&&z===lastViewZ&&radius===lastRadius)return;
    lastViewX=x;lastViewZ=z;lastRadius=radius;
    const visible=tiles.filter(t=>(t.x-x)**2+(t.z-z)**2<radius*radius);
    if(visible.length===active.length&&visible.every((tile,i)=>tile===active[i]))return;
    const plate=mesh.geometry.getAttribute('plate');
    let count=0;
    for(const tile of visible){
      mesh.instanceMatrix.array.set(tile.matrices,count*16);
      plate.array.set(tile.plates,count);
      count+=tile.plates.length;
    }
    mesh.count=count;
    if(count){
      mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,count*16);
      plate.clearUpdateRanges();plate.addUpdateRange(0,count);
      mesh.instanceMatrix.needsUpdate=plate.needsUpdate=true;
    }
    active=visible;
  }
  function finish(){
    for(const face of mallFaces())layout.frontage(face);
    for(const p of layout.arrange()){
      put(p.x,p.y,p.z,p.w,p.h,p.d,p.angle,p.plate);
      for(const f of p.frame??[]){
        instance('metal','box','#53555b',f.x,f.y,f.z,f.w,f.h,f.d,f.angle);
      }
      if(p.style==='primary'){
        const palette=p.plate%16<11?tradeLights:boutiqueLights;
        registerLight(p.x+p.shop.nx*1.8,p.y-.48,p.z+p.shop.nz*1.8,palette[p.plate%8]);
      }
    }
    layout=null; // Geometry queries and the shop ledger are construction-only.
    available.then(async images=>{
      const asset=images?.['neon-shop-atlas'];
      if(!asset)return;
      const texture=await new TextureLoader().loadAsync(new URL('../../../'+asset.src,import.meta.url).href);
      texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,anisotropy);
      material.map=texture;material.needsUpdate=true;
      attach();
    }).catch(()=>{}); // Existing storefront artwork remains available offline.
  }
  let lastX,lastZ,near,nearDistance;
  function update(x,z,lamps,radius,clock){
    material.userData.phase.value=lamps>.1?clock*.092:0;
    visibleSigns(x,z,radius);
    material.color.setScalar(.88+lamps*.78);

    light.intensity=0;
    if(!nightEnabled||lamps<.03||!material.map)return;
    // A stationary camera retains the same fixture; time still changes its intensity each frame.
    if(x!==lastX||z!==lastZ){
      lastX=x;lastZ=z;near=undefined;nearDistance=cell*cell;
      const ix=Math.floor(x/cell),iz=Math.floor(z/cell);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
        for(const s of sources.get((ix+a)+','+(iz+b))??[]){
          const d=(s.x-x)**2+(s.z-z)**2;
          if(d<nearDistance){nearDistance=d;near=s;}
        }
      }
      if(near){light.position.set(near.x,near.y,near.z);light.color.set(near.tint);}
    }
    if(near)light.intensity=lamps*80*(1-nearDistance/(cell*cell));
  }
  return {frontage:face=>layout.frontage(face),obstacle:(...args)=>layout?.obstacle(...args),finish,update};
}
