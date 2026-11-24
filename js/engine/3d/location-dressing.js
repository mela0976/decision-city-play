// Hand-built props that dress three sparse destinations: the 44 South Village shop
// forecourt, the Rainbow riverside promenade and the Songshan creative-park lawn.
// The renderer and fixtures.mjs both call placeLocationDressing with the same arguments,
// so every box or cylinder that reaches walking height is also a collider.
// Flat paving goes through the optional `paving` batch and never blocks movement.
import {metersPerUnit as unit,roadAt,inBuilding} from '../world.mjs?v=70a6a7b0';
import {riversideBank,promenade} from '../riverside-bank.mjs?v=70a6a7b0';
import {placeTree} from './vegetation.js?v=70a6a7b0';

// Local frame shared with placeEntrance: u runs along the street, d away from it.
function frame(p){
  const a=p.viewHeading,s=Math.sin(a),c=Math.cos(a),turn=Math.PI/2-a;
  const at=(u,d)=>[p.x*unit+u*s+d*c,p.y*unit-u*c+d*s];
  return {at,turn};
}

function kit(instance,at,turn){
  const put=(kind,shape,tint,u,y,d,w,h,l,rot=0,rx=0,rz=0)=>{
    const [x,z]=at(u,d);
    instance(kind,shape,tint,x,y,z,w,h,l,turn+rot,rx,rz);
  };
  const box=(tint,u,y,d,w,h,l,rot=0,kind='metal')=>put(kind,'box',tint,u,y,d,w,h,l,rot);
  const post=(tint,u,y,d,w,h,kind='metal')=>put(kind,'cylinder',tint,u,y,d,w,h,w);
  const blob=(tint,u,y,d,w,h,l,kind='grass')=>put(kind,'crown',tint,u,y,d,w,h,l);
  // A slatted park bench whose seat faces local -d after `rot`.
  function bench(u,d,rot=0,length=1.8,wood='#8d6a48'){
    const c=Math.cos(rot),s=Math.sin(rot);
    const off=(a,b)=>[u+a*c+b*s,d-a*s+b*c];
    for(const k of [-.13,0,.13]){const [x,z]=off(0,k);box(wood,x,.45,z,length,.045,.11,rot);}
    for(const y of [.62,.78]){const [x,z]=off(0,.25);box(wood,x,y,z,length,.09,.04,rot);}
    for(const side of [-1,1]){
      const [lx,lz]=off(side*(length/2-.14),.02);
      box('#4b4f4c',lx,.22,lz,.06,.44,.46,rot);
      const [bx,bz]=off(side*(length/2-.14),.25);
      box('#4b4f4c',bx,.60,bz,.05,.42,.05,rot);
    }
  }
  function potted(u,d,size=1,leaf='#5e7a45',pot='#a2674b'){
    post(pot,u,.21*size,d,.46*size,.42*size,'concrete');
    post('#5a4a3c',u,.43*size,d,.40*size,.03,'earth');
    blob(leaf,u,.62*size,d,.62*size,.52*size,.62*size);
    blob('#6f8c50',u+.12*size,.82*size,d-.05*size,.38*size,.36*size,.38*size);
  }
  return {put,box,post,blob,bench,potted};
}

// Tile a rectangle in the local frame with alternating tints, skipping road and buildings.
function tilePatch(paving,at,{u0,u1,d0,d1,size,tints,y=.012,gap=.03,skip=()=>false}){
  if(!paving)return;
  const [cx,cz]=at((u0+u1)/2,(d0+d1)/2);
  const out=paving(cx,cz,'paving');
  const nu=Math.round((u1-u0)/size[0]),nd=Math.round((d1-d0)/size[1]);
  for(let i=0;i<nu;i++)for(let j=0;j<nd;j++){
    const shift=(j%2)*size[0]*.5;
    const a=u0+i*size[0]+shift,b=Math.min(u1,a+size[0]-gap),c=d0+j*size[1],e=c+size[1]-gap;
    if(b<=a+.05||skip(a,c)||skip(b,e))continue;
    const corners=[[a,c],[b,c],[b,e],[a,e]].map(([u,d])=>at(u,d));
    if(corners.some(([x,z])=>roadAt(x/unit,z/unit,-.2/unit)||inBuilding(x/unit,z/unit)))continue;
    out.quad(...corners.map(([x,z])=>[x,y,z]),tints[(i*7+j*3+(i*j)%5)%tints.length],.5,.5);
  }
}

