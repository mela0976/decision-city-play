import * as T from '../vendor/three.module.min.js';
import {metersPerUnit as unit,locations,toWorld,elevatedRoofs} from '../world.mjs';
import {towerSkywalks} from './buildings-tower.js'; // A23 towers
import {addFactoryFront,addPondWalk} from './songshan-heritage.js';
import {addTemple} from './temple-court.js';
export {placeTempleCourt} from './temple-court.js';
import {buildLandmark} from './xinyi.js';
import {placeEntrance} from './frontage.js';
import {venues} from '../venue-entrances.mjs'; // A27
import {createOfficeDoor} from './office-door.js';
import {shapes,matrix,color} from './city-primitives.js';

const landmarkShapes={...shapes,spireTier:new T.CylinderGeometry(Math.SQRT1_2,.56,1,4,1,false,Math.PI/4)};

function addInstanceBatches(parent,materials,batches,castsShadow=false,pool=new Map()){
  for(const [key,items] of batches){
    const [kind,shape]=key.split('/');
    const previous=pool.get(key);
    const offset=previous?.count??0,count=offset+items.length;
    let mesh=previous;
    if(!mesh||count>mesh.instanceMatrix.count){
      const shared=materials[kind];
      const material=previous?.material??(shared.vertexColors?shared.clone():shared);
      material.vertexColors=false;
      // Grow on build only. All landmarks use the existing static instance layout.
      const capacity=2**Math.ceil(Math.log2(count));
      mesh=new T.InstancedMesh(landmarkShapes[shape],material,capacity);
      if(previous){
        mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
        mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3);
        mesh.instanceColor.array.set(previous.instanceColor.array);
        parent.remove(previous);
        previous.dispose();
      }
      mesh.receiveShadow=true;mesh.castShadow=castsShadow;
      parent.add(mesh);
      pool.set(key,mesh);
    }
    mesh.count=count;
    items.forEach(([tint,x,y,z,w,h,d,turn=0,rx=0,rz=0],i)=>{
      matrix.position.set(x,y,z);matrix.rotation.set(rx,turn,rz);matrix.scale.set(w,h,d);matrix.updateMatrix();
      mesh.setMatrixAt(offset+i,matrix.matrix);mesh.setColorAt(offset+i,color.set(tint));
    });
    mesh.computeBoundingSphere();
  }
}

function addFixedStructure(group,materials,place){
  const parts=new Map();
  place((kind,shape,...args)=>{
    const key=kind+'/'+shape;
    if(!parts.has(key))parts.set(key,[]);
    parts.get(key).push(args);
  });
  addInstanceBatches(group,materials,parts);
}

export function createLandmarks({group,replacements,batch,materials,textWall,obstacle,enabled,towerDetail}) {
  const office=enabled?createOfficeDoor(group):()=>{};
  const shop=enabled?createOfficeDoor(group,venues.get('convenience')):()=>{}; // A27
  const updateOfficeDoor=(progress,shopProgress=0)=>{office(progress);shop(shopProgress);};
  updateOfficeDoor(0);
  if(enabled){
    addFixedStructure(group,materials,addRiverBridge);
  }
  if(enabled||towerDetail)addFixedStructure(group,materials,base=>towerSkywalks(base,towerDetail)); // A23 towers
  const shadowLandmarks=new Map(),sunlitLandmarks=new Map(),replacedLandmarks=new Map();
  function landmark(b) {
    const shape=b.shape,x=(b.x+b.w/2)*unit,z=(b.y+b.h/2)*unit;
    const nominal={spire:160,office:266,museum:13,datalab:45,twist:76,dome:14,construction:90,memorial:12,cityhall:16,mall:19};
    const tall=shape==='construction'?91:Math.max(nominal[shape]??5,b.elevation);
    // The first 6 m are fixed at pedestrian scale. Match the exact OSM
    // tower height using the remaining height rather than scaling the full model.
    const sy=shape==='spire'?(tall-6)/(nominal.spire-6):tall/(nominal[shape]??tall);
    const w=b.w*unit,d=b.h*unit;
    const batches=new Map();
    const replacement=['office','museum','dome'].includes(shape);
    if(enabled&&replacement){
      const pad=new T.Mesh(new T.BoxGeometry(w*1.10,.42,d*1.10),
        new T.MeshStandardMaterial({color:shape==='office'?'#859378':'#9fa39c',roughness:.94}));
      pad.position.set(x,-.20,z);pad.receiveShadow=true;replacements.add(pad);
    }
    const instance=(kind,geo,tint,a,y,c,ww,h,dd,turn=0,rx=0,rz=0)=>{
      const k=kind+'/'+geo;
      if(!batches.has(k))batches.set(k,[]);
      const elevation=n=>n<=6?n:6+(n-6)*sy;
      const low=elevation(y-h/2),high=elevation(y+h/2);
      if(!rx&&!rz)obstacle?.(kind,geo,tint,a,(low+high)/2,c,ww,high-low,dd,turn); // A24c
      batches.get(k).push([tint,a,(low+high)/2,c,ww,high-low,dd,turn,rx,rz]);
    };
    const block=(kind,tint,a,y,c,ww,h,dd,turn=0)=>instance(kind,'box',tint,a,y,c,ww,h,dd,turn);
    const pole=(kind,tint,a,y,c,ww,h)=>instance(kind,'cylinder',tint,a,y,c,ww,h,ww);
    if(!buildLandmark(b,{x,z,w,d,instance,block,pole,curtain:'landmarkCurtain'}))return false;
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
    if(enabled){
      const castsShadow=shape!=='spire'&&shape!=='twist';
      const pool=replacement?replacedLandmarks:castsShadow?shadowLandmarks:sunlitLandmarks;
      addInstanceBatches(replacement?replacements:group,materials,batches,castsShadow,pool);
    }
    return true;
  }
  return {updateOfficeDoor,landmark};
}

