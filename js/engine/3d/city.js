import {canvasTexture,TextureLoader} from './city-primitives.js?v=9b45bc39';
export {canvasTexture} from './city-primitives.js?v=9b45bc39';
import * as T from '../vendor/three.module.min.js?v=9b45bc39';
import {trafficGreen} from '../navigation.js?v=9b45bc39';
import {buildLandmark} from './xinyi.js?v=9b45bc39';
import {buildings,civicWalkway,columns,columnNames,height,random,river,roads,rows,rowNames,width} from '../world.mjs?v=9b45bc39';

export const unit=.105;
const chunkSize=69;
const cube=new T.BoxGeometry(1,1,1);
const cylinder=new T.CylinderGeometry(.5,.5,1,8);
const crown=new T.IcosahedronGeometry(.59,1);
const pane=new T.PlaneGeometry(1,1);
const dome=new T.SphereGeometry(.5,28,12,0,Math.PI*2,0,Math.PI/2);
const dummy=new T.Object3D();
const tint=new T.Color();

function grit(doc) {
  const texture=canvasTexture(doc,128,128,(ctx,w,h)=>{
    const image=ctx.createImageData(w,h);
    for (let i=0;i<w*h;i++) {
      const grain=Math.floor(174+random(i)*59+(i%97===0?19:0));
      image.data.set([grain,grain,grain,255],i*4);
    }
    ctx.putImageData(image,0,0);
  });
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.anisotropy=4;
  return texture;
}
function glowTexture(doc) {
  return canvasTexture(doc,64,64,(ctx)=>{
    const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'#ffffffc8'); g.addColorStop(.24,'#ffffff57'); g.addColorStop(1,'#ffffff00');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  });
}
const shopNames=['牛肉麵','手搖茶','社區藥局','機車行','便當','五金','理髮','檳榔','早午餐','冰果室','洗衣','水電'];
const signPalette=['#d6a53f','#4fa286','#b93d36','#d67634','#4987ad','#b39e4d'];
function signAtlas(doc,names) {
  const columns=8,rows=Math.ceil(names.length/columns);
  const texture=canvasTexture(doc,columns*96*2,rows*192*2,(ctx)=>{
    ctx.scale(2,2); // 店家招牌：畫布放大兩倍，字比較清楚
    names.forEach((name,i)=>{
      const x=(i%columns)*96,y=Math.floor(i/columns)*192;
      ctx.fillStyle=signPalette[i%signPalette.length];
      ctx.fillRect(x,y,96,192);
      ctx.strokeStyle='#fff2cf';
      ctx.lineWidth=4;ctx.strokeRect(x+9,y+8,78,176);
      ctx.fillStyle=i%6===0||i%6===5?'#271e16':'#fff1d4';ctx.textAlign='center';ctx.textBaseline='middle';
      const step=Math.min(48,156/name.length);
      ctx.font=`900 ${Math.min(48,step*.94)}px system-ui`;
      [...name].forEach((char,j)=>ctx.fillText(char,x+48,y+96+(j-(name.length-1)/2)*step));
    });
  });
  // 開 mipmap：遠處的招牌不閃爍、不糊成一團
  texture.generateMipmaps=true;
  texture.minFilter=T.LinearMipmapLinearFilter;
  return {texture,columns,rows};
}
function terraceHeight(b) {
  if (b.tower) return 20+Math.floor(random(b.x)*5);
  if (b.id==='temple') return 6;
  if (b.id==='night_market') return 4;
  return 3.2+((b.floors??3)-1)*2.72;
}

