import * as T from '../vendor/three.module.min.js?v=1dff2833';
import {canvasTexture,hash,shapes} from './city-primitives.js?v=1dff2833';
import {venues,venuePoint} from '../venue-entrances.mjs?v=1dff2833'; // A27
import {byId,metersPerUnit as unit} from '../world.mjs?v=1dff2833';
import {signalState} from '../street-crossings.mjs?v=1dff2833'; // A24
import {marketCarts,nightMarketOpen} from '../night-market.mjs?v=1dff2833';
import {nightScenes,vendorCounters} from './night-scenes.js?v=1dff2833';

export const windowKinds=['old','oldB','oldC','new','towerB','towerC','office'];
const shopKinds=[...'abcdefghijkl'].map(letter=>'shop'+letter).concat('mall');
const windowTints=['#ffce95','#ffc097','#dce9ed','#efaa87','#ffe8c7'];
const neutralLED='#ffdbb7'; // Approximate a 4000 K phosphor LED in sRGB.
const shopDoor=venuePoint(venues.get('convenience')); // A27

function radial(doc,stops){
  return canvasTexture(doc,64,64,(ctx,w,h)=>{
    const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    for(const [at,value] of stops)g.addColorStop(at,value);
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  });
}

// Filtered microfacets interrupt a narrow highlight without projecting letters or stripes.
function wetFootprint(doc,paired=false){
  return canvasTexture(doc,128,64,(ctx,w,h)=>{
    const image=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=(x+.5)/w,v=(y+.5)/h-.5,spread=.07+u*.055;
      const center=.018*Math.sin(u*10)+.012*Math.sin(u*22+.8);
      const beam=offset=>Math.exp(-((v-center-offset)**2)/(2*spread*spread));
      const rays=paired?.56*(beam(-.23)+beam(.23)):beam(0);
      const grain=.66+.24*hash(x,y)+.10*Math.sin(u*19+v*9);
      const k=4*(y*w+x);
      image.data[k]=image.data[k+1]=image.data[k+2]=255;
      image.data[k+3]=Math.round(255*rays*grain*Math.sin(Math.PI*u)**.75);
    }
    ctx.putImageData(image,0,0);
  });
}

