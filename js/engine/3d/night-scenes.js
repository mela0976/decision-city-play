// Seasonal lighting follows existing plaza trees, facade polygons and elevated footways.
import * as T from '../vendor/three.module.min.js?v=5a397df';
import {courtPlanters,courtPoint} from '../entry-courts.mjs?v=5a397df';
import {buildings,byId,civicWalkway,metersPerUnit as unit,toWorld} from '../world.mjs?v=5a397df';
import {marketCarts,nightMarketOpen} from '../night-market.mjs?v=5a397df';
import {visitLandscapeTrees} from './vegetation.js?v=5a397df';
import {skywalks} from './landmarks.js?v=5a397df';
import {canvasTexture,hash,shapes} from './city-primitives.js?v=5a397df';

// Crop just the glazing from the two authored retail atlases. Other materials retain their full UVs.
const glazing=shapes.plane.clone();
const uv=glazing.attributes.uv;
for(let i=0;i<uv.count;i++)uv.setXY(i,.085+.83*uv.getX(i),.13+.49*uv.getY(i));

function marketBoard(doc,name){
  return canvasTexture(doc,256,72,(c,w,h)=>{
    const face=c.createLinearGradient(0,0,0,h);
    face.addColorStop(0,'#e7af65');face.addColorStop(.12,'#982f1c');face.addColorStop(.83,'#752514');face.addColorStop(1,'#e0a958');
    c.fillStyle=face;c.fillRect(0,0,w,h);
    c.strokeStyle='#e3b785';c.strokeRect(4,4,w-8,h-8);
    c.fillStyle='#fff0bc';c.textAlign='center';c.textBaseline='middle';
    c.font='bold 43px sans-serif';c.fillText(name,w*.54,h*.52);
    c.fillStyle='#f3c680';c.font='12px sans-serif';
    c.fillText('現點',24,26);c.fillText('現做',24,44);
  });
}