// OpenStreetMap level-2 footways. The deck is overhead scenery and has no ground supports.
export const skywalks=[ // A23 night: mount lighting on the same OSM spans.
  [ // OSM way 310909564
    [25.0394975,121.5670195],[25.0394937,121.5672215],
  ],
  [ // OSM way 331340437
    [25.0386949,121.5670275],[25.0386741,121.5672215],[25.037868,121.5672034],[25.0378273,121.567005],
  ],
  [ // OSM way 1339394551
    [25.0401281,121.567033],[25.0399442,121.5670294],[25.0394975,121.5670195],[25.0394134,121.5670176],
    [25.0393685,121.567043],[25.0392301,121.5670399],[25.038808,121.5670304],
  ],
  [ // OSM way 1339394552
    [25.038808,121.5670304],[25.0386949,121.5670275],[25.0378273,121.567005],[25.0377049,121.5670019],
    [25.0376808,121.566974],[25.0376828,121.566842],[25.0376684,121.5668418],
  ],
  [ // OSM way 1339401648
    [25.0375335,121.5673099],[25.037527,121.5676581],[25.0375249,121.5677739],[25.0375221,121.5679197],
    [25.0375985,121.5679215],[25.0375968,121.5680127],[25.037586,121.5685931],
  ],
  [ // OSM way 1339401656
    [25.0376684,121.5668418],[25.0373665,121.5668363],[25.0373404,121.5668358],[25.0373316,121.5668412],
    [25.0372096,121.566839],[25.0371871,121.5668528],[25.0370629,121.5668505],[25.0362245,121.5668349],
  ],
  [ // OSM way 257896676
    [25.0362245,121.5668349],[25.0361882,121.5669035],[25.0361596,121.5669367],[25.0361273,121.5669622],
    [25.03609,121.5669797],[25.0360353,121.5669867],[25.0356738,121.5670106],[25.0354322,121.5670057],
    [25.0354355,121.566809],[25.0349218,121.5667985],[25.0349236,121.5666939],[25.0349267,121.566513],
    [25.034931,121.5662684],[25.0349321,121.5662064],[25.0349533,121.5658941],
  ],
  [ // OSM way 321947680
    [25.03609,121.5669797],[25.0361222,121.5670166],[25.03706,121.5670378],[25.0371724,121.5670403],
    [25.0372243,121.5671],[25.0372227,121.5671889],[25.0373608,121.567192],[25.0373592,121.5672739],
    [25.0373592,121.5672771],[25.0375183,121.5673025],[25.0375335,121.5673099],[25.0375746,121.56733],
    [25.0375939,121.5673394],[25.0376668,121.5672623],[25.0376679,121.5671989],[25.037868,121.5672034],
  ],
];

function addSkywalks(instance){
  for(const path of skywalks){
    for(let i=1;i<path.length;i++){
      const a=toWorld(...path[i-1]),b=toWorld(...path[i]);
      const dx=(b.x-a.x)*unit,dz=(b.y-a.y)*unit,length=Math.hypot(dx,dz);
      if(length<.8)continue;
      const x=(a.x+b.x)*unit/2,z=(a.y+b.y)*unit/2,turn=-Math.atan2(dz,dx);
      instance('metal','box','#b4b5ad',x,6.42,z,length+.18,.46,3.1,turn);
      instance('glass','box','#a8bec1',x,8.88,z,length+.18,.18,3.18,turn);
      for(const side of [-1,1]){
        const ox=-dz*side*1.44/length,oz=dx*side*1.44/length;
        instance('glass','box','#879fa3',x+ox,7.15,z+oz,length,1.02,.10,turn);
        instance('metal','box','#aebdbb',x+ox,8.76,z+oz,length,.14,.16,turn);
        const bays=Math.ceil(length/3.2);
        for(let j=0;j<bays;j++){
          const t=(j+.5)/bays-.5;
          instance('metal','box','#bec0b7',x+ox+t*dx,7.77,z+oz+t*dz,.13,2.18,.12,turn);
        }
      }
    }
  }
}

