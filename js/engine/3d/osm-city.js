import {createOfficeDoor} from './office-door.js';
import {trafficGreen,trafficFlashing} from '../navigation.js';
import {surfaceMaps} from './pbr.js';
import * as T from '../vendor/three.module.min.js';
import {buildings,locations,roads,ways,water,riverWidthMeters,width,height,metersPerUnit as unit,roadAt,toWorld,roadNodes} from '../world.mjs';
import {urbanInfill} from '../infill.mjs';
import {createBasin} from './basin.js';
import landuse from '../data/xinyi-landuse.json' with { type:'json' };
import {placeFrontage,placeRoof,placeEntrance} from './frontage.js';
import {placeStreetLife,placeTree,xinyiBusBay} from './street-life.js';
import {buildLandmark} from './xinyi.js';
import {canvasTexture} from './city.js';
const chunkSize=100,box=new T.BoxGeometry(1,1,1),plane=new T.PlaneGeometry(1,1),
  cylinder=new T.CylinderGeometry(.5,.5,1,10),crown=new T.IcosahedronGeometry(.55,1),
  dome=new T.SphereGeometry(.5,24,11,0,Math.PI*2,0,Math.PI/2);
const shapes={box,plane,cylinder,crown,dome};
// The two mapped Songshan warehouses and the preservation block at Four Four South Village.
const historicFootprints=new Map([[228920407,'studio'],[228920409,'studio'],[441377762,'village'],[1131522120,'museum']]);
const matrix=new T.Object3D(),color=new T.Color();
const hash=(a,b=0)=>{const v=Math.sin(a*127.1+b*311.7+17.3)*43758.5453;return v-Math.floor(v);};
const wallSwatches=['#e6c6bd','#e8dcc2','#c6cbca','#c3d3bf','#d9cdb8','#cfc4c0'];
const windowKinds=['old','oldB','oldC','new','towerB','towerC','office'];

