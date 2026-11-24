import {placeVenueFront} from './venue-fronts.js?v=b7b57ceb'; // A27
import {courtPlanters,courtPoint,entranceHeaders} from '../entry-courts.mjs?v=b7b57ceb'; // A23 night: visible entrances
import {placeTree} from './vegetation.js?v=b7b57ceb';
import {placeOfficeReception} from './office-door.js?v=b7b57ceb'; // A23 landmarks2
import {surfaceAt} from '../sidewalks.mjs?v=b7b57ceb';
import {placeStudioEntrance} from './songshan-heritage.js?v=b7b57ceb'; // A23 landmarks2
import {inBuilding,roadAt,toWorld,metersPerUnit as unit} from '../world.mjs?v=b7b57ceb';
// Facades are visual detail only. OSM remains authoritative for building collisions.
const shops=['牛肉麵','茶飲','五金','藥局','早餐','鐘錶','機車行','便當','自助洗衣','文具'];
const plates=['#426352','#963f37','#76513b','#36556b','#a57a39'];
const shutters=['#777e79','#a19b8b','#77868c'];

export function placeFrontage(b,a,c,face,{instance,sign,managed=false}) {
  const length=a.distanceTo(c);
  if(length<4.5)return;
  const dx=(c.x-a.x)/length,dz=(c.y-a.y)/length,angle=-Math.atan2(dz,dx);
  const nx=face[0],nz=face[1];
  const at=(t,out)=>[a.x+t*dx+nx*out,a.y+t*dz+nz*out];
  function box(kind,t,y,out,w,h,d,color){
    const [x,z]=at(t,out);
    if(out>.18&&inBuilding(x/unit,z/unit))return;
    if(y-h/2<4.3&&[t-w/2,t,t+w/2].some(along=>[out-d/2,out+d/2].some(depth=>{
      const [px,pz]=at(along,depth);
      return roadAt(px/unit,pz/unit);
    })))return;
    instance(kind,'box',color,x,y,z,w,h,d,angle);
  }
  const step=length/(Math.max(2,Math.round(length/3.1)));
  const bays=Math.min(9,Math.round(length/step));
  const tint=b.modern?'#839194':'#b1a08a';
  for(let i=0;i<=bays;i++) {
    const t=Math.min(length-.16,Math.max(.16,i*step));
    box('concrete',t,1.61,1.03,.29,3.17,.30,tint);
    if(!b.modern){
      box('metal',t,2.95,1.03,.32,.072,.33,'#8f8473');
      box('concrete',t,.26,1.03,.29,.36,.30,'#90887a');
    }
    if(i===bays)continue;
    const closed=!b.modern && (i+b.osmId)%4===0;
    if(closed){
      const center=t+step*.53,width=step*.78,color=shutters[b.osmId%shutters.length];
      box('metal',center,1.37,.076,width,2.54,.09,color);
      box('metal',center,2.68,.12,width+.09,.18,.18,'#565756');
      for(let row=0;row<12;row++)box('metal',center,.18+row*.213,.129,width,.025,.018,'#62645e');
    }else{
      box('glass',t+.52,1.61,.043,.84,2.61,.14,b.modern?'#8fa7a3':'#786e60');
      if(!b.modern && (i+b.osmId)%3===0)box('window',t+step*.57,1.66,.077,step*.65,2.35,.04,'#c9a06d');
    }
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
  if(!b.modern&&!managed){ // A24c Printed cases replace the legacy blade and its backing.
    const k=b.osmId%shops.length;
    const hue=plates[k%plates.length],blade=angle+Math.PI/2;
    const tall=k%3===0;
    const width=tall?.61:.48+(k%3)*.09,height=tall?2.45:1.28+(k%4)*.23;
    const out=.91,offset=out+width*.26;
    const t=length*(.42+(k%5)*.086),y=3.36+height/2;
    const [x,z]=at(t,offset);
    if(inBuilding(x/unit,z/unit))return;
    box('metal',t,y,offset,.148,height+.10,width+.08,'#4f5149');
    box('metal',t,y+height*.32,out*.51,.074,.074,out,'#55534d');
    const style=k%5===0?'led':'acrylic';
    sign(shops[k],x,y,z,blade,hue,true,width,height,style);
    instance('reflection','plane',hue,x,.084,z,.75,3.8,1,blade,-Math.PI/2);
    if(length>10&&k%3===1){
      const [sx,sz]=at(length*.22,.12);
      sign(shops[(k+3)%shops.length],sx,2.96,sz,Math.atan2(nx,nz),'#963f37',false,1.86,.44,'led');
    }
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

function stationPaving(site,stone){
  const tones=['#c2bfb7','#d7d2c6','#b7b5b1','#d4cdc0'];
  const vertex=(along,inward)=>{
    const [x,z]=courtPoint(site,along,inward),surface=surfaceAt(x/unit,z/unit);
    if(inBuilding(x/unit,z/unit)||surface?.slab.kind==='ramp')return null;
    return [x,(surface?.height??.065)+.004,z];
  };
  for(let row=0;row<5;row++)for(let column=-13;column<13;column++){
    const s=column*1.52+(row%2)*.76,d=3.38+row*.82;
    // Leave the stair aperture and the existing tactile strip in front of it open.
    if(s<1.10&&s+1.49>-1.10&&d+.80>4.15)continue;
    const corners=[vertex(s,d),vertex(s+1.49,d),vertex(s+1.49,d+.80),vertex(s,d+.80)];
    if(corners.every(Boolean))stone.quad(...corners,tones[Math.abs(column+row*3)%tones.length],.78,.42);
  }
}

export function placeEntrance(p,{instance,sign,windowBand=()=>{},paving,treeInstance=instance}) {
  if(placeVenueFront(p,{instance,sign}))return true; // A27
  const angle=p.viewHeading,x=p.x*unit,z=p.y*unit;
  const scale=p.id==='client_hq'?1.65:p.id==='office'?1.35:1;
  const at=(s,d)=>[x+s*Math.sin(angle)+d*Math.cos(angle),z-s*Math.cos(angle)+d*Math.sin(angle)];
  function obj(kind,shape,color,t,y,dist,w,h,d,rot=0){
    const [xx,zz]=at(t*scale,dist);
    instance(kind,shape,color,xx,y,zz,w*scale,h,d,Math.PI/2-angle+rot);
  }
  const header=entranceHeaders[p.id];
  if(header){
    obj('metal','box',header.tint,0,header.y,header.depth,header.w,header.h,header.d);
    const {sides,depth}=courtPlanters[p.id];
    for(const [i,side] of sides.entries()){
      obj('concrete','box','#aaa294',side,.29,depth,1.68,.43,1.18);
      obj('concrete','box','#c2bcb0',side,.51,depth,1.75,.10,1.25);
      obj('earth','box','#584d41',side,.568,depth,1.52,.025,1.03);
      for(const offset of [-.48,.48])obj('grass','crown','#647648',side+offset,.62,depth,.68,.29,.77);
      const [tx,tz]=courtPoint(p,side,depth);
      placeTree(treeInstance,tx,tz,510+i,.23);
    }
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
      placeOfficeReception(obj); // A23 landmarks2
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
  if(['breakfast','convenience','gamadiam','rechao'].includes(p.id)){
    const convenience=p.id==='convenience',grocery=p.id==='gamadiam',dining=p.id==='rechao';
    const label=convenience?'巷口超商':grocery?'柑仔店':dining?'吳興熱炒':'巷口早餐';
    const sidewalk=convenience?toWorld(25.035926,121.567701):null;
    const shopAngle=convenience?2.83:angle;
    const originX=sidewalk?sidewalk.x*unit:x,originZ=sidewalk?sidewalk.y*unit:z;
    const shopAt=(s,d)=>[originX+s*Math.sin(shopAngle)+d*Math.cos(shopAngle),
      originZ-s*Math.cos(shopAngle)+d*Math.sin(shopAngle)];
    const offset=dining?4:0,depth=convenience?0:dining?6:5.2;
    const tint=convenience?'#515d60':grocery?'#785a42':'#704639';
    function shop(kind,shape,color,t,y,d,w,h,l,rot=0){
      if(y-h/2<1.35&&[-w/2,0,w/2].some(side=>[-l/2,l/2].some(back=>{
        const [px,pz]=shopAt(offset+t+side,depth+d+back);
        return roadAt(px/unit,pz/unit,-.30/unit)||inBuilding(px/unit,pz/unit);
      })))return;
      const [px,pz]=shopAt(offset+t,depth+d);
      instance(kind,shape,color,px,y,pz,w,h,l,Math.PI/2-shopAngle+rot);
    }
    const header=convenience?3.27:2.92,rotation=-Math.PI/2-shopAngle;
    shop('metal','box',tint,0,header,0,4.55,.55,.23);
    const [sx,sz]=shopAt(offset,depth-.13);
    sign(label,sx,header,sz,rotation,tint,false,3.18,.45,grocery?'paint':'acrylic');
    for(const side of [-1,1])shop('metal','box',tint,side*2.15,1.53,0,.12,3.05,.15);
    if(convenience){
      shop('luminous','box','#d9f3ff',0,2.87,.32,4.17,.055,.16);
      shop('metal','box','#839696',0,3.05,.71,4.46,.13,1.82);
      shop('metal','box','#657672',0,1.55,1.45,4.32,3.03,.09);
      for(const side of [-1,1]){
        shop('lobbyGlass','box','#9dbabd',side*1.51,1.51,0,1.16,2.68,.07);
        shop('metal','box','#647978',side*.88,1.50,0,.082,2.77,.10);
        for(const y of [.82,1.22,1.62,2.02]){
          shop('metal','box','#b4b7a3',side*1.33,y,.49,1.22,.052,.32);
          for(let i=0;i<5;i++)shop('metal','box',['#be8e61','#858d6e','#ad685b'][i%3],
            side*1.33+(i-2)*.2,y+.10,.43,.13,.15,.12);
        }
      }
      shop('metal','box','#849394',0,2.76,0,1.75,.15,.11);
      for(const side of [-1,1])shop('metal','box','#a0adab',side*.55,1.41,.02,.045,2.56,.085);
    }else{
      for(let i=-4;i<=4;i++)
        shop('metal','box',i%2?tint:'#b9a68e',i*.49,2.80,-.66,.49,.075,1.36);
      shop('metal','box','#a6a89e',-.61,.92,.33,2.65,.12,.70);
      shop('metal','box','#747771',-.61,.48,.38,2.53,.79,.52);
      shop('metal','box','#605b50',-.61,2.27,.42,2.56,.68,.12);
      for(let i=0;i<5;i++)shop('metal','box','#928d7b',-.61,2.05+i*.10,.34,2.52,.025,.05);
      shop('luminous','box','#ffddac',-.61,1.96,.25,2.45,.053,.065);
      const [mx,mz]=shopAt(offset+1.38,depth-.05);
      sign(grocery?'糖果 雜貨':dining?'熱炒 小菜':'蛋餅 豆漿',mx,1.93,mz,rotation,'#715747',false,.83,.38);
      for(let i=0;i<4;i++)shop('metal','cylinder',grocery?'#c3a771':'#555955',
        -1.48+i*.35,1.03,.29,.18,.14,.18);
      if(dining){
        shop('luminous','box','#e8844c',-.02,1.03,.32,.45,.052,.32);
        for(let i=-3;i<=3;i++)shop('luminous','cylinder','#ffdc9c',i*.56,2.65,-1.19,.08,.096,.08);
      }
      if(grocery){
        shop('metal','cylinder','#6c756a',.97,1.50,.48,.28,.095,.28);
        shop('metal','cylinder','#666d63',.97,1.67,.48,.06,.30,.06);
        shop('metal','box','#898678',.97,1.86,.48,.38,.38,.15);
      }
      for(const t of [-1.36,-.47,.42]){
        shop('metal','cylinder','#7e4540',t,.51,-.75,.32,.076,.32);
        shop('metal','cylinder','#605b51',t,.23,-.75,.08,.46,.08);
      }
    }
    return true;
  }
  if(p.shape==='temple')return true; // A23 landmarks2: temple-court supplies solids and the dedicated sign.
  if(p.shape==='mrt'){
    for(const side of [-1,1]){
      obj('lobbyGlass','box','#87b4b5',side*.94,1.07,5.4,.09,2.13,2.25);
      obj('metal','box','#547174',side*.94,1.13,5.4,.09,.063,2.27);
      for(const post of [4.29,6.51])obj('metal','box','#607777',side*.94,1.13,post,.08,2.28,.08);
    }
    if(paving)stationPaving(p,paving(x,z,'paving'));
    for(let i=0;i<5;i++)obj('concrete','box','#9c9588',0,-.02-i*.065,4.9+i*.30,1.59,.10,.33);
    for(const side of [-1,1])obj('metal','box','#40657a',side*.94,1.23,4.38,.10,.24,.70);
    const [mx,mz]=at(0,3.58);
    sign('捷運 市府站',mx,2.66,mz,-Math.PI/2-angle,'#325875',false,2.15,.43);
    return true;
  }
  if(p.id==='department'){
    const [sx,sz]=at(0,header.depth-.075);
    sign(p.name,sx,header.y,sz,-Math.PI/2-angle,'#3b5451',false,4.16,.48);
    return true;
  }
  if(p.shape==='studio')return placeStudioEntrance(p,{instance,sign}); // A23 landmarks2
  if(p.shape==='village'){
    const red='#aa836f';
    for(const i of [-1,1])obj('concrete','box',red,i*1.42,1.27,5.8,2.70,2.51,.14);
    for(let i=-6;i<=6;i++)obj('metal','box','#746754',i*.38,2.65+Math.abs(i)*.032,5.38,.37,.13,1.37);
  }
  const [sx,sz]=at(0,3.65);
  const signHeight=p.shape==='mrt'?2.65:p.shape==='village'?2.49:2.89;
  obj('metal','box','#66706b',0,signHeight,3.73,4.20,.51,.11);
  sign(p.name,sx,signHeight,sz,-Math.PI/2-angle,'#3b5451',false,4.16,.48);
  return true;
}
