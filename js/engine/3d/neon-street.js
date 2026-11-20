// Projecting blades, enamel fascias and illustrated lightboxes share one printed atlas.
import * as T from '../vendor/three.module.min.js';
import {buildings,inBuilding,metersPerUnit as unit,roadOptions} from '../world.mjs';
import {neonDistrict} from '../neon-districts.mjs';
import {hash,shapes} from './city-primitives.js';

const lampColors=['#ff8a85','#7fd9cd','#ffad6c','#b8a5ec','#ff8e9b','#aad493','#edbf77','#82ccd9'];

function signMaterial(clock,ground=false){
  const material=new T.MeshBasicMaterial();
  if(ground){
    material.transparent=true;material.depthWrite=false;material.blending=T.AdditiveBlending;
  }
  material.customProgramCacheKey=()=>ground?'neon-ground':'neon-case';
  material.onBeforeCompile=shader=>{
    shader.uniforms.neonTime=clock;
    shader.vertexShader='attribute float plate; varying float vPlate; varying float vFace;\n'+
      shader.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\n vPlate=plate; vFace=abs(normal.z);');
    shader.fragmentShader='uniform float neonTime; varying float vPlate; varying float vFace;\n'+
      shader.fragmentShader.replace('#include <map_fragment>',`
        #ifdef USE_MAP
          vec2 p = vMapUv;
          // Only the inset message window scrolls. The shop seal and frame stay fixed.
          if(vPlate>=16.0 && vPlate<32.0 && mod(vPlate,3.0)<0.5 &&
             p.x>.205 && p.x<.97 && p.y>.22 && p.y<.83){
            p.x=.205+mod(p.x-.205+neonTime,.765);
          }
          ${ground?`// The inverted type breaks up in short horizontal ripples on the paving.
          float ripple=sin(p.y*171.0+vPlate)*.5+sin(p.y*83.0)*.5;
          float fade=sin(3.14159*p.x)*sin(3.14159*p.y);
          diffuseColor.a *= fade*fade*(.50+.35*ripple);
          p.x=clamp(p.x+ripple*.026,.006,.994); p.y=1.0-p.y;`:''}
          vec2 tile=vec2(mod(vPlate,8.0),5.0-floor(vPlate/8.0));
          vec3 ink=texture2D(map,(tile+clamp(p,.006,.994))/vec2(8.0,6.0)).rgb;
          diffuseColor.rgb *= mix(vec3(.054,.061,.071),ink,vFace);
        #endif`);
  };
  return material;
}