function batchBuilder(){
  const batches=new Map(),points=[];
  function piece(kind,tint,x,y,z,w,h,d,turn=0){
    if(!batches.has(kind))batches.set(kind,[]);
    batches.get(kind).push({tint,x,y,z,w,h,d,turn});
  }
  function bulb(x,y,z,tint){points.push({x,y,z,tint});}
  function finish(group,materials,glow){
    const o=new T.Object3D(),color=new T.Color();
    for(const [kind,items] of batches){
      const mesh=new T.InstancedMesh(kind.startsWith('window')?glazing:kind.startsWith('menu')?shapes.plane:shapes.box,materials[kind],items.length);
      items.forEach(({tint,x,y,z,w,h,d,turn},i)=>{
        o.position.set(x,y,z);o.rotation.set(0,turn,0);o.scale.set(w,h,d);o.updateMatrix();
        mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,color.set(tint));
      });
      mesh.computeBoundingSphere();group.add(mesh);
    }
    if(!points.length)return;
    const positions=[],colors=[];
    for(const {x,y,z,tint} of points){positions.push(x,y,z);colors.push(...color.set(tint).multiplyScalar(2.7).toArray());}
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const bulbs=new T.PointsMaterial({size:.23,map:glow,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
    group.add(new T.Points(geometry,bulbs));
  }
  return {piece,bulb,finish};
}

function plazaLights(batch,has){
  const {bulb,piece}=batch;
  const focal=toWorld(25.03661,121.56696);
  if(has('landmarks')&&has('vegetation')){
    const mall=byId.get('department'),{sides,depth}=courtPlanters.department;
    for(const side of sides){
      const [x,z]=courtPoint(mall,side,depth);
      const conical=side===2,count=conical?170:74;
      for(let i=0;i<count;i++){
        const t=i/count,angle=t*(conical?27:12)*Math.PI,r=conical?1.15*(1-t)+.04:.15+.72*t;
        bulb(x+r*Math.cos(angle),.66+3.55*t,z+r*Math.sin(angle),i%5?'#eeb86a':'#ffebbd');
      }
      if(conical)for(let i=0;i<40;i++){
        const k=Math.floor(i/4),t=(i%4)/4;
        const star=j=>[Math.sin(j*Math.PI/5)*(j%2?.13:.29),Math.cos(j*Math.PI/5)*(j%2?.13:.29)];
        const a=star(k),b=star(k+1);
        bulb(x,4.48+a[1]*(1-t)+b[1]*t,z+a[0]*(1-t)+b[0]*t,'#ffe7ac');
      }
    }
    for(let span=1;span<sides.length;span++)for(let i=0;i<=38;i++){
      const t=i/38,[x,z]=courtPoint(mall,sides[span-1]*(1-t)+sides[span]*t,depth);
      bulb(x,4.35-.73*Math.sin(Math.PI*t),z,i%7?'#ffdc95':'#fff5d0');
    }
  }
  if(has('vegetation'))visitLandscapeTrees(({x,z,avenue,seed})=>{
    if(!avenue||Math.abs(x-civicWalkway.x*unit)>6||Math.abs(z-focal.y*unit)>115)return;
    const centerpiece=x<civicWalkway.x*unit&&Math.abs(z-focal.y*unit)<3.6;
    const count=centerpiece?590:52,height=centerpiece?5.6:3.1;
    for(let i=0;i<count;i++){
      const t=i/count,ang=t*Math.PI*(centerpiece?40:16)+seed;
      const r=centerpiece?.05+1.55*(1-t):.20+t*t*.44;
      bulb(x+Math.cos(ang)*r,.45+t*height,z+Math.sin(ang)*r,
        ['#ffe5aa','#e9a856','#ffd38b','#fff2cd'][i%4]);
    }
    if(centerpiece)for(let i=0;i<60;i++){
      const j=Math.floor(i/6),s=(i%6)/6;
      const tip=k=>[Math.sin(k*Math.PI/5)*(k%2?.18:.42),Math.cos(k*Math.PI/5)*(k%2?.18:.42)];
      const a=tip(j),b=tip(j+1);
      bulb(x+a[0]*(1-s)+b[0]*s,6.39+a[1]*(1-s)+b[1]*s,z,'#ffe6a0');
    }
    if(x>civicWalkway.x*unit||Math.abs(z-focal.y*unit)>74||Math.abs(seed)%3===1)return;
    const mirror=2*civicWalkway.x*unit-x;
    for(let i=0;i<=32;i++){
      const t=i/32;
      bulb(x+(mirror-x)*t,5.2-1.25*Math.sin(Math.PI*t),z,'#ffdc9a');
    }
  });
  if(has('landmarks'))for(const path of skywalks)for(let i=1;i<path.length;i++){
    const a=toWorld(...path[i-1]),b=toWorld(...path[i]),dx=(b.x-a.x)*unit,dz=(b.y-a.y)*unit;
    const len=Math.hypot(dx,dz);
    if(len<.8)continue;
    const x=(a.x+b.x)*unit/2,z=(a.y+b.y)*unit/2,angle=-Math.atan2(dz,dx);
    for(const side of [-1,1]){
      const ox=-dz/len*side*1.56,oz=dx/len*side*1.56;
      piece('box','#ffdda2',x+ox,6.48,z+oz,len,.07,.05,angle);
      for(let j=1;j<len;j+=3.2)bulb(a.x*unit+dx*j/len+ox,8.61,a.y*unit+dz*j/len+oz,'#ffeac8');
    }
  }
  if(has('storefront'))for(const b of buildings){
    if(![269773067,391309615].includes(b.osmId))continue;
    for(let i=0;i<b.polygon.length;i++){
      const a=b.polygon[i],e=b.polygon[(i+1)%b.polygon.length];
      const dx=(e.x-a.x)*unit,dz=(e.y-a.y)*unit,len=Math.hypot(dx,dz);
      const x=(a.x+e.x)*unit/2,z=(a.y+e.y)*unit/2;
      if(Math.abs(dx)>Math.abs(dz)*.4||Math.abs(x-civicWalkway.x*unit)>16||len<4)continue;
      const side=Math.sign(civicWalkway.x*unit-x),nx=Math.abs(dz)/len*side,nz=-dx/dz*nx;
      const bays=Math.max(1,Math.round(len/6));
      for(let j=0;j<bays;j++){
        const t=(j+.5)/bays-.5;
        piece((j+i)%3===1?'windowCafe':'windowClothes','#ffddae',x+dx*t+nx*.14,1.74,z+dz*t+nz*.14,len/bays*.88,2.65,1,Math.atan2(nx,nz));
      }
    }
  }
}

function marketDetails(batch,carts){
  carts.forEach(({x,z,dx,dz,side,heading},index)=>{
    const place=(s,d)=>[x+dx*s-dz*d*side,z+dz*s+dx*d*side];
    const box=(s,y,d,w,h,l,tint)=>{const [px,pz]=place(s,d);batch.piece('box',tint,px,y,pz,w,h,l,-heading);};
    const bright=['#bb4333','#b9954f','#436f69'][index%3];
    box(0,.30,0,1.87,.09,.88,'#494540');
    for(const s of [-.79,.79])for(const d of [-.37,.37])box(s,.19,d,.18,.25,.12,'#383632');
    box(0,.68,0,2.03,.71,.97,'#8a938c');box(0,1.06,0,2.18,.08,1.12,'#d2cabb');
    box(0,2.37,0,2.30,.13,1.37,bright);
    for(let s=-.99;s<1.1;s+=.39)box(s,2.33,-.63,.18,.16,.12,'#d4bd89');
    for(const s of [-.68,0,.68])box(s,.63,-.50,.035,.53,.025,'#5e6462');
    for(const s of [-.98,.98])for(const d of [-.49,.49])box(s,1.36,d,.043,1.95,.043,'#b6ad91');
    box(-.49,1.19,-.17,.43,.19,.38,'#705747');box(.25,1.15,.03,.46,.13,.37,'#d5bb84');
    const [sx,sz]=place(0,-.70);
    batch.piece('menu'+index%3,'#fff',sx,2.22,sz,1.52,.38,1,Math.atan2(dz*side,-dx*side));
    for(const s of [-.94,.94]){
      const [bx,bz]=place(s,-.61);
      batch.bulb(bx,2.13,bz,'#fff1ae');batch.piece('lit','#fff2c9',bx,2.11,bz,.095,.13,.09);
    }
    box(1.65,.44,0,.40,.08,.40,'#d8412f');
    box(1.65,.64,.17,.39,.32,.045,'#c8392a');
    for(const v of [-.15,.15])for(const d of [-.15,.15])box(1.65+v,.21,d,.052,.42,.052,'#b83428');
  });
}

// Mount warm lightboxes and cooking surfaces inside the existing west-entrance cart frames.
export function vendorCounters(doc,group,glow){
  const batch=batchBuilder(),materials={box:new T.MeshStandardMaterial({roughness:.65,metalness:.23}),
    lit:new T.MeshBasicMaterial()};
  function add(at,s,d,name){
    const [cx,cz]=at(s,d),[ax,az]=at(s+1,d),[bx,bz]=at(s,d+1);
    const turn=-Math.atan2(az-cz,ax-cx),normal=Math.atan2(bx-cx,bz-cz);
    const part=(kind,tint,side,y,depth,w,h,l)=>{
      const [x,z]=at(s+side,d+depth);batch.piece(kind,tint,x,y,z,w,h,l,turn);
    };
    const menu='menu'+name;
    materials[menu]??=new T.MeshBasicMaterial({map:marketBoard(doc,name)});
    for(const face of [-1,1]){
      const [x,z]=at(s,d+face*.755);
      batch.piece(menu,'#ffdaae',x,2.62,z,1.64,.39,1,normal+(face<0?Math.PI:0));
      part('lit','#ffde96',0,2.19,face*.50,1.46,.034,.031);
      for(const side of [-.77,0,.77]){
        part('box','#483c30',side,2.18,face*.60,.06,.13,.06);
        part('lit','#ffe1a7',side,2.06,face*.60,.11,.14,.11);
      }
      // Enamel skirt and two rails sit on the existing steel body.
      part('box','#9b5b3b',0,.54,face*.344,1.69,.45,.018);
      for(const y of [.35,.73])part('lit','#b98558',0,y,face*.359,1.65,.023,.016);
    }
    part('lit','#b48b60',0,.913,0,1.76,.026,.62);
    for(let i=0;i<3;i++){
      const side=(i-1)*.48;
      part('box','#5c5450',side,.95,0,.42,.055,.43);
      for(let j=0;j<5;j++)part('lit',j%2?'#c3894f':'#b66834',side-.14+j*.071,.999,0,.043,.042,.27);
    }
  }
  return {add,finish:()=>batch.finish(group,materials,glow)};
}

function steamingPots(carts,glow){
  const geometry=new T.BufferGeometry(),positions=[],phases=[];
  carts.forEach(({x,z,dx,dz,side},i)=>{
    for(let puff=0;puff<4;puff++){
      positions.push(x-.49*dx+.17*dz*side,1.31,z-.49*dz-.17*dx*side);
      phases.push((hash(i,3)+puff*.25)%1);
    }
  });
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('phase',new T.Float32BufferAttribute(phases,1));
  const time={value:0};
  const material=new T.PointsMaterial({map:glow,size:.39,color:'#e7dfd0',opacity:.35,transparent:true,depthWrite:false});
  material.onBeforeCompile=s=>{
    s.uniforms.steamTime=time;
    s.vertexShader='attribute float phase; uniform float steamTime; varying float age;\n'+s.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n age=fract(steamTime*.49+phase); transformed.y+=age*.84; transformed.x+=age*.15*sin(phase*22.+age*5.);')
      .replace('gl_PointSize = size;','gl_PointSize = size*(.32+age);');
    s.fragmentShader='varying float age;\n'+s.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\n diffuseColor.a*=sin(3.14159*age);');
  };
  return {mesh:new T.Points(geometry,material),time};
}

export function nightScenes(doc,parent,has,glow){
  const plaza=new T.Group(),market=new T.Group();parent.add(plaza,market);
  const material=map=>new T.MeshBasicMaterial({map:map??null});
  const materials={box:material(),lit:material(),windowCafe:material(),windowClothes:material()};
  const cartMaterials={...materials,box:new T.MeshStandardMaterial({roughness:.59,metalness:.18})};
  for(const [i,name] of ['鹽酥雞','滷味','茶飲'].entries())cartMaterials['menu'+i]=material(marketBoard(doc,name));
  const lights=batchBuilder();plazaLights(lights,has);lights.finish(plaza,materials,glow);
  const origin=toWorld(25.03661,121.56696),regions=[];
  // Avoid drawing the entire corridor when standing at a single stall.
  const buckets=new Map();
  for(const cart of marketCarts){
    const key=Math.floor(cart.x/75);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(cart);
  }
  if(has('furniture'))for(const carts of buckets.values()){
    const group=new T.Group(),batch=batchBuilder();market.add(group);
    marketDetails(batch,carts);batch.finish(group,cartMaterials,glow);
    const steam=steamingPots(carts,glow);group.add(steam.mesh);
    regions.push({group,time:steam.time,anchor:carts[carts.length>>1]});
  }
  return (x,z,night,hour,clock,surfaces)=>{
    for(const [fixture,atlas] of [[materials.windowCafe,surfaces.shopj],[materials.windowClothes,surfaces.shopi]]){
      if(atlas.map&&fixture.map!==atlas.map){fixture.map=atlas.map;fixture.needsUpdate=true;}
    }
    plaza.visible=night>.19&&Math.abs(x-origin.x*unit)<180&&Math.abs(z-origin.y*unit)<475;
    market.visible=nightMarketOpen(hour);
    if(market.visible)for(const {group,time,anchor} of regions){
      group.visible=Math.hypot(x-anchor.x,z-anchor.z)<115;time.value=clock;
    }
  };
}
