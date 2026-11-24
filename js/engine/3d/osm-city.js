import {createSignalLayer,signalReflections} from './traffic-signals.js?v=e5a00467'; // A24
import {createNeonStreet} from './neon-street.js?v=e5a00467'; // A22 street signs
import {surfaceMaps} from './pbr.js?v=e5a00467';
import * as T from '../vendor/three.module.min.js?v=e5a00467';
import {canvasTexture,hash,shapes,color,TextureLoader,mobileTextures} from './city-primitives.js?v=e5a00467';
import {addGround,addWaterAndParks} from './terrain.js?v=e5a00467';
import {createRoads} from './roads.js?v=e5a00467'; // A24 decks are owned by roads
import {createLandmarks,addEntrances} from './landmarks.js?v=e5a00467';
import {curtainMaterial} from './buildings-tower.js?v=e5a00467'; // A23 towers
import {addBuildings} from './buildings.js?v=e5a00467';
import {addInfill,apartmentWindowMask} from './buildings-old.js?v=e5a00467';
import {createStorefront,addBillboards,addStreetNames,updateSigns} from './storefront.js?v=e5a00467';
import {placeStreetLife} from './furniture.js?v=e5a00467';
import {createNight,updateNight,windowKinds} from './night.js?v=e5a00467';
import {placeGroundVegetation} from './vegetation.js?v=e5a00467';
import {foliageBatch,landscapeTrunkBatch,populateInstances,vegetationMaterials} from './vegetation-cards.js?v=e5a00467';
import {metersPerUnit as unit} from '../world.mjs?v=e5a00467';
import {later,preload} from './idle-work.js?v=e5a00467'; // P2 perf
import {paving,fillets} from '../sidewalks.mjs?v=e5a00467';
import {drawSidewalks} from './sidewalks.js?v=e5a00467';
const chunkSize=100;

// P1 perf: tint strings parse once (same values Color.set produces); pushes without spreading.
const tintCache=new Map();
// P2 perf：buffer 可以分段。reserve() 在目前位置插入一段空白，之後再由 writer(slot) 補上內容；
// make() 依段落順序串起來，所以補寫的三角形落在原本會在的位置，頂點順序與一次寫完完全相同。
// 頂點資料直接寫進會自動加大的 Float32Array（原本先放 JS 陣列、make() 時才轉 Float32，數值相同，少一次複製與大量暫存）
const empty=new Float32Array(0);
const part=()=>({v:empty,uv:empty,rgb:empty,n:0});
function grow(p){
  const vertices=Math.max(24,p.n*2);
  const v=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),rgb=new Float32Array(vertices*3);
  v.set(p.v);uv.set(p.uv);rgb.set(p.rgb);
  p.v=v;p.uv=uv;p.rgb=rgb;
}
function emit(p,a,b,c,tint,ta,tb,tc){
  if((p.n+3)*3>p.v.length)grow(p);
  const n=p.n,v=p.v,uv=p.uv,rgb=p.rgb;
  let i=n*3;
  v[i]=a[0];v[i+1]=a[1];v[i+2]=a[2];v[i+3]=b[0];v[i+4]=b[1];v[i+5]=b[2];v[i+6]=c[0];v[i+7]=c[1];v[i+8]=c[2];
  const j=n*2;
  uv[j]=ta[0];uv[j+1]=ta[1];uv[j+2]=tb[0];uv[j+3]=tb[1];uv[j+4]=tc[0];uv[j+5]=tc[1];
  let cached=typeof tint==='string'?tintCache.get(tint):null;
  if(cached){color.r=cached[0];color.g=cached[1];color.b=cached[2];}
  else{color.set(tint);if(typeof tint==='string')tintCache.set(tint,[color.r,color.g,color.b]);}
  const cr=color.r,cg=color.g,cb=color.b;
  rgb[i]=cr;rgb[i+1]=cg;rgb[i+2]=cb;rgb[i+3]=cr;rgb[i+4]=cg;rgb[i+5]=cb;rgb[i+6]=cr;rgb[i+7]=cg;rgb[i+8]=cb;
  p.n=n+3;
}
const corner0=[0,0],corner1=[0,1],corner2=[1,0];
function writerFor(part){
  function triangle(a,b,c,tint,ta=corner0,tb=corner1,tc=corner2){emit(part,a,b,c,tint,ta,tb,tc);}
  function quad(a,b,c,d,tint,u=1,w=1,uo=0,vo=0) {
    triangle(a,b,c,tint,[uo,vo],[uo+u,vo],[uo+u,vo+w]);
    triangle(a,c,d,tint,[uo,vo],[uo+u,vo+w],[uo,vo+w]);
  }
  return {triangle,quad};
}
const joined=(parts,key,size)=>{
  let n=0;for(const p of parts)n+=p.n*size;
  const out=new Float32Array(n);
  let at=0;for(const p of parts){out.set(p[key].subarray(0,p.n*size),at);at+=p.n*size;}
  return out;
};
function meshBuffers(material) {
  let current=part();
  const parts=[current];
  const writer=writerFor(current);
  return {
    // 直接寫進目前這一段（與原本的 triangle/quad 相同）；reserve() 之後換成寫進新的一段
    triangle:writer.triangle,
    quad:writer.quad,
    reserve(){
      const slot=part(),next=part();
      parts.push(slot,next);
      current=next;
      const w=writerFor(next);
      this.triangle=w.triangle;this.quad=w.quad;
      return slot;
    },
    writer:writerFor,
    make(){
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.BufferAttribute(joined(parts,'v',3),3));
      geometry.setAttribute('uv',new T.BufferAttribute(joined(parts,'uv',2),2));
      geometry.setAttribute('color',new T.BufferAttribute(joined(parts,'rgb',3),3));
      geometry.computeVertexNormals();
      return new T.Mesh(geometry,material);
    },
  };
}

