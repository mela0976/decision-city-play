import * as T from '../vendor/three.module.min.js?v=0da320b3';
import {water,riverWidthMeters,width,height,metersPerUnit as unit,roadAt,wuxingBounds,toWorld} from '../world.mjs?v=0da320b3';
import {createBasin} from './basin.js?v=0da320b3';
import {canvasTexture,hash,matrix,color,shapes} from './city-primitives.js?v=0da320b3';
import landuse from '../data/xinyi-landuse.json' with { type:'json' };

export const riversideCycleways=[ // A23 actors share the rendered OSM cycle paths.
  [ // OSM way 1073045446
    [25.0545683,121.5703135],[25.0540326,121.5704149],[25.0536073,121.5704906],[25.0533,121.570557],
    [25.0529379,121.5706408],[25.0528137,121.5706602],[25.0527683,121.5706834],[25.0525855,121.5707293],
    [25.0521408,121.5709069],[25.0520602,121.5709493],[25.0518384,121.5710974],[25.0514721,121.5712805],
    [25.0514283,121.5713187],[25.051364,121.5714173],[25.0512545,121.5716041],[25.0511459,121.571788],
    [25.0510847,121.5719655],[25.0510483,121.5721392],[25.0510334,121.572264],[25.0509709,121.5726705],
    [25.0509424,121.5729777],[25.0509358,121.5731782],[25.0509333,121.573484],[25.0509436,121.5736797],
    [25.0509779,121.5739006],[25.05098,121.5741699],[25.050994,121.574307],
  ],
  [ // OSM way 1212972996
    [25.0527959,121.5760381],[25.0528582,121.575653],[25.052984,121.57509],[25.0530549,121.5747556],
    [25.0531146,121.5745674],[25.0531901,121.5744254],[25.0534191,121.5740921],[25.0534665,121.5740372],
    [25.053709,121.5738462],[25.0537281,121.5738134],[25.0537832,121.5736332],[25.0538049,121.5735875],
    [25.0538531,121.5735356],[25.053923,121.5734966],[25.0540188,121.573465],[25.054088,121.5734504],
  ],
];
const riversideFacilities=[
  ['parking',[[25.0551052,121.5734726],[25.0551129,121.5735317],[25.0544802,121.5736333],[25.0544725,121.5735742]]], // OSM way 349844557
  ['parking',[[25.0544197,121.5735938],[25.0544262,121.5736461],[25.0542102,121.5736789],[25.0542037,121.5736265]]], // OSM way 349844558
  ['parking',[[25.055396,121.5735614],[25.0554029,121.5736115],[25.0544844,121.5737659],[25.0544775,121.5737158]]], // OSM way 349844559
  ['court',[[25.0550652,121.5729684],[25.0550649,121.5731202],[25.0548061,121.5731197],[25.0548063,121.5729679]]], // OSM way 349844560
  ['court',[[25.0529271,121.5739216],[25.0530539,121.5741552],[25.0531722,121.5740771],[25.0530454,121.5738434]]], // OSM way 1070592895
  ['court',[[25.0530676,121.5738307],[25.0531944,121.5740643],[25.0533127,121.5739862],[25.0531859,121.5737525]]], // OSM way 1347732273
];
const parkTints=new Map([[229061328,'#576c48'],[588528707,'#687e50'],[588628968,'#657b4f'],[596306247,'#667b4f']]);
const studioWalkways=[
  [ // OSM way 229056581
    [25.0441201,121.5619254],[25.0441521,121.5617058],[25.0441609,121.5615325],[25.044162,121.5614207],
    [25.0441719,121.5604551],[25.0441726,121.5603881],[25.0441805,121.5596154],[25.0441857,121.5591153],
    [25.0442706,121.5591172],[25.0443971,121.5591356],[25.0445093,121.5591831],[25.044662,121.5592173],
    [25.0447551,121.5593121],[25.0448982,121.5593464],[25.0449523,121.5593303],[25.0449926,121.5593235],
    [25.0450846,121.5593043],
  ],
  [ // OSM way 229056682
    [25.044162,121.5614207],[25.0431532,121.5614165],
  ],
  [ // OSM way 377983332
    [25.0441719,121.5604551],[25.0448426,121.5604688],[25.0449451,121.5604035],[25.0450549,121.5604044],
  ],
];

