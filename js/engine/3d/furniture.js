import {placeTree} from './vegetation.js?v=f213092';
import {hash} from './city-primitives.js?v=f213092';
import {crossings} from '../street-crossings.mjs?v=f213092';
import {carriagewayAt} from '../sidewalks.mjs?v=f213092';
import {placedPoles} from '../signal-poles.mjs?v=f213092';
import {roads,locations,inBuilding,roadAt,roadOptions,toWorld,random,worldContact,metersPerUnit as unit} from '../world.mjs?v=f213092';

const marketApproach=toWorld(25.02960,121.55408);
const studioEntrance=toWorld(25.04509,121.55910);
const stopLocation=toWorld(25.03291,121.56645);
const carriageways=roadOptions(stopLocation.x,stopLocation.y,8)
  .map(option=>option.r).filter(r=>r[5].way.name==='信義路五段');
const stopRoad=carriageways[0];
const reverseRoad=carriageways.find(r=>r[2]>r[0]);

export function xinyiBusBay(along=0,offset=0,reverse=false){
  const [ax,az,bx,bz,width]=reverse?reverseRoad:stopRoad;
  const heading=Math.atan2(bz-az,bx-ax),side=width*unit/2+offset;
  const originX=reverse?1478:(ax+bx)*unit/2;
  const originZ=reverse?az*unit+(originX-ax*unit)*Math.tan(heading):(az+bz)*unit/2;
  return {
    x:originX+Math.cos(heading)*along-Math.sin(heading)*side,
    z:originZ+Math.sin(heading)*along+Math.cos(heading)*side,
    heading,
  };
}