export function createCity(scene,doc,maxAnisotropy=4) {
  const grain=grit(doc);
  grain.anisotropy=maxAnisotropy;
  const glow=glowTexture(doc);
  const chunks=new Map();
  const signalBatches=[];
  let signalTick=-1;
  const signNames=[...shopNames,...buildings.filter(b=>b.id).map(b=>b.name)];
  const atlas=signAtlas(doc,signNames);
  let facade=null,horizon=false;
  const materials={
    concrete:new T.MeshStandardMaterial({roughness:.92,map:grain}),
    dark:new T.MeshStandardMaterial({roughness:.83}),
    metal:new T.MeshStandardMaterial({roughness:.58,metalness:.28}),
    grass:new T.MeshStandardMaterial({roughness:1}),
    glass:new T.MeshStandardMaterial({roughness:.32,metalness:.18}),
    highglass:new T.MeshStandardMaterial({roughness:.49,metalness:.05,fog:false}),
    luminous:new T.MeshBasicMaterial(),
    signal:new T.MeshBasicMaterial(),
    towerLights:new T.MeshBasicMaterial({fog:false}),
    bulb:new T.MeshBasicMaterial(),
    signs:new T.MeshBasicMaterial({map:atlas.texture}),
    window:new T.MeshBasicMaterial(),
    wetStreak:new T.MeshBasicMaterial({map:glow,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}),
    halo:new T.MeshBasicMaterial({map:glow,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}),
    reflection:new T.MeshBasicMaterial({map:glow,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}),
  };
  const geometry={box:cube,cylinder,crown,plane:pane,dome};
  const textured={apartment:['tex_facade_apartment',9,8.2],shophouse:['tex_facade_shophouse',4.8,3.5],
    curtain:['tex_facade_glass',3,3.5],office:['tex_facade_office',4.5,3.5],pavers:['tex_sidewalk',2.6,2.6]};
  function useRepeats(material) {
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute vec2 textureRepeat;\n'+shader.vertexShader.replace(
        '#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv *= textureRepeat;\n#endif');
    };
  }
  for(const family of Object.keys(textured)) {
    const mat=new T.MeshStandardMaterial({roughness:.85,side:T.DoubleSide,visible:false});
    useRepeats(mat);
    materials[family]=mat;
  }
  const loadedTextures=[];
  function loadTexture(key,material,white=false) {
    const texURL=new URL('../../../assets/tex/'+key+'.webp',import.meta.url);
    const loader=new TextureLoader();
    loader.load(texURL.href,texture=>{
      texture.colorSpace=T.SRGBColorSpace;
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.anisotropy=maxAnisotropy;
      texture.minFilter=T.LinearMipmapLinearFilter;
      texture.generateMipmaps=true;
      material.map=texture;
      if(white) material.color.set('#ddd1c0');
      material.visible=true;
      material.needsUpdate=true;
      loadedTextures.push(key);
    },undefined,()=>{});
  }
  function instance(kind,shape,color,x,y,z,w,h,d,angle=0,rx=0,rz=0,sign=0) {
    if (facade) {
      const {cx,cz,cos,sin,angle:rotation}=facade;
      const dx=x-cx,dz=z-cz;
      x=cx+cos*dx+sin*dz; z=cz-sin*dx+cos*dz;
      angle+=rotation;
    }
    const key=horizon||`${Math.floor(x/chunkSize)},${Math.floor(z/chunkSize)}`;
    if (!chunks.has(key)) chunks.set(key,{x:Math.floor(x/chunkSize)*chunkSize+chunkSize/2,
      z:Math.floor(z/chunkSize)*chunkSize+chunkSize/2,parts:new Map(),horizon});
    const chunk=chunks.get(key);
    const family=kind+'/'+shape;
    if (!chunk.parts.has(family)) chunk.parts.set(family,[]);
    chunk.parts.get(family).push({color,x,y,z,w,h,d,angle,rx,rz,sign});
  }
  const block=(kind,color,x,y,z,w,h,d,a=0)=>instance(kind,'box',color,x,y,z,w,h,d,a);
  const pole=(kind,color,x,y,z,w,h)=>instance(kind,'cylinder',color,x,y,z,w,h,w);
  function road(x1,z1,x2,z2,span) {
    const x=(x1+x2)/2,z=(z1+z2)/2,w=Math.hypot(x2-x1,z2-z1),a=-Math.atan2(z2-z1,x2-x1);
    const side=Math.sin(a),across=Math.cos(a);
    // Split long streets into contiguous tiles with local bounding boxes and repeating UVs.
    const runs=Math.ceil(w/34);
    for (let i=0;i<runs;i++) {
      const local=(i+.5)*w/runs-w/2;
      const px=x+local*across,pz=z-local*side;
      const group=new T.Group();
      group.position.set(px,0,pz);group.rotation.y=a;
      const geo=new T.PlaneGeometry(w/runs+.006,span);
      geo.rotateX(-Math.PI/2);
      const uv=geo.attributes.uv;
      for (let j=0;j<uv.count;j++) uv.setXY(j,(uv.getX(j)-.5)*w/runs/3+local/3,uv.getY(j)*span/3);
      const roadMesh=new T.Mesh(geo,asphalt);
      roadMesh.position.y=.025;roadMesh.receiveShadow=true;
      group.add(roadMesh);
      scene.add(group);
    }
    for (const s of [-1,1]) {
      const offset=s*(span/2+.85);
      for (let i=0;i<runs;i++) {
        const local=(i+.5)*w/runs-w/2;
        const px=x+side*offset+local*across,pz=z+across*offset-local*side;
        block('concrete','#92877c',px,.18,pz,w/runs,.29,1.7,a);
        instance('pavers','plane','#ffffff',px,.329,pz,w/runs,1.7,1,a,-Math.PI/2);
      }
    }
    const joints=x1===x2?rows.map(y=>y*unit):z1===z2?columns.map(x=>x*unit):[];
    for (let d=3;d<w-3;d+=4) {
      const px=x1+d*across,pz=z1-d*side;
      if (joints.some(j=>Math.abs(j-(x1===x2?pz:px))<10)) continue;
      block('dark','#e0a75c',px,.043,pz,1.7,.02,.15,a);
      for (const s of [-1,1]) {
        const off=s*(span/2-.45);
        block('dark','#beb3a0',px+side*off,.042,pz+across*off,3.98,.018,.085,a);
      }
    }
  }

  const asphalt=new T.MeshStandardMaterial({color:'#625d60',roughness:.94,map:grain,metalness:.08,polygonOffset:true,polygonOffsetFactor:-1});
  const ground=new T.MeshStandardMaterial({color:'#81796b',roughness:1,map:grain});
  const riverMat=new T.MeshStandardMaterial({color:'#365d64',roughness:.29,metalness:.37});
  if(new URLSearchParams(doc.defaultView.location.search).get('textures')!=='0') {
    for(const [family,[key]] of Object.entries(textured)) loadTexture(key,materials[family]);
    loadTexture('tex_asphalt',asphalt);
  }
  function floor(x,z,w,d,material,y) {
    const plane=new T.Mesh(new T.PlaneGeometry(w,d),material);
    plane.geometry.rotateX(-Math.PI/2);
    if (material===ground) {
      const uv=plane.geometry.attributes.uv;
      for (let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w/3,uv.getY(i)*d/3);
    }
    plane.position.set(x,y,z);plane.receiveShadow=true;
    scene.add(plane);
  }
  const north=(river-85)*unit,south=(river+85)*unit;
  floor(width*unit/2,north/2,width*unit,north,ground,-.06);
  floor(width*unit/2,(south+height*unit)/2,width*unit,height*unit-south,ground,-.06);
  floor(width*unit/2,river*unit,width*unit,south-north,riverMat,-.36);
  for (const [ax,ay,bx,by,w] of roads) road(ax*unit,ay*unit,bx*unit,by*unit,w*unit);
  // A narrow visible deck masks the sidewalk overlap at each street intersection.
  for (const x0 of columns) for (const z0 of rows) {
    const x=x0*unit,z=z0*unit;
    block('dark','#424043',x,.37,z,17.5,.09,17.1);
    for (const a of [0,Math.PI/2]) for (const side of [-1,1]) for (let i=-4;i<=4;i++) {
      const dx=side*8.1,dz=i*1.33;
      block('dark','#d5cab7',x+dx*Math.cos(a)+dz*Math.sin(a),.43,z-dx*Math.sin(a)+dz*Math.cos(a),1.9,.02,.48,a);
    }
  }
  function paintArrow(x,z,heading) {
    const angle=Math.atan2(-heading[1],heading[0]),[dx,dz]=heading;
    block('dark','#e6dfce',x,.051,z,2.2,.025,.14,angle);
    for (const side of [-1,1]) {
      block('dark','#e6dfce',x+dx*.74-dz*side*.26,.051,z+dz*.74+dx*side*.26,.72,.025,.12,angle-side*.55);
    }
  }
  function wire(x,z,across) {
    const reach=17.7;
    for(const side of [-1,1]) {
      const px=x+(across?side*reach/2:0),pz=z+(across?0:side*reach/2);
      pole('concrete','#716c5e',px,3.81,pz,.27,7.62);
      block('metal','#55534d',px,7.39,pz,across?.27:1.32,.10,across?1.32:.27);
    }
    for(let lane=-1;lane<=1;lane++) {
      for(let j=0;j<8;j++) {
        const offset=(j+.5)*reach/8-reach/2,y=6.82+2.2*(offset/reach)**2;
        const slope=4.4*offset/reach**2;
        instance('metal','box','#413c38',x+(across?offset:lane*.54),y+(lane===0?.27:0),z+(across?lane*.54:offset),
          reach/8+.024,.027,.027,across?0:-Math.PI/2,0,Math.atan(slope));
      }
    }
  }
  for(const [i,x0] of columns.entries()) for(const [j,z0] of rows.entries()) {
    const x=x0*unit,z=z0*unit;
    for(const side of [-1,1]) {
      paintArrow(x+side*13,z-side*2.6,[-side,0]);
      paintArrow(x+side*2.6,z+side*13,[0,-side]);
      const qx=x+side*5.4,qz=z-side*5.2;
      for(const e of [-1,1]) {
        block('dark','#ebdfc5',qx+e*.95,.434,qz,.075,.022,1.8);
        block('dark','#ebdfc5',qx,.434,qz+e*.9,1.9,.022,.075);
      }
      const tx=x+side*7.71,tz=z+side*7.18;
      pole('metal','#625d53',tx,2.22,tz,.16,4.44);
      block('metal','#504b43',tx-side*1.05,4.39,tz,2.23,.09,.11);
      block('dark','#363633',tx-side*2.05,4.3,tz,.34,.74,.27);
      for(let k=0;k<3;k++) {
        instance('bulb','box','#351f1c',tx-side*2.05,4.55-k*.24,tz-side*.16,.18,.13,.06,0,0,0,(i*rows.length+j)*6+k);
        instance('bulb','box','#351f1c',tx-side*2.23,4.55-k*.24,tz-side*.025,.06,.13,.18,0,0,0,(i*rows.length+j)*6+k+3);
      }
    }
    wire(x-14,z,false);
    if((i+j)%2===0) wire(x,z+15,true);
  }

  function tree(x,z,seed) {
    const y=4.2+random(seed)*.98;
    pole('concrete','#674c37',x,y*.5,z,.33,y);
    for (let i=0;i<4;i++) {
      const px=x+(random(seed+i*3)-.5)*2.4,pz=z+(random(seed+21+i*3)-.5)*2.4;
      instance('grass','crown',['#425747','#526b47','#607654','#374f40'][i],px,y+.6+i*.29,pz,1.92,1.47,1.92,i);
    }
  }
  function light(x,z,color='#ffd39f',h=5.7) {
    pole('metal','#474849',x,h/2,z,.17,h);
    block('metal','#555752',x+.46,h,z,1.05,.12,.23);
    block('luminous',color,x+.87,h-.11,z,.34,.075,.25);
    instance('halo','plane',color,x+.87,h-.18,z,3.3,3.3,1);
    instance('reflection','plane',color,x+.87,.49,z,5.9,6.8,1,0,-Math.PI/2);
  }
  function horizontalStreet(x,z){
    for (const side of [-1,1]) {
      const pz=z+side*7.7;
      light(x,pz);
      tree(x+11.5,pz,x+z);
      pole('concrete','#777668',x+11.5,.22,pz,1.06,.43);
      pole('dark','#625744',x+11.5,.45,pz,.87,.033);
      block('metal','#617866',x+3,.68,pz,.75,1.32,.52);
    }
  }
  for (const z of rows) for (let x=columns[0]+120;x<columns.at(-1)-80;x+=185) {
    if (columns.some(col=>Math.abs(col-x)<104)) continue;
    horizontalStreet(x*unit,z*unit);
  }
  for (const x of columns) for (let y=rows[0]+100;y<rows.at(-1)-80;y+=193) {
    if (rows.some(row=>Math.abs(row-y)<104)) continue;
    light(x*unit-7.8,y*unit);
    tree(x*unit+7.9,y*unit+8,x+y);
  }
  for(let x=12;x<width*unit;x+=11) {
    const z=south+3.2;
    block('grass','#697e55',x,.07,z,10.8,.18,6.1);
    tree(x-1.8,z+1.2,100+x);
    block('concrete','#9d9c7b',x,.1,z-2.9,10.8,.08,1.75);
  }
  function streetName(name,x,z,angle=0) {
    const label=canvasTexture(doc,288,70,(ctx,w,h)=>{
      ctx.fillStyle='#225389';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#dbedf1';ctx.lineWidth=5;
      ctx.strokeRect(5,5,w-10,h-10);ctx.fillStyle='#eff9f4';ctx.font='900 43px system-ui';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,w/2,h/2,w-24);
    });
    const mat=new T.MeshBasicMaterial({map:label,side:T.DoubleSide});
    const sign=new T.Mesh(pane,mat);
    sign.position.set(x,3.9,z);sign.rotation.y=angle;sign.scale.set(2.65,.59,1);
    scene.add(sign);
  }
  for(const [i,x0] of columns.entries()) for(const [j,y0] of rows.entries()){
    const x=x0*unit+8.1,z=y0*unit-7.9;
    pole('metal','#747a71',x,2.11,z,.14,4.22);
    streetName(rowNames[j],x-1.2,z);
    streetName(columnNames[i],x,z+.89,Math.PI/2);
  }
  const walkX=civicWalkway.x*unit;
  const walkMid=(civicWalkway.y0+civicWalkway.y1)*unit/2;
  for(let y=civicWalkway.y0*unit;y<civicWalkway.y1*unit;y+=8) {
    block('concrete','#d1c7b4',walkX,.38,y,6.1,.19,8);
    tree(walkX-2.24,y,5+y);
    block('metal','#8d7156',walkX+1.85,.68,y,1.6,.16,.44);
  }
  for(const row of [rows[1],rows[2]]) {
    block('glass','#9aada8',walkX,6.3,row*unit,18.4,1.6,2.8);
    block('metal','#777d77',walkX,7.15,row*unit,18.5,.18,2.9);
    for(const s of [-1,1]) pole('concrete','#a29985',walkX+s*8.7,3.1,row*unit,.43,6.2);
  }
  streetName('香堤大道',walkX,walkMid);
  for(const [x0,z0] of [[2360,1780],[3400,870],[4150,2450],[2290,3347],[5300,3860]]) {
    const x=x0*unit,z=z0*unit;
    for(let i=0;i<7;i++) {
      const xx=x+i*.73;
      block('metal','#7e9273',xx,.66,z,.49,.16,1.15);
      for(const t of [-1,1]) block('dark','#343936',xx,.32,z+.49*t,.10,.63,.54);
      block('metal','#6c8762',xx,1.03,z-.42,.43,.09,.06);
      block('metal','#aebdb0',xx,1.14,z-.4,.4,.14,.36);
    }
    block('metal','#606c67',x+6.2,1.12,z,1.45,2.20,.63);
    block('signal','#93c779',x+6.2,1.47,z-.33,1.2,.76,.028);
    const busZ=z+2;
    block('glass','#a6bab4',x+8.9,1.35,busZ,3.65,2.15,.09);
    block('metal','#636f69',x+8.9,2.49,busZ-.49,3.76,.13,1.18);
    for(const q of [-1,1]) pole('metal','#777771',x+8.9+q*1.74,1.22,busZ,.12,2.44);
    block('concrete','#a28e6e',x+8.9,.55,busZ-.32,2.35,.12,.41);
  }
  for(let x=columns[1]*unit+18;x<columns[5]*unit-12;x+=8) {
    if(columns.some(c=>Math.abs(c*unit-x)<11)) continue;
    for(const side of [-1,1]) {
      block('dark','#a77543',x,.049,rows[3]*unit+side*4.15,6.9,.018,.11);
    }
  }

  function parked(x,z,i,angle=0) {
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const stamp=(kind,color,px,py,pz,w,h,d)=>{
      const dx=px-x,dz=pz-z;
      block(kind,color,x+dx*cos+dz*sin,py,z-dx*sin+dz*cos,w,h,d,angle);
    };
    const color=['#9a4b3c','#314b56','#b8b3a6','#425b54'][i%4];
    for (const side of [-1,1]) stamp('dark','#22272a',x,.22,z+side*.6,.18,.42,.42);
    stamp('metal',color,x,.48,z,.55,.35,1.4);
    stamp('dark','#252425',x,.71,z-.28,.48,.13,.64);
    stamp('metal',color,x,.9,z+.52,.52,.46,.24);
    stamp('metal','#a6a19a',x,1.06,z+.53,.66,.07,.1);
  }
  const filler=['#9b7965','#a78e75','#85847c','#a3a49a','#738577','#85888b'];
  function storefront(b,index) {
    const x=(b.x+b.w*.5)*unit,z=(b.y+b.h*.5)*unit;
    const angle=b.angle??0;
    const vertical=Math.abs(angle)===Math.PI/2;
    const w=(vertical?b.h:b.w)*unit,d=(vertical?b.w:b.h)*unit,h=terraceHeight(b)+(b.modern?4+index%8:0),front=z-d*.5;
    if(angle) facade={cx:x,cz:z,cos:Math.cos(angle),sin:Math.sin(angle),angle};
    horizon=['spire','twist'].includes(b.shape)?b.shape:false;
    if(buildLandmark(b,{x,z,w,d,block,pole,instance})) {
      if(b.shape==='office'||b.shape==='datalab') {
        const tall=b.shape==='office'?59.2:45;
        instance('curtain','plane','#ffffff',x,tall/2,z-d*.401,w*.85,tall,1);
        instance('office','plane','#ffffff',x-w*.427,tall/2,z,d*.81,tall,1,Math.PI/2);
        if(b.shape==='office') {
          const badge=canvasTexture(doc,768,144,(ctx,w,h)=>{
            ctx.fillStyle='#233435';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='#b7aea0';ctx.lineWidth=5;ctx.strokeRect(6,6,w-12,h-12);
            ctx.fillStyle='#f1e2bd';ctx.font='600 88px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.fillText(b.name,w*.5,h*.52);
          });
          badge.anisotropy=maxAnisotropy;
          const label=new T.Mesh(pane,new T.MeshBasicMaterial({map:badge,side:T.DoubleSide}));
          label.position.set(x,5.55,z-d*.542);label.rotation.y=Math.PI;label.scale.set(6.4,1.06,1);
          scene.add(label);
        }
      }
      facade=null;horizon=false;
      return;
    }
    horizon=false;
    const main=b.id?b.color:b.modern?'#819a9c':filler[index%filler.length];
    block('concrete','#7d7467',x,.17,z,w+.31,.31,d+.45);
    block('dark','#64534b',x,1.68,z+.6,w-.28,2.85,d-1.37);
    block(b.modern?'glass':'concrete',main,x,(h+3.05)/2,z,w,h-3.05,d);
    block('metal',b.tower?'#626970':'#657177',x,h+.07,z,w+.24,.24,d+.25);
    instance(b.modern?'curtain':'apartment','plane','#ffffff',x,(h+3.05)/2,front-.022,w,h-3.05,1);
    if(!b.modern) instance('shophouse','plane','#ffffff',x,1.55,front+1.13,w-.42,2.84,1);
    const tiles=Math.max(2,Math.floor(w/2.1));
    const lit=index%5!==1 && !b.modern;
    if(lit) {
      instance('reflection','plane','#e6a36d',x,.38,front-.72,w,2.8,1,0,-Math.PI/2);
      block('dark','#695948',x,.54,front+1.09,w-.67,.25,.10);
    }
    for (let j=0;j<=tiles;j++) {
      const px=x-w/2+.34+j*(w-.68)/tiles;
      block('concrete','#a99579',px,1.61,front+.3,.37,3.18,.36);
      if (j===tiles) continue;
      if(lit) {
        block('window',j%3===2?'#d19a6f':'#d8a977',px+.78,1.54,front+1.14,1.27,1.97,.05);
        block('metal','#76614b',px+.78,1.61,front+1.1,.045,1.96,.06);
        block('metal','#76614b',px+.78,2.1,front+1.09,1.27,.045,.06);
      }
      else block('glass','#444f48',px+.78,1.44,front+1.36,1.23,2.42,.07);
      block('metal','#5b5044',px+.79,1.52,front+1.29,.06,2.42,.08);
      if ((j+index)%4===0) block('luminous','#e29b63',px+.68,2.56,front+1.26,.72,.14,.05);
      for (let floor=4.3;floor<h-.43;floor+=2.43) {
        const wx=px+.8,wz=front-.07;
        block('glass',b.tower?'#577174':'#353f42',wx,floor,wz,1.15,1.15,.12);
        block('metal','#8d9189',wx,floor-.6,wz,1.25,.1,.37);
        for (let bar=-1;bar<=1;bar+=2) block('metal','#9c9787',wx+bar*.32,floor,wz-.09,.05,1.11,.08);
        if ((j+index)%3===0) {
          block('metal','#aaa89a',wx+.76,floor-.43,wz-.13,.52,.38,.32);
          block('dark','#565855',wx+.76,floor-.43,wz-.3,.25,.2,.04);
        }
        if (!b.modern && j===0 && (index+Math.floor(floor))%3===0) {
          block('metal','#585653',wx,floor-.23,wz-.35,1.6,.052,.074);
          for (let i=0;i<3;i++) block('concrete',['#c5bea8','#697e84','#985b59'][i],wx+(i-1)*.43,floor-.48,wz-.37,.29,.48,.038);
        }
        if (random(index+floor+j)>.82) block('luminous','#f9c382',wx,floor+.18,wz-.09,.57,.36,.02);
      }
    }
    block('metal','#575957',x,3.05,front-.34,w+.4,.21,1.13);
    block('metal','#9eaaa5',x,2.975,front-.86,w+.35,.076,.075);
    const signX=x+w*.37, signY=Math.min(h-1,4.65),signZ=front-.62;
    for (let floor=4.35; (b.corner||b.id) && floor<h-.55;floor+=2.72) for (const side of [-1,1]) {
      const sideX=x+side*(w/2+.055);
      for (const distance of [1.65,3.6]) {
        block('glass','#465054',sideX,floor,front+distance,.12,1.16,1.3);
        block('metal','#a6a099',sideX+side*.12,floor-.57,front+distance,.31,.08,1.49);
      }
    }
    const signCount=b.id||w<5.5?1:b.modern?(index%4===0?1:0):1+Math.floor(random(index*17)*3);
    for(let i=0;i<signCount;i++) {
      const position=signX-i*(w-.9)/Math.max(2,signCount-1);
      const sign=b.id?signNames.indexOf(b.name):(index*7+i*3)%shopNames.length;
      const color=signPalette[sign%signPalette.length];
      const center=position<x-w*.46?x-w*.41:position;
      const size=.78+(index%3)*.14;
      const tall=2.0+(index+i)%4*.29;
      const bladeZ=signZ-size*.31;
      block('metal','#51453c',center,signY,bladeZ,.14,tall+.06,size+.06);
      instance('signs','plane','#ffffff',center+.076,signY,bladeZ,size,tall,1,Math.PI/2,0,0,sign);
      instance('signs','plane','#ffffff',center-.076,signY,bladeZ,size,tall,1,-Math.PI/2,0,0,sign);
      instance('halo','plane',color,center,signY,signZ-.29,2.3,tall+1.2,1);
      instance('wetStreak','plane',color,center,.48,front-4.1,1.88,7.7,1,0,-Math.PI/2);
    }
    if (index%3!==1 && b.id!=='temple') {
      pole('metal','#879898',x-w*.26,h+.73,z+d*.2,1.12,1.16);
      pole('metal','#a5aaa1',x-w*.26,h+1.34,z+d*.2,1.13,.12);
      block('metal','#53636b',x+w*.2,h+.7,z-d*.12,w*.36,1.25,d*.4);
      for (let i=0;i<7;i++) block('metal','#798080',x+w*.055+i*w*.047,h+1.36,z-d*.12,.07,.075,d*.42);
    }
    if (b.id || index%3===0) {
      for (let i=0;i<Math.floor(w/1.55);i++) {
        const px=x-w*.43+i*1.42;
        block('dark','#c6bfb0',px,.12,front-1.7,.045,.025,1.75);
        if ((i+index)%5!==1) parked(px+.43,front-1.57,i+index,.39);
      }
    }
    if (b.id==='temple') temple(x,z,w,d,h);
    if (b.id==='mrt') {
      block('glass','#67a4a4',x,2,front-1.1,w*.64,3.3,1.6);
      block('metal','#434e57',x,4.14,front-1.5,w*.84,.35,3.24);
      block('luminous','#7de0bc',x,3.9,front-3.04,w*.64,.15,.09);
      for (let i=0;i<5;i++) block('concrete','#726e62',x,i*.13,front-2.6+i*.21,w*.68,.15,.31);
    }
    if (['night_market','rechao','breakfast','convenience'].includes(b.id)||index%13===0) {
      const count=b.id==='night_market'?4:2;
      for (let i=0;i<count;i++) stall(x-w/2+(i+.5)*w/count,front-.1,i,b.id);
    }
    if (b.id==='studio') {
      block('dark','#252836',x,1.4,front+.44,w*.62,2.6,.2);
      block('luminous','#fbc675',x,2.7,front+.26,w*.48,.06,.07);
    }
    if (b.id==='tvstation') {
      pole('metal','#bbb9b1',x,h+1.8,z,.14,3.6);
      block('metal','#909a9d',x,h+3.1,z,1.9,.09,.09);
      block('luminous','#db645d',x,h+3.65,z,.16,.14,.16);
    }
    if (b.id==='datalab'||b.id==='office'||b.id==='client_hq'||b.id==='department') {
      block('glass',b.tower?'#647d83':'#717d8c',x,h*.54,front-.13,w*.43,h*.37,.13);
      for (let i=-3;i<=3;i++) block('metal','#a2a8a7',x+i*w*.063,h*.54,front-.23,.085,h*.39,.09);
    }
    facade=null;
  }

  function temple(x,z,w,d,h) {
    const red='#97392f',gold='#c79650';
    const roofMat=new T.MeshStandardMaterial({color:'#a74531',roughness:.81,side:T.DoubleSide});
    for (const tier of [0,1]) {
      const y=h+tier*1.22,w2=w*(tier?.85:1.12),d2=d*(tier?.75:1.14);
      const positions=[];
      for (let i=0;i<14;i++) {
        const at=t=>{const side=t*2-1;return [x+side*w2/2,y+Math.abs(side)**5*1.28];};
        const [a,ay]=at(i/14),[b,by]=at((i+1)/14);
        for (const k of [-1,1]) {
          const r=z+k*d2/2;
          positions.push(a,ay,r,b,by,r,b,by+1.7,z,a,ay,r,b,by+1.7,z,a,ay+1.7,z);
          block('metal',i%2?gold:red,(a+b)/2,(ay+by)/2,r,(b-a)+.02,.17,.14);
        }
      }
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geo.computeVertexNormals();
      const mesh=new T.Mesh(geo,roofMat);
      mesh.castShadow=mesh.receiveShadow=true;
      scene.add(mesh);
      block('metal',gold,x,y+1.77,z,w2*.93,.22,.19);
    }
    for (const n of [-.44,-.23,.23,.44]) {
      pole('concrete',red,x+n*w,1.78,z-d*.59,.42,3.55);
      pole('metal',gold,x+n*w,.29,z-d*.59,.49,.21);
    }
    for (const n of [-.32,-.12,.12,.32]) {
      const px=x+n*w,pz=z-d*.54;
      pole('luminous','#f57646',px,2.76,pz,.43,.48);
      instance('halo','plane','#f7834e',px,2.76,pz,1.2,1.2,1);
    }
  }
  function stall(x,z,i,id) {
    const fabric=i%2?'#d4ad6b':'#9c403a';
    for (const offset of [-1.17,1.17]) for (const depth of [-.88,.71]) pole('metal','#62564c',x+offset,1.2,z+depth,.09,2.4);
    for (let j=0;j<7;j++) block('concrete',j%2?fabric:'#ded2b1',x-1.13+j*.38,2.43,z-.19,.37,.08,2.0);
    block('concrete',id==='rechao'?'#d3a894':'#6d7060',x,.87,z+.04,1.75,.11,.72);
    pole('luminous','#ffc57b',x,2.25,z-.49,.12,.15);
    instance('halo','plane','#ffc479',x,2.25,z-.5,1.32,1.47,1);
    instance('reflection','plane',id==='night_market'?(i%2?'#f4aa67':'#b576e4'):'#ffc479',x,.52,z-2.35,3.3,4.8,1,0,-Math.PI/2);
    block('luminous',id==='night_market'?(i%2?'#f4aa67':'#b576e4'):'#ffc479',x,2.36,z-.89,1.46,.06,.09);
    if (id==='rechao'||id==='night_market') {
      pole('concrete','#a87764',x,.76,z-1.75,1.01,.11);
      pole('metal','#62554d',x,.36,z-1.75,.09,.72);
      for (const s of [-1,1]) {
        block('metal','#b34135',x+s*.62,.43,z-1.85,.34,.1,.33);
        block('metal','#b34135',x+s*.62,.69,z-2,.32,.42,.07);
        for (const dx of [-.12,.12]) for (const dz of [-.105,.105]) block('metal','#a13933',x+s*.62+dx,.22,z-1.85+dz,.045,.38,.045);
      }
    } else {
      block('glass','#486762',x+.49,1.39,z-.12,.48,.88,.42);
      block('luminous','#9ed28a',x+.49,1.71,z-.35,.43,.13,.035);
      for (const d of [-.36,-.12,.1]) pole('concrete','#e2c18a',x+d,1.02,z-.23,.12,.26);
    }
  }
  function signageMesh(parts) {
    const positions=[],uvs=[];
    const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,-.5],[.5,.5],[-.5,.5]];
    for(const p of parts) {
      const cos=Math.cos(p.angle),sin=Math.sin(p.angle);
      for(const [u,v] of corners) {
        positions.push(p.x+u*p.w*cos,p.y+v*p.h,p.z-u*p.w*sin);
        uvs.push((p.sign%atlas.columns+.027+(u+.5)*.946)/atlas.columns,
          1-(Math.floor(p.sign/atlas.columns)+.016+(.5-v)*.968)/atlas.rows);
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    return new T.Mesh(geometry,materials.signs);
  }

  const skyline=new T.InstancedMesh(cube,new T.MeshBasicMaterial({color:'#6c6970',fog:false}),164);
  const skylineTint=new T.Color();
  for(let i=0;i<skyline.count;i++) {
    const side=Math.floor(i/41),along=((i%41)+random(i+507)*.48)/41;
    const level=17+random(i+510)**2*89;
    const depth=9+random(i)*26;
    const margin=61+random(i+37)*36;
    const w=width*unit,h=height*unit;
    const x=side<2?along*(w+156)-78:side===2?-margin:w+margin;
    const z=side<2?(side===0?-margin:h+margin):along*(h+156)-78;
    dummy.position.set(x,level/2-1,z);
    dummy.rotation.set(0,side<2?0:Math.PI/2,0);
    dummy.scale.set(depth,level,16+random(i+510)*21);
    dummy.updateMatrix();
    skyline.setMatrixAt(i,dummy.matrix);
    skyline.setColorAt(i,skylineTint.setScalar(.73+random(i+32)*.24));
  }
  skyline.frustumCulled=false;
  scene.add(skyline);
  const hillGeo=new T.IcosahedronGeometry(1,1);
  const hill=new T.InstancedMesh(hillGeo,new T.MeshBasicMaterial({color:'#626c60',fog:false}),11);
  hill.frustumCulled=false;
  for(let i=0;i<hill.count;i++) {
    dummy.position.set(50+i*62,-9,height*unit+124+i*1.8);
    dummy.rotation.set(0,i*.51,0);dummy.scale.set(81,29+random(i*111)*39,52);
    dummy.updateMatrix();hill.setMatrixAt(i,dummy.matrix);
  }
  scene.add(hill);
  buildings.forEach(storefront);
  for (const [i,chunk] of [...chunks.values()].entries()) {
    chunk.group=new T.Group();
    chunk.shadowMeshes=[];
    scene.add(chunk.group);
    for (const [key,parts] of chunk.parts) {
      const [kind,shape]=key.split('/');
      if(kind==='signs') {
        chunk.group.add(signageMesh(parts));
        continue;
      }
      let geo=geometry[shape];
      if(textured[kind]) {
        geo=geo.clone();
        const [,tileW,tileH]=textured[kind];
        geo.setAttribute('textureRepeat',new T.InstancedBufferAttribute(new Float32Array(parts.flatMap(p=>[
          p.w/tileW,p.h/tileH,
        ])),2));
      }
      const inst=new T.InstancedMesh(geo,materials[kind],parts.length);
      if(kind==='bulb') signalBatches.push({inst,parts});
      parts.forEach(({color,x,y,z,w,h,d,angle,rx,rz},index)=>{
        dummy.position.set(x,y,z);
        dummy.scale.set(w,h,d);
        dummy.rotation.set(rx,angle,rz);
        dummy.updateMatrix();
        inst.setMatrixAt(index,dummy.matrix);
        inst.setColorAt(index,tint.set(color));
      });
      inst.computeBoundingSphere();
      inst.castShadow=['concrete','metal','dark','grass'].includes(kind);
      inst.receiveShadow=inst.castShadow;
      inst.name=`chunk-${i}-${kind}`;
      chunk.group.add(inst);
      if (inst.castShadow) chunk.shadowMeshes.push(inst);
    }
  }
  return {
    materials,asphalt,glow,loadedTextures,
    update(x,z,night,rain,quality,haze,clock) {
      const tick=Math.floor(clock*2);
      if(tick!==signalTick) {
        signalTick=tick;
        for(const {inst,parts} of signalBatches) {
          parts.forEach(({sign},i)=>{
            const cell=Math.floor(sign/6),axis=sign%6<3,light=sign%3;
            const green=trafficGreen(axis,clock,columns[Math.floor(cell/rows.length)],rows[cell%rows.length]);
            inst.setColorAt(i,tint.set(light===(green?2:0)?green?'#6ef1a2':'#ef5642':'#3b302c'));
          });
          inst.instanceColor.needsUpdate=true;
        }
      }
      skyline.material.color.copy(haze).multiplyScalar(.68);
      hill.material.color.copy(haze).lerp(tint.set("#536454"),.33).multiplyScalar(.60);
      materials.luminous.color.setScalar(.37+night*2.05);
      materials.towerLights.color.setScalar(.16+night*4.1);
      materials.signs.color.setScalar(.90+night*1.04);
      materials.window.color.setScalar(.16+night*.78);
      materials.wetStreak.opacity=rain?night*.72:0;
      materials.wetStreak.visible=materials.wetStreak.opacity>.02;
      materials.halo.opacity=quality>0?night*.75:0;
      materials.halo.visible=materials.halo.opacity>.012;
      materials.reflection.opacity=night*(rain?.73:.145);
      materials.reflection.visible=night>.05;
      asphalt.roughness=rain?.19:.94;
      asphalt.metalness=rain?.38:.08;
      asphalt.color.set(loadedTextures.includes('tex_asphalt')?(rain?'#8f929d':'#a7a099'):(rain?'#5d5f6f':'#625d60'));
      for (const c of chunks.values()) {
        const distance=Math.hypot(c.x-x,c.z-z);
        c.group.visible=c.horizon||distance<(quality>1?192:155);
        const shadow=distance<(quality>0?73:55);
        for(const mesh of c.shadowMeshes) mesh.castShadow=shadow;
      }
    },
  };
}