// OpenStreetMap flood-wall ways 349859226 and 351705263.
const floodWalls=[
  [
    [25.0559217,121.5735792],[25.0551393,121.5736999],[25.0543885,121.5738018],[25.0540028,121.5738689],
    [25.0536356,121.5740348],[25.0534518,121.5741632],[25.0533045,121.5743243],[25.0531882,121.5745045],
    [25.0530952,121.5747902],[25.0530456,121.575017],[25.0528998,121.575633],[25.0528685,121.5757802],
    [25.0528519,121.5759238],[25.0528533,121.5760357],[25.0528664,121.5761675],
  ],
  [
    [25.0553962,121.570125],[25.0553069,121.5701414],[25.0550014,121.5701928],[25.0546098,121.5702618],
    [25.054065,121.5703519],[25.0536687,121.570421],[25.0533553,121.5704781],[25.0531489,121.5705094],
    [25.0528891,121.5705692],[25.0527365,121.5706087],[25.0524759,121.5706767],[25.0522039,121.5707331],
    [25.0519828,121.5707893],[25.0516538,121.5709528],[25.0514741,121.5711891],[25.0514212,121.5712295],
    [25.0513742,121.5712296],[25.0512414,121.5713865],[25.0511232,121.5715713],[25.0510059,121.5718434],
    [25.0509467,121.5721234],[25.0509204,121.5723152],[25.0508614,121.5728507],[25.0508471,121.5732861],
    [25.0508638,121.5736426],[25.0509103,121.5740351],[25.0509477,121.5742393],[25.0511304,121.5750601],
    [25.0513622,121.5761122],[25.051457,121.5765362],[25.0523369,121.5804665],[25.0525435,121.5813934],
  ],
];
const gatePosition=toWorld(25.051457,121.5765362); // OSM node 3858388780.

export function placeFloodDefenses(instance){
  const wallHeight=4.2;
  for(const path of floodWalls){
    for(let i=1;i<path.length;i++){
      const a=toWorld(...path[i-1]),b=toWorld(...path[i]);
      const dx=(b.x-a.x)*unit,dz=(b.y-a.y)*unit,len=Math.hypot(dx,dz);
      if(len<.1)continue;
      const turn=-Math.atan2(dz,dx);
      const cuts=Math.ceil(len/2.7),step=len/cuts;
      const at=t=>[a.x*unit+t*dx,a.y*unit+t*dz];
      for(let j=0;j<cuts;j++){
        const [x,z]=at((j+.5)/cuts);
        // Leave mapped street crossings clear and the surveyed evacuation gate open.
        if(roadAt(x/unit,z/unit,-2/unit)
          ||Math.hypot(x-gatePosition.x*unit,z-gatePosition.y*unit)<3.65+step/2)continue;
        instance('concrete','box',j%5?'#8c8a80':'#969185',x,wallHeight/2,z,step+.018,wallHeight,.54,turn);
        instance('metal','box','#757b78',x,wallHeight+.22,z,step+.015,.075,.48,turn);
        if(j%2===0)instance('metal','box','#6e7573',x,wallHeight+.43,z,.065,.87,.065,turn);
        instance('metal','box','#767d7d',x,wallHeight+.86,z,step+.018,.084,.09,turn);
      }
    }
  }
  const [before]=floodWalls[1].slice(-4);
  const reference=toWorld(...before),x=gatePosition.x*unit,z=gatePosition.y*unit;
  const angle=Math.atan2(z-reference.y*unit,x-reference.x*unit),turn=-angle;
  for(const side of [-1,1]){
    const dx=Math.cos(angle)*side*4.08,dz=Math.sin(angle)*side*4.08;
    instance('concrete','box','#9b998a',x+dx,2.31,z+dz,.61,4.62,.73,turn);
    // Painted open gate leaves are flush with the roadside jambs.
    instance('metal','box',side===1?'#778070':'#647c81',x+dx,1.87,z+dz-.48,.54,3.56,.12,turn);
  }
  instance('metal','box','#666e68',x,4.38,z,8.55,.39,.54,turn);
}