function meshBuffers(material) {
  const v=[],uv=[],rgb=[];
  function triangle(a,b,c,tint,ta=[0,0],tb=[0,1],tc=[1,0]) {
    v.push(...a,...b,...c);uv.push(...ta,...tb,...tc);
    color.set(tint);
    for(let i=0;i<3;i++)rgb.push(color.r,color.g,color.b);
  }
  function quad(a,b,c,d,tint,u=1,w=1,uo=0) {
    triangle(a,b,c,tint,[uo,0],[uo+u,0],[uo+u,w]);triangle(a,c,d,tint,[uo,0],[uo+u,w],[uo,w]);
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

export function createOsmCity(scene,doc,anisotropy) {
  const group=new T.Group();
  const updateOfficeDoor=createOfficeDoor(group);
  updateOfficeDoor(0);
  const replacements=new T.Group();
  scene.add(group,replacements);
  const glow=canvasTexture(doc,64,64,ctx=>{
    const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'#fff');g.addColorStop(1,'#ffffff00');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  });
  const textUv={total:0,osm:0,infill:0,other:0,failed:0};
  function textWall(buffer,a,b,c,d,nx,nz,tint,u,v,source='other',uo=0){
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
        // Lit windows: dark glazing cells are randomly switched on, warm or cool white.
        const mask=canvasTexture(doc,256,256,(ctx,w,h)=>{
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
  materials.lobbyTrim=materials.concrete;
  materials.lobbyLight=new T.MeshBasicMaterial();
  materials.lobbyGlass=new T.MeshStandardMaterial({metalness:.2,roughness:.16,transparent:true,opacity:.40,depthWrite:false});
  materials.reflection=new T.MeshBasicMaterial({map:glow,transparent:true,depthWrite:false,opacity:0,blending:T.AdditiveBlending});
  const lampHalos=[],lampDecals=[],decalMaterial=new T.MeshBasicMaterial({map:glow,color:'#ffb866',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}),signalFaces=[],roadMarkMaterials=new Map(),chunks=new Map(),signs=[],signCache=new Map(),instanceMaterials=new Map();
  const groupOf=(x,z)=>{
    const ix=Math.floor(x/chunkSize),iz=Math.floor(z/chunkSize),key=ix+','+iz;
    if(!chunks.has(key))chunks.set(key,{x:(ix+.5)*chunkSize,z:(iz+.5)*chunkSize,meshes:new Map(),instances:new Map(),group:new T.Group(),detail:new T.Group()});
    return chunks.get(key);
  };
  function batch(x,z,kind) {
    const c=groupOf(x,z);
    if(!c.meshes.has(kind))c.meshes.set(kind,meshBuffers(materials[kind]));
    return c.meshes.get(kind);
  }
  function instance(kind,shape,tint,x,y,z,w,h,d,turn=0,rx=0,rz=0) {
    const c=groupOf(x,z),key=kind+'/'+shape;
    if(!c.instances.has(key))c.instances.set(key,[]);
    c.instances.get(key).push([tint,x,y,z,w,h,d,turn,rx,rz]);
  }
  // Ground: a low-res tint mask (paving, verge, grass) multiplied by a tiling detail noise in world space.
  const cover=canvasTexture(doc,512,512,(ctx,w,h)=>{
    const designated=toWorld(25.038,121.566);
    for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
      const gx=x/w*width,gy=y/h*height;
      const civic=Math.hypot(gx-designated.x,gy-designated.y)*unit<550;
      const strip=roadAt(gx,gy,-92);
      const n=(x*13+y*47+(x*y)%29)%18;
      ctx.fillStyle=civic?`rgb(${126+n} ${128+n} ${118+n})`:strip?`rgb(${110+n} ${108+n} ${84+n})`:
        n>14?`rgb(${116+n} ${106+n} ${80+n})`:`rgb(${84+n} ${112+n} ${68+n})`;
      ctx.fillRect(x,h-y-2,2,2);
    }
  });
  cover.anisotropy=anisotropy;
  const detail=canvasTexture(doc,256,256,(ctx,w,h)=>{
    const data=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const coarse=hash(Math.floor(x/16),Math.floor(y/16)),mid=hash(Math.floor(x/4),Math.floor(y/4)+9),fine=hash(x,y+33);
      const v=Math.round(255*(.5+.22*(coarse-.5)+.28*(mid-.5)+.3*(fine-.5)));
      const k=(y*w+x)*4;data.data[k]=data.data[k+1]=data.data[k+2]=v;data.data[k+3]=255;
    }
    ctx.putImageData(data,0,0);
  });
  detail.wrapS=detail.wrapT=T.RepeatWrapping;detail.anisotropy=anisotropy;
  const soilMaterial=new T.MeshStandardMaterial({map:cover,roughness:1});
  soilMaterial.onBeforeCompile=shader=>{
    shader.uniforms.detailMap={value:detail};
    shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec2 groundXZ; void main() {')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n groundXZ=(modelMatrix*vec4(position,1.)).xz;');
    shader.fragmentShader=shader.fragmentShader.replace('void main() {','uniform sampler2D detailMap; varying vec2 groundXZ; void main() {')
      .replace('#include <map_fragment>',`#include <map_fragment>
      float d1=texture2D(detailMap,groundXZ/7.).r,d2=texture2D(detailMap,groundXZ/1.9+.37).r;
      diffuseColor.rgb*=.62+.52*mix(d1,d2,.45);`);
  };
  const soil=new T.Mesh(new T.PlaneGeometry(width*unit,height*unit),soilMaterial);
  soil.rotation.x=-Math.PI/2;soil.position.set(width*unit/2,-.11,height*unit/2);
  soil.receiveShadow=true;group.add(soil);
  const basin=createBasin(width*unit,height*unit);
  group.add(basin);

  const strip=(a,b,span,y,kind,off=0,tint='#fff',uvScale=3)=>{
    const ax=a[0]*unit,az=a[1]*unit,bx=b[0]*unit,bz=b[1]*unit;
    const len=Math.hypot(bx-ax,bz-az);
    if(len<.1)return;
    const nx=-(bz-az)/len,nz=(bx-ax)/len,half=span/2;
    const p=(x,z,side)=>[x+nx*(side*half+off),y,z+nz*(side*half+off)];
    batch((ax+bx)*.5,(az+bz)*.5,kind).quad(p(ax,az,-1),p(bx,bz,-1),p(bx,bz,1),p(ax,az,1),tint,len/uvScale,span/uvScale);
  };
  function addRoadMark(arrows,x,z,heading){
    if(!roadMarkMaterials.has(arrows)){
      const image=canvasTexture(doc,256,128,(ctx,w,h)=>{
        ctx.font='bold 76px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle='#e5dfcb';
        if(arrows==='scooter'){
          ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=9;ctx.beginPath();
          for(const x of [83,173]){ctx.moveTo(x+16,84);ctx.arc(x,84,16,0,Math.PI*2);}
          ctx.moveTo(83,84);ctx.lineTo(154,84);ctx.lineTo(173,54);ctx.lineTo(160,40);
          ctx.lineTo(191,40);ctx.moveTo(86,53);ctx.lineTo(123,53);ctx.stroke();
        }else ctx.fillText(arrows,w/2,h/2,w*.94);
      });
      roadMarkMaterials.set(arrows,new T.MeshBasicMaterial({map:image,transparent:true,depthWrite:false}));
    }
    const mark=new T.Mesh(plane,roadMarkMaterials.get(arrows));
    mark.position.set(x,.078,z);mark.rotation.set(-Math.PI/2,0,-heading-Math.PI/2,'YXZ');
    mark.scale.set(arrows==='scooter'?1.4:2.25,arrows==='↑'?2.0:1.30,1);
    group.add(mark);signs.push(mark);
  }
  const busMark=xinyiBusBay(10,-1.66);
  addRoadMark('公車專用',busMark.x,busMark.z,busMark.heading);
  const reverseBusMark=xinyiBusBay(10,-1.66,true);
  addRoadMark('公車專用',reverseBusMark.x,reverseBusMark.z,reverseBusMark.heading);
  for(const reverse of [false,true]){
    for(const [offset,label] of [[18,'40'],[25,'↑']]){
      const point=xinyiBusBay(offset,-1.66,reverse);
      addRoadMark(label,point.x,point.z,point.heading);
    }
  }
  const covers=new Set();
  for(const [ax,ay,bx,by,w,{way,forward,reverse}] of roads) {
    const a=[ax,ay],b=[bx,by],span=w*unit;
    if(way.kind==='pedestrian') {strip(a,b,span,.07,'paving');continue;}
    strip(a,b,span,.02,'road',0,'#fff',4.2);
    const d=Math.hypot(bx-ax,by-ay),at=t=>[ax+(bx-ax)*t/d,ay+(by-ay)*t/d];
    const arterial=['primary','secondary','tertiary'].includes(way.kind);
    for(const side of [-1,1]){
      strip(a,b,1.6,.050,'paving',side*(span/2+.77),'#fff',2.6);
      strip(a,b,.14,.059,'curb',side*(span/2+.06),'#eee7d9');
      if(d*unit>11&&way.name){
        strip(a,b,.06,.028,'drain',side*(span/2-.05),'#999');
        const roadEdge=side*(span/2-.22);
        strip(at(d*.05),at(d*.95),.083,.039,'line',roadEdge,arterial?'#ee7b64':'#ecc467');
      }
    }
    if(span>7&&!way.oneway){
      if(arterial&&span>9){
        for(const offset of [-.14,.14])strip(a,b,.105,.035,'line',offset,'#e1bc60');
      }else for(let p=9;p<d-9;p+=84)strip(at(p),at(Math.min(d,p+30)),.13,.036,'line',0,'#dbc289');
    }
    if(arterial&&span>10){
      for(const side of [-1,1]){
        for(let pos=24;pos<d-18;pos+=58){
          strip(at(pos),at(Math.min(d,pos+25)),.098,.043,'line',side*(span/2-2.45),'#f8f2db');
        }
      }
    }
    if(way.name&&!arterial&&d*unit>25&&(span<9)){
      // Concrete utility poles on one side, with crossarm, three sagging wires and the odd transformer.
      const pitch=(28+hash(way.id,1)*8)/unit,heading=Math.atan2(by-ay,bx-ax);
      const side=way.id%2?1:-1,nx=-Math.sin(heading),nz=Math.cos(heading);
      let previous=null;
      for(let pos=pitch*.5,k=0;pos<d-4/unit;pos+=pitch,k++){
        const pt=at(pos),off=side*(span/2+1.45),x=pt[0]*unit+nx*off,z=pt[1]*unit+nz*off;
        instance('concrete','cylinder','#a8a59d',x,4.25,z,.18,8.5,.18);
        instance('dark','box','#3a3a3c',x,8.15,z,1.5,.08,.08,-Math.atan2(nz,nx));
        if(k%4===1)instance('metal','box','#6d7168',x-nx*side*.32,6.6,z-nz*side*.32,.5,.8,.4,-heading);
        if(previous){
          const mx=(x+previous.x)/2,mz=(z+previous.z)/2,len=Math.hypot(x-previous.x,z-previous.z);
          for(const lateral of [-.6,0,.6])
            instance('dark','box','#26262a',mx+nx*lateral,7.95,mz+nz*lateral,len,.025,.025,-Math.atan2(z-previous.z,x-previous.x));
        }
        previous={x,z};
      }
    }
    if(d*unit>17&&way.name&&way.id%3===0){
      const pt=at(d*.56),x=pt[0]*unit,z=pt[1]*unit;
      const key=Math.floor(x/9)+','+Math.floor(z/9);
      if(!covers.has(key)){
        covers.add(key);
        instance('metal','cylinder','#646465',x,.033,z,.70,.015,.70);
        instance('metal','cylinder','#777677',x,.043,z,.57,.008,.57);
        for(const off of [-.17,-.08,.01,.10,.19])instance('metal','box','#515356',x+off,.050,z,.023,.006,.41);
      }
      const patchLen=(1.4+hash(way.id,2)*.8)/unit,patchAt=d*(.2+hash(way.id,5)*.5);
      if(patchAt+patchLen<d)strip(at(patchAt),at(patchAt+patchLen),.8+hash(way.id,7)*.4,.029,'repair',(hash(way.id,9)-.5)*span*.3,
        hash(way.id,4)>.5?'#a5a19d':'#c0bbb5',1.2);
      if(arterial&&way.id%7===0){
        const arrows=way.kind==='primary'&&span>10?'公車專用':'40';
        const heading=Math.atan2(by-ay,bx-ax),offset=span*.25;
        const dx=-Math.sin(heading)*offset,dz=Math.cos(heading)*offset;
        if(forward)addRoadMark(arrows,x+dx,z+dz,heading);
        if(reverse)addRoadMark(arrows,x-dx,z-dz,heading+Math.PI);
      }
    }
  }
  // A cap closes the asphalt wedge between angled OSM segments.
  for(const n of roadNodes){
    if(n.around.length<2||!n.out.length)continue;
    const x=n.x*unit,z=n.y*unit,w=Math.max(...n.out.map(e=>e.w))*unit*.49;
    const buf=batch(x,z,'road'),y=.024,uv=(dx,dz)=>[(x+dx)/4.2,(z+dz)/4.2];
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,b=a+Math.PI/4;
      const ax=w*Math.cos(a),az=w*Math.sin(a),bx=w*Math.cos(b),bz=w*Math.sin(b);
      buf.triangle([x,y,z],[x+bx,y,z+bz],[x+ax,y,z+az],'#f1efed',uv(0,0),uv(bx,bz),uv(ax,az));
    }
  }
  // Stop lines, zebra crossings and approach arrows at junctions.
  for(const n of roadNodes){
    if(n.around.length<3||!n.out.length)continue;
    const capRadius=Math.max(...n.out.map(e=>e.w))*unit*.49+1.1;
    for(const e of n.out){
      const to=roadNodes[e.to],dist=Math.hypot(to.x-n.x,to.y-n.y);
      if(!e.way.name||!e.reverse||dist*unit<capRadius+9||e.w*unit<5||e.way.layer!==0)continue;
      const dx=(to.x-n.x)/dist,dy=(to.y-n.y)/dist,span=e.w*unit;
      const P=m=>[n.x+dx*m/unit,n.y+dy*m/unit];
      const arterialEdge=['primary','secondary','tertiary'].includes(e.way.kind);
      for(let lat=-span/2+.6;lat<span/2-.3;lat+=1)strip(P(capRadius),P(capRadius+3),.5,.046,'line',lat,'#f4efe2');
      strip(P(capRadius+3.4),P(capRadius+3.8),span/2-.4,.046,'line',-span/4,'#f4efe2');
      if(arterialEdge&&span>9&&hash(e.a,e.b)>.35){
        const h=Math.atan2(-dy,-dx),at=P(capRadius+11),lane=-span/4;
        addRoadMark('↑',at[0]*unit-dy*lane,at[1]*unit+dx*lane,h);
      }
    }
  }
  for(const [,kind,,coordinates] of landuse.features){
    const ring=coordinates.map(([lat,lon])=>{const p=toWorld(lat,lon);return new T.Vector2(p.x*unit,p.y*unit);});
    const type=kind==='green'?'park':kind==='plaza'?'paving':'water';
    const buf=batch(ring[0].x,ring[0].y,type);
    for(const face of T.ShapeUtils.triangulateShape(ring,[])){
      const v=face.map(i=>ring[i]);
      buf.triangle(...v.map(p=>[p.x,-.056,p.y]),'#fff',...v.map(p=>[p.x/3,p.y/3]));
    }
  }
  for(const object of water) {
    const pts=object.points;
    const closed=pts.length>3&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<2;
    if(!closed){
      if(object.name==='基隆河')for(let i=1;i<pts.length;i++){
        strip([pts[i-1].x,pts[i-1].y],[pts[i].x,pts[i].y],riverWidthMeters+9,-.052,'park',0,'#8c9a68');
        strip([pts[i-1].x,pts[i-1].y],[pts[i].x,pts[i].y],riverWidthMeters,-.04,'water');
      }
      continue;
    }
    const polygon=pts.slice(0,-1).map(p=>new T.Vector2(p.x*unit,p.y*unit));
    const buf=batch(polygon[0].x,polygon[0].y,'water');
    for(const ids of T.ShapeUtils.triangulateShape(polygon,[]))buf.triangle(...ids.map(i=>[polygon[i].x,-.045,polygon[i].y]),'#fff');
  }
  function landmark(b) {
    const shape=b.shape,x=(b.x+b.w/2)*unit,z=(b.y+b.h/2)*unit;
    const nominal={spire:160,office:266,museum:13,datalab:45,twist:76,dome:14,construction:90,memorial:12,cityhall:16,mall:19};
    const tall=shape==='construction'?91:Math.max(nominal[shape]??5,b.elevation);
    const sy=tall/(nominal[shape]??tall),w=b.w*unit,d=b.h*unit;
    const batches=new Map();
    const replacement=['office','museum','dome'].includes(shape);
    if(replacement){
      const pad=new T.Mesh(new T.BoxGeometry(w*1.10,.42,d*1.10),
        new T.MeshStandardMaterial({color:shape==='office'?'#859378':'#9fa39c',roughness:.94}));
      pad.position.set(x,-.20,z);pad.receiveShadow=true;replacements.add(pad);
    }
    const instance=(kind,geo,tint,a,y,c,ww,h,dd,turn=0,rx=0,rz=0)=>{
      const k=kind+'/'+geo;
      if(!batches.has(k))batches.set(k,[]);
      const elevation=n=>n<=6?n:6+(n-6)*sy;
      const low=elevation(y-h/2),high=elevation(y+h/2);
      batches.get(k).push([tint,a,(low+high)/2,c,ww,high-low,dd,turn,rx,rz]);
    };
    const block=(kind,tint,a,y,c,ww,h,dd,turn=0)=>instance(kind,'box',tint,a,y,c,ww,h,dd,turn);
    const pole=(kind,tint,a,y,c,ww,h)=>instance(kind,'cylinder',tint,a,y,c,ww,h,ww);
    if(!buildLandmark(b,{x,z,w,d,instance,block,pole}))return false;
    if(shape==='mall'){
      const h=12,y0=.04,y1=y0+h,w0=w*.943,d0=d*.914;
      for(const side of [-1,1]){
        const zz=z+side*d0/2,xx=x+side*w0/2,m=batch(x,z,'mall');
        textWall(m,[x-w0/2,y0,zz],[x+w0/2,y0,zz],[x+w0/2,y1,zz],[x-w0/2,y1,zz],
          0,side,'#fff',w0/(h*2),1);
        textWall(m,[xx,y0,z-side*d0/2],[xx,y0,z+side*d0/2],[xx,y1,z+side*d0/2],[xx,y1,z-side*d0/2],
          side,0,'#fff',d0/(h*2),1);
      }
    }
    for(const [k,items] of batches){
      const [kind,geo]=k.split('/');
      const mesh=new T.InstancedMesh(shapes[geo],materials[kind],items.length);
      const mat=materials[kind];
      if(mat.vertexColors===true){ // Instanced colors are supplied independently of the shared wall buffers.
        mesh.material=mat.clone();mesh.material.vertexColors=false;
      }
      items.forEach(([tint,a,y,c,ww,h,dd,turn,rx,rz],i)=>{
        matrix.position.set(a,y,c);matrix.rotation.set(rx,turn,rz);matrix.scale.set(ww,h,dd);matrix.updateMatrix();
        mesh.setMatrixAt(i,matrix.matrix);mesh.setColorAt(i,color.set(tint));
      });
      mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=shape!=='spire'&&shape!=='twist';
      (replacement?replacements:group).add(mesh);
    }
    return true;
  }
  function paveFront(ax,az,bx,bz,nx,nz,length,maxDepth=10) {
    const mx=(ax+bx)/2,mz=(az+bz)/2;
    for(let d=.5;d<=maxDepth;d+=.25){
      if(!roadAt((mx+nx*d)/unit,(mz+nz*d)/unit,-.25/unit))continue;
      const edge=Math.max(.15,d-.37);
      batch(mx,mz,'paving').quad([ax,.047,az],[bx,.047,bz],
        [bx+nx*edge,.047,bz+nz*edge],[ax+nx*edge,.047,az+nz*edge],'#e7dfd1',length/3,edge/3);
      break;
    }
  }
  const streetBands=new Map();
  function storefrontAt(x,z){
    const ix=Math.floor(x/16),iz=Math.floor(z/16),used=new Set();
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      for(const neighbor of streetBands.get((ix+dx)+','+(iz+dz))??[]){
        if(Math.hypot(neighbor.x-x,neighbor.z-z)<14)used.add(neighbor.key);
      }
    }
    const near=(id,radius)=>locations.some(site=>site.id===id&&Math.hypot(site.x*unit-x,site.y*unit-z)<radius);
    const options=near('night_market',180)?'gh':near('home',220)||near('temple',220)?'abcdefkl':'abcdef';
    const seed=(Math.floor(x/7)+Math.floor(z/5))%options.length;
    let key=options[seed];
    for(let i=0;i<options.length;i++){
      if(!used.has(key))break;
      key=options[(seed+i+1)%options.length];
    }
    const tile=ix+','+iz;
    if(!streetBands.has(tile))streetBands.set(tile,[]);
    streetBands.get(tile).push({x,z,key});
    return 'shop'+key;
  }
  for(const b of buildings) {
    const localShape=historicFootprints.get(b.osmId);
    if((b.shape||localShape) && landmark(localShape?{...b,shape:localShape}:b))continue;
    const x=(b.x+b.w/2)*unit,z=(b.y+b.h/2)*unit;
    const points=b.polygon.map(p=>new T.Vector2(p.x*unit,p.y*unit));
    const h=Math.max(3,Math.min(198,b.elevation)),roof=batch(x,z,b.modern?'roof':'roofTop');
    for(const face of T.ShapeUtils.triangulateShape(points,[])){
      const corners=face.slice().reverse().map(i=>points[i]);
      roof.triangle(...corners.map(p=>[p.x,h,p.y]),'#c7c1b8',
        ...corners.map(p=>[(p.x-b.x*unit)/(b.w*unit),(p.y-b.y*unit)/(b.h*unit)]));
    }
    const facadeVariant=Math.min(2,Math.floor(hash(b.osmId,7)*3));
    const upper=batch(x,z,(b.modern?['new','towerB','towerC']:['old','oldB','oldC'])[facadeVariant]);
    const [baseW,baseH]=b.modern?[[18,18.75],[18,18.75],[12,11.25]][facadeVariant]:[5.2,5.2];
    const jitter=.85+.3*hash(b.osmId,11),tileWidth=baseW*jitter,tileHeight=baseH*(.94+.12*hash(b.osmId,12));
    const uOffset=hash(b.osmId,13),mirror=hash(b.osmId,17)>.5?-1:1;
    const faceKinds=[];
    const podium=Math.min(3.5,h-.16);
    const tint=new T.Color(b.color).lerp(new T.Color('#ebe6dc'),.68);
    if(b.modern)tint.offsetHSL(0,0,(hash(b.osmId,19)-.5)*.1);
    else tint.lerp(new T.Color(wallSwatches[Math.floor(hash(b.osmId,23)*wallSwatches.length)]),.28+.3*hash(b.osmId,29))
      .offsetHSL((hash(b.osmId,31)-.5)*.03,0,(hash(b.osmId,37)-.5)*.14);
    let frontage=null;
    const winding=Math.sign(points.reduce((sum,p,i)=>{
      const c=points[(i+1)%points.length];
      return sum+p.x*c.y-c.x*p.y;
    },0))||1;
    for(let i=0;i<points.length;i++){
      const a=points[i],c=points[(i+1)%points.length],length=a.distanceTo(c);
      const p=(v,y)=>[v.x,y,v.y];
      const mx=(a.x+c.x)/2,mz=(a.y+c.y)/2,streetFace=roadAt(mx/unit,mz/unit,-72);
      const storefront=batch(x,z,b.modern?'new':'shop');
      if(length<.01)continue;
      const nx=(c.y-a.y)/length,nz=(a.x-c.x)/length;
      if(b.modern)storefront.quad(p(a,0),p(c,0),p(c,podium),p(a,podium),tint,length/tileWidth,podium/tileHeight);
      else textWall(storefront,p(a,0),p(c,0),p(c,podium),p(a,podium),nx*winding,nz*winding,tint,length/4.2,1,'osm');
      if(streetFace&&length>1){
        const sign=winding;
        const shift=new T.Vector2(nx*.024*sign,nz*.024*sign);
        const left=a.clone().add(shift),right=c.clone().add(shift);
        const beltHeight=b.modern?4.7:6.8,top=Math.min(h-.02,beltHeight);
        // Every street face is cut into shopfront units, each picking its own sign.
        const units=b.modern?1:Math.max(1,Math.round(length/6.5));
        for(let k=0;k<units;k++){
          const l0=left.clone().lerp(right,k/units),r0=left.clone().lerp(right,(k+1)/units);
          const kind=b.modern?['shopi','shopj'][(b.osmId+i+k)%2]:storefrontAt((l0.x+r0.x)/2,(l0.y+r0.y)/2);
          faceKinds[i]??=kind;
          const uLen=length/units/(beltHeight*2);
          textWall(batch(x,z,kind),p(l0,.015),p(r0,.015),p(r0,top),p(l0,top),
            nx*sign,nz*sign,'#fff',units>1?uLen:length/(beltHeight*2),top/beltHeight,'osm',
            units>1?hash(b.osmId+i*7,k+5)*Math.max(0,1-uLen):0);
        }
        if(!b.modern)paveFront(a.x,a.y,c.x,c.y,nx*sign,nz*sign,length);

      }
      upper.quad(p(a,podium),p(c,podium),p(c,h),p(a,h),tint,mirror*length/tileWidth,(h-podium)/tileHeight,
        mirror>0?uOffset:uOffset+length/tileWidth);
      if(length>1&&h>6){
        // Dark plinth, parapet cap and storey bands break up the flat wall.
        const out=winding*.06,band=batch(x,z,'curb'),o=new T.Vector2(nx*out,nz*out);
        const ring=(y0,y1,tintBand,push=1)=>band.quad(p(a.clone().addScaledVector(o,push),y0),p(c.clone().addScaledVector(o,push),y0),
          p(c.clone().addScaledVector(o,push),y1),p(a.clone().addScaledVector(o,push),y1),tintBand,1,1);
        if(!streetFace)ring(0,.25,'#6b665e');
        ring(h-.5,h,'#bdb7aa',1.4);
        if(!b.modern)for(let y=podium+34;y<h-5;y+=34)ring(y,y+.32,'#c9c2b2');
        if(!b.modern&&h>12&&length>5){
          // Air-conditioner condensers and balcony slabs, only built near the camera.
          const count=Math.floor(hash(b.osmId+i,41)*3);
          for(let k=0;k<count;k++){
            const t=.15+.7*hash(b.osmId+i,43+k),floor=1+Math.floor(hash(b.osmId+i,47+k)*Math.min(7,(h-podium-1.5)/3.4));
            const yy=podium+floor*3.4+.8,turnAngle=-Math.atan2(c.y-a.y,c.x-a.x);
            const px=a.x+(c.x-a.x)*t+nx*winding*.2,pz=a.y+(c.y-a.y)*t+nz*winding*.2;
            if(hash(b.osmId+i,53+k)>.4)instance('metal','box','#a7a9a6',px,yy,pz,.7,.5,.3,turnAngle);
            else{
              instance('concrete','box','#b9b4a8',px+nx*winding*.3,yy-.55,pz+nz*winding*.3,1.2,.1,.6,turnAngle);
              instance('metal','box','#5d605f',px+nx*winding*.58,yy-.1,pz+nz*winding*.58,1.2,.9,.04,turnAngle);
            }
          }
        }
      }
      if((!b.modern&&(b.osmId%3!==0||h>50))||length<5||length<=(frontage?.length??0))continue;
      if(streetFace){
        const nx=(c.y-a.y)/length,nz=(a.x-c.x)/length;
        const side=(mx-x)*nx+(mz-z)*nz<0?-1:1;
        frontage={a,c,length,face:[side*nx,side*nz],kind:faceKinds[i]??(b.modern?'shopi':'shopa')};
      }
    }
    if(frontage){
      const storefrontSign=(...args)=>{
        const mark=sign(...args);
        if(mark.userData.vertical)mark.userData.suppressWith=materials[frontage.kind];
      };
      placeFrontage(b,frontage.a,frontage.c,frontage.face,{instance,sign:storefrontSign});
      if(b.modern){
        const {a,c,face,length}=frontage,height=Math.min(4.9,h-.05),width=Math.min(length,37);
        const dx=(c.x-a.x)/length,dz=(c.y-a.y)/length,[nx,nz]=face;
        const [lx,lz]=[a.x+nx*.098,a.y+nz*.098],rx=lx+dx*width,rz=lz+dz*width;
        const centerX=(lx+rx)/2,centerZ=(lz+rz)/2;
        const normal=(dx*nz-dz*nx)>0;
        const left=normal?[lx,lz]:[rx,rz],right=normal?[rx,rz]:[lx,lz];
        textWall(batch(centerX,centerZ,'mall'),[left[0],.1,left[1]],[right[0],.1,right[1]],
          [right[0],height,right[1]],[left[0],height,left[1]],nx,nz,'#e8e5dc',width/10,.52,'osm');
        const angle=-Math.atan2(dz,dx);
        if(!roadAt((centerX+nx*.92)/unit,(centerZ+nz*.92)/unit,0)){
          instance('metal','box','#8c9691',centerX+nx*.89,height-.39,centerZ+nz*.89,width,.16,1.79,angle);
          instance('concrete','box','#c4beb0',centerX+nx*.76,.033,centerZ+nz*.76,width,.066,1.70,angle);
        }
      }

      if(!b.modern){
        const a=frontage.a,c=frontage.c,n=frontage.face;
        const xx=(a.x+c.x)/2+n[0]*2.3,zz=(a.y+c.y)/2+n[1]*2.3;
        instance('reflection','plane','#ffc78e',xx,.085,zz,Math.min(frontage.length,10),5.5,1,
          -Math.atan2(c.y-a.y,c.x-a.x),-Math.PI/2);
      }
      placeRoof(b,x,z,instance);
    }
  }
  for(const {x,z,width,depth,height,housing,civic,tree,lot,tin,setback=0,heading=0,streetSide,shop,street} of urbanInfill()){
    const ux=Math.cos(heading),uz=Math.sin(heading);
    const p=(dx,dy,h)=>[x+ux*dx*width/2-uz*dy*depth/2,h,z+uz*dx*width/2+ux*dy*depth/2];
    const seed=Math.round(x*31+z);
    const groundKind=civic?'paving':lot==='parking'?'paving':lot==='fence'||lot==='bare'?'earth':'park';
    const groundTint=civic?'#a39f93':lot==='parking'?'#8d8a84':lot==='fence'||lot==='bare'?'#8c8266':'#738759';
    batch(x,z,groundKind).quad(p(-1,-1,-.083),p(1,-1,-.083),p(1,1,-.083),p(-1,1,-.083),groundTint,width/3,depth/3);
    if(housing){
      const walls=batch(x,z,civic?'new':'old'),roof=batch(x,z,'roofTop');
      const top=tin?Math.min(height,5.4):height,cut=setback?top-setback*3.2:top;
      const base=new T.Color(wallSwatches[Math.floor(hash(seed)*wallSwatches.length)]).lerp(new T.Color('#c1b49e'),.45);
      const tintA=base.clone().offsetHSL(0,0,(hash(seed,3)-.5)*.1),tintB=tintA.clone().multiplyScalar(.93);
      const scale=civic?18:5.2*(.88+.24*hash(seed,5)),vscale=civic?18.75:4.4;
      const shell=(sx,sy,off,y0,y1,u0)=>{
        const q=(dx,dy,h)=>p(dx*sx,dy*sy+off,h);
        for(const side of [-1,1]){
          walls.quad(q(-1,side,y0),q(1,side,y0),q(1,side,y1),q(-1,side,y1),tintA,width*sx/scale,(y1-y0)/vscale,u0);
          walls.quad(q(side,-1,y0),q(side,1,y0),q(side,1,y1),q(side,-1,y1),tintB,depth*sy/scale,(y1-y0)/vscale,u0);
        }
        roof.quad(q(-1,-1,y1),q(1,-1,y1),q(1,1,y1),q(-1,1,y1),tin?'#7f8d93':'#9d9181');
      };
      shell(1,1,0,0,cut,hash(seed,7));
      if(setback)shell(.78,.75,-(streetSide??0)*.25,cut,top,hash(seed,8));
      if(street){
        const y=streetSide*1.004;
        textWall(batch(x,z,'shop'),p(-1,y,.02),p(1,y,.02),p(1,y,3.6),p(-1,y,3.6),
          -uz*streetSide,ux*streetSide,'#fff',width/7,1,'infill');
        const left=p(-1,y*1.015,.025),right=p(1,y*1.015,.025),nx=-uz*streetSide,nz=ux*streetSide;
        const sections=Math.max(1,Math.round(width/6.5));
        for(let k=0;k<sections;k++){
          const lerp=t=>left.map((v,i)=>v+(right[i]-v)*t),l0=lerp(k/sections),r0=lerp((k+1)/sections);
          const kind='shop'+'abcdefghijkl'[Math.floor(hash(shop,seed+k*17+streetSide)*12)];
          const uLen=width/sections/12;
          textWall(batch(x,z,kind),l0,r0,[r0[0],5.2,r0[2]],[l0[0],5.2,l0[2]],nx,nz,'#fff',
            sections>1?uLen:width/12,.82,'infill',sections>1?hash(seed,k+60)*Math.max(0,1-uLen):0);
        }
        if(!civic)paveFront(left[0],left[2],right[0],right[2],nx,nz,width,4.0);
        const [cx,,cz]=p(0,streetSide*1.17,0);
        instance('metal','box','#a39984',cx,2.93,cz,width,.38,1.12,-heading);
        instance('glass','box','#8b9c90',cx,2.71,cz,width,.24,.13,-heading);
        for(const side of [-.8,-.27,.27,.8]){
          const [colX,,colZ]=p(side,streetSide*1.17,0);
          instance('concrete','box','#bdb7a9',colX,1.4,colZ,.32,2.8,.32,-heading);
        }
      }
    }else if(lot==='parking'){
      for(let k=0;k<=5;k++){
        const dx=-1+2*k/5;
        batch(x,z,'line').quad(p(dx-.012,-.85,-.07),p(dx+.012,-.85,-.07),p(dx+.012,.85,-.07),p(dx-.012,.85,-.07),'#e9e4d2');
      }
      for(let k=0;k<5;k++){
        const roll=hash(seed,k+70);
        if(roll>.62)continue;
        const [cx,,cz]=p(-1+(2*k+1)/5,.15,0),paint=['#c9ccd0','#2f3236','#9a2e2e','#e8e6df','#3f5b7a'][Math.floor(roll*8)%5];
        instance('metal','box',paint,cx,.55,cz,4.3,.7,1.75,-heading+Math.PI/2);
        instance('dark','box','#33383d',cx,1.15,cz,2.2,.5,1.55,-heading+Math.PI/2);
      }
      const [sx,,sz]=p(.9,-.75,0);
      instance('metal','box','#5d6d6a',sx,1.2,sz,.1,2.4,.1,0);
    }else if(lot==='fence'){
      const wallTint='#8aa29a';
      instance('metal','box',wallTint,...[p(0,-1,0)[0],.95,p(0,-1,0)[2]],width,1.9,.08,-heading);
      instance('metal','box',wallTint,...[p(0,1,0)[0],.95,p(0,1,0)[2]],width,1.9,.08,-heading);
      instance('metal','box',wallTint,...[p(-1,0,0)[0],.95,p(-1,0,0)[2]],.08,1.9,depth,-heading);
      instance('metal','box',wallTint,...[p(1,0,0)[0],.95,p(1,0,0)[2]],.08,1.9,depth,-heading);
      const [mx,,mz]=p(.2,.1,0);
      instance('concrete','box','#a9a396',mx,.4,mz,3.2,.8,2.4,-heading);
    }else if(tree||lot==='park'){
      placeTree(instance,x,z,seed,.32);
      if(lot==='park'||civic){
        const [tx,,tz]=p(-.55,.5,0),[ux2,,uz2]=p(.5,-.5,0);
        placeTree(instance,tx,tz,seed+5,.26);
        if(hash(seed,9)>.4)placeTree(instance,ux2,uz2,seed+9,.24);
      }
      if((civic||lot==='park')&&width>8&&depth>6){
        const [bx,,bz]=p(0,.62,0),[px,,pz]=p(.58,-.62,0);
        instance('metal','box','#81634d',bx,.48,bz,2.1,.12,.48,-heading);
        for(const offset of [-.61,.61]){
          instance('metal','box','#615e56',bx+ux*offset,.23,bz+uz*offset,.11,.46,.41,-heading);
        }
        if(civic){
          instance('concrete','box','#b8ad9a',px,.24,pz,1.72,.48,.92,-heading);
          instance('grass','crown','#987467',px,.48,pz,1.60,.44,.85,-heading);
        }
      }
    }
  }
  const collisionProps=[],parkedScooters=[];
  placeStreetLife({instance,paint:strip,roadMark:addRoadMark,sign,
    lampGlow:(x,y,z)=>{
      const sprite=new T.Sprite(new T.SpriteMaterial({map:glow,color:'#ffd797',transparent:true,depthWrite:false,
        blending:T.AdditiveBlending,opacity:0}));
      sprite.position.set(x,y,z);sprite.scale.set(2.8,2.8,1);
      group.add(sprite);lampHalos.push(sprite);
      const pool=new T.Mesh(plane,decalMaterial);
      pool.rotation.x=-Math.PI/2;pool.position.set(x,.09,z);pool.scale.set(9,9,1);pool.visible=false;
      group.add(pool);lampDecals.push(pool);
    },
    signal:(crossing,x,z)=>{
      const faces=[];
      for(const [y,tint] of [[4.46,'#ef8267'],[3.99,'#79c997']]){
        const bulb=new T.Mesh(box,new T.MeshBasicMaterial({color:tint}));
        bulb.position.set(x-.12*crossing.dx,y,z-.12*crossing.dy);
        bulb.rotation.y=Math.atan2(-crossing.dx,-crossing.dy);bulb.scale.set(.15,.12,.014);
        bulb.userData.base=new T.Color(tint);
        group.add(bulb);faces.push(bulb);
      }
      signalFaces.push({crossing,faces,x,z});
    },
    obstacle:(x,z,r,top)=>collisionProps.push({x:x/unit,y:z/unit,r:r/unit,top}),
    parked:(x,z,heading)=>{parkedScooters.push({x,z,heading});return true;},
  });
  for(const p of locations){
    placeEntrance(p,{instance,sign,windowBand:(a,b,h)=>{
      const m=batch((a[0]+b[0])*.5,(a[1]+b[1])*.5,'mall');
      textWall(m,[a[0],.10,a[1]],[b[0],.10,b[1]],[b[0],h,b[1]],[a[0],h,a[1]],
        -Math.cos(p.viewHeading),-Math.sin(p.viewHeading),'#fff',1,.49);
    }});
    if(p.shape!=='temple')continue;
    const a=p.viewHeading,x=p.x*unit+Math.cos(a)*4.12,z=p.y*unit+Math.sin(a)*4.12;
    const dx=Math.sin(a)*2.56,dz=-Math.cos(a)*2.56;
    textWall(batch(x,z,'temple'),[x-dx,.36,z-dz],[x+dx,.36,z+dz],
      [x+dx,2.92,z+dz],[x-dx,2.92,z-dz],-Math.cos(a),-Math.sin(a),'#fff',1,1);
  }
  for(const c of chunks.values()){
    for(const [key,items] of c.instances){
      const [kind,shape]=key.split('/');
      if(!instanceMaterials.has(kind)){
        const material=materials[kind];
        if(material.vertexColors){
          const copy=material.clone();
          copy.vertexColors=false;
          instanceMaterials.set(kind,copy);
        }else instanceMaterials.set(kind,material);
      }
      const mesh=new T.InstancedMesh(shapes[shape],instanceMaterials.get(kind),items.length);
      items.forEach(([tint,x,y,z,w,h,d,turn,rx,rz],i)=>{
        matrix.position.set(x,y,z);matrix.rotation.set(rx,turn,rz);matrix.scale.set(w,h,d);matrix.updateMatrix();
        mesh.setMatrixAt(i,matrix.matrix);mesh.setColorAt(i,color.set(tint));
      });
      mesh.computeBoundingSphere();mesh.receiveShadow=kind!=='reflection';
      c.detail.add(mesh);
    }
    c.group.add(c.detail);
    c.instances.clear();
    for(const [kind,batch] of c.meshes){
      const mesh=batch.make();
      mesh.receiveShadow=true;
      mesh.castShadow=['old','shop','new','office','roof'].includes(kind);
      c.group.add(mesh);
    }
    group.add(c.group);
    c.meshes.clear();
  }
  function sign(name,x,y,z,rotation,tint='#233c57',large=false,w=large?6:3.2,h=large?1.2:.69) {
    const vertical=h>w,key=name+'/'+tint+'/'+vertical;
    if(!signCache.has(key)){
      const texture=canvasTexture(doc,vertical?96:512,vertical?256:110,(ctx,iw,ih)=>{
        ctx.fillStyle=tint;ctx.fillRect(0,0,iw,ih);
        ctx.strokeStyle='#eddfc4';ctx.lineWidth=4;ctx.strokeRect(6,6,iw-12,ih-12);
        ctx.font=vertical?'700 43px system-ui':'700 55px system-ui';
        ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillStyle='#fff4d8';
        if(vertical)Array.from(name).forEach((char,i)=>ctx.fillText(char,iw/2,(i+1)*ih/(name.length+1),iw*.83));
        else ctx.fillText(name,iw*.5,ih*.51,iw-28);
      });
      texture.anisotropy=anisotropy;
      signCache.set(key,new T.MeshBasicMaterial({map:texture,side:T.FrontSide}));
    }
    const mark=new T.Mesh(plane,signCache.get(key));
    mark.position.set(x,y,z);mark.rotation.y=rotation;mark.scale.set(w,h,1);
    mark.userData.vertical=vertical;
    group.add(mark);signs.push(mark);
    if(vertical){
      const reflection=new T.Mesh(plane,new T.MeshBasicMaterial({map:signCache.get(key).map,
        transparent:true,side:T.DoubleSide,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
      reflection.position.set(x,.081,z);
      reflection.rotation.set(-Math.PI/2,0,-rotation);
      reflection.scale.set(w,-h*1.8,1);
      reflection.visible=false;group.add(reflection);mark.userData.reflection=reflection;
    }
    return mark;
  }
  const loadedAds=[],adMaterials=new Map();
  function billboard(id,x,y,z,rotation,w,h){
    let material=adMaterials.get(id);
    if(!material){
      material=new T.MeshStandardMaterial({color:'#9d9b8e',metalness:.15,roughness:.43,side:T.FrontSide});
      adMaterials.set(id,material);
      loadAd(id).then(texture=>{
        if(!texture)return;
        material.map=material.emissiveMap=texture;
        material.color.set('#fff');material.emissive.set('#fff');material.needsUpdate=true;
        loadedAds.push('ad_'+id);
      });
    }
    const panel=new T.Mesh(plane,material);
    panel.position.set(x,y,z);panel.rotation.y=rotation;panel.scale.set(w,h,1);
    group.add(panel);signs.push(panel);
  }
  for(const [i,id] of ['department','mrt','office','client_hq','night_market','convenience','studio','datalab'].entries()){
    const site=locations.find(p=>p.id===id),a=site.viewHeading;
    const side=i===0?-4.0:i===1?2.65:-4.9,depth=i<2?4.4:3.4;
    const x=(site.x*unit)+Math.sin(a)*side+Math.cos(a)*depth;
    const z=(site.y*unit)-Math.cos(a)*side+Math.sin(a)*depth;
    const wide=i>=4;
    billboard(i+1,x,wide?4.9:2.14,z,-Math.PI/2-a,wide?5.4:2.12,wide?2.7:2.12);
  }
  const bayPoster=xinyiBusBay(8.7,1.71);
  billboard(3,bayPoster.x,1.40,bayPoster.z,Math.PI-bayPoster.heading,1.22,1.48);
  const named=new Set();
  for(const way of ways){
    if(!way.name||named.has(way.name)||!['primary','secondary','tertiary'].includes(way.kind))continue;
    named.add(way.name);
    const p=way.points[Math.floor(way.points.length/2)];
    sign(way.name,p.x*unit,4.0,p.y*unit,0,'#235d46');
    sign(way.name,p.x*unit,4.0,p.y*unit-.06,Math.PI,'#235d46');
  }
  return {
    group,replacements,updateOfficeDoor,collisionProps,parkedScooters,glow,loadedTextures,loadedAds,textUv,
    update(x,z,night,rain,quality,clock,lamps=night,aerial=false,hour){
      materials.road.roughness=rain?.19:.94;
      materials.road.metalness=rain?.27:0;
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
      for(const chunk of chunks.values()){
        const d=Math.hypot(x-chunk.x,z-chunk.z);
        chunk.group.visible=d<(aerial?535:quality===2?340:265);
        chunk.detail.visible=!aerial&&d<(quality===2?117:88);
        const shadow=d<77;
        for(const mesh of chunk.group.children)mesh.castShadow=shadow&&['old','shop','new','office','roof'].some(k=>materials[k]===mesh.material);
      }
      const flashing=trafficFlashing(hour),flashOn=clock%1<.5;
      for(const item of signalFaces){
        const show=Math.hypot(item.x-x,item.z-z)<90;
        const c=item.crossing,green=trafficGreen(Math.abs(c.dx)>.8,clock,c.x,c.y,hour);
        for(const [i,face] of item.faces.entries()){
          face.visible=show;
          if(!show)continue;
          if(flashing&&i===0)face.material.color.set('#ffb638').multiplyScalar(flashOn?1.45:.12);
          else face.material.color.copy(face.userData.base).multiplyScalar(!flashing&&Boolean(i)===green?1.4:.16);
        }
      }
      for(const sign of signs){
        sign.visible=!sign.userData.suppressWith?.userData.authored&&
          Math.hypot(sign.position.x-x,sign.position.z-z)<(sign.userData.vertical?49:85);
        const reflection=sign.userData.reflection;
        if(reflection){reflection.visible=sign.visible&&rain&&night>.1;reflection.material.opacity=night*.22;}
      }
    },
  };
}