function addElevatedRoofs(batch){
  // Match the 9 m top of the nearby level-2 connector roofs.
  const top=9.12,bottom=8.69;
  for(const {points} of elevatedRoofs){
    const ring=points.map(({x,y})=>new T.Vector2(x*unit,y*unit));
    const faces=T.ShapeUtils.triangulateShape(ring,[]);
    const {x,y:z}=ring[0];
    const metal=batch(x,z,'metal');
    for(const face of faces){
      const [a,b,c]=face.map(i=>ring[i]);
      metal.triangle([c.x,top,c.y],[b.x,top,b.y],[a.x,top,a.y],'#aeb7b7');
      metal.triangle([a.x,bottom,a.y],[b.x,bottom,b.y],[c.x,bottom,c.y],'#7c8381');
    }
    for(let j=0;j<ring.length;j++){
      const a=ring[j],b=ring[(j+1)%ring.length];
      metal.quad([a.x,bottom,a.y],[b.x,bottom,b.y],[b.x,top,b.y],[a.x,top,a.y],'#9ca8a7');
    }
  }
}

function addRiverBridge(instance){
  // OSM arch bridge footprint way 567293011, center points of its two short edges.
  const a=toWorld(25.05191945,121.5717299),b=toWorld(25.05275385,121.5732713);
  const dx=(b.x-a.x)*unit,dz=(b.y-a.y)*unit,length=Math.hypot(dx,dz);
  const turn=-Math.atan2(dz,dx),x=(a.x+b.x)*unit/2,z=(a.y+b.y)*unit/2;
  const deck=7.8;
  instance('concrete','box','#adaeaa',x,deck,z,length,.84,16.2,turn);
  for(const t of [.23,.77]){
    const px=a.x*unit+dx*t,pz=a.y*unit+dz*t;
    // Both piles fall inside the existing, non-walkable river collision band.
    instance('concrete','box','#8f9188',px,(deck-.42)/2,pz,2.3,deck-.42,5.1,turn);
    instance('concrete','box','#9e9d93',px,deck-.78,pz,2.87,.66,8.4,turn);
  }
  for(const side of [-1,1]){
    const ox=-dz*side*7.8/length,oz=dx*side*7.8/length;
    const at=(t,y)=>[a.x*unit+dx*t+ox,y,a.y*unit+dz*t+oz];
    const arch=t=>deck+1+12.8*4*t*(1-t);
    instance('metal','box','#d0cbc0',x+ox,deck+.86,z+oz,length,.19,.14,turn);
    for(let i=0;i<18;i++){
      const t0=i/18,t1=(i+1)/18,t=(t0+t1)/2;
      const lo=arch(t0),hi=arch(t1),delta=hi-lo;
      instance('metal','box','#d1d3cd',...at(t,(lo+hi)/2),Math.hypot(length/18,delta)+.10,.43,.49,
        turn,0,Math.atan2(delta,length/18));
      instance('metal','cylinder','#c3c4bc',...at(t,(arch(t)+deck)/2),.12,arch(t)-deck,.12);
    }
  }
}

export function addEntrances({instance,sign,batch,textWall,foliage}) {
  addElevatedRoofs(batch);
  addFactoryFront(instance,batch);
  addPondWalk(batch);
  for(const p of locations){
    if(p.shape==='temple'){
      placeEntrance(p,{instance,sign:()=>{}}); // A27 shrine returns
      addTemple(p,{instance,batch,sign,foliage});
      continue;
    }
    // A27 the open restaurant uses the same frontage for rendering and collision.
    // A23 night: the entrance paving and planted bays share the existing landmark batches.
    placeEntrance(p,{instance,sign,paving:batch,treeInstance:foliage?instance:()=>{},windowBand:(a,b,h)=>{
      const m=batch((a[0]+b[0])*.5,(a[1]+b[1])*.5,'mall');
      textWall(m,[a[0],.10,a[1]],[b[0],.10,b[1]],[b[0],h,b[1]],[a[0],h,a[1]],
        -Math.cos(p.viewHeading),-Math.sin(p.viewHeading),'#fff',1,.49);
    }});
  }
}
