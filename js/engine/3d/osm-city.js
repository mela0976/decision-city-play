import {createSignalLayer,signalReflections} from './traffic-signals.js'; // A24
import {createNeonStreet} from './neon-street.js'; // A22 street signs
import {surfaceMaps} from './pbr.js';
import * as T from '../vendor/three.module.min.js';
import {canvasTexture,hash,shapes,color} from './city-primitives.js';
import {addGround,addWaterAndParks} from './terrain.js';
import {createRoads} from './roads.js'; // A24 decks are owned by roads
import {createLandmarks,addEntrances} from './landmarks.js';
import {curtainMaterial} from './buildings-tower.js'; // A23 towers
import {addBuildings} from './buildings.js';
import {addInfill,apartmentWindowMask} from './buildings-old.js';
import {createStorefront,addBillboards,addStreetNames,updateSigns} from './storefront.js';
import {placeStreetLife} from './furniture.js';
import {createNight,updateNight,windowKinds} from './night.js';
import {placeGroundVegetation} from './vegetation.js';
import {foliageBatch,landscapeTrunkBatch,populateInstances,vegetationMaterials} from './vegetation-cards.js';
import {metersPerUnit as unit} from '../world.mjs';
const chunkSize=100;

function meshBuffers(material) {
  const v=[],uv=[],rgb=[];
  function triangle(a,b,c,tint,ta=[0,0],tb=[0,1],tc=[1,0]) {
    v.push(...a,...b,...c);uv.push(...ta,...tb,...tc);
    color.set(tint);
    for(let i=0;i<3;i++)rgb.push(color.r,color.g,color.b);
  }
  function quad(a,b,c,d,tint,u=1,w=1,uo=0,vo=0) {
    triangle(a,b,c,tint,[uo,vo],[uo+u,vo],[uo+u,vo+w]);
    triangle(a,c,d,tint,[uo,vo],[uo+u,vo+w],[uo,vo+w]);
  }
  return {triangle,quad,make(){
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(v,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    geometry.computeVertexNormals();
    return new T.Mesh(geometry,material);
  }};
}

export function createOsmCity(scene,doc,anisotropy,has=()=>true) {
  const group=new T.Group();
  const replacements=new T.Group();
  scene.add(group,replacements);
  const lighting=createNight({doc,group,has,enabled:has('night')}); // A23 night
  const {glow}=lighting;
  const {plane}=shapes;
  const textUv={total:0,osm:0,infill:0,other:0,failed:0};
  function textWall(buffer,a,b,c,d,nx,nz,tint,u,v,source='other',uo=0){
    // A23 night: the baked street-facing display shares its source position with the wet asphalt.
    if(buffer.shopKind)lighting.optics?.windowLight(a,b,nx,nz,buffer.shopKind);
    const direction=(b[0]-a[0])*nz-(b[2]-a[2])*nx;
    const face=direction<0?[b,a,d,c]:[a,b,c,d];
    const du=(face[1][0]-face[0][0])*nz-(face[1][2]-face[0][2])*nx;
    textUv.total++;textUv[source]++;
    if(!(du>0&&u>0))textUv.failed++;
    buffer.quad(...face,tint,u,v,uo);
  }
  const materials={}, loadedTextures=[];
  const types={
    road:['#7b7880','tex_asphalt'],paving:['#b6ad9c','tex_sidewalk'],
    old:['#afa093','tex_facade_apartment'],shop:['#a09587','tex_facade_shophouse'],
    new:['#8caaa9','tex_facade_glass'],office:['#a5a49e','tex_facade_office'],
    roof:['#837e76'],water:['#648d97'],curb:['#ada89d'],drain:['#474b4c'],repair:['#777571'],earth:['#82857b'],park:['#809461'],line:['#d4c8b2'],
    concrete:['#fff'],metal:['#fff'],dark:['#fff'],glass:['#fff'],grass:['#fff'],
  };
  const enabled=new URLSearchParams(doc.defaultView.location.search).get('textures')!=='0';
  const variants={
    oldB:['old','tex_facade_apartment_b'],oldC:['old','tex_facade_apartment_c'],
    towerB:['new','tex_facade_tower_b'],towerC:['new','tex_facade_tower_c'],
    roofTop:['roof','tex_roof_top'],mall:['concrete','tex_facade_mall'],temple:['concrete','tex_temple_front'],
    ...Object.fromEntries([...'abcdefghijkl'].map(letter=>['shop'+letter,['shop','tex_shopfront_'+letter]])),
  };
  for(const [variant,[fallback,key]] of Object.entries(variants))types[variant]=[types[fallback][0],key];
  const available=enabled?fetch(new URL('../../../assets/manifest.json',import.meta.url))
    .then(response=>response.ok?response.json():null).then(manifest=>manifest?.images??{}).catch(()=>({})):Promise.resolve({});
  const loader=new T.TextureLoader();
  const adImages=new Map();
  function loadAd(id){
    const key='ad_'+id;
    if(!adImages.has(id))adImages.set(id,available.then(images=>images[key]?
      loader.loadAsync(new URL('../../../assets/tex/'+key+'.webp',import.meta.url).href).then(texture=>{
        texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=anisotropy;
        return texture;
      }).catch(()=>null):null));
    return adImages.get(id);
  }
  function fillMallPanels(texture,mask){
    Promise.all([loadAd(1),loadAd(4)]).then(posters=>{
      if(!posters.some(Boolean))return;
      const image=texture.image,facade=doc.createElement('canvas');
      facade.width=image.width;facade.height=image.height;
      const color=facade.getContext('2d'),light=mask.image.getContext('2d');
      color.drawImage(image,0,0);
      posters.forEach((poster,i)=>{
        if(!poster)return;
        const u=i===0?.088:.555,v=.350,w=.357,h=.215;
        const photo=poster.image,ratio=w*facade.width/(h*facade.height);
        const sw=Math.min(photo.width,photo.height*ratio),sh=Math.min(photo.height,photo.width/ratio);
        color.drawImage(photo,(photo.width-sw)/2,(photo.height-sh)/2,sw,sh,
          u*facade.width,v*facade.height,w*facade.width,h*facade.height);
        light.fillStyle='#bcbcbc';
        light.fillRect(u*mask.image.width,v*mask.image.height,w*mask.image.width,h*mask.image.height);
      });
      texture.image=facade;texture.needsUpdate=true;mask.needsUpdate=true;
    });
  }
  function loadMaterial(kind,tex,material,variant=false){
    loader.load(new URL('../../../assets/tex/'+tex+'.webp',import.meta.url).href,texture=>{
      texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.anisotropy=anisotropy;
      material.map=texture;
      if(/^shop[a-l]$/.test(kind)||kind==='mall'){
        const mask=canvasTexture(doc,256,128,(ctx,w,h)=>{
          ctx.drawImage(texture.image,0,0,w,h);
          const data=ctx.getImageData(0,0,w,h);
          for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const k=(y*w+x)*4,r=data.data[k],g=data.data[k+1],b=data.data[k+2];
            const light=Math.max(0,Math.min(1,((r*.28+g*.58+b*.14)-75)/123));
            const gate=y>=h*.38?1:.14;
            const value=Math.round(255*light*light*gate);
            data.data[k]=value;data.data[k+1]=value;data.data[k+2]=value;
          }
          ctx.putImageData(data,0,0);
        });
        mask.wrapS=T.RepeatWrapping;
        material.emissiveMap=mask;
        if(kind==='mall')fillMallPanels(texture,mask);
        material.emissive.set('#ffcb83');material.emissiveIntensity=0;
      }
      if(windowKinds.includes(kind)){
        // Old residential atlases use grouped household glazing, while other atlases retain their own lighting.
        const mask=apartmentWindowMask(doc,kind)??canvasTexture(doc,256,256,(ctx,w,h)=>{
          ctx.drawImage(texture.image,0,0,w,h);
          const data=ctx.getImageData(0,0,w,h),lum=new Float32Array(w*h);
          let mean=0;
          for(let i=0;i<w*h;i++){lum[i]=data.data[i*4]*.28+data.data[i*4+1]*.58+data.data[i*4+2]*.14;mean+=lum[i];}
          mean/=w*h;
          for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const k=(y*w+x)*4,cell=hash(Math.floor(x/8),Math.floor(y/8)+kind.length*31);
            const on=lum[y*w+x]<mean*.78&&cell<.32;
            const warm=hash(Math.floor(x/8)+3,Math.floor(y/8))<.7;
            data.data[k]=on?(warm?255:205):0;data.data[k+1]=on?(warm?214:228):0;data.data[k+2]=on?(warm?150:255):0;
          }
          ctx.putImageData(data,0,0);
        });
        mask.wrapS=mask.wrapT=T.RepeatWrapping;
        material.emissiveMap=mask;material.emissive.set('#fff');material.emissiveIntensity=0;
      }
      try{Object.assign(material,surfaceMaps(doc,texture.image,anisotropy,['new','office','towerB','towerC'].includes(kind)?.42:1.6));}catch{}
      if(['new','office','towerB','towerC'].includes(kind)){material.metalness=.32;material.roughness=.47;}
      material.color.set(kind==='road'?'#b3a8a0':kind==='paving'?'#d1c7b7':'#fff');
      material.userData.authored=variant;
      material.visible=true;
      material.needsUpdate=true;
      loadedTextures.push(tex);
      if(!variant)for(const [alias,[fallback]] of Object.entries(variants)){
        if(fallback!==kind||materials[alias].userData.authored||/^shop[a-l]$/.test(alias))continue;
        for(const name of ['map','normalMap','roughnessMap','emissiveMap'])materials[alias][name]=material[name];
        if(material.emissiveMap){materials[alias].emissive.set('#fff');materials[alias].emissiveIntensity=0;}
        materials[alias].color.copy(material.color);materials[alias].needsUpdate=true;
      }
    },undefined,()=>{});
  }
  for(const [kind,[tint,tex]] of Object.entries(types)){
    const material=new T.MeshStandardMaterial({color:tint,roughness:.86,side:T.DoubleSide,vertexColors:true});
    if(kind==='glass'){material.metalness=.51;material.roughness=.28;}
    if(/^shop[a-l]$/.test(kind)||kind==='temple')material.visible=false;
    materials[kind]=material;
    if(!tex||!enabled)continue;
    if(variants[kind])available.then(images=>{if(images[tex])loadMaterial(kind,tex,material,true);});
    else loadMaterial(kind,tex,material);
  }
  for(const kind of ['luminous','signal','signalRed','signalGreen','towerLights','window','highglass']) {
    materials[kind]=kind==='highglass'?new T.MeshStandardMaterial({roughness:.42,fog:false}):new T.MeshBasicMaterial({fog:kind!=='towerLights'});
  }
  // A23 towers: OSM meshes carry vertex tints, landmark batches carry instance tints.
  materials.curtain=curtainMaterial(doc,anisotropy,enabled);
  materials.landmarkCurtain=materials.curtain.clone();
  materials.landmarkCurtain.vertexColors=false;
  materials.landmarkCurtain.onBeforeCompile=materials.curtain.onBeforeCompile;
  materials.lobbyTrim=materials.concrete;
  materials.lobbyLight=new T.MeshBasicMaterial();
  materials.lobbyGlass=new T.MeshStandardMaterial({metalness:.2,roughness:.16,transparent:true,opacity:.40,depthWrite:false});
  materials.reflection=new T.MeshBasicMaterial({map:glow,transparent:true,depthWrite:false,opacity:0,blending:T.AdditiveBlending});
  const foliageMaterials=has('vegetation')?vegetationMaterials(doc,available,anisotropy):null;
  const updateSignals=has('furniture')?createSignalLayer(scene,doc):null; // A24
  const chunks=new Map(),signs=[],instanceMaterials=new Map();
  const shadowMaterials=new Set(['old','shop','new','office','roof','curtain']);
  const groupOf=(x,z)=>{
    const ix=Math.floor(x/chunkSize),iz=Math.floor(z/chunkSize),key=ix+','+iz;
    if(!chunks.has(key))chunks.set(key,{x:(ix+.5)*chunkSize,z:(iz+.5)*chunkSize,meshes:new Map(),instances:new Map(),roofMeshes:new Map(),storeMeshes:new Map(),shadowMeshes:[],group:new T.Group(),detail:new T.Group(),storeDetail:new T.Group(),vegetation:new T.Group()});
    return chunks.get(key);
  };
  function bufferFor(meshes,kind){
    if(!meshes.has(kind)){
      const buffer=meshBuffers(materials[kind]);
      if(/^shop[a-l]$/.test(kind))buffer.shopKind=kind; // A23 night
      meshes.set(kind,buffer);
    }
    return meshes.get(kind);
  }
  const batch=(x,z,kind)=>bufferFor(groupOf(x,z).meshes,kind);
  let neon; // A24c Reserve the actual facade fixtures before packing sign slots.
  function instance(kind,shape,tint,x,y,z,w,h,d,turn=0,rx=0,rz=0,atlasSlot) {
    const c=groupOf(x,z),key=kind+'/'+shape;
    if(!c.instances.has(key))c.instances.set(key,[]);
    c.instances.get(key).push([tint,x,y,z,w,h,d,turn,rx,rz,atlasSlot]);
  }
  const emptyBatch={quad(){},triangle(){}};
  const batchFor=module=>has(module)?batch:()=>emptyBatch;
  const instanceFor=module=>has(module)?instance:()=>{};
  const signLayer=createStorefront({doc,anisotropy,group,signs,loadAd,nightEnabled:false}); // A23 night: fixture footprints replace mirrored lettering.
  const {loadedAds,storefrontAt}=signLayer;
  const signFor=module=>(...args)=>signLayer.sign(has(module),...args);
  const sign=signFor('storefront');
  const roadBatch=batchFor('roads'),furnitureInstance=instanceFor('furniture');
  const terrainBatch=batchFor('terrain'),treeInstance=instanceFor('vegetation');
  // A24c Register actual building fixtures in the same coordinates used for rendering.
  const fixtureFor=module=>has(module)?(...args)=>{neon?.obstacle(...args);instance(...args);}:()=>{};
  const storeBatch=batchFor('storefront'),storeInstance=fixtureFor('storefront');
  const towerBatch=batchFor('buildings-tower'),oldBatch=batchFor('buildings-old');
  const oldRoofDetailBatch=has('buildings-old')?(x,z,kind)=>bufferFor(groupOf(x,z).roofMeshes,kind):()=>emptyBatch;
  const oldStoreDetailBatch=has('storefront')?(x,z,kind)=>bufferFor(groupOf(x,z).storeMeshes,kind):()=>emptyBatch;
  const towerInstance=fixtureFor('buildings-tower'),oldInstance=fixtureFor('buildings-old');
  const nightInstance=instanceFor('night');
  const landmarkBatch=batchFor('landmarks');
  neon=has('storefront')&&enabled?createNeonStreet({group,scene,groupOf,available,anisotropy,instance,nightEnabled:has('night')}):null; // A24c Reuse the metal fixture batch for roof uprights.
  const {updateOfficeDoor,landmark}=createLandmarks({group,replacements,batch:landmarkBatch,materials,textWall,obstacle:neon?.obstacle,enabled:has('landmarks'),towerDetail:has('buildings-tower')?towerInstance:null});
  const localPave=(...args)=>paveFront(roadBatch,...args);
  if(has('terrain'))addGround(group,doc,anisotropy);
  const road=createRoads({
    batch:roadBatch,instance:instanceFor('roads'),furnitureInstance,doc,group,signs,enabled:has('roads'),
  });
  road.build();
  if(has('terrain'))addWaterAndParks(terrainBatch,createRoads({
    batch:terrainBatch,doc,group,signs,enabled:false,
  }).strip);
  // A22 storefront geometry and night lighting share the existing chunk and material pools.

  addBuildings({neon,oldBatch,oldInstance,oldRoofDetailBatch,oldStoreDetailBatch,towerBatch,towerInstance,storeBatch,storeInstance,nightInstance,
    textWall,storefrontAt,sign,materials,landmark});
  addInfill({neon, // A22 street-facing infill
    oldInstance, // A23 alleys: covered frontage belongs to the old-building module.
    batch:oldBatch,oldRoofDetailBatch,oldStoreDetailBatch,towerBatch,terrainBatch,storeBatch,storeInstance,roadBatch,furnitureInstance,treeInstance,
    textWall,paveFront:localPave});
  const collisionProps=[],parkedScooters=[];
  placeStreetLife({instance:furnitureInstance,paint:road.strip,roadMark:road.addRoadMark,sign:signFor('furniture'),treeInstance,nightInstance,
    lampGlow:has('furniture')?lighting.lampGlow:undefined,vendorLight:has('furniture')?lighting.optics?.vendorLight:undefined, // A23 night
    obstacle:(x,z,r,top)=>collisionProps.push({x:x/unit,y:z/unit,r:r/unit,top}),
    parked:(x,z,heading)=>{
      if(has('furniture'))parkedScooters.push({x,z,heading});
      return true;
    },
  });
  if(has('vegetation'))placeGroundVegetation(treeInstance); // A19 vegetation hook
  addEntrances({instance:fixtureFor('landmarks'),sign,batch:landmarkBatch,textWall,foliage:has('vegetation')}); // A23 landmarks2: reuse leaf atlas on the old banyan.
  neon?.finish(); // A24c All awnings and storefront fixtures are available now.
  for(const c of chunks.values()){
    for(const [key,items] of c.instances){
      const [kind,shape]=key.split('/');
      if(shape==='vegetationCards'){
        c.foliage=foliageBatch(items,foliageMaterials);
        c.vegetation.add(c.foliage);
        continue;
      }
      if(!instanceMaterials.has(kind)){
        const material=materials[kind];
        if(material.vertexColors){
          const copy=material.clone();
          copy.vertexColors=false;
          instanceMaterials.set(kind,copy);
        }else instanceMaterials.set(kind,material);
      }
      const material=instanceMaterials.get(kind);
      if(shape==='vegetationTrunk'){
        c.vegetation.add(landscapeTrunkBatch(items,material));
        c.primaryVegetation=true;
        continue;
      }
      const mesh=new T.InstancedMesh(shapes[shape],material,items.length);
      populateInstances(mesh,items);
      mesh.receiveShadow=kind!=='reflection';
      c.detail.add(mesh);
    }
    for(const [buffers,target] of [[c.roofMeshes,c.detail],[c.storeMeshes,c.storeDetail]]){
      for(const buffer of buffers.values()){
        const mesh=buffer.make();
        mesh.receiveShadow=true;
        target.add(mesh);
      }
      buffers.clear();
    }
    c.group.add(c.detail,c.storeDetail,c.vegetation);
    c.instances.clear();
    for(const [kind,batch] of c.meshes){
      const mesh=batch.make();
      mesh.receiveShadow=true;
      if(shadowMaterials.has(kind))c.shadowMeshes.push(mesh);
      c.group.add(mesh);
    }
    group.add(c.group);
    c.meshes.clear();
  }
  if(has('storefront'))addBillboards(signLayer.billboard);
  if(has('roads'))addStreetNames(signFor('roads'));
  const cityChunks=[...chunks.values()];
  const lightState={...lighting,...signLayer,materials,signalFaces:has('furniture')?signalReflections:[],signs}; // A24 share lamps with A23 night
  return {
    group,replacements,updateOfficeDoor,collisionProps,parkedScooters,glow,loadedTextures,loadedAds,textUv,
    update(x,z,night,rain,quality,clock,lamps=night,aerial=false,hour){
      materials.road.roughness=rain?.19:.94;
      materials.road.metalness=rain?.27:0;
      updateNight(lightState,x,z,has('night')?night:0,rain,clock,has('night')?lamps:0,hour); // A23 night
      materials.curtain.emissiveIntensity=materials.landmarkCurtain.emissiveIntensity=has('night')?night*.65:0; // A23 towers
      const radius=aerial?535:quality===2?340:265;
      const detailRadius=quality===2?117:88;
      const storeRadius=quality===2?186:145;
      neon?.update(x,z,has('night')?lamps:0,aerial?0:storeRadius,clock); // A24c Also visible over live tiles.
      const leafRadius=quality===2?97:76;
      const corridorRadius=quality===2?230:154;
      for(const chunk of cityChunks){
        const dx=x-chunk.x,dz=z-chunk.z,d2=dx*dx+dz*dz;
        chunk.group.visible=d2<radius*radius;
        chunk.detail.visible=!aerial&&d2<detailRadius*detailRadius;
        const vegetationRadius=chunk.primaryVegetation?corridorRadius:detailRadius;
        chunk.vegetation.visible=!aerial&&d2<vegetationRadius*vegetationRadius;
        if(chunk.vegetation.visible)chunk.foliage?.userData.setLod(d2>=leafRadius*leafRadius);
        chunk.storeDetail.visible=!aerial&&d2<storeRadius*storeRadius;
        const shadow=d2<77*77;
        if(shadow!==chunk.shadow){
          for(const mesh of chunk.shadowMeshes)mesh.castShadow=shadow;
          chunk.shadow=shadow;
        }
      }
      updateSignals?.(x,z,clock,hour); // A24
      updateSigns(signs,x,z,rain,has('night')?night:0);
    },
  };
}