export function placeStreetLife({instance,paint,sign,roadMark=()=>{},signal=()=>{},vendorLight,lampGlow=()=>{},obstacle:register=()=>{},parked=()=>false,treeInstance=instance,nightInstance=instance}) {
  // Fixture footprints crossing the OSM travel strip stay decorative.
  // Props fully on the pavement still block normal movement and riding.
  const obstacle=(x,z,r,h,kind)=>{if(!roadAt(x/unit,z/unit,-r/unit*.55))register(x,z,r,h,kind);};
  const block=(color,x,y,z,w,h,d,turn=0)=>instance('metal','box',color,x,y,z,w,h,d,turn);
  const pole=(color,x,y,z,w,h)=>instance('metal','cylinder',color,x,y,z,w,h,w);
  const glow=(color,x,y,z,w,h,d)=>nightInstance('luminous','box',color,x,y,z,w,h,d);
  const tree=(x,z,seed)=>{
    if(carriagewayAt(x/unit,z/unit))return; // 樹不種在車道上
    obstacle(x,z,.16,3.4);
    placeTree(treeInstance,x,z,seed);
  };
  function scooter(x,z,a,i){
    obstacle(x,z,.76,1.08);
    if(parked(x,z,a,i))return;
    const [dx,dz]=[Math.cos(a),Math.sin(a)];
    const c=['#bf6660','#668e96','#d1c8b7','#555d79','#7b7a67'][i%5];
    for(const j of [-1,1])block('#252b31',x+j*dx*.61,.19,z+j*dz*.61,.36,.38,.135,-a);
    block(c,x,.44,z,1.62,.44,.43,-a);
    block('#39373b',x-dx*.18,.73,z-dz*.18,.66,.085,.37,-a);
    block(c,x+dx*.54,.72,z+dz*.54,.29,.51,.42,-a);
    block('#bbc1bc',x+dx*.48,.99,z+dz*.48,.09,.061,.64,-a);
  }
  const lamps=new Set();
  for(const [i,[ax,ay,bx,by,w,edge]] of roads.entries()) {
    if(!edge.way.name||edge.way.kind==='pedestrian'||edge.d*unit<13)continue;
    const span=w*unit,dx=(bx-ax)/edge.d,dz=(by-ay)/edge.d;
    const t=.56,length=edge.d*unit,x=(ax+(bx-ax)*t)*unit,z=(ay+(by-ay)*t)*unit;
    const qx=x-dz*(span/2+1.22),qz=z+dx*(span/2+1.22);
    const key=Math.floor(qx/15)+','+Math.floor(qz/15);
    // 路燈與行道樹放在路緣外；路口或兩條路靠很近時，這個點會落在別條路的車道上，就不放
    if(lamps.has(key)||inBuilding(qx/unit,qz/unit)||roadAt(qx/unit,qz/unit,-.5/unit,1e-6))continue;
    lamps.add(key);
    if(i%3===0){
      obstacle(qx,qz,.11,5.3);
      pole('#676e66',qx,2.65,qz,.12,5.3);
      block('#73796d',qx+dz*.42,5.26,qz-dx*.42,.92,.10,.12,Math.atan2(dx,dz));
      glow('#f4d5a1',qx+dz*.73,5.19,qz-dx*.73,.31,.065,.19);
      lampGlow(qx+dz*.73,5.18,qz-dx*.73);
      if(i%27===0&&['residential','unclassified'].includes(edge.way.kind)){
        const along=Math.atan2(dz,dx),fx=qx+dx*.30,fz=qz+dz*.30;
        block('#6e7067',fx,4.78,fz,.63,.032,.032,-along);
        sign('街坊共好',fx,4.10,fz,Math.PI/2-along,'#8b423c',false,.49,1.24,'flag');
      }
      nightInstance('reflection','plane','#f2c48d',qx+dz*.44,.065,qz-dx*.44,6.4,7.3,1,0,-Math.PI/2);
    }else tree(qx,qz,i);
    if(i%5===0) {
      const px=qx-dx*2-dz*.72,pz=qz-dz*2+dx*.72;
      if(!roadAt(px/unit,pz/unit,-4)&&!inBuilding(px/unit,pz/unit)){
        if(i%20===0){
          obstacle(px,pz,.20,.61);
          pole('#9c4334',px,.31,pz,.22,.58);
          pole('#aa4c38',px,.60,pz,.29,.12);
          block('#6f4238',px,.40,pz,.37,.12,.13,-Math.atan2(dz,dx));
        }else{
          obstacle(px,pz,.41,1.18);
          block('#557760',px,.59,pz,.72,1.18,.52);
          block('#66795a',px,1.18,pz,.75,.055,.55);
          block('#ae9f6c',px,.88,pz-.274,.15,.10,.033);
          for(const y of [.65,.73,.81])block('#334c44',px,y,pz-.267,.38,.021,.018);
        }
      }
    }

  }
  const roadside=new Set();
  for(const [i,[ax,ay,bx,by,w,edge]] of roads.entries()){
    if(!edge.way.name||edge.way.layer!==0||edge.d*unit<8)continue;
    const length=edge.d*unit,major=['primary','secondary','tertiary'].includes(edge.way.kind);
    const heading=Math.atan2(by-ay,bx-ax),dx=Math.cos(heading),dz=Math.sin(heading);
    const step=major?19:26,count=Math.max(1,Math.floor(length/step));
    for(const side of [-1,1])for(let n=0;n<count;n++){
      const along=(n+.5)*length/count,off=side*(w*unit/2+2.28);
      const x=ax*unit+dx*along-dz*off,z=ay*unit+dz*along+dx*off;
      const key=Math.floor(x/11)+','+Math.floor(z/11);
      if(roadside.has(key)||roadAt(x/unit,z/unit,-1.45/unit)||inBuilding(x/unit,z/unit)||
        locations.some(site=>Math.hypot(x-site.x*unit,z-site.y*unit)<5))continue;
      roadside.add(key);
      if((i+n+Number(side>0))%3===0){
        pole('#666e65',x,2.75,z,.13,5.5);
        const hx=x+dz*side*.72,hz=z-dx*side*.72;
        block('#666e65',(x+hx)/2,5.43,(z+hz)/2,.86,.10,.12,-heading+Math.PI/2);
        glow('#f6d69c',hx,5.37,hz,.34,.07,.25);
        if(major&&i%4===0)lampGlow(hx,5.34,hz);
      }else{
        tree(x,z,i+n);
        if(i%5===0){
          instance('concrete','cylinder','#9b7864',x,.18,z,.44,.36,.44);
          instance('grass','crown','#727f4f',x,.39,z,.40,.23,.42);
        }

      }
      if(major&&i%23===0){
        sign(edge.way.name,x,2.52,z,Math.PI/2-heading,'#235d46',false,1.9,.41);
      }
      if(major&&i%37===0&&length>27){
        const sx=x+dx*3,sz=z+dz*3;
        block('#75817e',sx,2.42,sz,3.7,.13,1.11,-heading);
        block('#565d57',sx,1.16,sz,3.7,2.35,.052,-heading);
        for(const end of [-1,1])pole('#616965',sx+dx*1.7*end,1.2,sz+dz*1.7*end,.09,2.4);
        sign('公車候車區',sx,2.27,sz,Math.PI/2-heading,'#506a65',false,1.35,.29);
      }
    }
  }
  // Furnish the open forecourt on the east side of 忠孝東路五段236巷.
  const court=toWorld(25.03694,121.57196);
  const clearCourt=(x,z,r)=>!roadAt(x/unit,z/unit,-(r+1.1)/unit)&&
    !worldContact(x/unit,z/unit,r/unit);
  for(let i=0;i<4;i++){
    const x=court.x*unit,z=court.y*unit+(i-1.5)*5.4;
    if(!clearCourt(x,z,.85))continue;
    tree(x,z,1209+i);
    instance('concrete','box','#b0a091',x,.21,z,1.48,.42,1.48);
    instance('grass','crown','#916d6e',x,.43,z,1.35,.28,1.32);
    const bx=x-1.18,bz=z+1.75;
    if(!clearCourt(bx,bz,1.0))continue;
    obstacle(bx,bz,.84,.88);
    block('#806650',bx,.48,bz,1.78,.12,.46,Math.PI/2);
    block('#82705c',bx+.20,.72,bz,1.78,.31,.065,Math.PI/2);
    for(const dz of [-.60,.60])block('#66645d',bx,.23,bz+dz,.34,.44,.09);
  }
  // Mark short recessed bays outside the travel strip and the pedestrian through zone.
  const bays=[],busStops=[xinyiBusBay(),xinyiBusBay(0,0,true)];
  for(const [i,[ax,ay,bx,by,w,edge]] of roads.entries()){
    const length=edge.d*unit;
    if(!edge.way.name||edge.way.layer!==0||!['residential','unclassified'].includes(edge.way.kind)||
      length<30||w*unit<6||i%4)continue;
    const direction=edge.forward?1:-1,dx=(bx-ax)/edge.d*direction,dz=(by-ay)/edge.d*direction;
    const heading=Math.atan2(dz,dx);
    const x=(ax+bx)*unit/2-dz*(w*unit/2+2.52),z=(ay+by)*unit/2+dx*(w*unit/2+2.52);
    if(bays.some(p=>Math.hypot(p.x-x,p.z-z)<24)||
      busStops.some(p=>Math.hypot(p.x-x,p.z-z)<13)||
      crossings.some(p=>Math.hypot(p.x*unit-x,p.y*unit-z)<12)||
      locations.some(p=>Math.hypot(p.x*unit-x,p.y*unit-z)<12))continue;
    const at=(along,side)=>[(x+dx*along-dz*side)/unit,(z+dz*along+dx*side)/unit];
    const clear=(half,checks)=>checks.every(along=>[-.65,0,.65].every(side=>{
      const [px,pz]=at(along*half,side);
      return !roadAt(px,pz,-.25/unit)&&!worldContact(px,pz,.20/unit);
    }));
    if(!clear(2.6,[-1,0,1]))continue;
    const crowded=clear(3.35,[-1,-.67,-.33,0,.33,.67,1]);
    const half=crowded?3.35:2.6,count=crowded?3:2,slot=half*2/count;
    bays.push({x,z});
    paint(at(-half,0),at(half,0),1.34,.061,'paving',0,'#bdb8ad');
    for(const side of [-.66,.66])paint(at(-half,side),at(half,side),.065,.069,'line');
    for(let j=0;j<=count;j++)paint(at(-half+j*slot,-.66),at(-half+j*slot,.66),.065,.069,'line');
    for(let j=0;j<count;j++){
      const [px,pz]=at(-half+(j+.5)*slot,0);
      scooter(px*unit,pz*unit,heading+((i+j)%3-1)*.095,i+j);
    }
  }
  // A24 physical signal posts are rendered by the instanced signal layer.
  for(const p of placedPoles)obstacle(p.x,p.y,.11,5.4,'signal');
  const byId=new Map(locations.map(p=>[p.id,p]));
  const placement=(id,fn)=>{
    const p=byId.get(id),angle=p.viewHeading,x=p.x*unit,z=p.y*unit;
    const at=(s,d)=>[x+s*Math.sin(angle)+d*Math.cos(angle),z-s*Math.cos(angle)+d*Math.sin(angle)];
    const box=(color,s,y,d,w,h,l)=>{const [px,pz]=at(s,d);block(color,px,y,pz,w,h,l,Math.PI/2-angle);};
    fn({p,at,box,angle});
  };
  function stall({at,box,angle},s,d,color='#a7493b',name='茶飲') {
    const [sx,sz]=at(s,d);obstacle(sx,sz,1.08,2.35);
    vendorLight?.(at,s,d,name); // A23 night: bulbs follow the physical cart counter.
    for(const x of [-1,1])for(const z of [-.56,.55])box('#5b5b54',s+x,1.13,d+z,.075,2.25,.075);
    for(let n=0;n<9;n++)box(n%2?color:'#e0ccb0',s+(n-4)*.247,2.31,d,.244,.11,1.55);
    box('#736a55',s,.78,d,1.7,.18,.62);
    for(let i=0;i<4;i++)box('#d6c4a8',s-.5+i*.24,.96,d-.17,.095,.17,.09);
    const [x,z]=at(s,d-.67);glow('#ffe6ad',x,2.18,z,.12,.1,.12);
    const [tx,tz]=at(s,d-.74);
    sign(name,tx,2.62,tz,-Math.PI/2-angle,'#814c3c',false,1.58,.36,'acrylic');
  }
  function chair(box,s,d){
    box('#b8493a',s,.43,d,.40,.095,.40);
    box('#b8493a',s,.67,d+.19,.36,.41,.066);
    for(const x of [-.145,.145])for(const z of [-.14,.14])box('#954139',s+x,.22,d+z,.042,.43,.04);
  }
  // Leave the OSM vehicle corridor open, including the cross streets.
  const marketBearing=Math.atan2(.978,-.209);
  const marketAt=(d,s)=>[marketApproach.x*unit-.209*d+.978*s,marketApproach.y*unit+.978*d+.209*s];
  const [gateX,gateZ]=marketAt(16.5,-8.8);
  const [panelX,panelZ]=marketAt(16.5,-4.7);
  if(!roadAt(gateX/unit,gateZ/unit,-.3/unit)&&!worldContact(gateX/unit,gateZ/unit,.18/unit)){
    pole('#59483d',gateX,3.38,gateZ,.21,6.76);
    block('#625047',panelX,6.57,panelZ,8.35,.15,.14,Math.PI/2-marketBearing);
    block('#8d4b36',panelX,6.04,panelZ,4.75,.83,.19,Math.PI/2-marketBearing);
    const [sx,sz]=marketAt(16.39,-4.7);
    sign('拎薑夜市',sx,6.04,sz,-Math.PI/2-marketBearing,'#9d4737',false,4.62,.73,'acrylic');
  }
  for(let row=0;row<2;row++)for(let n=0;n<5;n++){
    const d=8+n*8.5+row*4,side=row===0?-7.8:4.9;
    const [x,z]=marketAt(d,side);
    const at=(s,depth)=>[x-.209*s+.978*depth,z+.978*s+.209*depth];
    const hasClearance=[-1.14,0,1.14].every(s=>[-.80,0,.80].every(depth=>{
      const [px,pz]=at(s,depth);
      return !roadAt(px/unit,pz/unit,-.18/unit)&&!worldContact(px/unit,pz/unit,.13/unit);
    }));
    if(!hasClearance)continue;
    const box=(color,s,y,depth,w,h,l)=>{
      const [px,pz]=at(s,depth);
      block(color,px,y,pz,w,h,l,-marketBearing);
    };
    const colors=['#954238','#92724b','#586b67'];
    stall({at,box,angle:marketBearing+Math.PI/2},0,0,colors[(n+row)%colors.length],['鹽酥雞','滷味','珍奶'][(n+row)%3]);
    box('#9c9e94',0,.50,0,1.75,.61,.67);
    box('#c3bdab',0,.86,0,1.83,.079,.69);
    const [lx,lz]=at(0,.50);
    glow('#ffefd3',lx,2.17,lz,1.64,.038,.041);
  }
  for(const id of ['home','breakfast','night_market','rechao','convenience'])placement(id,args=>{
    const {box,at,angle}=args;
    stall(args,4.8,3.05,id==='home'?'#697f56':'#ac5542');
    if(id==='night_market'){
      stall(args,7.4,3.25,'#577871');
      stall(args,10.0,3.35,'#927858');
    }
    const tables=id==='convenience'?[-3.8,-2.45]:[-3.8,-2.45,.2]; // A27 leave the shop’s curb-to-door path clear
    for(const s of tables) {
      box(id==='rechao'?'#a5a8a1':'#b09777',s,.76,2.4,.78,.065,.73);
      if(id==='rechao'){
        box('#ddd0b4',s-.13,.804,2.35,.19,.034,.19);
        box('#647459',s+.20,.872,2.51,.071,.17,.071);
      }
      for(const d of [2.13,2.68])box('#615b53',s,.36,d,.051,.71,.059);
      chair(box,s-.53,2.46);chair(box,s+.55,2.46);
    }
    const [px,pz]=at(-5.3,2.6);
    pole('#747567',px,1.23,pz,.085,2.46);
    box('#ddd3b0',-5.26,2.2,2.61,.78,.44,.038);
    sign('社區公告',px,2.2,pz-.07,-Math.PI/2-angle,'#6c694a',false,.72,.31);
    const [fx,fz]=at(-4.3,2.85);
    pole('#635e54',fx,1.78,fz,.06,3.55);
    box('#657853',-4.03,3.18,2.85,.60,.39,.044);
    sign('里長選舉',fx,3.18,fz+.035,-Math.PI/2-angle,'#657853',false,.66,.31);

  });
  for(const id of ['mrt','office','department','client_hq'])placement(id,({box,at,angle})=>{
    for(let i=0;i<7;i++){
      box('#a69756',5.4+i*.62,.68,2.5,.43,.11,1.1);
      for(const d of [2.08,2.94])box('#343d39',5.4+i*.62,.31,d,.061,.62,.56);
    }
    box('#687b72',-5.1,2.53,2.9,3.7,.14,1.42);
    if(id==='mrt'||id==='department'){ // A23 night: retain sight lines through the shelter on both pedestrian forecourts.
      const [px,pz]=at(-5.1,3.52);
      instance('lobbyGlass','box','#abc3bc',px,1.26,pz,3.6,2.23,.063,Math.PI/2-angle);
      box('#73847c',-5.1,1.13,3.56,3.58,.048,.045);
    }else box('#a0aaa0',-5.1,1.26,3.52,3.6,2.23,.063);
    box('#8d795e',-5.1,.55,3.18,1.93,.11,.30);
    for(const s of [-6.85,-3.45])box('#66796f',s,1.22,3.47,.091,2.44,.10);
    const [x,z]=at(-5.1,2.16);
    sign('公車候車區',x,2.42,z,-Math.PI/2-angle,'#506a65',false,2.8,.28);
  });
  const bay=xinyiBusBay(6.4,1.25),bayTurn=-bay.heading;
  block('#687b72',bay.x,2.53,bay.z,5.6,.14,1.42,bayTurn);
  const rear=xinyiBusBay(6.4,1.86);
  block('#849793',rear.x,1.34,rear.z,5.5,2.24,.076,bayTurn);
  block('#8d795e',bay.x,.55,bay.z,3.8,.11,.34,bayTurn);
  for(const offset of [-2.65,2.65]){
    const pillar=xinyiBusBay(6.4+offset,1.86);
    pole('#66796f',pillar.x,1.23,pillar.z,.095,2.46);
  }
  const bayLabel=xinyiBusBay(6.4,.53);
  sign('公車候車區',bayLabel.x,2.40,bayLabel.z,-bay.heading,'#506a65',false,3.5,.30);
  // A23 landmarks2: temple lanterns now hang directly from the shrine eaves.
}