export function createOsmCity(scene,doc,anisotropy,has=()=>true,deferDerived=false) {
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
  const loader=new TextureLoader();
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
      if(deferDerived){
        // P2 perf：貼圖一到先掛上底色貼圖就能看；遮罩、法線與粗糙度圖（每張要算幾十萬個像素）
        // 連同原本整段設定，依到達順序排進 later()，玩家開始騎乘後在背景照原順序執行，最後的材質狀態與原本相同。
        texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
        texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.anisotropy=anisotropy;
        material.map=texture;
        if(['new','office','towerB','towerC'].includes(kind)){material.metalness=.32;material.roughness=.47;}
        material.color.set(kind==='road'?'#b3a8a0':kind==='paving'?'#d1c7b7':'#fff');
        material.visible=true;material.needsUpdate=true;
        preload(texture);
        later(()=>applyTexture(kind,tex,material,variant,texture));
      }else applyTexture(kind,tex,material,variant,texture);
    },undefined,()=>{});
  }
  function applyTexture(kind,tex,material,variant,texture){
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
      // 手機（觸控螢幕）不產生法線與粗糙度貼圖：小螢幕看不出差別，省掉開局約 30 秒、每 5 秒約 40 MB 的貼圖運算卡頓
      if(!mobileTextures)try{Object.assign(material,surfaceMaps(doc,texture.image,anisotropy,['new','office','towerB','towerC'].includes(kind)?.42:1.6));}catch{}
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
  // P2 perf：一般遊戲（deferDerived）時人行道幾何（全城約 97 萬個三角形呼叫）不在開機時算：
  // 先在每個區塊會收到人行道的 buffer 裡保留位置（呼叫 batch 的順序與 drawSidewalks 一樣），
  // 區塊第一次要被看到、或背景有空時，才只算那個區塊的鋪面與圓角，寫回保留的位置。
  const deferChunks=deferDerived;
  const sidewalkSlots=new Map(),sidewalkWork=new Map();
  const reserveSidewalks=b=>{
    const touch=(x,z,kind)=>{
      const buffer=b(x,z,kind);
      if(buffer.reserve&&!sidewalkSlots.has(buffer))sidewalkSlots.set(buffer,buffer.writer(buffer.reserve()));
    };
    const work=(x,z)=>{
      const c=groupOf(x,z);
      if(!sidewalkWork.has(c))sidewalkWork.set(c,{paving:[],fillets:[]});
      return sidewalkWork.get(c);
    };
    for(const s of paving){touch(s.x,s.z,'paving');if(s.kind!=='ramp')touch(s.x,s.z,'curb');work(s.x,s.z).paving.push(s);}
    for(const f of fillets){if(!f.cut.length)continue;touch(f.x,f.z,'road');touch(f.x,f.z,'curb');work(f.x,f.z).fillets.push(f);}
  };
  const road=createRoads({
    batch:roadBatch,instance:instanceFor('roads'),furnitureInstance,doc,group,signs,enabled:has('roads'),
    ...(deferChunks?{sidewalks:reserveSidewalks}:{}),
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
  // P2 perf：區塊的 mesh 改成 finishChunk() 逐一建立。材質副本先依原本的遇到順序建好（副本必須是貼圖載入前的狀態），
  // 區塊的 group 也照原順序先掛上場景；一般遊戲時區塊內容等到第一次在可見範圍內、或背景有空才建。
  for(const c of chunks.values())for(const key of c.instances.keys()){
    const [kind,shape]=key.split('/');
    if(shape==='vegetationCards'||instanceMaterials.has(kind))continue;
    const material=materials[kind];
    if(material.vertexColors){
      const copy=material.clone();
      copy.vertexColors=false;
      instanceMaterials.set(kind,copy);
    }else instanceMaterials.set(kind,material);
  }
  function finishChunk(c){
    if(c.built)return;
    c.built=true;
    const work=sidewalkWork.get(c);
    if(work)drawSidewalks((x,z,kind)=>sidewalkSlots.get(bufferFor(groupOf(x,z).meshes,kind)),work.paving,work.fillets);
    sidewalkWork.delete(c);
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
    c.meshes.clear();
    c.shadow=undefined; // 讓下一次 update 依距離設定陰影
  }
  // 只還區塊自己的 GPU 緩衝；共用的基本形狀（shapes）留著，不然每個區塊進出都要重傳
  const sharedShapes=new Set(Object.values(shapes));
  function releaseChunk(c){
    c.group.traverse(o=>{
      if(o.isInstancedMesh)o.dispose(); // 只放掉 instanceMatrix 等每個 mesh 自己的緩衝
      if(o.geometry&&!sharedShapes.has(o.geometry))o.geometry.dispose();
    });
  }
  const pendingChunks=new Set();
  for(const c of chunks.values()){
    group.add(c.group);
    if(deferChunks)pendingChunks.add(c);
    else finishChunk(c);
  }
  let focusX=0,focusZ=0;
  function finishNearest(){
    let best=null,bestD=Infinity;
    for(const c of pendingChunks){const d=(c.x-focusX)**2+(c.z-focusZ)**2;if(d<bestD){bestD=d;best=c;}}
    if(!best)return;
    pendingChunks.delete(best);
    finishChunk(best);
    if(pendingChunks.size)later(finishNearest);
  }
  // 遠處的區塊等玩家上街後才在背景一個一個建（離目前位置近的先建）
  if(pendingChunks.size)later(finishNearest);
  if(has('storefront'))addBillboards(signLayer.billboard);
  if(has('roads'))addStreetNames(signFor('roads'));
  const cityChunks=[...chunks.values()];
  const lightState={...lighting,...signLayer,materials,signalFaces:has('furniture')?signalReflections:[],signs}; // A24 share lamps with A23 night
  return {
    finishAll(){for(const c of pendingChunks)finishChunk(c);pendingChunks.clear();}, // P2 perf：測試與工具用，立刻建完全部區塊
    group,replacements,updateOfficeDoor,collisionProps,parkedScooters,glow,loadedTextures,loadedAds,textUv,
    update(x,z,night,rain,quality,clock,lamps=night,aerial=false,hour,nearRadius){
      materials.road.roughness=rain?.19:.94;
      materials.road.metalness=rain?.27:0;
      updateNight(lightState,x,z,has('night')?night:0,rain,clock,has('night')?lamps:0,hour); // A23 night
      materials.curtain.emissiveIntensity=materials.landmarkCurtain.emissiveIntensity=has('night')?night*.65:0; // A23 towers
      const radius=nearRadius??(aerial?535:quality===2?340:265);
      const detailRadius=quality===2?117:88;
      const storeRadius=quality===2?186:145;
      neon?.update(x,z,has('night')?lamps:0,aerial?0:storeRadius,clock); // A24c Also visible over live tiles.
      const leafRadius=quality===2?97:76;
      const corridorRadius=quality===2?230:154;
      focusX=x;focusZ=z;
      for(const chunk of cityChunks){
        const dx=x-chunk.x,dz=z-chunk.z,d2=dx*dx+dz*dz;
        if(!chunk.built&&d2<radius*radius){pendingChunks.delete(chunk);finishChunk(chunk);} // P2 perf：要看到了就當場建
        chunk.group.visible=d2<radius*radius;
        // 記憶體：Three.js 把畫過的區塊幾何留在 GPU，物件隱藏也不釋放，騎越遠 GPU 用量越大（手機分頁會被系統殺掉）。
        // 離開可見圈再遠 120 m 就把區塊的 GPU 緩衝還掉（CPU 端資料保留，回來時 Three.js 自動重傳）。
        if(chunk.built&&chunk.uploaded&&d2>(radius+120)**2){releaseChunk(chunk);chunk.uploaded=false;}
        else if(chunk.group.visible)chunk.uploaded=true;
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