function dressVillageShop(p,{instance,paving,treeInstance}){
  const {at,turn}=frame(p);
  const {box,post,blob,bench,potted,put}=kit(instance,at,turn);
  // Terracotta brick forecourt in front of the shop, and a weathered tile and cement yard
  // where the empty plaza used to be. The entrance aisle (|u|<2.6) stays an open floor.
  tilePatch(paving,at,{u0:-6.2,u1:6.2,d0:3.6,d1:7.8,size:[.46,.23],
    tints:['#b1715a','#a8644e','#b97d62','#9d5f4b','#b26f55']});
  tilePatch(paving,at,{u0:-15.5,u1:-6.4,d0:4.6,d1:15.2,size:[.62,.62],
    tints:['#b3aa9c','#c2b8a8','#a99f92','#bdb2a1','#9e978c','#c4a48f'],
    skip:(u,d)=>u>-8.2&&d>12.6});
  tilePatch(paving,at,{u0:5.4,u1:11.2,d0:6.2,d1:11.8,size:[.62,.62],
    tints:['#b8ae9f','#a9a094','#c3b9a9','#b07b62']});

  // Canopy-edge lanterns under the existing venue eave (decorative, above head height).
  for(const u of [-2.4,2.4]){
    box('#3c3631',u,2.86,7.72,.02,.22,.02);
    blob('#c8402f',u,2.6,7.72,.36,.44,.36,'metal');
    box('#d9a548',u,2.36,7.72,.06,.08,.06);
  }

  // Lantern string over the yard: two posts with a cable and red paper lanterns.
  for(const u of [-4.9,-13.4])post('#5a4b3c',u,1.6,6.3,.11,3.2);
  box('#2f2b28',-9.15,3.08,6.3,8.5,.025,.025);
  for(let i=0;i<7;i++){
    const u=-5.9-i*1.07,sag=.18*Math.sin(Math.PI*(i+.5)/7);
    box('#2f2b28',u,2.98-sag,6.3,.015,.16,.015);
    blob(i%3===1?'#d8803c':'#c53b2c',u,2.72-sag,6.3,.34,.42,.34,'metal');
    box('#d6a84a',u,2.48-sag,6.3,.05,.07,.05);
  }

  // Goods stall right of the door: a sloped wooden display, candy jars, baskets.
  const stallU=-5.6,stallD=9.4;
  box('#7b5a3e',stallU,.42,stallD,1.9,.84,.72);
  box('#9a7451',stallU,.86,stallD,2.0,.05,.8);
  for(const side of [-1,1])box('#6c4f37',stallU+side*.95,.95,stallD+.33,.06,1.9,.06);
  box('#6c4f37',stallU,1.88,stallD+.33,1.96,.06,.06);
  const candy=['#e4a03f','#d6585a','#e7d36a','#9fc15d','#e98fae','#c98c4a'];
  for(let i=0;i<6;i++){
    const u=stallU-.78+i*.31;
    post(candy[i],u,1.01,stallD-.12,.22,.26,'concrete');
    post('#cfd6d2',u,1.01,stallD-.12,.25,.24,'lobbyGlass');
    post('#a8a49a',u,1.17,stallD-.12,.2,.05);
  }
  for(let i=0;i<3;i++){
    const u=stallU-.6+i*.6;
    post('#b98b52',u,.93,stallD+.2,.46,.1);
    blob(['#d9b062','#a8553f','#e0c27b'][i],u,.98,stallD+.2,.36,.12,.36,'concrete');
  }
  // Hanging snack bags on the stall frame.
  for(let i=0;i<5;i++)box(['#e2c35a','#d9653f','#79a6c4','#e7a2b0','#9cc27a'][i],
    stallU-.7+i*.35,1.62,stallD+.33,.24,.32,.03);

  // Candy jar bench left of the door, where the street camera sees it first.
  box('#6e5139',4.9,.36,8.0,1.3,.72,.62);
  box('#94704e',4.9,.74,8.0,1.4,.05,.7);
  for(let i=0;i<4;i++){
    const u=4.42+i*.32;
    post(candy[(i+2)%6],u,.92,7.92,.24,.3,'concrete');
    post('#cfd6d2',u,.92,7.92,.27,.28,'lobbyGlass');
    post('#a8a49a',u,1.1,7.92,.22,.06);
  }
  post('#b98b52',4.9,.8,8.26,.5,.08);
  // Drink crates and a goods rack against the side wall.
  const crate=(u,d,y,tint)=>{
    box(tint,u,y+.15,d,.56,.3,.4);
    for(let k=0;k<3;k++)post(['#5c3a2a','#c7a56b','#3d5f3b'][k],u-.16+k*.16,y+.37,d,.08,.16);
  };
  crate(-7.6,11.0,0,'#c4473b');crate(-7.6,11.0,.3,'#2f6aa3');crate(-8.2,11.4,0,'#d1a13c');
  crate(-7.1,11.6,0,'#2f6aa3');crate(-7.1,11.6,.3,'#c4473b');crate(-7.1,11.6,.6,'#d1a13c');
  const rackU=-9.8,rackD=12.0;
  for(const side of [-1,1])box('#5d5a52',rackU+side*.82,.95,rackD,.05,1.9,.42);
  for(let row=0;row<4;row++){
    const y=.18+row*.5;
    box('#8a8678',rackU,y,rackD,1.66,.035,.42);
    for(let i=0;i<6;i++){
      const tint=['#c85a42','#e1b24c','#5f8fb4','#e9e2cf','#78a356','#b86a8c'][(i+row*2)%6];
      box(tint,rackU-.68+i*.27,y+.12,rackD-.04,.2,.2+((i+row)%3)*.04,.22);
    }
  }

  // Seating: a long wooden bench by the door, a pair of stools and a tea table.
  bench(-11.6,8.4,0,2.1);
  bench(7.6,10.6,0,1.9,'#7e5f43');
  for(const [u,d] of [[-12.6,11.3],[-11.3,11.8]]){
    post('#6f5440',u,.22,d,.32,.44);
    post('#8b6b4e',u,.46,d,.38,.05);
  }
  post('#6b5845',-12,.34,12.4,.12,.68);
  post('#9a7a5a',-12,.7,12.4,.78,.05);

  // Potted plants and a water jar along the frontage.
  potted(-4.3,7.2,1.05);potted(7.1,9.6,1.05,'#678748','#8f5a43');
  potted(-14.2,6.0,1.3,'#4f6e3e');potted(-14.6,9.6,.95,'#6b8a4a','#7a6f62');
  potted(7.0,7.3,1.2,'#557040','#6d6a60');potted(10.5,8.0,.9);
  post('#5f5546',-13.1,.3,13.6,.62,.6,'concrete');
  post('#3f5562',-13.1,.58,13.6,.56,.03,'glass');
  for(let i=0;i<4;i++)potted(-6.6-i*.55,13.6+(i%2)*.18,.72,['#627d47','#7b8c4d'][i%2],'#9d6549');

  // A parked scooter in the yard and a bicycle leaning by the bench.
  const scooter=(u,d,rot,tint)=>{
    for(const j of [-1,1])box('#252b31',u+j*.61*Math.cos(rot),.19,d-j*.61*Math.sin(rot),.36,.38,.135,rot);
    box(tint,u,.44,d,1.62,.44,.43,rot);
    box('#39373b',u-.18*Math.cos(rot),.73,d+.18*Math.sin(rot),.66,.085,.37,rot);
    box(tint,u+.54*Math.cos(rot),.72,d-.54*Math.sin(rot),.29,.51,.42,rot);
    box('#bbc1bc',u+.48*Math.cos(rot),.99,d-.48*Math.sin(rot),.09,.061,.64,rot);
  };
  scooter(-10.6,14.4,.12,'#8fb1a8');
  const bike=(u,d,rot)=>{
    const c=Math.cos(rot),s=Math.sin(rot);
    for(const j of [-1,1])put('metal','cylinder','#2c2e30',u+j*.52*c,.34,d-j*.52*s,.66,.05,.66,rot+Math.PI/2,0,Math.PI/2);
    box('#a3443a',u,.55,d,1.0,.05,.05,rot);
    box('#a3443a',u+.12*c,.42,d-.12*s,.05,.42,.05,rot);
    box('#2f2f2f',u-.2*c,.8,d+.2*s,.24,.05,.12,rot);
    box('#8a8f92',u+.46*c,.86,d-.46*s,.05,.05,.5,rot);
    box('#8a8f92',u+.48*c,.62,d-.48*s,.05,.5,.05,rot);
  };
  bike(9.6,11.4,.08);

  // Old village houses: drying poles, a low brick wall and a hand-painted mailbox.
  for(let i=0;i<7;i++)box(i%2?'#a8604a':'#b3694f',-17.0,.38,5.4+i*1.12,.24,.76,1.08,0,'concrete');
  box('#c4b9a6',-17.0,.8,9.3,.3,.08,7.9,0,'concrete');
  for(const d of [6.2,12.3])post('#7c7468',-16.2,1.15,d,.06,2.3);
  box('#8a8170',-16.2,2.25,9.25,.03,.03,6.1);
  for(let i=0;i<6;i++)box(['#dfe3e6','#c9625a','#e8d9a8','#7ea0c2','#f0efe8','#b6c48e'][i],
    -16.2,1.86,6.9+i*.9,.02,.7,.5);
  box('#2e6a49',11.6,1.05,6.8,.34,.48,.28);
  post('#565b57',11.6,.4,6.8,.07,.8);

  // Shade tree in the yard corner.
  const [tx,tz]=at(-14.8,13.9);
  placeTree(treeInstance,tx,tz,4471,.24);
}

