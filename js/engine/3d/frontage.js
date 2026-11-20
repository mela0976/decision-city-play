import {inBuilding,metersPerUnit as unit} from '../world.mjs';
// Facades are visual detail only. OSM remains authoritative for building collisions.
const shops=['牛肉麵','茶飲','五金','藥局','早餐','鐘錶','機車行','便當','自助洗衣','文具'];
const plates=['#647c59','#926252','#7e7760','#537083','#b28a57'];

export function placeFrontage(b,a,c,face,{instance,sign}) {
  const length=a.distanceTo(c);
  if(length<4.5)return;
  const dx=(c.x-a.x)/length,dz=(c.y-a.y)/length,angle=-Math.atan2(dz,dx);
  const nx=face[0],nz=face[1];
  const at=(t,out)=>[a.x+t*dx+nx*out,a.y+t*dz+nz*out];
  function box(kind,t,y,out,w,h,d,color){
    const [x,z]=at(t,out);
    if(out>.18&&inBuilding(x/unit,z/unit))return;
    instance(kind,'box',color,x,y,z,w,h,d,angle);
  }
  const step=length/(Math.max(2,Math.round(length/3.1)));
  const bays=Math.min(9,Math.round(length/step));
  const tint=b.modern?'#839194':'#b1a08a';
  for(let i=0;i<=bays;i++) {
    const t=Math.min(length-.16,Math.max(.16,i*step));
    box('concrete',t,1.61,1.03,.29,3.17,.30,tint);
    if(i===bays)continue;
    box('glass',t+.52,1.61,.043,.84,2.61,.14,b.modern?'#8fa7a3':'#786e60');
    if(!b.modern && (i+b.osmId)%3===0)box('window',t+step*.57,1.66,.077,step*.65,2.35,.04,'#c9a06d');
    if(!b.modern)for(const floor of [4.7,8.2,11.6]){
      if(floor>b.elevation-.39)continue;
      box('metal',t+.74,floor,.14,1.07,.078,.16,'#a7a197');
      box('metal',t+.74,floor-.43,.18,1.08,.10,.37,'#827f77');
      for(const z of [-.41,.41])box('metal',t+.74+z,floor+.03,.13,.054,.96,.067,'#807c76');
      if((b.osmId+i+Math.floor(floor))%3===0)
        box('metal',t+1.57,floor-.31,.29,.43,.39,.39,'#b4b2a9');
    }
  }
  const breadth=Math.min(length,27);
  box('metal',length*.5,3.24,.65,breadth,.14,1.55,b.modern?'#778786':'#6f695d');
  if(!b.modern){
    const t=length*.67,[x,z]=at(t,1.10);
    if(inBuilding(x/unit,z/unit))return;
    const k=b.osmId%shops.length;
    const hue=plates[k%plates.length];
    box('metal',t,4.21,.91,.126,1.87,.70,'#4f5149');
    const blade=angle+Math.PI/2;
    sign(shops[k],x+dx*.073,4.21,z+dz*.073,blade,hue,true,.55,1.77);
    sign(shops[k],x-dx*.073,4.21,z-dz*.073,blade+Math.PI,hue,true,.55,1.77);
    instance('reflection','plane',hue,x,.084,z,.75,3.8,1,blade,-Math.PI/2);
    const [px,pz]=at(.24,1.195);
    sign('冷氣清洗',px,1.61,pz,Math.atan2(nx,nz),'#8a7456',false,.19,.24);
  }
}

export function placeRoof(b,x,z,instance) {
  if(b.modern || b.elevation>38 || b.w*b.h<2500)return;
  const top=b.elevation;
  instance('metal','cylinder','#a9adab',x-.45,top+.61,z,.81,1.18,.81);
  instance('metal','box','#656f70',x+.62,top+.57,z+.52,1.36,1.17,2.24);
  for(let i=-2;i<=2;i++)instance('metal','box','#919b97',x+.62+i*.26,top+1.16,z+.52,.053,.079,2.31);
}