export function createNeonStreet({group,groupOf,available,anisotropy,instance,nightEnabled}){
  const buckets=new Map(),sources=new Map(),clock={value:0};
  const material=signMaterial(clock),ground=signMaterial(clock,true);
  const reflections=new Map();
  const light=new T.PointLight('#ffd5ae',0,21,2);
  // The nearest fixture lights glossy moving vehicles using their existing PBR materials.
  if(nightEnabled)group.add(light);
  const cell=22;
  function put(x,y,z,w,h,d,angle,plate){
    const chunk=groupOf(x,z);
    if(!buckets.has(chunk))buckets.set(chunk,[]);
    buckets.get(chunk).push({x,y,z,w,h,d,angle,plate});
  }
  function registerLight(x,y,z,tint,angle,w,plate){
    if(!nightEnabled)return;
    const key=Math.floor(x/cell)+','+Math.floor(z/cell);
    if(!sources.has(key))sources.set(key,[]);
    sources.get(key).push({x,y,z,tint});
    const chunk=groupOf(x,z);
    if(!reflections.has(chunk))reflections.set(chunk,[]);
    const length=5.8;
    reflections.get(chunk).push({x:x+Math.sin(angle)*length*.32,y:.107,
      z:z+Math.cos(angle)*length*.32,w,h:length,d:1,angle,plate});
  }
  function frontage(x,z,nx,nz,width,top,seed,designated=false){
    if(width<3.5||top<5.2||!neonDistrict(x/unit,z/unit))return;
    // Nearest sidewalk must lie on this side of the wall. Skip party walls.
    if(!designated){
      const nearest=roadOptions(x/unit,z/unit,2,false);
      if(!nearest.some(hit=>hit.r[5].way.layer===0&&hit.d*unit<hit.r[4]*unit/2+13&&
        ((hit.x*unit-x)*nx+(hit.y*unit-z)*nz)>hit.d*unit*.65))return;
    }
    const angle=Math.atan2(nx,nz),ux=nz,uz=-nx;
    const bays=Math.max(1,Math.floor(width/10));
    for(let i=0;i<bays;i++){
      const bay=width/bays,t=(i+.5)*bay-width/2;
      const cx=x+ux*t,cz=z+uz*t;
      if(inBuilding((cx+nx*1.35)/unit,(cz+nz*1.35)/unit))continue;
      const k=seed+i*23;
      const pick=(salt,band)=>band*16+Math.floor(hash(k,salt)*16);
      const fascia=pick(7,1),tint=lampColors[(fascia*3+Math.floor(fascia/8))%8];
      const full=designated&&width>23;
      const base=full?5.0:4.2;
      const wide=Math.min(bay*(.70+.20*hash(k,3)),full?8:6.6),height=wide*.22;
      put(cx+nx*.33,base,cz+nz*.33,wide,height,.32,angle,fascia);
      const side=(hash(k,11)>.5?1:-1)*bay*.30;
      const bx=cx+ux*side,bz=cz+uz*side;
      const vertical=pick(29,0),h=Math.min(3.9,top-.1-base+.6);
      if(h>1.45){
        const bladeW=h*.33,mid=base+h*.48+.25,offset=.48+bladeW*.5;
        put(bx+nx*offset,mid,bz+nz*offset,bladeW,h,.17,angle+Math.PI/2,vertical);
        for(const y of [mid-h*.32,mid+h*.32])
          instance('metal','box','#5a555b',bx+nx*.28,y,bz+nz*.28,.09,.09,.6,angle);
      }
      if(top>9.1&&(full||hash(k,17)>.42)){
        const pw=Math.min(bay*.67,full?10:5.8),ph=pw*.5625;
        const py=Math.min(top-ph*.5-.12,base+1.1+ph*.5+hash(k,15)*1.2);
        put(cx-ux*side*.48+nx*.31,py,cz-uz*side*.48+nz*.31,pw,ph,.33,angle,pick(19,2));
        if(top>15&&full&&i%3===1)
          put(cx+nx*.3,py+ph*.5+1.15,cz+nz*.3,wide*.65,.95,.27,angle,pick(47,1));
      }
      registerLight(cx+nx*2.1,base-.48,cz+nz*2.1,tint,angle,Math.min(5,wide),fascia);
    }
  }

  function attach(batches,shape,surface,horizontal){
    const obj=new T.Object3D();
    for(const [chunk,items] of batches){
      const geometry=shape.clone();
      geometry.setAttribute('plate',new T.InstancedBufferAttribute(Float32Array.from(items,p=>p.plate),1));
      const mesh=new T.InstancedMesh(geometry,surface,items.length);
      items.forEach(({x,y,z,w,h,d,angle},i)=>{
        obj.position.set(x,y,z);obj.scale.set(w,h,d);
        if(horizontal)obj.rotation.set(-Math.PI/2,0,angle);
        else obj.rotation.set(0,angle,0);
        obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);
      });
      mesh.computeBoundingSphere();chunk.storeDetail.add(mesh);
    }
    batches.clear();
  }
  function finish(){
    // The mall has a bespoke podium. Its four faces use these same footprint ratios in landmarks.js.
    const mall=buildings.find(b=>b.shape==='mall');
    if(mall){
      const x=(mall.x+mall.w/2)*unit,z=(mall.y+mall.h/2)*unit;
      const w=mall.w*unit*.943,d=mall.h*unit*.914;
      for(const side of [-1,1]){
        frontage(x+side*w/2,z,side,0,d,17,mall.osmId+side,true);
        frontage(x,z+side*d/2,0,side,w,17,mall.osmId+side*31,true);
      }
    }
    available.then(async images=>{
      const asset=images?.['neon-shop-atlas'];
      if(!asset)return;
      const texture=await new T.TextureLoader().loadAsync(new URL('../../../'+asset.src,import.meta.url).href);
      texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,anisotropy);
      material.map=texture;material.needsUpdate=true;
      ground.map=texture;ground.needsUpdate=true;
      attach(buckets,shapes.box,material,false);
      attach(reflections,shapes.plane,ground,true);
    }).catch(()=>{}); // Existing storefront artwork remains available offline.
  }
  function update(x,z,lamps,time,rain){
    clock.value=lamps>.1?time*.092:0;
    material.color.setScalar(.88+lamps*1.15);
    ground.opacity=lamps*(rain?.63:.20);
    ground.visible=ground.opacity>.015;
    light.intensity=0;
    if(!nightEnabled||lamps<.03||!material.map)return;
    const ix=Math.floor(x/cell),iz=Math.floor(z/cell);
    let best=cell*cell,near;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
      for(const s of sources.get((ix+a)+','+(iz+b))??[]){
        const d=(s.x-x)**2+(s.z-z)**2;
        if(d<best){best=d;near=s;}
      }
    }
    if(near){
      light.position.set(near.x,near.y,near.z);
      light.color.set(near.tint);light.intensity=lamps*80*(1-best/(cell*cell));
    }
  }
  return {frontage,finish,update};
}