function dressRiverside(p,{instance,paving,treeInstance}){
  const bank=riversideBank();
  if(!bank)return;
  const {pts,normals,offsetAt}=bank,{pathIn,pathOut}=promenade,mid=(pathIn+pathOut)/2;
  let index=0;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<1)continue;
    const tx=dx/length,tz=dz/length,[nx,nz]=normals[i],turn=-Math.atan2(tz,tx);
    const near=(f,off)=>bank.near(...offsetAt(i,f,off));
    if(![0,.25,.5,.75,1].some(f=>near(f,mid)))continue;
    if(paving){
      // Riverside lawn, a paved bike path with lane lines, and pale kerb edges.
      const steps=Math.ceil(length/3);
      for(let j=0;j<steps;j++){
        const f0=j/steps,f1=(j+1)/steps;
        if(!near(f0,mid)&&!near(f1,mid))continue;
        const [x,z]=offsetAt(i,f0,mid);
        const band=(kind,o0,o1,y,tint,u=1,v=1,g0=f0,g1=f1)=>{
          const c=[offsetAt(i,g0,o0),offsetAt(i,g1,o0),offsetAt(i,g1,o1),offsetAt(i,g0,o1)];
          paving(x,z,kind).quad(...c.map(([px,pz])=>[px,y,pz]),tint,u,v);
        };
        band('grass',.4,pathIn-.4,.008,j%2?'#5f7843':'#5b7441');
        band('grass',pathOut+.4,pathOut+15,.008,j%2?'#5d7642':'#5a7340');
        band('concrete',pathIn,pathOut,.018,j%3?'#8b8984':'#85837e');
        band('concrete',pathIn-.4,pathIn,.02,'#bdb7a9');
        band('concrete',pathOut,pathOut+.4,.02,'#bdb7a9');
        for(const o of [pathIn+.14,pathOut-.14])band('line',o-.05,o+.05,.026,'#e6e2d2');
        if(j%2===0)band('line',mid-.05,mid+.05,.026,'#efe7c2',1,1,f0,f0+(f1-f0)*.55);
      }
    }
    // Railing, lamps, benches and planting along the embankment and the path.
    for(let t=1.2;t<length;t+=2.4){
      const f=t/length;
      if(!near(f,mid))continue;
      const k=index++;
      const [px,pz]=offsetAt(i,f,.75);
      instance('metal','cylinder','#8d9692',px,.55,pz,.1,1.1,.1);
      const [rx,rz]=offsetAt(i,Math.min(1,f+1.2/length),.75);
      for(const y of [1.08,.62])instance('metal','box',y>1?'#b4bbb6':'#98a09b',rx,y,rz,2.42,y>1?.08:.05,y>1?.09:.05,turn);
      if(k%2===0){
        // Silver-grass reeds on the revetment below the railing.
        const [qx,qz]=offsetAt(i,f,-.7);
        for(let j=0;j<4;j++){
          const ox=Math.cos(j*2.4+k)*.3,oz=Math.sin(j*2.4+k)*.3,h=1.1+((j+k)%3)*.25,lean=(j-1.5)*.1;
          instance('grass','box','#8f9762',qx+ox,h/2,qz+oz,.04,h,.04,j,0,lean);
          instance('grass','box','#e6dcc2',qx+ox-lean*h*.5,h+.1,qz+oz,.09,.34,.09,j,0,lean);
        }
      }
      if(k%4===1){
        const [sx,sz]=offsetAt(i,f,2.4);
        instance('grass','crown',k%8===1?'#55703f':'#62793f',sx,.34,sz,1.6,.66,1.2,turn);
      }
      if(k%10===4){
        const [lx,lz]=offsetAt(i,f,pathIn-1.1),[hx,hz]=offsetAt(i,f,pathIn-.75),[gx,gz]=offsetAt(i,f,pathIn-.5);
        instance('metal','cylinder','#3e4442',lx,2.2,lz,.12,4.4,.12);
        instance('metal','box','#3e4442',hx,4.38,hz,.7,.08,.12,turn+Math.PI/2);
        instance('luminous','box','#f3e2bd',gx,4.31,gz,.3,.05,.22,turn+Math.PI/2);
      }
      if(k%10===8){
        const [bx,bz]=offsetAt(i,f,pathIn-2.1);
        benchAlong(instance,bx,bz,tx,tz,nx,nz);
      }
      if(k%9===6){
        const [gx,gz]=offsetAt(i,f,pathOut+3.6);
        if(!roadAt(gx/unit,gz/unit,-1/unit))placeTree(treeInstance,gx,gz,7700+k,.24);
      }
    }
  }
}

