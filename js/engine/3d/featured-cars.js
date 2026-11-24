import * as T from '../vendor/three.module.min.js?v=e5a00467';
import {TextureLoader} from './city-primitives.js?v=e5a00467'; // 手機貼圖減半
import {toWorld,metersPerUnit as unit,buildingHeightAt} from '../world.mjs?v=e5a00467';

// Vehicles face local +X. Bake small parts into one vertex-coloured surface per
// finish, so wheels, turbine vanes and hardware don't each submit a draw call.
const paint=['#5968bd','#267f82','#a25071'],flash=['#ffa6a8','#ffe5a2','#ffc49d'];
const ink='#202831',glass='#304b60',rim='#ced9df';
const vector=(x,y,z)=>new T.Vector3(x,y,z);
function surface(){
  const positions=[],normals=[],colors=[],uvs=[];
  const color=new T.Color();
  function append(geo,tint,uv){
    const g=geo.index?geo.toNonIndexed():geo;
    const pos=g.attributes.position,n=g.attributes.normal;
    color.set(tint);
    for(let i=0;i<pos.count;i++){
      positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      colors.push(color.r,color.g,color.b);
      uvs.push(...(uv?.(i)??[0,0]));
    }
    if(g!==geo)g.dispose();
    geo.dispose();
  }
  function face(points,tint,uv){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
    const order=points.length===4?[0,1,2,0,2,3]:[0,1,2];
    g.setIndex(order);g.computeVertexNormals();
    append(g,tint,uv&&((i)=>uv[order[i]]));
  }
  return {
    face,
    box(x,y,z,l,h,w,tint,rot=0){
      append(new T.BoxGeometry(l,h,w).rotateZ(rot).translate(x,y,z),tint);
    },
    tube(a,b,r1,r2,tint,n=12){
      const direction=vector(...b).sub(vector(...a));
      const g=new T.CylinderGeometry(r2,r1,direction.length(),n);
      g.applyQuaternion(new T.Quaternion().setFromUnitVectors(vector(0,1,0),direction.normalize()));
      append(g.translate(...a.map((v,i)=>(v+b[i])/2)),tint);
    },
    // Cross sections specify length position, floor, shoulder, crown, half-width.
    loft(sections,tints,roof=[]){
      const rings=sections.map(([x,b,s,t,w])=>[
        [x,b,-w*.82],[x,b,w*.82],[x,b+.085,w],[x,s,w],[x,t,w*.76],
        [x,t,-w*.76],[x,s,-w],[x,b+.085,-w],
      ]);
      for(let i=1;i<rings.length;i++)for(let j=0;j<8;j++){
        const k=(j+1)%8;
        face([rings[i-1][j],rings[i][j],rings[i][k],rings[i-1][k]],j===4?(roof[i-1]??tints[j]):tints[j]);
      }
      for(const [ring,reverse] of [[rings[0],false],[rings.at(-1),true]]){
        for(let j=1;j<7;j++)face(reverse?[ring[0],ring[j+1],ring[j]]:[ring[0],ring[j],ring[j+1]],tints[3]);
      }
    },
    finish(){
      const g=new T.BufferGeometry();
      for(const [key,data,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',uvs,2]])
        g.setAttribute(key,new T.Float32BufferAttribute(data,size));
      g.computeBoundingSphere();return g;
    },
  };
}
function wheels(body,ev,accent){
  for(const x of [-1.41,1.42])for(const side of [-1,1]){
    const z=side*.96,y=.36;
    body.tube([x,y,z-side*.18],[x,y,z],.343,.343,ink,20);
    body.tube([x,y,z],[x,y,z+side*.018],.268,.257,ev?'#535d69':rim,20);
    body.tube([x,y,z+side*.019],[x,y,z+side*.024],.209,.209,'#293646',16);
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+.18;
      body.tube([x+.04*Math.cos(angle),y+.04*Math.sin(angle),z+side*.027],
        [x+.216*Math.cos(angle+.23),y+.216*Math.sin(angle+.23),z+side*.027],.028,.041,accent,4);
    }
    body.tube([x,y,z+side*.026],[x,y,z+side*.037],.071,.062,rim);
  }
}
function vehicle(style){
  const ev=style===3,b=surface(),l=surface(),wrap=surface();
  const base=ev?'#b8ced3':paint[style],accent=ev?'#9aeeef':flash[style];
  const sections=ev?
    [[-2.39,.42,.65,.76,.66],[-1.9,.29,.76,.92,.96],[-.65,.25,.80,.93,.96],[.80,.26,.73,.83,.94],[1.77,.34,.63,.75,.91],[2.39,.44,.52,.60,.60]]:
    [[-2.36,.32,.65,.79,.83],[-1.92,.23,.78,.89,.94],[-.93,.22,.81,.87,.94],[.91,.22,.79,.85,.94],[1.84,.24,.65,.77,.93],[2.36,.30,.48,.61,.78]];
  b.loft(sections,[ink,ink,base,base,base,base,base,ink]);
  const top=ev?1.41:1.32+[0,.07,-.02][style];
  const cab=[[-1.61,.74,.8,.85,.74],[-.92,.78,top-.09,top,.77],[-.64,.78,top-.04,top+.055,.76],
    [.13,.78,top-.045,top+.045,.71],[.40,.78,top-.13,top-.035,.69],[1.12,.70,.81,.85,.78]];
  b.loft(cab,[ink,ink,glass,glass,ev?'#526b7a':base,glass,glass,ink],[glass,base,ev?'#42586c':base,glass,'#577382']);
  for(const side of [-1,1]){
    b.tube([-.99,top-.055,side*.65],[-1.55,.86,side*.76],.045,.07,base,5);
    b.tube([.19,top-.02,side*.57],[1.09,.83,side*.76],.035,.047,rim,5);
    b.tube([-.41,top-.055,side*.74],[-.45,.87,side*.78],.035,.037,ink,4);
    b.box(-.04,.263,side*.954,2.10,.056,.057,ev?ink:accent);
    b.tube([.67,.84,side*.77],[.62,.91,side*.959],.024,.037,ink);
    b.box(.61,.93,side*.99,.24,.095,.115,base,-.08);
    b.box(-.16,.817,side*.945,.14,.037,.020,rim);
    if(!ev){
      // The same atlas is readable on both sides. Follow the changing shoulder
      // and sill width along the sculpted hull, then let the wheels cover it.
      for(let j=1;j<sections.length;j++){
        const panel=(s,high)=>{
          const [x,bottom,shoulder,,w]=s;
          return [x,high?shoulder-.012:bottom+.094,(w+.003)*side];
        };
        const a=sections[j-1],c=sections[j];
        const stripes=[0,.10,.19,.82,.92,1],u=i=>side>0?stripes[i]:1-stripes[i];
        const low=1-(style+1)/3+.002,high=1-style/3-.002;
        wrap.face([panel(a,false),panel(c,false),panel(c,true),panel(a,true)],'#ffffff',
          [[u(j-1),low],[u(j),low],[u(j),high],[u(j-1),high]]);
      }
      b.tube([-1.82,.83,side*.58],[-2.03,1.22,side*.67],.047,.037,ink,5);
      b.box(-2.04,1.23,side*.962,.39,.19,.04,accent,-.11);
      b.tube([-2.20,.36,side*.59],[-2.45,.32,side*.64],.11,.10,rim);
      b.tube([-2.45,.32,side*.64],[-2.455,.319,side*.641],.078,.078,ink);
    }
  }
  if(ev){
    // Split silver shoulders expose the dark battery sill and four ducted nacelles.
    for(const side of [-1,1]){
      b.face([[-1.85,.74,side*.966],[-.82,.66,side*.973],[.88,.58,side*.955],[1.7,.67,side*.926]],'#6c8b99');
      b.face([[-1.56,.67,side*.974],[-.77,.52,side*.978],[.83,.46,side*.962],[1.25,.58,side*.951]],'#344750');
      b.tube([1.10,.82,side*.55],[1.89,.72,side*.58],.014,.023,'#7193a0',5);
      for(let n=0;n<4;n++)b.tube([-.99+n*.074,.72,side*.972],[-.89+n*.074,.64,side*.977],.012,.017,'#aabcc3',4);
    }
    const gold='#c9a97c';
    for(const x of [-1.38,1.38])for(const s of [-1,1]){
      const z=s*.88;
      b.tube([x,.34,z],[x,.54,z],.251,.31,'#536470',16);
      b.tube([x,.24,z],[x,.35,z],.228,.253,gold,16);
      for(let n=0;n<8;n++){
        const a=n*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a);
        b.tube([x+.205*dx,.246,z+.205*dz],[x+.232*dx,.31,z+.232*dz],.018,.030,ink,4);
      }
      l.tube([x,.236,z],[x,.245,z],.182,.19,'#a8ffff',16);
    }
    b.box(-2.30,.47,0,.15,.13,1.39,'#2a3946');
    for(const z of [-.51,-.25,0,.25,.51])b.box(-2.31,.41,z,.25,.14,.036,'#687b86',-.12);
    for(const s of [-1,1]){
      l.tube([2.36,.567,0],[2.30,.602,s*.60],.027,.032,'#dcffff');
      l.tube([2.30,.602,s*.60],[1.84,.71,s*.86],.032,.015,'#9dfcff');
      l.tube([-2.36,.69,0],[-2.32,.69,s*.68],.035,.027,'#ff798a');
      b.tube([-.8,.46,s*.965],[.85,.50,s*.956],.018,.021,gold,6);
    }
  }else{
    // Use a second portion of the wrap across the bonnet and rear deck.
    for(const [start,end,back] of [[sections[3],sections[4],false],[sections[0],sections[1],true]]){
      const point=(row,side)=>[row[0],row[3]+.006,side*row[4]*.70];
      const low=1-(style+1)/3+.012,high=1-style/3-.012;
      wrap.face([point(start,-1),point(end,-1),point(end,1),point(start,1)],'#ffffff',
        [[.03,low],[.03,high],[back?.40:.9,high],[back?.40:.9,low]]);
    }
    const rearUV=1-style/3,tailX=-2.367;
    wrap.face([[tailX,.407,.775],[tailX,.407,-.775],[tailX,.65,-.775],[tailX,.65,.775]],'#ffffff',
      [[.12,rearUV-.316],[.97,rearUV-.316],[.97,rearUV-.015],[.12,rearUV-.015]]);
    b.box(-2.04,1.23,0,.33,.072,1.99,ink,-.11);
    b.box(-2.10,1.27,0,.09,.045,1.92,base,-.12);
    b.tube([-.82,top,0],[-.98,top+.60,.055],.019,.007,ink,5);
    b.box(2.27,.316,0,.21,.067,1.84,ink);
    for(const s of [-1,1]){
      l.tube([2.34,.53,s*.46],[2.27,.57,s*.79],.034,.055,'#fff5cb');
      l.tube([-2.365,.61,s*.40],[-2.365,.63,s*.75],.038,.052,'#ff5368');
      b.tube([.94,.858,s*.31],[1.95,.733,s*.45],.025,.045,accent,4);
    }
  }
  wheels(b,ev,accent);
  return {body:b.finish(),lights:l.finish(),wrap:ev?null:wrap.finish()};
}