function addFloodDefenses(group){
  const parts=new Map();
  placeFloodDefenses((kind,shape,...part)=>{
    if(!parts.has(kind))parts.set(kind,[]);
    parts.get(kind).push(part);
  });
  for(const [kind,items] of parts){
    const mat=new T.MeshStandardMaterial({roughness:kind==='metal'?.51:.9,metalness:kind==='metal'?.24:0});
    const mesh=new T.InstancedMesh(shapes.box,mat,items.length);
    items.forEach(([tint,x,y,z,w,h,d,turn],index)=>{
      matrix.position.set(x,y,z);matrix.scale.set(w,h,d);matrix.rotation.set(0,turn,0);matrix.updateMatrix();
      mesh.setMatrixAt(index,matrix.matrix);mesh.setColorAt(index,color.set(tint));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow=true;
    group.add(mesh);
  }
}

export function addGround(group,doc,anisotropy) {
  // Ground: a low-res tint mask (paving, verge, grass) multiplied by a tiling detail noise in world space.
  const cover=canvasTexture(doc,1024,1024,(ctx,w,h)=>{
    const designated=toWorld(25.038,121.566);
    for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){
      const gx=x/w*width,gy=y/h*height;
      const civic=Math.hypot((gx-designated.x)*.92,gy-designated.y)*unit<780;
      const strip=roadAt(gx,gy,-92);
      const patch=hash(Math.floor(x/26),Math.floor(y/18)+7);
      const grain=hash(x/2,y/2);
      const t=.74*patch+.26*grain;
      ctx.fillStyle=civic
        ? `rgb(${114+32*t} ${118+27*t} ${108+22*t})`
        : strip
          ? `rgb(${99+29*t} ${97+22*t} ${79+20*t})`
          : `rgb(${95+39*t} ${99+31*t} ${83+26*t})`;
      ctx.fillRect(x,h-y-4,4,4);
    }
    // Paint mapped vegetation on the existing ground plane, keeping water and
    // authored plaza materials in the higher-resolution geometry pass.
    function greenRing(id,coordinates,local){
      ctx.beginPath();
      coordinates.forEach(([lat,lon],index)=>{
        const p=toWorld(lat,lon),x=p.x*w/width,y=local?p.y*h/height:h-p.y*h/height;
        if(index===0)ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
      });
      ctx.closePath();
      const shade=hash(id,41);
      ctx.fillStyle=parkTints.get(id)??`rgb(${84+34*shade} ${107+27*shade} ${68+20*shade})`;
      ctx.fill();
    }
    for(const [id,kind,,ring] of landuse.features)if(kind==='green')greenRing(id,ring,false);
    // On the rotated ground plane canvas row zero is north. Clip the correction to these blocks.
    const {nw,se}=wuxingBounds;
    ctx.save();
    ctx.beginPath();
    ctx.rect(nw.x*w/width,nw.y*h/height,(se.x-nw.x)*w/width,(se.y-nw.y)*h/height);
    ctx.clip();
    ctx.fillStyle='#898178';
    ctx.fillRect(0,0,w,h);
    for(const [id,kind,,ring] of landuse.features)if(kind==='green')greenRing(id,ring,true);
    ctx.restore();
  });
  cover.anisotropy=anisotropy;
  const detail=canvasTexture(doc,256,256,(ctx,w,h)=>{
    const data=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const coarse=hash(Math.floor(x/16),Math.floor(y/16)),mid=hash(Math.floor(x/4),Math.floor(y/4)+9),fine=hash(x,y+33);
      const v=Math.round(255*(.5+.22*(coarse-.5)+.28*(mid-.5)+.3*(fine-.5)));
      const k=(y*w+x)*4;data.data[k]=v;data.data[k+1]=Math.round(255*(coarse*.65+mid*.35));
      data.data[k+2]=v;data.data[k+3]=255;
    }
    ctx.putImageData(data,0,0);
  });
  detail.colorSpace=T.NoColorSpace;
  detail.wrapS=detail.wrapT=T.RepeatWrapping;detail.anisotropy=anisotropy;
  const soilMaterial=new T.MeshStandardMaterial({map:cover,roughness:1});
  soilMaterial.onBeforeCompile=shader=>{
    shader.uniforms.detailMap={value:detail};
    shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec2 groundXZ; void main() {')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n groundXZ=(modelMatrix*vec4(position,1.)).xz;');
    shader.fragmentShader=shader.fragmentShader.replace('void main() {','uniform sampler2D detailMap; varying vec2 groundXZ; void main() {')
      .replace('#include <map_fragment>',`#include <map_fragment>
      vec2 field=texture2D(detailMap,groundXZ/11.).rg;
      float grain=texture2D(detailMap,groundXZ/2.3+.37).r;
      diffuseColor.rgb*=mix(vec3(.71,.77,.70),vec3(1.15,1.09,.96),field.g);
      diffuseColor.rgb*=.66+.67*mix(field.r,grain,.56);`);
  };
  const soil=new T.Mesh(new T.PlaneGeometry(width*unit,height*unit),soilMaterial);
  soil.rotation.x=-Math.PI/2;soil.position.set(width*unit/2,-.11,height*unit/2);
  soil.receiveShadow=true;group.add(soil);
  const basin=createBasin(width*unit,height*unit);
  group.add(basin);
  addRiverCorridor(group);
  addFloodDefenses(group);
}

