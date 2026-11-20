import {trafficGreen} from '../navigation.js';
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

function meshBuffers(material) {
  const v=[],uv=[],rgb=[];
  function triangle(a,b,c,tint,ta=[0,0],tb=[0,1],tc=[1,0]) {
    v.push(...a,...b,...c);uv.push(...ta,...tb,...tc);
    color.set(tint);
    for(let i=0;i<3;i++)rgb.push(color.r,color.g,color.b);
  }
  function quad(a,b,c,d,tint,u=1,w=1) {
    triangle(a,b,c,tint,[0,0],[u,0],[u,w]);triangle(a,c,d,tint,[0,0],[u,w],[0,w]);
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
  const replacements=new T.Group();
  scene.add(group,replacements);
  const glow=canvasTexture(doc,64,64,ctx=>{
    const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'#fff');g.addColorStop(1,'#ffffff00');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  });
  const textUv={total:0,osm:0,infill:0,other:0,failed:0};
  function textWall(buffer,a,b,c,d,nx,nz,tint,u,v,source='other'){
    const direction=(b[0]-a[0])*nz-(b[2]-a[2])*nx;
    const face=direction<0?[b,a,d,c]:[a,b,c,d];
    const du=(face[1][0]-face[0][0])*nz-(face[1][2]-face[0][2])*nx;
    textUv.total++;textUv[source]++;
    if(!(du>0&&u>0))textUv.failed++;
    buffer.quad(...face,tint,u,v);
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
      try{Object.assign(material,surfaceMaps(doc,texture.image,anisotropy,['new','office','towerB','towerC'].includes(kind)?.42:1.6));}catch{}
      if(['new','office','towerB','towerC'].includes(kind)){material.metalness=.32;material.roughness=.47;}
      material.color.set(kind==='road'?'#b3a8a0':kind==='paving'?'#d1c7b7':'#fff');
      material.userData.authored=variant;
      material.visible=true;
      material.needsUpdate=true;
      loadedTextures.push(tex);
      if(!variant)for(const [alias,[fallback]] of Object.entries(variants)){
        if(fallback!==kind||materials[alias].userData.authored||/^shop[a-l]$/.test(alias))continue;
        for(const name of ['map','normalMap','roughnessMap'])materials[alias][name]=material[name];
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
  materials.lobbyGlass=new T.MeshStandardMaterial({metalness:.2,roughness:.16,transparent:true,opacity:.40,depthWrite:false});
  materials.reflection=new T.MeshBasicMaterial({map:glow,transparent:true,depthWrite:false,opacity:0,blending:T.AdditiveBlending});
  const lampHalos=[],signalFaces=[],roadMarkMaterials=new Map(),chunks=new Map(),signs=[],signCache=new Map(),instanceMaterials=new Map();
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
  const cover=canvasTexture(doc,512,512,(ctx,w,h)=>{
    const designated=toWorld(25.038,121.566);
    for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
      const gx=x/w*width,gy=y/h*height;
      const civic=Math.hypot(gx-designated.x,gy-designated.y)*unit<550;
      const strip=roadAt(gx,gy,-92);
      const n=(x*13+y*47+(x*y)%29)%18;
      ctx.fillStyle=civic||strip?`rgb(${141+n} ${135+n} ${118+n})`:
        `rgb(${98+n} ${111+n} ${78+n})`;
      ctx.fillRect(x,h-y-2,2,2);
    }
  });
  cover.anisotropy=anisotropy;
  const soil=new T.Mesh(new T.PlaneGeometry(width*unit,height*unit),new T.MeshStandardMaterial({map:cover,roughness:1}));
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
        strip(a,b,.16,.028,'drain',side*(span/2-.10),'#999');
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
    if(d*unit>17&&way.name&&way.id%3===0){
      const pt=at(d*.56),x=pt[0]*unit,z=pt[1]*unit;
      const key=Math.floor(x/9)+','+Math.floor(z/9);
      if(!covers.has(key)){
        covers.add(key);
        instance('metal','cylinder','#646465',x,.033,z,.70,.015,.70);
        instance('metal','cylinder','#777677',x,.043,z,.57,.008,.57);
        for(const off of [-.17,-.08,.01,.10,.19])instance('metal','box','#515356',x+off,.050,z,.023,.006,.41);
      }
      strip(at(d*.25),at(d*.43),.41,.029,'repair',span*.15,'#b6b2ae',.89);
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
      if(object.name==='基隆河')for(let i=1;i<pts.length;i++)strip([pts[i-1].x,pts[i-1].y],[pts[i].x,pts[i].y],riverWidthMeters,-.04,'water');
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
    const facadeVariant=b.osmId%3;
    const upper=batch(x,z,(b.modern?['new','towerB','towerC']:['old','oldB','oldC'])[facadeVariant]);
    const [tileWidth,tileHeight]=b.modern?[[18,18.75],[18,18.75],[12,11.25]][facadeVariant]:[5.2,5.2];
    const storeKind=b.modern?['shopi','shopj'][b.osmId%2]:storefrontAt(x,z);
    const podium=Math.min(3.5,h-.16);
    const tint=new T.Color(b.color).lerp(new T.Color('#ebe6dc'),.68);
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
        textWall(batch(x,z,storeKind),p(left,.015),p(right,.015),p(right,top),p(left,top),
          nx*sign,nz*sign,'#fff',length/(beltHeight*2),top/beltHeight,'osm');
        if(!b.modern)paveFront(a.x,a.y,c.x,c.y,nx*sign,nz*sign,length);

      }
      upper.quad(p(a,podium),p(c,podium),p(c,h),p(a,h),tint,length/tileWidth,(h-podium)/tileHeight);
      if((!b.modern&&(b.osmId%3!==0||h>50))||length<5||length<=(frontage?.length??0))continue;
      if(streetFace){
        const nx=(c.y-a.y)/length,nz=(a.x-c.x)/length;
        const side=(mx-x)*nx+(mz-z)*nz<0?-1:1;
        frontage={a,c,length,face:[side*nx,side*nz]};
      }
    }
    if(frontage){
      const storefrontSign=(...args)=>{
        const mark=sign(...args);
        if(mark.userData.vertical)mark.userData.suppressWith=materials[storeKind];
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
  for(const {x,z,width,depth,height,housing,civic,tree,heading=0,streetSide,shop,street} of urbanInfill()){
    const ux=Math.cos(heading),uz=Math.sin(heading);
    const p=(dx,dy,h)=>[x+ux*dx*width/2-uz*dy*depth/2,h,z+uz*dx*width/2+ux*dy*depth/2];
    batch(x,z,civic?'paving':'park').quad(p(-1,-1,-.083),p(1,-1,-.083),
      p(1,1,-.083),p(-1,1,-.083),civic?'#b3ab96':'#738759',width/3,depth/3);
    if(housing){
      const walls=batch(x,z,civic?'new':'old'),roof=batch(x,z,'roofTop'),h=height;
      for(const side of [-1,1]){
        walls.quad(p(-1,side,0),p(1,side,0),p(1,side,h),p(-1,side,h),
          '#c1b49e',width/(civic?18:5.2),h/(civic?18.75:4.4));
        walls.quad(p(side,-1,0),p(side,1,0),p(side,1,h),p(side,-1,h),
          '#b4a892',depth/(civic?18:5.2),h/(civic?18.75:4.4));
      }
      roof.quad(p(-1,-1,h),p(1,-1,h),p(1,1,h),p(-1,1,h),'#9d9181');
      if(street){
        const y=streetSide*1.004;
        textWall(batch(x,z,'shop'),p(-1,y,.02),p(1,y,.02),p(1,y,3.6),p(-1,y,3.6),
          -uz*streetSide,ux*streetSide,'#fff',width/7,1,'infill');
        const left=p(-1,y*1.015,.025),right=p(1,y*1.015,.025),nx=-uz*streetSide,nz=ux*streetSide;
        textWall(batch(x,z,'shop'+'abcdef'[shop]),left,right,
          p(1,y*1.015,5.2),p(-1,y*1.015,5.2),nx,nz,'#fff',width/12,.82,'infill');
        if(!civic)paveFront(left[0],left[2],right[0],right[2],nx,nz,width,4.0);
        const [cx,,cz]=p(0,streetSide*1.17,0);
        instance('metal','box','#a39984',cx,2.93,cz,width,.16,1.12,-heading);
        instance('glass','box','#8b9c90',cx,2.71,cz,width,.24,.13,-heading);
      }
    }else if(tree){
      placeTree(instance,x,z,Math.round(x*31+z),.32);
      if(civic&&width>8&&depth>6){
        const [bx,,bz]=p(0,.62,0),[px,,pz]=p(.58,-.62,0);
        instance('metal','box','#81634d',bx,.48,bz,2.1,.12,.48,-heading);
        for(const offset of [-.61,.61]){
          instance('metal','box','#615e56',bx+ux*offset,.23,bz+uz*offset,.11,.46,.41,-heading);
        }
        instance('concrete','box','#b8ad9a',px,.24,pz,1.72,.48,.92,-heading);
        instance('grass','crown','#987467',px,.48,pz,1.60,.44,.85,-heading);
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
    group,replacements,collisionProps,parkedScooters,glow,loadedTextures,loadedAds,textUv,
    update(x,z,night,rain,quality,clock,lamps=night,aerial=false){
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
      for(const material of signCache.values())material.color.setScalar(.9+lamps*1.25);
      for(const mat of adMaterials.values())mat.emissiveIntensity=lamps*1.25;
      for(const chunk of chunks.values()){
        const d=Math.hypot(x-chunk.x,z-chunk.z);
        chunk.group.visible=d<(aerial?535:quality===2?340:265);
        chunk.detail.visible=!aerial&&d<(quality===2?117:88);
        const shadow=d<77;
        for(const mesh of chunk.group.children)mesh.castShadow=shadow&&['old','shop','new','office','roof'].some(k=>materials[k]===mesh.material);
      }
      for(const item of signalFaces){
        const show=Math.hypot(item.x-x,item.z-z)<90;
        const c=item.crossing,green=trafficGreen(Math.abs(c.dx)>.8,clock,c.x,c.y);
        for(const [i,face] of item.faces.entries()){
          face.visible=show;
          face.material.color.copy(face.userData.base).multiplyScalar(Boolean(i)===green?1.4:.16);
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