// A continuous rectangular sweep covers the entire flight lane, including the
// gaps between samples. Routes are above infill roofs and clear of the 101 site.
const lanes=[
  [[25.04125,121.557],[25.04125,121.569],0,86],
  [[25.03405,121.562],[25.03405,121.555],9,109],
].map(([start,end,offset,period])=>{
  const a=toWorld(...start),b=toWorld(...end),dx=b.x-a.x,dy=b.y-a.y;
  const distance=Math.hypot(dx,dy),heading=Math.atan2(dy,dx);
  const roof=buildingHeightAt((a.x+b.x)/2,(a.y+b.y)/2,distance/2+3/unit,2.1/unit,heading);
  return {a,dx,dy,heading,altitude:Math.max(46,roof+12),travel:distance*unit/24,offset,period};
});
export function skyTraffic(clock){
  const visible=[];
  for(const lane of lanes){
    const t=(clock+lane.offset)%lane.period;
    if(t>=lane.travel)continue;
    const f=t/lane.travel;
    visible.push({x:(lane.a.x+lane.dx*f)*unit,z:(lane.a.y+lane.dy*f)*unit,heading:lane.heading,altitude:lane.altitude});
  }
  return visible;
}

export function createFeaturedCars(scene,glow){
  let textureReady;
  const ready=new Promise(resolve=>{textureReady=resolve;});
  const atlas=new TextureLoader().load(new URL('../../../assets/tex/featured-car-wraps.webp',import.meta.url).href,textureReady,undefined,()=>textureReady(null));
  atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=4;
  const metal=new T.MeshStandardMaterial({vertexColors:true,metalness:.32,roughness:.33});
  const luminous=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const vinyl=new T.MeshStandardMaterial({map:atlas,roughness:.44,side:T.DoubleSide,emissiveMap:atlas,emissive:'#ffffff',emissiveIntensity:.18});
  const effects=new T.MeshBasicMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,toneMapped:false});
  const dustMat=new T.MeshBasicMaterial({transparent:true,map:glow,opacity:.38,side:T.DoubleSide,depthWrite:false,color:'#dbb898'});
  const batches=[];
  function batch(geometry,material,count){
    const mesh=new T.InstancedMesh(geometry,material,count);
    mesh.name='featured-car-batch';mesh.count=0;mesh.visible=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);batches.push(mesh);return mesh;
  }
  const cars=[0,1,2,3].map(style=>{
    const mesh=vehicle(style);
    const body=batch(mesh.body,metal,96);body.castShadow=true;body.receiveShadow=true;
    return {body,lights:batch(mesh.lights,luminous,96),wrap:mesh.wrap&&batch(mesh.wrap,vinyl,96)};
  });
  const flame=batch(new T.LatheGeometry([[.02,-1],[.30,-.72],[.52,-.43],[.78,-.24],[.88,-.08],[.76,0]]
    .map(([r,y])=>new T.Vector2(r,y)),16),effects,64);
  const haze=batch(new T.TorusGeometry(1,.035,6,32).rotateX(Math.PI/2),effects,64);
  const dust=batch(new T.PlaneGeometry(1,1).rotateX(-Math.PI*.25),dustMat,32);
  const plume=batch(new T.ConeGeometry(1,1,10).translate(0,.5,0).rotateZ(Math.PI/2),effects,24);
  const frame=new T.Object3D(),part=new T.Object3D(),matrix=new T.Matrix4(),shade=new T.Color();
  function pose(x,y,z,heading,roll=0,pitch=0){
    frame.position.set(x,y,z);frame.rotation.set(roll,-heading,pitch,'YXZ');frame.updateMatrix();
  }
  function emit(mesh,x,y,z,sx,sy,sz,tint){
    part.position.set(x,y,z);part.scale.set(sx,sy,sz);part.updateMatrix();
    matrix.multiplyMatrices(frame.matrix,part.matrix);
    const i=mesh.count++;
    mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,shade.set(tint));
  }
  function shell(style){
    const car=cars[style];
    for(const mesh of [car.body,car.lights,car.wrap])if(mesh&&mesh.count<mesh.instanceMatrix.count)
      mesh.setMatrixAt(mesh.count++,frame.matrix);
  }
  function electric(x,z,heading,altitude,turn,clock,night,speed,style=3){ // A26
    const lift=Math.min(1,altitude/.8),hover=.068*Math.sin(clock*3)*lift;
    pose(x,.06+altitude+hover,z,heading,-turn*.13);
    shell(style); // A26
    if(altitude<.07)return;
    const jet=Math.min(1,altitude/1.3);
    for(const px of [-1.38,1.38])for(const pz of [-.88,.88]){
      const wave=Math.sin(clock*22+px*5+pz*3);
      const len=(1.05+wave*.13)*jet;
      emit(flame,px,.24,pz,.215,len,.215,'#287fff');
      emit(flame,px,.235,pz,.14,len*.66,.14,'#beffff');
      const age=(clock*2+px+pz+6)%1,size=.12+.16*age;
      emit(haze,px+.04*wave,.19-len*(.70+age*.58),pz,size,.14,size,'#4684ac');
    }
    if(night>.15&&speed>1){
      const length=Math.min(7,speed*.42)*night;
      for(const sign of [-1,1]){
        emit(plume,-1.75,.56,sign*.69,length,.081,.092,'#4184e6');
        emit(plume,-1.75,.56,sign*.69,length*.69,.035,.05,'#adfcff');
      }
    }
    if(altitude<2.8){
      pose(x,.045,z,heading);
      const radius=.85+altitude*.84;
      emit(haze,0,.018,0,radius*1.23,.5,radius,'#57a5bb');
      for(let i=0;i<12;i++){
        const a=i*2.4,age=(clock*1.4+i*.137)%1,d=radius*(.85+.6*age);
        emit(dust,Math.cos(a)*d,.06+.16*age,Math.sin(a)*d,.65+age*.55,.39+age*.35,.55+age*.46,'#ffffff');
      }
    }
  }
  return {
    ready,
    begin(){for(const mesh of batches){mesh.count=0;mesh.visible=false;}},
    street(car,x,z){
      const hit=car.impact;
      pose(x,.05+(hit?.center??0),z,car.heading,hit?.roll??0,hit?.pitch??0);
      if(hit){frame.translateY(-hit.spec.height);frame.updateMatrix();}
      shell(car.featuredStyle);
    },
    electric,
    finish(){
      for(const mesh of batches)if(mesh.count){
        mesh.computeBoundingSphere();mesh.visible=true;mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      }
    },
    dispose(){
      for(const mesh of batches){scene.remove(mesh);mesh.geometry.dispose();mesh.dispose();}
      for(const mat of [metal,luminous,vinyl,effects,dustMat])mat.dispose();
      atlas.dispose();
    },
  };
}