export function addWaterAndParks(batch,strip) {
  for(const [,kind,,coordinates] of landuse.features){
    if(kind==='green')continue;
    const ring=coordinates.map(([lat,lon])=>{const p=toWorld(lat,lon);return new T.Vector2(p.x*unit,p.y*unit);});
    const type=kind==='plaza'?'paving':'water';
    const tint=kind==='water'?'#b7c0ad':'#e6e2d6';
    const buf=batch(ring[0].x,ring[0].y,type);
    for(const face of T.ShapeUtils.triangulateShape(ring,[])){
      const v=face.map(i=>ring[i]);
      const y=kind==='water'?-.033:-.056;
      buf.triangle(...v.map(p=>[p.x,y,p.y]),tint,...v.map(p=>[p.x/3,p.y/3]));
    }
  }
  for(const object of water) {
    const pts=object.points;
    const closed=pts.length>3&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<2;
    if(!closed)continue;
    const vector=p=>new T.Vector2(p.x*unit,p.y*unit);
    const polygon=pts.slice(0,-1).map(vector);
    const holes=(object.holes??[]).map(ring=>ring.slice(0,-1).map(vector));
    const vertices=polygon.concat(...holes);
    const buf=batch(polygon[0].x,polygon[0].y,'water');
    const y=holes.length?-.032:-.045;
    for(const face of T.ShapeUtils.triangulateShape(polygon,holes)){
      buf.triangle(...face.map(i=>[vertices[i].x,y,vertices[i].y]),holes.length?'#ced4af':'#fff');
    }
  }
  for(const [use,coordinates] of riversideFacilities){
    const corners=coordinates.map(point=>toWorld(...point));
    const [a,b,c,d]=corners;
    const point=(p,y)=>[p.x*unit,y,p.y*unit];
    const tint=use==='court'?'#72857e':'#9b9892';
    batch(a.x*unit,a.y*unit,'paving').quad(...corners.map(p=>point(p,.010)),tint,1,1);
    if(use==='court'){
      corners.forEach((p,i)=>{
        const q=corners[(i+1)%corners.length];
        strip([p.x,p.y],[q.x,q.y],.06,.019,'line',0,'#e9e3c5');
      });
      strip([(a.x+d.x)/2,(a.y+d.y)/2],[(b.x+c.x)/2,(b.y+c.y)/2],.06,.019,'line',0,'#e9e3c5');
    }else{
      const length=Math.hypot(c.x-b.x,c.y-b.y)*unit,bays=Math.max(1,Math.floor(length/2.65));
      for(let i=1;i<bays;i++){
        const t=i/bays;
        strip([a.x+(d.x-a.x)*t,a.y+(d.y-a.y)*t],[b.x+(c.x-b.x)*t,b.y+(c.y-b.y)*t],
          .07,.017,'line',0,'#dedacf');
      }
    }
  }
  for(const path of riversideCycleways){
    for(let i=1;i<path.length;i++){
      const a=toWorld(...path[i-1]),b=toWorld(...path[i]);
      strip([a.x,a.y],[b.x,b.y],3.2,.016,'road',0,'#c0beb3');
      const length=Math.hypot(b.x-a.x,b.y-a.y)*unit;
      for(let d=0;d+.70<length;d+=2.5){
        const at=t=>[a.x+(b.x-a.x)*t/length,a.y+(b.y-a.y)*t/length];
        strip(at(d),at(d+.70),.075,.024,'line',0,'#ebe7cc');
      }
    }
  }
  for(const path of studioWalkways){
    for(let i=1;i<path.length;i++){
      const a=toWorld(...path[i-1]),b=toWorld(...path[i]);
      strip([a.x,a.y],[b.x,b.y],2.7,.014,'paving',0,'#d9d0bd',1.6);
    }
  }
}