export function placeEntrance(p,{instance,sign,windowBand=()=>{}}) {
  const angle=p.viewHeading,x=p.x*.105,z=p.y*.105;
  const scale=p.id==='client_hq'?1.65:p.id==='office'?1.35:1;
  const at=(s,d)=>[x+s*Math.sin(angle)+d*Math.cos(angle),z-s*Math.cos(angle)+d*Math.sin(angle)];
  function obj(kind,shape,color,t,y,dist,w,h,d,rot=0){
    const [xx,zz]=at(t*scale,dist);
    instance(kind,shape,color,xx,y,zz,w*scale,h,d,Math.PI/2-angle+rot);
  }
  const isTower=['client_hq','office','datalab'].includes(p.id);
  if(isTower){
    const office=p.id==='office';
    if(office){
      obj('concrete','box','#c5b6a1',0,.041,4.22,11.25,.077,5.35);
      obj('glass','box','#627476',0,2.58,8.24,10.5,5.13,.14);
      obj('lobbyTrim','box','#a89179',0,2.45,8.13,2.44,4.90,.14);
      obj('lobbyTrim','box','#d0c2a8',0,.032,7.45,2.48,.06,2.0);
      for(const side of [-1,1]){
        obj('lobbyTrim','box','#c4b298',side*1.25,2.4,7.40,.10,4.8,1.55);
        obj('lobbyLight','box','#ffe5ac',side*.86,4.50,7.32,.14,.085,1.83);
        obj('lobbyLight','box','#ead1a1',side*.81,2.64,8.03,.072,2.25,.038);
      }
      obj('lobbyLight','box','#f8dda6',0,4.24,8.04,2.14,.09,.055);
      obj('window','box','#d9bd91',0,4.63,6.29,9.75,.16,.13);
      for(const t of [-3.8,-2.65,-1.5,1.5,2.65,3.8]){
        obj('window','box','#d0b188',t,3.83,6.28,.62,.11,.12);
        obj('lobbyGlass','box','#bdd6d1',t,2.57,6.17,1.13,4.97,.05);
      }
      for(const t of [-1.26,1.26])obj('metal','box','#757f77',t,1.48,6.31,.052,2.84,.11);
      obj('metal','box','#78817d',0,2.91,6.32,2.59,.12,.16);
      obj('lobbyGlass','box','#b9d3cd',0,3.95,6.17,2.50,1.88,.045);
      for(const t of [-3.58,3.58]){
        obj('concrete','box','#afa995',t,.24,4.21,1.07,.45,.61);
        obj('grass','crown','#567048',t,.55,4.21,1.04,.68,.67);
      }
    }
    if(!office)for(const t of [-3,-2,-1,0,1,2,3])
      obj('glass','box',t===0?'#90a5a2':'#719a97',t*1.35,2.37,6.5,1.28,4.67,.12);
    for(const t of [-3.4,-2.5,-1.5,-.5,.5,1.5,2.5,3.4].filter(t=>!office||Math.abs(t)>.5))
      obj('metal','box','#858c82',t*1.39,2.45,6.38,.079,4.90,.17);
    obj('metal','box','#85847a',0,4.95,5.28,10.9,.24,3.75);
    obj('glass','box','#b1b6a8',0,4.78,4.13,10.6,.12,.57);
    for(const t of [-4.56,4.56])obj('metal','box','#8d8577',t,2.44,4.85,.28,4.87,.30);
    for(let i=0;i<3;i++)obj('concrete','box','#aaa394',0,office?.068:.06+i*.077,4.05+i*.42,10.8,office?.015:.10,.48);
    const sideLength=p.id==='client_hq'?12.2:8.5;
    for(const side of [-1,1]){
      obj('concrete','box','#d0c9b7',side*sideLength,.04,6.93,8.0,.12,6.8);
      obj('glass','box','#507374',side*sideLength,2.37,7.52,8.13,4.7,.29);
      obj('glass','box','#b8b6a2',side*sideLength,4.63,6.70,8.4,.16,2.25);
      const a=at((side*sideLength-4.01)*scale,7.32),b=at((side*sideLength+4.01)*scale,7.32);
      windowBand(a,b,4.5);
      for(let i=-2;i<=2;i++){
        obj('metal','box','#979b8f',side*sideLength+i*1.62,2.33,7.11,.071,4.51,.19);
      }
      obj('grass','box','#6f865e',side*sideLength,.22,5.17,1.40,.40,1.22);
      obj('metal','cylinder','#7d6b58',side*sideLength,1.52,5.17,.18,2.98,.18);
      obj('grass','crown','#677e50',side*sideLength,3.36,5.17,2.47,1.79,2.35);
      obj('metal','box','#866d58',side*(sideLength-2.4),.53,5.04,1.42,.11,.54);
    }
    if(p.id==='client_hq'){
      obj('window','box','#e2ba78',0,3.64,6.74,6.3,.35,.08);
      const [mallX,mallZ]=at(0,5.42);
      sign('購物商場入口',mallX,3.85,mallZ,-Math.PI/2-angle,'#54443e',false,4.1,.50);
    }
    const [x1,z1]=at(0,office?3.36:4.08);
    sign(p.name,x1,office?4.28:4.72,z1,-Math.PI/2-angle,'#314d50',false,5.4*scale,.68);
    return true;
  }
  if(p.shape==='temple'){
    for(const s of [-2.45,2.45]){
      obj('luminous','cylinder','#a74634',s,1.48,4.1,.28,2.98,.28);
      obj('concrete','box','#978b70',s,.22,4.1,.73,.43,.66);
    }
    for(let i=-8;i<=8;i++){
      const x=i*.34,y=3.02+Math.abs(i/8)**4*.65;
      obj('metal','box','#994f3d',x,y,4.1,.365,.16,1.20);
      obj('luminous','box','#be8354',x,y-.17,3.46,.365,.071,.094);
    }
  }
  if(p.shape==='mrt'){
    obj('glass','box','#567d78',-.94,1.07,5.4,.19,2.13,2.25);
    obj('glass','box','#567d78',.94,1.07,5.4,.19,2.13,2.25);
    obj('metal','box','#727f77',0,2.42,5.4,2.21,.19,2.96);
    for(let i=0;i<5;i++)obj('concrete','box','#9c9588',0,-.02-i*.065,4.9+i*.30,1.59,.10,.33);
  }
  if(p.shape==='village'||p.shape==='studio'){
    const red=p.shape==='studio'?'#795141':'#aa836f';
    for(const i of [-1,1])obj('concrete','box',red,i*1.42,1.27,5.8,2.70,2.51,.14);
    for(let i=-6;i<=6;i++)obj('metal','box','#746754',i*.38,2.65+Math.abs(i)*.032,5.38,.37,.13,1.37);
  }
  const [sx,sz]=at(0,3.65);
  const signHeight=p.shape==='temple'?2.72:p.shape==='mrt'?2.65:p.shape==='studio'||p.shape==='village'?2.49:2.89;
  obj('metal','box','#66706b',0,signHeight,3.73,4.20,.51,.11);
  sign(p.name,sx,signHeight,sz,-Math.PI/2-angle,'#3b5451',false,4.16,.48);
  return true;
}