function localLighting(group,doc,glow,has){
  const core=radial(doc,[[0,'#fff'],[.18,'#fff'],[.32,'#ffffffe0'],[.58,'#ffffff38'],[1,'#ffffff00']]);
  const fade=radial(doc,[[0,'#ffffffd8'],[.24,'#ffffffac'],[.64,'#ffffff42'],[1,'#ffffff00']]);
  const scenes=nightScenes(doc,group,has,core);
  const fixtures=new Map(),cell=45;
  function register(kind,x,y,z,data){
    const key=Math.floor(x/cell)+','+Math.floor(z/cell);
    if(!fixtures.has(key))fixtures.set(key,[]);
    fixtures.get(key).push({kind,x,y,z,data});
  }
  const poolMaterial=new T.MeshBasicMaterial({map:fade,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  const capacity=384;
  const pools=new T.InstancedMesh(shapes.plane,poolMaterial,capacity);
  const wetMaterial=poolMaterial.clone();wetMaterial.map=wetFootprint(doc);
  const streaks=new T.InstancedMesh(shapes.plane,wetMaterial,capacity);
  streaks.count=0;streaks.frustumCulled=false;group.add(streaks);
  pools.count=0;pools.frustumCulled=false;group.add(pools);
  const object=new T.Object3D(),color=new T.Color();
  function pool(x,z,w,h,turn,tint,gain,mesh=pools){
    if(mesh.count>=capacity)return;
    object.position.set(x,.095,z);object.scale.set(w,h,1);object.rotation.set(-Math.PI/2,0,turn);
    object.updateMatrix();mesh.setMatrixAt(mesh.count,object.matrix);
    mesh.setColorAt(mesh.count++,color.set(tint).multiplyScalar(gain));
  }
  const haloPositions=new T.Float32BufferAttribute(new Float32Array(capacity*3),3);
  const haloGeometry=new T.BufferGeometry();haloGeometry.setAttribute('position',haloPositions);
  const haloMaterial=new T.PointsMaterial({map:glow,size:1.55,color:neutralLED,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  const halos=new T.Points(haloGeometry,haloMaterial);halos.frustumCulled=false;group.add(halos);
  const cx=shopDoor.x*unit,cz=shopDoor.y*unit;
  if(has('storefront'))register('shop',cx,2.87,cz);
  if(has('furniture'))for(const cart of marketCarts)register('cart',cart.x,2.11,cart.z,cart);
  const market=byId.get('night_market'),bulbs=[];
  const cartLight=new T.PointLight('#ffca84',0,7,2);
  group.add(cartLight);
  const counters=new T.Group();group.add(counters);
  const counterBatch=vendorCounters(doc,counters,core);
  function vendorLight(at,s,d,name){
    const [x,z]=at(s,d);
    if(Math.hypot(x-market.x*unit,z-market.y*unit)>100)return;
    counterBatch.add(at,s,d,name);
    for(const offset of [-.76,0,.76]){
      const [bx,bz]=at(s+offset,d-.50);
      bulbs.push(bx,2.06,bz);
    }
    register('vendor',x,2.05,z);
  }
  let signalsIndexed=false,bulbCloud,previousDry;
  function update(x,z,night,rain,clock,lamps,hour,signals,signs,surfaces){
    scenes(x,z,night,hour,clock,surfaces);
    counters.visible=night>.15&&Math.hypot(x-market.x*unit,z-market.y*unit)<105;
    if(bulbCloud)bulbCloud.visible=counters.visible;
    pools.visible=halos.visible=night>.15;streaks.visible=pools.visible&&streaks.count>0;
    if(!pools.visible){cartLight.visible=false;previousDry=null;return;}
    // Dry pools stay fixed when the player is stationary. Steam still advances above.
    if(!rain&&previousDry&&x===previousDry.x&&z===previousDry.z&&lamps===previousDry.lamps&&hour===previousDry.hour)return;
    previousDry=rain?null:{x,z,lamps,hour};
    cartLight.visible=false;
    if(!signalsIndexed){
      counterBatch.finish();
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(bulbs,3));
      bulbCloud=new T.Points(geometry,new T.PointsMaterial({size:.29,map:core,color:'#ffda99',
        transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
      bulbCloud.visible=counters.visible;group.add(bulbCloud);
      for(const item of signals)register('signal',item.x,4.2,item.z,item.crossing);
      for(const sign of signs){
        if(!['acrylic','led'].includes(sign.userData.detailStyle))continue;
        const {x,y,z}=sign.position;
        register('sign',x,y,z,sign.userData.detailStyle);
      }
      signalsIndexed=true;
    }
    const ix=Math.floor(x/cell),iz=Math.floor(z/cell);
    pools.count=streaks.count=0;let points=0,nearestVendor=15;
    for(let i=ix-2;i<=ix+2;i++)for(let j=iz-2;j<=iz+2;j++){
      for(const f of fixtures.get(i+','+j)??[]){
        if(!rain&&['window','sign','signal'].includes(f.kind))continue;
        const dx=x-f.x,dz=z-f.z,d=Math.hypot(dx,dz);
        if(d>=82)continue;
        const energy=lamps*Math.min(1,(82-d)/16);
        if(f.kind==='lamp'){
          if(points<capacity)haloPositions.setXYZ(points++,f.x,f.y,f.z);
          pool(f.x,f.z,8.2,8.2,0,neutralLED,energy*(rain?.26:.17));
        }else if(f.kind==='vendor'){
          pool(f.x,f.z,4.5,4.5,0,'#ffc98b',energy*.50);
          if(d<nearestVendor){
            nearestVendor=d;cartLight.visible=true;cartLight.position.set(f.x,1.90,f.z);
            cartLight.intensity=lamps*27*(1-d/18);
          }
        }else if(f.kind==='window'){
          if(!rain||d>50)continue;
        }else if(f.kind==='shop'){
          // The fluorescent canopy faces outward from the existing shop threshold.
          pool(f.x-Math.cos(2.83)*1.45,f.z-Math.sin(2.83)*1.45,6.8,5.9,0,'#e2f2ff',energy*.52);
        }else if(f.kind==='cart'){
          if(!nightMarketOpen(hour))continue;
          const c=f.data;
          pool(f.x+c.dz*c.side*.46,f.z-c.dx*c.side*.46,3.4,3.9,c.heading,'#ffc381',energy*.42);
        }
        // Water around operating carts leaves a short sheen even after drizzle stops.
        if(!rain&&f.kind!=='cart'&&f.kind!=='vendor')continue;
        const facing=Math.atan2(dx,dz),forwardX=dx/Math.max(d,.1),forwardZ=dz/Math.max(d,.1);
        let tint=neutralLED,stretch=5.6,gain=.37;
        if(f.kind==='signal'){
          const c=f.data;
          const state=signalState(c.junction,clock,hour); // A24
          if(state.flashing&&clock%1>=.5)continue;
          const phase=state[c.group?'a':'b'];
          tint=state.flashing||phase==='yellow'?'#ffb64c':phase==='green'?'#41d89f':'#ff4836';
          stretch=7.1;gain=.83;
        }else if(f.kind==='window'){
          tint=f.data;stretch=9.5;gain=.60;
        }else if(f.kind==='sign'){
          tint=f.data==='led'?'#fc8c5c':'#e7c5a9';stretch=Math.min(11,3+f.y);gain=.48;
        }else if(f.kind==='cart'||f.kind==='vendor')tint='#f6a05f';
        else if(f.kind==='shop')tint='#d9edff';
        if(!rain){stretch=3.8;gain=.23;}
        pool(f.x+forwardX*stretch*.36,f.z+forwardZ*stretch*.36,stretch,2.35,facing-Math.PI/2,tint,energy*gain,streaks);
      }
    }
    haloGeometry.setDrawRange(0,points);haloPositions.needsUpdate=true;haloMaterial.opacity=lamps*(rain?.72:.54);
    pools.instanceMatrix.needsUpdate=true;
    if(pools.instanceColor)pools.instanceColor.needsUpdate=true;
    streaks.visible=streaks.count>0;
    streaks.instanceMatrix.needsUpdate=true;
    if(streaks.instanceColor)streaks.instanceColor.needsUpdate=true;
  }
  function windowLight(a,b,nx,nz,kind){
    const x=(a[0]+b[0])/2,z=(a[2]+b[2])/2;
    const tint=windowTints[kind.charCodeAt(4)%windowTints.length];
    register('window',x+nx*2.2,2.8,z+nz*2.2,tint);
  }
  return {lampGlow:(x,y,z)=>register('lamp',x,y,z),vendorLight,windowLight,update};
}

export function createNight({doc,group,enabled,has}){
  // This texture also serves existing daytime actor shadows.
  const glow=radial(doc,[[0,'#fff'],[1,'#ffffff00']]);
  if(enabled)glow.userData.wetVehicle=wetFootprint(doc,true);
  const optics=enabled?localLighting(group,doc,glow,has):null;
  return {glow,optics,lampGlow:optics?.lampGlow??(()=>{})};
}

export function updateNight({materials,optics,signCache,adMaterials,signalFaces,signs},x,z,night,rain,clock,lamps,hour){
  materials.towerLights.color.setScalar(.12+night*3.4);
  materials.luminous.color.setScalar(.22+lamps*2.1);
  for(const kind of shopKinds)materials[kind].emissiveIntensity=lamps*1.62;
  materials.signalRed.color.setScalar(clock%24<12?1.65:.12);
  materials.signalGreen.color.setScalar(clock%24<12?.12:1.65);
  materials.window.color.setScalar(.13+night*1.1);
  materials.reflection.opacity=lamps*(rain?.52:.19);
  if(rain&&night>.15){
    materials.road.roughness=.34;
    materials.road.metalness=.17;
  }
  optics?.update(x,z,night,rain,clock,lamps,hour,signalFaces,signs,materials);
  for(const kind of windowKinds)if(materials[kind].emissiveMap)materials[kind].emissiveIntensity=night*.6;
  for(const [key,material] of signCache){
    material.color.setScalar(.9+lamps*1.25);
    if(night>.19&&/^(鹽酥雞|滷味|珍奶|茶飲)\//.test(key)){
      material.color.g*=.74;material.color.b*=.45;
    }
  }
  for(const mat of adMaterials.values())mat.emissiveIntensity=lamps*1.25;
}