// Bench seat faces the river along tangent (tx,tz), seat behind (nx,nz) away from water.
function benchAlong(instance,x,z,tx,tz,nx,nz){
  const turn=-Math.atan2(tz,tx),wood='#86684b';
  const at=(u,d)=>[x+u*tx+d*nx,z+u*tz+d*nz];
  for(const k of [-.13,0,.13]){const [a,b]=at(0,k);instance('metal','box',wood,a,.45,b,1.8,.045,.11,turn);}
  for(const y of [.62,.78]){const [a,b]=at(0,.26);instance('metal','box',wood,a,y,b,1.8,.09,.04,turn);}
  for(const side of [-1,1]){
    const [a,b]=at(side*.76,.02);instance('metal','box','#4b4f4c',a,.22,b,.06,.44,.46,turn);
    const [c,d]=at(side*.76,.26);instance('metal','box','#4b4f4c',c,.6,d,.05,.42,.05,turn);
  }
}

function dressStudioLawn(p,{instance,paving,treeInstance}){
  const {at,turn}=frame(p);
  const {box,post,blob,bench,potted}=kit(instance,at,turn);
  const pathD=9.4;
  // Pale concrete pavers along the lawn to the studio forecourt, with a spur to the kerb.
  tilePatch(paving,at,{u0:-46,u1:-6.6,d0:pathD-1.2,d1:pathD+1.2,size:[1.2,.6],
    tints:['#c9c2b3','#bdb6a7','#d3ccbd','#b5ae9f']});
  tilePatch(paving,at,{u0:-27.2,u1:-24.8,d0:4.2,d1:pathD-1.2,size:[.6,1.2],
    tints:['#c9c2b3','#bdb6a7','#d3ccbd']});
  tilePatch(paving,at,{u0:-27,u1:-17,d0:16,d1:24,size:[1,1],
    tints:['#a9a294','#b8b1a2','#9f998c','#c2baa9']});

  // Raised timber-edged planters with trees on the far side of the path.
  for(const [i,u] of [-41,-33,-17.5,-10].entries()){
    const d=pathD+3.3;
    box('#a7a194',u,.26,d,2.0,.52,2.0,0,'concrete');
    box('#8b6c4b',u,.54,d,2.08,.06,2.08);
    box('#5a4b3b',u,.53,d,1.8,.02,1.8,0,'earth');
    blob('#5d7845',u+.5,.66,d-.5,.6,.3,.6);
    const [x,z]=at(u,d);
    placeTree(treeInstance,x,z,9100+i,.24);
  }
  // Benches facing the path between the planters.
  for(const u of [-37,-29,-13.8])bench(u,pathD+2.2);
  // Bollard lights along the near edge of the path and two tall park lamps.
  for(let u=-44;u<-7;u+=5.5){
    post('#3d403e',u,.42,pathD-1.6,.16,.84);
    post('#f2e3c0',u,.78,pathD-1.6,.13,.1,'luminous');
  }
  for(const u of [-30.5,-21]){
    post('#3a3d3b',u,2.2,pathD-1.75,.12,4.4);
    box('#3a3d3b',u,4.35,pathD-1.5,.1,.08,.6);
    box('#f6e8c6',u,4.28,pathD-1.3,.32,.05,.2,0,'luminous');
  }

  // A sign-less installation: nested, twisted weathering-steel frames on a paved pad.
  const cu=-22,cd=20;
  for(let i=0;i<5;i++){
    const size=3.6-i*.48,rot=i*.22,h=size*1.05,th=.16;
    const c=Math.cos(rot),s=Math.sin(rot);
    const tint=['#9a5634','#a6603a','#8d4f31','#ad6b43','#93532f'][i];
    for(const side of [-1,1]){
      box(tint,cu+side*size/2*c,h/2,cd-side*size/2*s,th,h,th,rot);
    }
    box(tint,cu,h-th/2,cd,size+th,th,th,rot);
  }
  // Concrete cubes as informal seats around the pad.
  for(const [u,d,w] of [[-25.6,17.2,.9],[-18.6,17.6,.75],[-19.2,22.8,1.0],[-25.3,22.6,.7]]){
    box('#b8b2a5',u,w/2,d,w,w,w,(u+d)*.3,'concrete');
  }
  // Mown lawn under the dressing, then shrubs at the planter feet and pots by the forecourt.
  if(paving){
    const [cx,cz]=at(-26,17),lawn=paving(cx,cz,'grass');
    for(let u=-46;u<-7;u+=3)for(let d=4.8;d<30;d+=3){
      const corners=[[u,d],[u+3,d],[u+3,d+3],[u,d+3]].map(([a,b])=>at(a,b));
      if(corners.some(([x,z])=>roadAt(x/unit,z/unit,-.3/unit)||inBuilding(x/unit,z/unit)))continue;
      lawn.quad(...corners.map(([x,z])=>[x,.006,z]),Math.round(u/3)%2?'#6b8650':'#64804b');
    }
  }
  for(const u of [-41,-33,-17.5,-10])for(const side of [-1,1])
    blob(side>0?'#4f6939':'#5b7040',u+side*1.6,.3,pathD+3.6,.9,.55,.8);
  for(const [u,d] of [[-8.5,8.6],[-8.5,10.2]])potted(u,d,1.2,'#5e7f47','#8e8a80');
}

// `paving(x,z,kind)` returns a triangle batch; omit it for collision-only visits.
// `treeInstance` defaults to `instance` so collision visits register the same trunks.
export function placeLocationDressing(p,{instance,paving=null,treeInstance=instance}){
  if(p.id==='gamadiam')dressVillageShop(p,{instance,paving,treeInstance});
  else if(p.id==='riverside')dressRiverside(p,{instance,paving,treeInstance});
  else if(p.id==='studio')dressStudioLawn(p,{instance,paving,treeInstance});
}
