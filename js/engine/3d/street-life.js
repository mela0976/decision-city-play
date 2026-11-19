import {crossings} from '../street-crossings.mjs';
import {roads,locations,inBuilding,roadAt,roadOptions,toWorld,random,metersPerUnit as unit} from '../world.mjs';

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

export function placeStreetLife({instance,paint,sign,roadMark=()=>{},signal=()=>{},lampGlow=()=>{},obstacle:register=()=>{},parked=()=>false}) {
  // Fixture footprints crossing the OSM travel strip stay decorative.
  // Props fully on the pavement still block normal movement and riding.
  const obstacle=(x,z,r,h)=>{if(!roadAt(x/unit,z/unit,-r/unit*.55))register(x,z,r,h);};
  const block=(color,x,y,z,w,h,d,turn=0)=>instance('metal','box',color,x,y,z,w,h,d,turn);
  const pole=(color,x,y,z,w,h)=>instance('metal','cylinder',color,x,y,z,w,h,w);
  const glow=(color,x,y,z,w,h,d)=>instance('luminous','box',color,x,y,z,w,h,d);
  const tree=(x,z,seed)=>{
    obstacle(x,z,.16,3.4);
    pole('#796757',x,1.7,z,.22,3.4);
    for(let i=0;i<3;i++)instance('grass','crown',['#667f45','#536f43','#4d693c'][i],
      x+(i-1)*.54,3.6+random(seed+i)*.7,z+i*.24,2.12,1.44,1.88);
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
    if(lamps.has(key)||inBuilding(qx/unit,qz/unit))continue;
    lamps.add(key);
    if(i%3===0){
      obstacle(qx,qz,.11,5.3);
      pole('#676e66',qx,2.65,qz,.12,5.3);
      block('#73796d',qx+dz*.42,5.26,qz-dx*.42,.92,.10,.12,Math.atan2(dx,dz));
      glow('#f4d5a1',qx+dz*.73,5.19,qz-dx*.73,.31,.065,.19);
      lampGlow(qx+dz*.73,5.18,qz-dx*.73);
      instance('reflection','plane','#f2c48d',qx+dz*.44,.065,qz-dx*.44,6.4,7.3,1,0,-Math.PI/2);
    }else tree(qx,qz,i);
    if(i%5===0) {
      const px=qx-dx*2-dz*.72,pz=qz-dz*2+dx*.72;
      if(!roadAt(px/unit,pz/unit,-4)&&!inBuilding(px/unit,pz/unit)){
        obstacle(px,pz,.41,1.18);
        block('#557760',px,.59,pz,.72,1.18,.52);
        block('#8c9b74',px,.85,pz-.265,.45,.31,.03);
      }
    }
    if(i%7===0){
      for(let j=0;j<Math.min(6,Math.floor(length/1.36));j++){
        const p=(j-2)*1.03,px=x+dx*p-dz*(span/2-.67),pz=z+dz*p+dx*(span/2-.67);
        if(!inBuilding(px/unit,pz/unit))scooter(px,pz,Math.atan2(dz,dx)+.94,i+j);
      }
    }
  }
  for(const crossing of crossings){
    const {dx,dy:dz}=crossing,x=crossing.x*unit,z=crossing.y*unit,span=crossing.width*unit;
    const forward=t=>[(x+dx*t)/unit,(z+dz*t)/unit];
    for(let j=-Math.floor(span*.55);j<=Math.floor(span*.55);j++) {
      paint(forward(3.6),forward(5.6),.39,.074,'line',j*.81,'#eee1c9');
    }
    for(const side of [-1,1]){
      paint(forward(6.2),forward(6.45),span*.39,.075,'line',side*span*.26,'#ece1c9');
    }
    const lane=-span*.24,paintBox=(a,b,offset)=>paint(forward(a),forward(b),.085,.076,'line',offset,'#ded2bb');
    paintBox(6.8,9.15,lane-.83);paintBox(6.8,9.15,lane+.83);
    for(const t of [6.8,9.15])paint(forward(t),forward(t+.09),1.72,.076,'line',lane,'#ded2bb');
    const heading=Math.atan2(dz,dx),arrow=span>9?12:10;
    for(const direction of [-1,1]){
      const offset=direction*span*.25,angle=heading+(direction===1?0:Math.PI);
      roadMark('↑',x+dx*arrow-dz*offset,z+dz*arrow+dx*offset,angle);
    }
    roadMark('scooter',x+dx*7.95-dz*lane,z+dz*7.95+dx*lane,heading+Math.PI);
    const sx=x-dz*(span*.52+1.2),sz=z+dx*(span*.52+1.2);
    pole('#737a72',sx,2.32,sz,.16,4.64);
    block('#373e3b',sx,4.23,sz,.24,.76,.22);
    signal(crossing,sx,sz);
  }
  const byId=new Map(locations.map(p=>[p.id,p]));
  const placement=(id,fn)=>{
    const p=byId.get(id),angle=p.viewHeading,x=p.x*unit,z=p.y*unit;
    const at=(s,d)=>[x+s*Math.sin(angle)+d*Math.cos(angle),z-s*Math.cos(angle)+d*Math.sin(angle)];
    const box=(color,s,y,d,w,h,l)=>{const [px,pz]=at(s,d);block(color,px,y,pz,w,h,l,Math.PI/2-angle);};
    fn({p,at,box,angle});
  };
  function stall({at,box,angle},s,d,color='#a7493b') {
    const [sx,sz]=at(s,d);obstacle(sx,sz,1.08,2.35);
    for(const x of [-1,1])for(const z of [-.56,.55])box('#5b5b54',s+x,1.13,d+z,.075,2.25,.075);
    for(let n=0;n<9;n++)box(n%2?color:'#e0ccb0',s+(n-4)*.247,2.31,d,.244,.11,1.55);
    box('#736a55',s,.78,d,1.7,.18,.62);
    for(let i=0;i<4;i++)box('#d6c4a8',s-.5+i*.24,.96,d-.17,.095,.17,.09);
    const [x,z]=at(s,d-.67);glow('#ffe6ad',x,2.18,z,.12,.1,.12);
    const [tx,tz]=at(s,d-.74);
    sign('茶飲',tx,2.62,tz,-Math.PI/2-angle,'#435d48',false);
  }
  function chair(box,s,d){
    box('#b8493a',s,.43,d,.40,.095,.40);
    box('#b8493a',s,.67,d+.19,.36,.41,.066);
    for(const x of [-.145,.145])for(const z of [-.14,.14])box('#954139',s+x,.22,d+z,.042,.43,.04);
  }
  for(const id of ['home','breakfast','night_market','rechao','convenience'])placement(id,args=>{
    const {box,at,angle}=args;
    stall(args,4.8,3.05,id==='home'?'#697f56':'#ac5542');
    if(id==='night_market'){
      stall(args,7.4,3.25,'#577871');
      stall(args,10.0,3.35,'#927858');
    }
    for(const s of [-3.8,-2.45,.2]) {
      box('#b09777',s,.76,2.4,.78,.065,.73);
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
    for(let i=0;i<5;i++){
      const [sx,sz]=at(-2-i*.8,1.63);
      if(!inBuilding(sx/unit,sz/unit))scooter(sx,sz,angle+.35,i);
    }
  });
  for(const id of ['mrt','office','department','client_hq'])placement(id,({box,at,angle})=>{
    for(let i=0;i<7;i++){
      box('#a69756',5.4+i*.62,.68,2.5,.43,.11,1.1);
      for(const d of [2.08,2.94])box('#343d39',5.4+i*.62,.31,d,.061,.62,.56);
    }
    box('#687b72',-5.1,2.53,2.9,3.7,.14,1.42);
    box('#a0aaa0',-5.1,1.26,3.52,3.6,2.23,.063);
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
  placement('temple',({at})=>{
    for(let i=0;i<8;i++){
      const [x,z]=at((i-3.5)*1.03,4.75);
      instance('luminous','crown','#ee6840',x,2.86,z,.40,.45,.40);
      pole('#c8a758',x,2.59,z,.065,.18);
    }
  });
}