export function addUtilityPoles({instance,way,by,ay,bx,ax,span,d,at}) {
  // Concrete utility poles on one side, with crossarm, three sagging wires and the odd transformer.
  const pitch=(28+hash(way.id,1)*8)/unit,heading=Math.atan2(by-ay,bx-ax);
  const side=way.id%2?1:-1,nx=-Math.sin(heading),nz=Math.cos(heading);
  let previous=null;
  for(let pos=pitch*.5,k=0;pos<d-4/unit;pos+=pitch,k++){
    const pt=at(pos),off=side*(span/2+1.45),x=pt[0]*unit+nx*off,z=pt[1]*unit+nz*off;
    const nearStudio=Math.hypot(x-studioEntrance.x*unit,z-studioEntrance.y*unit)<5;
    const diameter=nearStudio?.14:.18;
    instance(nearStudio?'metal':'concrete','cylinder',nearStudio?'#595e5b':'#a8a59d',x,4.25,z,diameter,8.5,diameter);
    instance('dark','box','#3a3a3c',x,8.15,z,1.5,.08,.08,-Math.atan2(nz,nx));
    if(k%4===1)instance('metal','box','#6d7168',x-nx*side*.32,6.6,z-nz*side*.32,.5,.8,.4,-heading);
    if(previous){
      const dx=x-previous.x,dz=z-previous.z,length=Math.hypot(dx,dz),turn=-Math.atan2(dz,dx);
      const heights=[8.12,7.76,7.64,7.76,8.12];
      for(const lateral of [-.52,0,.52]){
        for(let segment=0;segment<4;segment++){
          const t=(segment+.5)/4;
          const a=heights[segment],b=heights[segment+1];
          instance('dark','box','#343235',previous.x+dx*t+nx*lateral,(a+b)/2,
            previous.z+dz*t+nz*lateral,Math.hypot(length/4,b-a)+.01,.032,.032,turn,0,Math.atan2(b-a,length/4));
        }
      }
    }
    previous={x,z};
  }
}