function addRiverCorridor(group){
  const grass=[],channel=[],bank=[],bankColors=[];
  const quad=(out,a,b,c,d)=>out.push(...a,...b,...c,...a,...c,...d);
  for(const {name,points} of water){
    if(name!=='基隆河')continue;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      const ax=a.x*unit,az=a.y*unit,bx=b.x*unit,bz=b.y*unit;
      if(Math.max(ax,bx)<-350||Math.min(ax,bx)>width*unit+350
        ||Math.max(az,bz)<-350||Math.min(az,bz)>height*unit+350)continue;
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
      if(len<.10)continue;
      const point=(x,z,d,y)=>[x-dz*d/len,y,z+dx*d/len];
      const flat=(out,half,y)=>quad(out,point(ax,az,-half,y),point(bx,bz,-half,y),point(bx,bz,half,y),point(ax,az,half,y));
      flat(grass,(riverWidthMeters+9)/2,-.052);
      flat(channel,riverWidthMeters/2,-.04);
      // The revetment is contained within the existing water collision band.
      const profile=[[2.3,-.03,'#55624e'],[.85,.26,'#757c6d'],[.32,.31,'#96988a'],[0,-.045,'#858777']];
      for(const side of [-1,1]){
        const at=(x,z,inset,y)=>point(x,z,side*(riverWidthMeters/2-inset),y);
        for(let j=1;j<profile.length;j++){
          const [lo,yl,tint]=profile[j-1],[hi,yh]=profile[j];
          const corners=[at(ax,az,lo,yl),at(bx,bz,lo,yl),at(bx,bz,hi,yh),at(ax,az,hi,yh)];
          quad(bank,...(side===1?corners.reverse():corners));
          color.set(tint);
          for(let k=0;k<6;k++)bankColors.push(color.r,color.g,color.b);
        }
      }
    }
  }
  for(const [points,tint,colors] of [[grass,'#576b41'],[channel,'#5d8080'],[bank,'#fff',bankColors]]){
    if(!points.length)continue;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
    if(colors)geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({
      color:tint,roughness:.86,vertexColors:Boolean(colors),side:T.DoubleSide,
    }));
    mesh.receiveShadow=true;
    group.add(mesh);
  }
}
