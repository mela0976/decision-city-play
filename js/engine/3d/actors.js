import {surfaceAt} from '../sidewalks.mjs?v=f213092'; // A24
import {createFeaturedCars,skyTraffic} from './featured-cars.js?v=f213092'; // A22
import {marketTruck} from '../night-market.mjs?v=f213092'; // A23 night
import {parkedKey} from '../impact.mjs?v=f213092';
import {streetCrowds} from '../crowds.mjs?v=f213092';
import {femaleNpcs,maleNpcs} from '../npc-gender.mjs?v=f213092';
import {createNamedNpcModels} from './named-npcs.js?v=f213092';
import {buildOfficePeople} from './office-people.js?v=f213092';
import {createModelAssets} from './model-assets.js?v=f213092';
import {fixtureColliders} from '../fixtures.mjs?v=f213092';
import {byId,metersPerUnit,roadAt,worldContact} from '../world.mjs?v=f213092';
import * as T from '../vendor/three.module.min.js?v=f213092';

const cube=new T.BoxGeometry(1,1,1);
const round=new T.SphereGeometry(.5,10,7);
const faceMark=new T.SphereGeometry(.5,8,5);
const wheel=new T.CylinderGeometry(.5,.5,1,12).rotateX(Math.PI/2);
const hat=new T.ConeGeometry(.5,1,12);
// Beveled service bodies reuse fixed meshes rather than box silhouettes.
function serviceProfile(points){
  const outline=new T.Shape();
  points.forEach(([x,y],i)=>i?outline.lineTo(x,y):outline.moveTo(x,y));
  const geometry=new T.ExtrudeGeometry(outline,{depth:.94,bevelEnabled:true,bevelSize:.026,bevelThickness:.03,bevelSegments:1});
  geometry.translate(0,0,-.47);
  return geometry;
}
const officeGarment=serviceProfile([[-.34,-.47],[.34,-.47],[.43,-.28],[.46,.29],
  [.30,.45],[-.30,.45],[-.46,.29],[-.43,-.28]]).rotateY(Math.PI/2);
const officeTrouser=new T.CylinderGeometry(.5,.36,1,10);
const cab=serviceProfile([[-.46,-.46],[.42,-.46],[.47,-.32],[.44,.15],[.19,.46],[-.38,.46],[-.46,.35]]);
const busShell=serviceProfile([[-.46,-.39],[.40,-.39],[.47,-.26],[.47,.22],[.35,.43],[-.41,.43],[-.47,.30]]);
const compactor=serviceProfile([[-.47,-.40],[.44,-.40],[.47,.25],[.33,.43],[-.28,.43],[-.47,.16]]);
// The lower edge follows the two tire openings. A narrow chassis joins the axles inside.
const sedanHull=serviceProfile([
  [-.47,-.24],[-.47,.22],[-.40,.34],[-.24,.37],[.15,.35],[.35,.28],[.46,.16],[.47,-.20],[.43,-.43],
  [.40,-.43],[.38,-.10],[.34,.09],[.30,.15],[.26,.09],[.22,-.10],[.20,-.43],
  [-.20,-.43],[-.22,-.10],[-.26,.09],[-.30,.15],[-.34,.09],[-.38,-.10],[-.40,-.43],[-.43,-.43],
]);
function cabinProfile(points){
  const mesh=serviceProfile(points);
  const vertices=mesh.getAttribute('position');
  for(let i=0;i<vertices.count;i++){
    const taper=1-.18*(vertices.getY(i)+.5);
    vertices.setZ(i,vertices.getZ(i)*taper);
  }
  mesh.computeVertexNormals();
  return mesh;
}
const sedanGlass=cabinProfile([[-.47,-.46],[-.24,.33],[-.14,.44],[.17,.44],[.26,.31],[.47,-.46]]);
const wagonGlass=cabinProfile([[-.47,-.46],[-.37,.34],[-.28,.44],[.20,.44],[.29,.32],[.47,-.46]]);
const scooterRear=serviceProfile([[-.47,-.06],[-.43,.30],[-.28,.43],[.26,.43],[.47,.28],[.38,-.33],[-.07,-.42]]);
const scooterShield=serviceProfile([[-.46,-.44],[-.22,.30],[.04,.46],[.31,.38],[.46,.12],[.26,-.27],[-.02,-.44]]);
const scooterSeat=serviceProfile([[-.47,-.20],[-.44,.27],[-.31,.40],[.03,.38],[.21,.21],[.43,.21],[.47,.04],[.35,-.30],[-.31,-.30]]);
const headColors=['#a97657','#ab785d','#c08968','#926747'];
const outfits={ae:'#547981',planner:'#ba9262',media:'#6387ac',creative:'#a26072',data:'#776993',cx:'#7d8861',
  grandma:'#8b5368',npc_grandma:'#a7656e',npc_client:'#7184a2',npc_boss:'#435264',npc_colleague:'#739780',
  npc_vendor:'#324b62',npc_student:'#296168',npc_elder:'#766953',npc_rider:'#c29b4d'};

// P2 perf：每幀臨時拼出來的人形、單車、閃光等零件改從物件池拿，不再每幀配置上萬個小物件。
// 只有在 scratch 打開的區段（畫完就丟的零件）才用池；快取起來的車款、機車等模型照舊建新物件。
const partPool=[];let scratch=false,pooled=0;
const part=(shape,color,x,y,z,w,h,d,roll=0)=>{
  if(!scratch)return {shape,color,x,y,z,w,h,d,roll};
  let e=partPool[pooled++];
  // pitch／yaw 用 0（stamp 讀的是 d.pitch??0，結果相同），欄位一直是數字，重設時不必配置新的數值物件
  if(!e){e={shape,color,x,y,z,w,h,d,roll,pitch:0,yaw:0};partPool.push(e);return e;}
  e.shape=shape;e.color=color;e.x=x;e.y=y;e.z=z;e.w=w;e.h=h;e.d=d;e.roll=roll;e.pitch=0;e.yaw=0;
  return e;
};
// P2 perf：明列參數，不用 ...args（每次呼叫都會配置一個陣列）
const p=(color,x,y,z,w,h,d,roll)=>part('box',color,x,y,z,w,h,d,roll);
const ball=(color,x,y,z,w,h,d,roll)=>part('round',color,x,y,z,w,h,d,roll);
const tire=(x,y,z,size=.58)=>part('wheel','#252329',x,y,z,size,size,.16);
const metal=(x,y,z,w,h,d,roll)=>p('#87908e',x,y,z,w,h,d,roll);
function scooterBody(paint,steer){
  const front=tire(.71,.30,0);
  front.yaw=steer*.65;
  return [tire(-.68,.30,0),front,
    part('scooterRear',paint,-.45,.59,0,.98,.39,.45),
    part('scooterShield',paint,.51,.70,0,.55,.65,.43),
    part('scooterSeat','#28272a',-.39,.79,0,.81,.15,.38),
    p('#303439',.11,.42,0,.81,.085,.38),
    p('#b74031',-.91,.65,0,.055,.075,.27)];
}
function twoWheeler(grandma,paint,steer,electric=false) {
  if (grandma) {
    const chair=[];
    for(const x of [-.62,.59]) for(const z of [-.36,.36]) chair.push(tire(x,.25,z,.46));
    chair.push(p(paint,0,.41,0,1.72,.24,.87),p('#ceb28a',.66,.8,0,.37,.34,.49),
      p('#716650',.66,.96,0,.39,.052,.51),
      ...[-1,1].flatMap(s=>[p('#73664f',.66,.91,s*.24,.40,.053,.037),
        p('#dfc89e',.81,.84,s*.19,.028,.20,.031),p('#dfc89e',.81,.84,s*.08,.028,.20,.031)]),p('#28262b',-.42,.81,0,.64,.18,.59),
      p('#28262b',-.68,1.03,0,.14,.53,.59),metal(.38,.67,0,.09,.63,.1,-.17),
      p('#e87b5e',-.858,.44,0,.03,.11,.38));
    return chair;
  }
  const body=scooterBody(paint,steer);
  const bar=p('#303439',.46,1.015,0,.12,.075,.68);
  bar.yaw=steer;
  const hub=part('wheel','#afb8b7',.71,.30,0,.30,.30,.183);
  hub.yaw=steer*.65;
  body.push(bar,hub,part('wheel','#afb8b7',-.68,.30,0,.30,.30,.183),
    metal(.585,.56,0,.082,.57,.11,.43),
    ball(paint,.71,.57,0,.49,.16,.29),
    p('#d9edf4',.70,.88,0,.093,.07,.29,-.24),
    p('#253e54',.46,1.055,0,.17,.032,.23),
    p('#d8d2c0',-.945,.49,0,.028,.115,.23,-.14),
    p('#505457',-.64,.31,.225,.45,.095,.12));
  for(let side=-1;side<=1;side+=2){
    body.push(p('#35353a',.46,1.095,side*.295,.035,.17,.042),
      ball('#5c6268',.435,1.18,side*.315,.09,.077,.135));
  }
  if(electric)body.push(p('#557c82',.09,.47,0,.61,.13,.35),p('#85c0bd',.09,.49,.181,.48,.021,.015));
  return body;
}
const profile={
  ae:['#586d7b','#2b313b','briefcase'],planner:['#aa9069','#433d3d','satchel'],
  media:['#5175a1','#3e434d','backpack'],creative:['#9e5555','#41424a','scarf'],
  data:['#6e6481','#343843','glasses'],cx:['#6a8267','#464842','vest'],
};
function limb(color,a,b,w,d=w) {
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  // Endpoints are model-local (a few meters), so squared lengths stay in range.
  const xy2=dx*dx+dy*dy;
  const entry=ball(color,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,Math.sqrt(xy2+dz*dz)+w*.52,d,Math.atan2(-dx,dy));
  entry.pitch=Math.atan2(dz,Math.sqrt(xy2));
  return entry;
}
// Compile the stationary office poses once, outside the per-frame scratch pool.
const officePeople=buildOfficePeople(p,ball,limb,part);
const personBody=[],kneeAt=[0,0,0],ankleAt=[0,0,0],elbowAt=[0,0,0],handAt=[0,0,0],rootAt=[0,0,0];
const namedNpcModels=createNamedNpcModels(p,ball,limb);
const v3=(out,x,y,z)=>{out[0]=x;out[1]=y;out[2]=z;return out;};
const strideLength=1.10,stance=.56,plantReach=strideLength*stance/2;
const ankleHeight=.125,legSegment=.378,idlePelvis=.872;
function footTravel(cycle) {
  if(cycle<stance)return plantReach-strideLength*cycle;
  const t=(cycle-stance)/(1-stance);
  // Match the ground stride's tangent at lift-off and landing.
  const smooth=t*t*(3-2*t);
  return -plantReach+2*plantReach*smooth-strideLength*(1-stance)*t*(1-t)*(1-2*t);
}
function footLift(cycle) {
  if(cycle<stance)return 0;
  const lift=Math.sin(Math.PI*(cycle-stance)/(1-stance));
  return .145*lift*lift;
}
function person(skin,phase,riding=false,seat=0,photo=false,clothes=null,running=false,faceDetail=false,gait=-1,idle=0) { // A22 photo pose
  const grandma=skin.includes('grandma');
  const [shirt,pants,accessory]=clothes??profile[skin]??[outfits[skin]??'#536573',grandma?'#4b4146':'#3e4147',
    skin==='npc_student'?'backpack':skin==='npc_boss'?'briefcase':''];
  const skinColor=headColors[skin.length%headColors.length];
  const walking=gait>=0;
  const swing=riding?0:walking?Math.cos(phase*2*Math.PI)*.205*gait:Math.sin(phase)*(running?.37:.21);
  const hip=riding?(grandma?-.45:-.34):walking?idle*.019:0;
  const pelvis=riding?seat+.46:walking?idlePelvis-(idlePelvis-.81+.025*Math.cos(phase*4*Math.PI))*gait:.86+(running?.045*Math.abs(Math.sin(phase)):0);
  const shoulder=pelvis+.49;
  const headX=riding?hip+.17:walking?hip*1.7:0,headY=shoulder+.235;
  // P2 perf：臨時零件（scratch）時重用同一個陣列；limb 的端點陣列讀完就丟，也重用
  const body=scratch?personBody:[];
  body.length=0;
  body.push(
    ball(pants,hip,pelvis,0,.30,.24,.285),
    ball(shirt,hip+.058,pelvis+.29,0,.265,.52,.365),
    ball(shirt,hip+.072,shoulder-.075,0,.255,.18,.43),
    ball('#d1ccb9',hip+.124,shoulder-.017,0,.146,.088,.158),
    ball(skinColor,headX,headY-.152,0,.12,.19,.12),
  );
  if(riding) {
    const shell=clothes?.[3]??(grandma?'#ba8c88':skin==='npc_rider'?'#cba666':'#d5d1c4');
    body.push(ball(shell,headX,headY+.022,0,.285,.279,.276),
      ball('#343f49',headX+.103,headY-.005,0,.127,.125,.242),
      ball('#899ba1',headX+.158,headY+.022,0,.022,.058,.157));
  } else {
    const hair=grandma?'#a69d97':'#2c2525';
    body.push(ball(skinColor,headX,headY,0,.216,.246,.192),ball(hair,headX-.036,headY+.071,0,.188,.156,.199),
      ball(skinColor,headX+.102,headY-.019,0,.053,.057,.068));
  }
  for(let side=0;side<2;side++) {
    const s=side?1:-1;
    let knee,ankle;
    if(walking){
      const cycle=(phase+(side?0:.5))%1;
      const ax=footTravel(cycle)*gait,ay=ankleHeight+footLift(cycle)*gait;
      const dx=ax-hip,dy=pelvis-ay;
      const reach=Math.hypot(dx,dy);
      // Equal upper/lower lengths. Choose the forward knee, perpendicular to hip–ankle.
      const bend=Math.sqrt(Math.max(0,legSegment*legSegment-reach*reach/4))/reach;
      knee=v3(kneeAt,(hip+ax)/2+dy*bend,(pelvis+ay)/2+dx*bend,s*.105);
      ankle=v3(ankleAt,ax,ay,s*.105);
    }else{
      knee=v3(kneeAt,riding?hip+.51:s*swing*.8,riding?.58:.48+(running?Math.max(0,s*swing)*.35:0),s*.14);
      ankle=v3(ankleAt,riding?hip+.52:s*swing,riding?.34:.14,s*.13);
    }
    const elbow=walking?v3(elbowAt,hip+.03-s*swing*.69,shoulder-.295,s*.235):photo?v3(elbowAt,.23,1.15,s*.21):v3(elbowAt,riding?hip+.36:-s*swing*.64,shoulder-.205,s*.235);
    const hand=walking?v3(handAt,hip+.052-s*swing,pelvis-.069+Math.abs(swing)*.16,s*.245):photo?v3(handAt,.37,1.49,s*.08):running?v3(handAt,.14-s*swing*.75,shoulder-.21,s*.22):v3(handAt,riding?(grandma?.29:.46):-s*swing*.9,riding?(grandma?.96:1.00):pelvis-.01,s*.255);
    body.push(limb(pants,v3(rootAt,hip,pelvis,s*.105),knee,.15),limb(pants,knee,ankle,.113),
      ball('#332e31',ankle[0]+.064,ankle[1]-(walking?ankleHeight-.0575:.085),ankle[2],.231,.115,.121),
      limb(shirt,v3(rootAt,hip+.07,shoulder-.102,s*.178),elbow,.13),
      limb(shirt,elbow,hand,.092),ball(skinColor,hand[0],hand[1],hand[2],.083,.091,.086));
  }
  if(accessory==='backpack'||accessory==='satchel') {
    body.push(ball('#363940',hip-.13,pelvis+.29,accessory==='satchel'?.16:0,.215,.35,.28));
    for(let side=0;side<2;side++){const s=side?1:-1;body.push(limb('#33333a',v3(rootAt,hip+.173,shoulder,s*.137),v3(kneeAt,hip+.173,pelvis+.17,s*.137),.034));}
  }
  if(accessory==='briefcase'&&!riding)body.push(p('#584339',swing*.82,pelvis-.23,.28,.31,.25,.12));
  if(accessory==='scarf')body.push(ball('#e2b56b',hip+.09,shoulder+.058,0,.20,.083,.182));
  if(accessory==='glasses'&&!riding)body.push(p('#34373d',headX+.102,headY+.031,0,.038,.036,.17));
  if(faceDetail&&!riding){
    // The face points along local +X. Set the shallow marks into the cheek
    // surface so they follow the head silhouette in profile.
    for(let side=-1;side<=1;side+=2){
      if(accessory!=='glasses')body.push(part('faceMark','#362824',headX+.089,headY+.019,side*.047,.019,.024,.033));
      body.push(part('faceMark',grandma?'#68534a':'#51372f',headX+.075,headY+.053,side*.048,.019,.015,.050));
    }
    body.push(part('faceMark','#79504a',headX+.096,headY-.046,0,.015,.016,.064));
  }
  if(accessory==='vest')body.push(p('#c4c09a',hip+.197,pelvis+.27,0,.022,.28,.10));
  return body;
}
function schoolWalker(index,phase,close) {
  // Keep the head similar in size across ages and shorten the torso and legs for children.
  const child=index%3===0;
  const skin=headColors[index%headColors.length],hair='#302726',shirt='#e5e9df';
  const uniform=child?'#354c68':'#344558',pack=child?'#b35643':'#345f77';
  const hip=child?.57:.73,shoulder=child?.94:1.15,head=shoulder+.19;
  const width=child?.30:.35,hem=child?.39:.29;
  const body=personBody;
  body.length=0;
  body.push(ball(shirt,.035,(hip+shoulder)*.5,0,.235,shoulder-hip+.15,width),
    p(uniform,0,hip-.014,0,.185,.12,width-.05),
    ball(skin,.032,head,0,.216,.237,.198),
    ball(hair,-.018,head+.054,0,.206,.181,.208),
    ball(pack,-.151,(hip+shoulder)*.5,0,.183,shoulder-hip+.013,width-.035));
  if(close){
    body.push(ball(skin,.035,head-.102,0,.10,.16,.103),
      p(uniform,.146,shoulder-.075,0,.023,.126,.052),
      p('#74889b',.145,shoulder-.103,.069,.021,.032,.045),
      ball(pack,-.206,hip+.07,0,.115,.137,width-.071),
      p('#d3b683',-.263,hip+.105,0,.012,.013,.12));
  }
  const stride=Math.sin(phase)*(child?.11:.15);
  for(let side=-1;side<=1;side+=2){
    const step=stride*side,legZ=side*(child?.073:.084),armZ=side*(width*.5-.004);
    const ankle=v3(ankleAt,step,.043+Math.max(0,step)*.12,legZ);
    const sleeve=v3(elbowAt,-step*.34,shoulder-.145,armZ+side*.018);
    const hand=v3(handAt,-step*.72,hip-.012,armZ+side*.029);
    body.push(limb(uniform,v3(rootAt,0,hip,legZ),v3(kneeAt,step*.55,hem,legZ),child?.116:.124),
      limb(child?skin:uniform,kneeAt,ankle,child?.071:.093),
      limb(shirt,v3(rootAt,.026,shoulder,armZ),sleeve,.108),
      limb(skin,sleeve,hand,.063));
    if(close){
      body.push(ball('#f3f0de',step,ankle[1]+.04,legZ,.082,.096,.081),
        ball('#29303b',step+.038,ankle[1]-.058,legZ,.166,.080,.095),
        p(pack,.139,(hip+shoulder)*.5,side*width*.31,.028,shoulder-hip+.05,.039,.045),
        ball(hair,.126,head+.015,side*.048,.013,.021,.021));
    }
  }
  return body;
}
function car(color,variant=0) {
  const glass='#334651';
  const wagon=variant===1,roof=wagon?1.53:1.44;
  return [
    part('sedanHull',color,0,.65,0,4.46,.70,1.84),
    p('#303239',0,.42,0,3.99,.16,1.51),
    part(wagon?'wagonGlass':'sedanGlass',glass,wagon?-.37:-.23,(roof+.84)*.5,0,wagon?3.19:2.66,roof-.78,1.72),
    part('scooterSeat',color,wagon?-.50:-.29,roof-.015,0,wagon?1.69:1.17,.076,1.42),
    p('#313138',2.175,.54,0,.075,.145,1.35),p('#d5d3c8',2.224,.55,0,.033,.106,.34),
    p('#d6d4c8',-2.215,.55,0,.032,.112,.34),
    ...[-1,1].flatMap(side=>[
      tire(1.32,.34,side*.86,.68),tire(-1.34,.34,side*.86,.68),
      part('wheel','#a1a5a7',1.32,.34,side*.949,.38,.38,.025),
      part('wheel','#a1a5a7',-1.34,.34,side*.949,.38,.38,.025),
      p('#dce9e4',2.135,.715,side*.65,.162,.075,.40,-.11),
      p('#b83c32',-2.121,.745,side*.65,.174,.088,.40,.14),
      ball(color,.70,1.04,side*.92,.23,.11,.18),
      p('#44474a',-.02,.87,side*.891,.17,.036,.024),p('#44474a',-.90,.87,side*.891,.17,.036,.024),
    ]),
  ];
}
function serviceTruck(recycling=false) {
  const paint=recycling?'#488e64':'#d9a944',trim=recycling?'#c9d4ab':'#e9c47d';
  return [part('cab',paint,.99,.96,0,1.52,1.64,1.65),p(paint,.90,.78,0,1.32,.95,1.50),
    p('#455e67',1.47,1.45,0,.067,.48,1.41,.42),
    p('#b9bbb2',1.67,.65,0,.10,.14,1.39),
    part('compactor',paint,-.68,1.17,0,2.94,1.64,1.61),p(trim,-.98,1.48,0,2.1,.16,1.65),
    p('#34383c',-2.10,1.02,0,.078,.68,1.45),
    p(trim,-2.19,.68,0,.20,.19,1.62),p('#62615a',-2.13,1.37,0,.13,.11,1.53),
    p('#a04f36',-2.22,.54,0,.050,.045,1.33),p(trim,.87,1.67,0,.18,.12,.48),
    ...[-1,1].flatMap(s=>[tire(1.0,.34,s*.76),tire(-1.30,.34,s*.76),
      part('wheel','#9fa5a4',1.0,.34,s*.86,.33,.33,.035),
      part('wheel','#9fa5a4',-1.30,.34,s*.86,.33,.33,.035),
      ball(paint,1.0,.60,s*.75,.80,.19,.28),ball(paint,-1.30,.60,s*.75,.80,.19,.27),
      p('#455e67',.98,1.39,s*.758,.64,.40,.026),
      p('#5b6463',1.41,1.27,s*.88,.16,.06,.23),
      ball('#48504f',1.44,1.25,s*1.01,.19,.23,.08),
      p('#f9d193',1.69,.65,s*.52,.05,.13,.15),p('#bd493d',-2.10,.72,s*.55,.052,.18,.22)])];
}
const bus=[
  part('busShell','#b0c2bc',0,1.68,0,10.72,2.80,2.44),p('#699687',0,1.16,0,10.27,.58,2.47),
  p('#405b66',-.07,2.23,0,9.81,.94,2.45),p('#dbddd0',0,3.07,0,10.04,.23,2.37),
  ...[-1,1].flatMap(side=>[
    tire(3.2,.52,side*1.05,1.03),tire(-3.34,.52,side*1.05,1.03),
    p('#e6d9ae',5.14,1.16,side*.82,.07,.16,.34),p('#cc6351',-5.16,1.21,side*.84,.06,.16,.29)
  ]),
  p('#7b9f83',5.16,2.79,0,.07,.18,1.57),
  p('#557782',4.82,2.30,0,.10,1.07,2.28,.37),
  ...[-1,1].flatMap(side=>[
    ...[-3.7,-2.4,-1.1,.2,1.5,2.8,4.1].map(x=>p('#829d9c',x,2.24,side*1.246,.07,.95,.025)),
    ball('#aeb9a7',3.20,.96,side*1.19,1.16,.26,.21),
    ball('#aeb9a7',-3.34,.96,side*1.19,1.16,.26,.21),
    p('#616c69',4.96,2.05,side*1.35,.07,.07,.38),
    ball('#4c595b',5.06,2.07,side*1.50,.18,.33,.10),
  ]),
];
const delivery=[
  part('cab','#6a9392',1.15,1.24,0,1.53,1.30,1.70),
  p('#557979',1.9,.63,0,.18,.29,1.73),
  p('#394e55',1.56,1.58,0,.075,.47,1.44,.56),
  p('#6d777a',0,.47,0,4.03,.16,1.68),
  p('#84938d',-.78,.76,0,2.46,.14,1.69),
  p('#5a7b7a',-2.01,.98,0,.12,.42,1.74),
  ...[-1,1].flatMap(side=>[
    p('#365457',1.17,1.53,side*.846,.68,.40,.035),
    p('#729a97',-.79,.99,side*.84,2.44,.42,.075),
    p('#657576',-.79,1.20,side*.86,2.43,.055,.078),
    p('#394b50',1.47,1.48,side*.96,.12,.16,.24),
    p('#e6dfc4',1.99,.79,side*.57,.075,.16,.36),
    p('#da5c48',-2.07,.62,side*.68,.06,.13,.31),
    ...[-1.32,1.23].flatMap(x=>[
      tire(x,.32,side*.77,.64),
      part('wheel','#a7b1ab',x,.32,side*.87,.29,.29,.044),
      p('#515d5e',x,.67,side*.84,.83,.09,.17),
    ]),
  ]),
];
const truckModels={waste:serviceTruck(),recycling:serviceTruck(true),bus,delivery};
const cat=[ball('#8a6652',0,.21,0,.39,.26,.225),ball('#a68669',.19,.30,0,.18,.18,.17),
  ball('#9c7254',.205,.40,.052,.065,.121,.055),ball('#9c7254',.205,.40,-.052,.065,.121,.055),
  limb('#7e5945',[-.15,.24,0],[-.40,.37,-.02],.074)];

// Pair each top with trousers from the same wardrobe before applying either tint.
// Slate, concrete and weathered tile keep their distinction without competing with street signage.
const sidewalkWardrobe=[
  ['#936b62','#3c4144',.93,1.02],['#677d73','#4a5049',1.04,.92],['#a88e6f','#514b46',.96,1.06],
  ['#758698','#414b56',1.02,.95],['#806c7a','#41454d',1.07,1.11],['#b2aa98','#51554a',.94,.97],
  ['#637e88','#424e53',1.04,1.06],['#918264','#514c45',.98,.94],
];
const officeWardrobe=[
  ['#c4c1b5','#44494e'],['#667788','#393f49'],['#a58a82','#4b4546'],['#657267','#414943'],
  ['#aaa092','#514c46'],['#826e76','#41444d'],['#9ca8af','#414953'],['#776d65','#444140'],
];
const marketWardrobe=[
  ['#a17a66','#524842'],['#6e8884','#414e50'],['#b09c72','#575143'],['#868492','#474751'],
  ['#946f78','#4a444a'],['#788871','#474f45'],['#b3afa3','#4d5356'],['#9b8476','#504944'],
];
const meiWardrobe=['#877585','#404650'];
const officeDoors=['client_hq','office','mrt'].map(id=>byId.get(id));
const elderHats=['temple','night_market'].map(id=>byId.get(id));
const helmets=['#ebe6d7','#494651','#b34e43','#98a9ac','#ded2b6','#343e51','#e1b96c','#836875'];
const coats=['#e3bf53','#394764','#cbc6b8','#88749a','#a95e66','#567875'];
const paint=['#35373c','#d2cbbf','#57677d','#895b55','#a3a4a0','#464951','#65575f','#b2a691'];
const bikeRing=new T.TorusGeometry(.37,.032,5,14);
const canopy=new T.SphereGeometry(.5,8,3,0,Math.PI*2,0,Math.PI*.49);
function riderModel(color,index,rain,near){
  const shirt=sidewalkWardrobe[index%8][0],helmet=helmets[index%helmets.length];
  const jacket=rain?coats[index%coats.length]:shirt;
  const parts=near?[...twoWheeler(false,color,0),...person('npc_rider',0,true,.51,false,[jacket,'#42454a','',helmet])]:
    [...scooterBody(color,0),p('#303439',.46,1.015,0,.12,.075,.68),
     ball(jacket,-.23,1.29,0,.44,.65,.51),ball(helmet,-.17,1.74,0,.30,.32,.31),
     p('#353c41',-.028,1.72,0,.07,.10,.24)];
  if(rain)parts.push(part('hat',jacket,-.15,1.26,0,.98,.71,.84),
    ball(jacket,.12,1.10,0,.69,.17,.68));
  if(index%5===1)parts.push(p('#374243',-.73,1.01,0,.48,.43,.54),
    p(index%2?'#c27a38':'#607e5a',-.73,1.18,0,.50,.21,.56),p('#d4cbb4',-.978,1.05,0,.012,.057,.47));
  return parts;
}

function activeCycle(index,phase){
  const frame=sidewalkWardrobe[index%8][0];
  const attitude=Math.cos(phase),left=[.04+.17*attitude,.39+.17*Math.sin(phase),.14];
  const right=[.04-.17*attitude,.39-.17*Math.sin(phase),-.14];
  return [part('bikeRing','#35383b',-.65,.38,0,1,1,1),part('bikeRing','#35383b',.65,.38,0,1,1,1),
    limb(frame,[-.65,.38,0],[-.29,.84,0],.07),limb(frame,[-.29,.84,0],[.04,.37,0],.08),
    limb(frame,[-.65,.38,0],[.04,.37,0],.06),limb(frame,[.04,.37,0],[.41,.88,0],.08),
    limb(frame,[.41,.88,0],[-.29,.84,0],.06),limb('#9ca4a2',[.42,1.01,0],[.65,.38,0],.07),
    p('#39363a',-.28,.89,0,.28,.09,.19),p('#38393d',.43,1.02,0,.09,.055,.46),
    limb(frame,[-.28,.96,0],[.025,1.39,0],.30,.43),ball('#b68b6d',.10,1.53,0,.23,.26,.21),
    ball(helmets[index%8],.09,1.66,0,.29,.16,.25),
    ...[left,right].flatMap((foot,i)=>{
      const side=i===0?1:-1,knee=[.06+side*.12*attitude,.68+side*.10*Math.sin(phase),side*.15];
      return [limb('#414650',[-.28,.98,side*.11],knee,.16),limb('#ac8369',knee,foot,.11),
        ball('#303336',...foot,.22,.09,.12),limb(frame,[.005,1.34,side*.18],[.15,1.12,side*.23],.11),
        limb('#b68b6d',[.15,1.12,side*.23],[.42,1.025,side*.20],.09)];
    })];
}
const umbrellas=helmets.map((tone,i)=>[part('canopy',tone,.10,1.81,.16,1.07,.50,1.07),
  p('#524e4c',.10,1.57,.16,.023,.54,.023),ball(i%2?'#d9ceba':'#b6adb0',.10,2.055,.16,.055,.047,.055)]);
// Radii in metres cover the visible sweep of the limbs, umbrellas and bicycles.
const personRadius=.48,umbrellaRadius=.74,runnerRadius=.60,bicycleRadius=1.05;
const spacingRings=[.28,.55,.82,1.10,1.40,1.72];
const spacingAngles=[0,Math.PI,Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4];
// P2 perf：stampPerson 用的暫存（畫完就丟的零件清單、衣著、一個零件的清單）
const femaleSkins=['npc_student','npc_grandma','creative','media'],clothesAt=['','',''],farBody=new Array(7),walkerBag=new Array(3),onePart=[null];
const one=entry=>{onePart[0]=entry;return onePart;};
function nearSite(sites,px,pz,scale,limit){
  for(let i=0;i<sites.length;i++)if(Math.hypot(px-sites[i].x*scale,pz-sites[i].y*scale)<limit)return true;
  return false;
}
const dummy=new T.Object3D();
const tintCache=new Map();
const local=new T.Vector3();

export function createActors(scene,glow,parkedScooters=[]) {
  const models=createModelAssets(scene);
  const featured=createFeaturedCars(scene,glow); // A22
  const lookCache=new WeakMap();let nextLook=0;
  const gaitCache=new WeakMap();
  function trackGait(item,x,z,heading,clock,moving,index){
    let pose=gaitCache.get(item);
    if(!pose){
      pose={x,z,heading,clock,phase:(index%13)/13,weight:0};
      gaitCache.set(item,pose);
    }
    const dx=x-pose.x,dz=z-pose.z,elapsed=clock-pose.clock;
    const travel=dx*Math.cos(heading)+dz*Math.sin(heading);
    if(elapsed>0&&elapsed<.25&&dx*dx+dz*dz<.81&&Math.cos(heading-pose.heading)>.5){
      // A stale speed at a red light must not keep a motionless walker mid-step.
      moving=moving&&Math.abs(travel)>.0001;
      if(moving)pose.phase=(pose.phase+travel/strideLength+1)%1;
    }
    pose.weight=moving?1:Math.max(0,pose.weight-Math.max(0,elapsed)*6);
    pose.x=x;pose.z=z;pose.heading=heading;pose.clock=clock;
    return pose;
  }
  const geometries={box:cube,round,faceMark,wheel,hat,cab,busShell,compactor,sedanHull,sedanGlass,wagonGlass,
    scooterRear,scooterShield,scooterSeat,bikeRing,canopy,officeGarment,officeTrouser};
  const material=new T.MeshStandardMaterial({roughness:.63});
  const groups=Object.fromEntries(Object.entries(geometries).map(([name,geo])=>{
    const coat=['cab','busShell','compactor'].includes(name)?new T.MeshStandardMaterial({roughness:.31,metalness:.51}):material;
    const mesh=new T.InstancedMesh(geo,coat,1200);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.count=0;
    mesh.frustumCulled=false;
    mesh.castShadow=name!=='faceMark';
    scene.add(mesh);
    return [name,mesh];
  }));
  const meshes=Object.values(groups);
  const wreckRotation=new T.Quaternion(),partRotation=new T.Euler(),wreckEuler=new T.Euler(0,0,0,'YXZ');
  const parkedModel=twoWheeler(false,'#788b91',0);
  const farScooters=new Map();
  const racks=fixtureColliders().filter(p=>p.alley).map(p=>({x:p.x*metersPerUnit,z:p.y*metersPerUnit,heading:p.heading,look:p.look}));
  const parkedStyles=paint.map(tone=>({
    near:twoWheeler(false,tone,0),
    far:[...scooterBody(tone,0),p('#303439',.46,1.015,0,.12,.075,.68)],
  }));
  const carModels=new Map();
  const walkerOptions={dt:0,moving:false,speed:1.28,ground:0,tint:undefined,trousers:undefined,stature:1,idlePose:0,build:1,complexion:0};
  const headlightMat=new T.MeshBasicMaterial({
    map:glow,transparent:true,depthWrite:false,opacity:0,blending:T.AdditiveBlending,side:T.DoubleSide,color:'#f8cc88',
  });
  const headlights=new T.InstancedMesh(new T.PlaneGeometry(1,1),headlightMat,140);
  headlights.frustumCulled=false;
  scene.add(headlights);
  const tailMaterial=new T.MeshBasicMaterial({map:glow,transparent:true,depthWrite:false,opacity:0,
    blending:T.AdditiveBlending,side:T.DoubleSide,color:'#e24932'});
  const tails=new T.InstancedMesh(new T.PlaneGeometry(1,1),tailMaterial,140);
  tails.frustumCulled=false;scene.add(tails);
  const shadowMat=new T.MeshBasicMaterial({map:glow,transparent:true,color:'#241916',opacity:.52,depthWrite:false});
  const shadows=new T.InstancedMesh(new T.PlaneGeometry(1,1),shadowMat,265);
  shadows.frustumCulled=false;
  scene.add(shadows);
  function stamp(descriptors,x,z,heading,lean,impact=null,altitude=0) {
    if(impact)wreckRotation.setFromEuler(wreckEuler.set(impact.roll,-heading,impact.pitch,'YXZ'));
    const cos=Math.cos(heading),sin=Math.sin(heading);
    for (let i=0;i<descriptors.length;i++) {
      const d=descriptors[i];
      const mesh=groups[d.shape];
      if (mesh.count>=mesh.instanceMatrix.count) continue;
      if(impact){
        local.set(d.x,d.y-impact.spec.height,d.z).applyQuaternion(wreckRotation);
        dummy.position.set(x+local.x,impact.center+local.y+.07,z+local.z);
        dummy.quaternion.setFromEuler(partRotation.set(d.pitch??0,d.yaw??0,d.roll,'YXZ')).premultiply(wreckRotation);
      }else{
        local.set(d.x,d.y,d.z);
        if(lean)local.applyAxisAngle(axis,lean);
        dummy.position.set(x+local.x*cos-local.z*sin,local.y+.07+altitude,z+local.x*sin+local.z*cos);
        dummy.rotation.set(lean+(d.pitch??0),-heading+(d.yaw??0),d.roll,'YXZ');
      }
      dummy.scale.set(d.w,d.h,d.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count,dummy.matrix);
      let tint=tintCache.get(d.color);
      if(!tint){tint=new T.Color(d.color);tintCache.set(d.color,tint);}
      mesh.setColorAt(mesh.count,tint);
      mesh.count++;
    }
  }
  function decal(mesh,x,z,heading,w,h,y) {
    if(mesh.count>=mesh.instanceMatrix.count) return;
    dummy.position.set(x,y,z);
    dummy.rotation.set(-Math.PI/2,-heading,0,'YXZ');
    dummy.scale.set(w,h,1);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count++,dummy.matrix);
  }
  const axis=new T.Vector3(1,0,0);
  let last=0;
  // Draw in priority order (portrait, named NPC, resident, walker) and reserve
  // each accepted pose. Reuse the buffer when the next frame rebuilds the poses.
  const crowdPoses=[],crowdPeople=[];
  let crowdCount=0;
  function reservePerson(x,z,radius){
    let pose=crowdPoses[crowdCount];
    if(!pose)crowdPoses[crowdCount]=pose={x:0,z:0,radius:0};
    pose.x=x;pose.z=z;pose.radius=radius;
    crowdCount++;
    return pose;
  }
  function clearPerson(x,z,radius){
    for(let i=0;i<crowdCount;i++){
      const other=crowdPoses[i],dx=x-other.x,dz=z-other.z;
      const clearance=radius+other.radius;
      if(dx*dx+dz*dz<clearance*clearance)return false;
    }
    return true;
  }
  function placePerson(item,facing,radius,scale){
    const x=item.x*scale,z=item.y*scale;
    if(clearPerson(x,z,radius))return reservePerson(x,z,radius);
    const onRoad=Boolean(roadAt(item.x,item.y,-.15/scale));
    for(const distance of spacingRings)for(const offset of spacingAngles){
      const angle=facing+Math.PI/2+offset;
      const px=x+Math.cos(angle)*distance,pz=z+Math.sin(angle)*distance;
      if(!clearPerson(px,pz,radius))continue;
      const wx=px/scale,wy=pz/scale;
      // Preserve the side of the curb and avoid pressing the shifted body into a wall.
      if(Boolean(roadAt(wx,wy,-.15/scale))!==onRoad||worldContact(wx,wy,.24/scale))continue;
      return reservePerson(px,pz,radius);
    }
    // A fully occupied pocket cannot take another silhouette this frame.
    return null;
  }
  function drawParked(x,z,missingParked){
    for(const prop of parkedScooters){
      if(Math.hypot(x-prop.x,z-prop.z)>43||missingParked?.has(parkedKey(prop.x,prop.z)))continue;
      if(Math.hypot(x-prop.x,z-prop.z)>24||!models.draw('scooter_parked',prop.x,prop.z,prop.heading))
        stamp(Math.hypot(x-prop.x,z-prop.z)>24?parkedStyles[4].far:parkedModel,prop.x,prop.z,prop.heading,0);
    }
  }
  function drawRacks(x,z,missing){
    for(const prop of racks){
      if(Math.abs(x-prop.x)>53||Math.abs(z-prop.z)>53||missing?.has(parkedKey(prop.x,prop.z)))continue;
      const style=prop.look%paint.length;
      stamp(Math.hypot(x-prop.x,z-prop.z)<20?parkedStyles[style].near:parkedStyles[style].far,prop.x,prop.z,prop.heading,0);
    }
  }
  function uploadInstances(){
    for (const mesh of meshes) {
      if(!mesh.count)continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor){
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0,mesh.count*3);
        mesh.instanceColor.needsUpdate=true;
      }
    }
  }
  function updateActors(state,scale,night,rain,turn,photorealistic,walkerPortrait=null,eye=null,previewBus=null,previewDelivery=null,scalePortrait=null,parkedOnly=false) {
    featured.begin(); // A22
    models.begin();
    scratch=false;pooled=0; // P2 perf
    for (const mesh of meshes) mesh.count=0;
    headlights.count=shadows.count=tails.count=0;
    const {player,clock}=state;
    const x=player.x*scale,z=player.y*scale;
    if(parkedOnly){
      drawParked(x,z,state.impact?.missingParked);
      uploadInstances();
      return;
    }
    const dt=Math.max(0,Math.min(.05,clock-last));last=clock;
    const riding=player.mode==='scooter',grandma=player.skin==='grandma';
    const lean=riding?turn*Math.min(.46,player.speed*scale*.045)*(grandma?.4:1):0;
    const pitch=riding?T.MathUtils.clamp((state.acceleration??0)*.007,-.056,.051):0;
    const stand=!riding&&player.speed<.5?state.standingPoint:null;
    const avatarX=stand?stand.x*scale:x,avatarZ=stand?stand.y*scale:z;
    const ground=(surfaceAt(avatarX/scale,avatarZ/scale)?.height??(roadAt(player.x,player.y)?.02:.065))+Math.abs(pitch)*.64; // A24
    const avatar=riding?(grandma?'grandma_scooter':'rider_scooter'):['creative','media','grandma'].includes(player.skin)?'walker_f':'walker_m';
    const tesla=player.vehicle==='flyingTesla',altitude=player.altitude??0;
    if(player.mode==='car'){ // A26 draw the same livery on the street and in flight.
      if(!state.cockpit)featured.electric(x,z,player.heading,altitude,turn,clock,night,player.speed*scale,player.featuredStyle);
      state.avatarModel=state.cockpit?'cockpit':'companyCar';
    }else if(tesla){
      featured.electric(x,z,player.heading,altitude,turn,clock,night,player.speed*scale); // A22
      state.avatarModel='flyingTesla';
    }else if(eye&&Math.hypot(eye.x-avatarX,eye.z-avatarZ)<.95&&eye.y<ground+2.3){
      // 鏡頭被牆或柱子推到主角身上時，暫時不畫主角，不要讓畫面被衣服的破面填滿
      state.avatarModel='hidden';
    }else{
      const loadedAvatar=models.draw(avatar,avatarX,avatarZ,player.heading,{
        dt,moving:player.speed>1,speed:player.speed*scale,ground,lean,pitch,tint:outfits[player.skin],
      });
      state.avatarModel=loadedAvatar?avatar:models.pending(avatar)?'loading':'procedural';
      if(!loadedAvatar&&(riding||!models.pending(avatar))){
        scratch=true;
        if(riding)stamp(twoWheeler(grandma,outfits[player.skin],turn,player.skin==='data'),x,z,player.heading,lean);
        const pose=riding?null:trackGait(player,avatarX,avatarZ,player.heading,clock,player.speed>.5,0);
        stamp(person(player.skin,pose?.phase??0,riding,grandma?.31:.51,false,null,false,false,pose?.weight??-1,
          Math.sin(clock*1.7)*(1-(pose?.weight??0))),avatarX,avatarZ,player.heading,lean,null,ground-.07);
        scratch=false;
      }
    }
    const missingParked=state.impact?.missingParked;
    if(!photorealistic){drawParked(x,z,missingParked);drawRacks(x,z,missingParked);}
    decal(shadows,avatarX,avatarZ,player.heading,tesla?4.55:riding?2.35:.93,tesla?1.75:.8,tesla?.35:.47);
    if ((riding||player.mode==='car') && night>.1) { // A26
      decal(headlights,x+Math.cos(player.heading)*4,z+Math.sin(player.heading)*4,player.heading,7.7,2.45,.49);
    }
    // A22 sky traffic follows surveyed lanes above the roofs.
    for(const npc of skyTraffic(clock))featured.electric(npc.x,npc.z,npc.heading,npc.altitude,0,clock,night,24);
    const cars=missingParked?.size?[...state.cars,...state.impact.parkedVehicles()]:state.cars;
    for (const item of [...cars,...(state.featuredParked??[])]) { // A22
      if(item.hidden)continue;
      const px=item.x*scale,pz=item.y*scale;
      const distance=Math.hypot(px-x,pz-z);
      if(distance>104&&!state.inActorView?.(item,true))continue;
      if(distance>22&&!item.impact&&state.inActorView?.(item,true)===false)continue;
      const impact=item.impact;
      if(item.featuredStyle!=null){ // A22 use the same rigid body as A14.
        featured.street(item,px,pz);
      }else if(impact&&item.scooter){
        const loaded=models.draw('scooter_parked',px,pz,item.heading,{impact});
        if(!loaded)stamp(parkedModel,px,pz,item.heading,0,impact);
      }else if(item.scooter) {
        const look=lookOf(item)%120,near=distance<18;
        const key=[item.color,look,Boolean(rain),near].join('/');
        if(!farScooters.has(key))farScooters.set(key,riderModel(item.color,look,rain,near));
        stamp(farScooters.get(key),px,pz,item.heading,0);
      } else {
        const variant=lookOf(item)%3,taxi=item.service==='taxi',tone=taxi?'#eeb82e':item.color;
        const key=tone+variant;
        if(!carModels.has(key))carModels.set(key,car(tone,variant));
        const asset=item.service==='waste'?'garbage_truck':item.service==='bus'?'bus':
          !item.service&&variant===0?'car_ev':null;
        const loaded=asset&&distance<(asset==='car_ev'?20:42)&&
          models.draw(asset,px,pz,item.heading,{tint:asset==='car_ev'?tone:undefined,impact});
        if(!loaded)stamp(truckModels[item.service]??carModels.get(key),px,pz,item.heading,0,impact);
        scratch=true;
        if(taxi)stamp([p('#ecd66b',-.08,1.57,0,.34,.12,.34),p('#fff2b2',.01,1.59,0,.041,.075,.26)],px,pz,item.heading,0,impact);
        if(!impact&&item.signal&&item.signalUntil>clock&&Math.floor(clock*5)%2===0){
          const front=item.service==='bus'?5.2:2.31;
          stamp([p('#ffaa39',front,.77,item.signal*.79,.053,.12,.19),p('#ffaa39',-front,.77,item.signal*.79,.053,.12,.19)],px,pz,item.heading,0);
        }
        scratch=false;
      }
      if(distance<57) decal(shadows,px,pz,item.heading,item.scooter?2.3:4.4,item.scooter?.8:1.9,.46);
      if(impact?.settled&&distance<65){
        scratch=true;
        for(let i=0;i<4;i++){
          const age=(clock*.9+i*.25)%1;
          const size=.18+age*.39;
          stamp([ball(i%2?'#687077':'#525960',age*.55,1.02+age*1.65,Math.sin(age*4+i)*.25,size,size,size)],px,pz,0,0);
        }
        scratch=false;
      }
      if(!impact&&night>.1) {
        const length=item.scooter?(rain?6.2:5.2):(rain?10:8.5);
        decal(headlights,px+Math.cos(item.heading)*length*.49,pz+Math.sin(item.heading)*length*.49,
          item.heading,length,item.scooter?1.08:2.30,.088);
        if(rain)decal(tails,px-Math.cos(item.heading)*2.7,pz-Math.sin(item.heading)*2.7,
          item.heading,4.35,item.scooter?.45:1.2,.088);
      }
    }
    function lookOf(item){
      if(item===walkerPortrait)return 0;
      let look=lookCache.get(item);
      if(look===undefined){
        const key=item.localId??item.id;
        if(key!=null){look=0;for(const ch of String(key))look=(look*31+ch.charCodeAt(0))>>>0;}
        else look=nextLook++;
        lookCache.set(item,look);
      }
      return look;
    }
    function stampPerson(item,px,pz,facing,index,moving,ground,distance){ // A24
      const officePerson=item.locationId==='office'?officePeople.get(item.id):null;
      if(officePerson){
        stamp(officePerson,px,pz,facing,0,null,ground);
        return;
      }
      const skin=item.skin??'npc_vendor',standing=Boolean(item.standing),speed=item.movingSpeed;
      // The demo's walker portrait still exercises the optional GLB path.
      if(skin==='npc_student'&&item!==walkerPortrait){
        const distance=Math.hypot(px-(eye?.x??x),pz-(eye?.z??z));
        const phase=moving?clock*8+index:0;
        stamp(schoolWalker(index,phase,distance<18),px,pz,facing,0,null,ground);
        return;
      }
      const style=sidewalkWardrobe[index%sidewalkWardrobe.length];
      const atOffice=item.district==='client_hq'||nearSite(officeDoors,px,pz,scale,95);
      const evening=state.time>=17.5||state.time<6;
      const market=item.zone==='market'||item.district==='night_market';
      const [shirt,pants]=item.id==='ae_mei'?meiWardrobe:atOffice&&!evening?officeWardrobe[index%8]:
        market||evening?marketWardrobe[index%8]:style;
      // 有名字的角色照角色設定的性別；路人才用外觀類型或輪流
      const female=femaleNpcs.has(item.id)?true:maleNpcs.has(item.id)?false:standing?index%2===0:femaleSkins.includes(skin);
      const elder=skin==='npc_elder'||skin==='npc_grandma';
      const stature=(elder?.94:1)*style[2],type=female?'walker_f':'walker_m';
      const hatAllowed=elder&&(item.zone==='market'||nearSite(elderHats,px,pz,scale,45));
      if(hatAllowed)stamp(one(part('hat','#afa178',0,1.68*stature,0,.46,.16,.46)),px,pz,facing,0,null,ground);
      let drawn=false;
      if(distance<=8){
        walkerOptions.dt=dt;walkerOptions.moving=moving;walkerOptions.speed=speed;walkerOptions.ground=ground;
        walkerOptions.tint=shirt;walkerOptions.trousers=pants;walkerOptions.stature=stature;
        walkerOptions.idlePose=index%5;walkerOptions.build=style[3];walkerOptions.complexion=((index*11)%7-3)*.034;
        drawn=models.draw(type,px,pz,facing,walkerOptions);
      }
      if(!drawn){
        const pose=trackGait(item,px,pz,facing,clock,moving,index);
        const {phase,weight}=pose;
        const idle=Math.sin(clock*1.7+(index%13)*.82)*(1-weight);
        if(distance<28){
          clothesAt[0]=shirt;clothesAt[1]=pants;clothesAt[2]=index%4===0?'satchel':'';
          const faceDetail=Math.hypot(px-(eye?.x??x),pz-(eye?.z??z))<12;
          stamp(person(skin,phase,false,0,false,clothesAt,false,faceDetail,weight,idle),px,pz,facing,0,null,ground-.07);
        }else{
          const opposite=(phase+.5)%1,hip=idle*.019;
          const arm=Math.cos(phase*2*Math.PI)*.205*weight;
          farBody[0]=ball(shirt,hip,1.14,0,.30,.61,.44);
          farBody[1]=ball('#bc9178',hip+.025,1.55,0,.21,.26,.21);
          farBody[2]=ball('#443c3a',hip-.008,1.64,0,.22,.16,.22);
          farBody[3]=limb(pants,v3(rootAt,hip,.81,.11),v3(kneeAt,footTravel(phase)*weight,.039+footLift(phase)*weight,.11),.15);
          farBody[4]=limb(pants,v3(rootAt,hip,.81,-.11),v3(kneeAt,footTravel(opposite)*weight,.039+footLift(opposite)*weight,-.11),.15);
          farBody[5]=limb(shirt,v3(rootAt,hip,1.32,.22),v3(kneeAt,hip-arm,.89,.22),.11);
          farBody[6]=limb(shirt,v3(rootAt,hip,1.32,-.22),v3(kneeAt,hip+arm,.89,-.22),.11);
          stamp(farBody,px,pz,facing,0,null,ground-.07);
        }
        return;
      }
      if(index%5===1||index%5===3){
        walkerBag[0]=ball('#433f49',-.16,1.16*stature,0,.21,.42,.30);
        walkerBag[1]=p('#5a5560',-.055,1.23*stature,.13,.17,.28,.027);
        walkerBag[2]=p('#5a5560',-.055,1.23*stature,-.13,.17,.28,.027);
        stamp(walkerBag,px,pz,facing,0,null,ground);
      }
    }
    if(!photorealistic)for(const id of ['home','night_market','client_hq']){
      const site=byId.get(id),heading=site.viewHeading,fx=Math.cos(heading),fz=Math.sin(heading);
      const sx=site.x*scale,sz=site.y*scale;
      if(Math.hypot(x-sx,z-sz)>39)continue;
      const at=(side,front)=>[sx+fz*side+fx*front,sz-fx*side+fz*front];
      if(id!=='client_hq'&&!previewBus){
        const [truckX,truckZ]=id==='night_market'?[marketTruck.x*scale,marketTruck.y*scale]:at(-3.8,.95); // A23 night
        const direction=heading-Math.PI/2;
        if(id!=='home'||!models.draw('garbage_truck',truckX,truckZ,direction))
          stamp(truckModels[id==='home'?'waste':'recycling'],truckX,truckZ,direction,0);
      }
      stamp(cat,...at(3.2+Math.sin(clock*.9)*.6,2.98),heading,0);
    }
    if(!photorealistic&&scalePortrait){
      const {x,z,heading,car,walker}=scalePortrait;
      models.draw('rider_scooter',x,z,heading);
      models.draw('walker_f',walker.x,walker.z,walker.heading,{tint:'#379078'});
      models.draw('car_ev',car.x,car.z,car.heading,{tint:'#a9bac2'});
      decal(shadows,x,z,heading,2.35,.8,.47);
    }
    if(!photorealistic&&previewDelivery)stamp(delivery,previewDelivery.x,previewDelivery.z,previewDelivery.heading,0);
    if(!photorealistic&&previewBus&&!models.draw('bus',previewBus.x,previewBus.z,previewBus.heading))
      stamp(bus,previewBus.x,previewBus.z,previewBus.heading,0);
    const persons=crowdPeople;
    persons.length=0;
    if(walkerPortrait)persons.push(walkerPortrait);
    for(const person of state.npcs)persons.push(person);
    for(const person of streetCrowds)persons.push(person);
    for(const person of state.walkers)persons.push(person);
    crowdCount=0;
    if(player.mode==='foot'&&state.avatarModel!=='hidden')reservePerson(avatarX,avatarZ,personRadius);
    scratch=true; // 這個迴圈裡的零件都是畫完就丟
    for (let i=0;i<persons.length;i++) {
      const item=persons[i];
      const look=lookOf(item);
      if(i>0&&item===walkerPortrait)continue;
      if(item.hidden)continue;
      const distance=Math.hypot(item.x*scale-x,item.y*scale-z);
      if(item!==walkerPortrait){
        if(distance>60&&!state.inActorView?.(item,true)||distance>12&&state.inActorView?.(item,true)===false)continue;
      }
      const named=item.id!=null||item.standing;
      const facing=item.heading??-Math.PI/2;
      const umbrella=rain&&item.role!=='cyclist'&&item.role!=='runner'&&look%4!==0;
      const radius=item.role==='cyclist'?bicycleRadius:item.role==='runner'?runnerRadius:umbrella?umbrellaRadius:personRadius;
      const pose=placePerson(item,facing,radius,scale);
      if(!pose)continue;
      const {x:px,z:pz}=pose;
      const ground=surfaceAt(px/scale,pz/scale)?.height??0; // A24
      const namedModel=item.id==null?undefined:namedNpcModels.get(item.id);
      if(namedModel){
        // The named models' soles are built at local zero; cancel stamp's default lift.
        stamp(namedModel,px,pz,facing,0,null,ground-.07);
      }else if(item.role==='cyclist'){
        stamp(activeCycle(look,clock*6),px,pz,facing,0,null,ground);
      }else if(item.role==='runner'){
        stamp(person(item.skin,clock*9+look,false,0,false,[sidewalkWardrobe[look%8][0],'#424655',''],true),px,pz,facing,-.04,null,ground);
      }else if(item.takingPhoto){ // A22 raised arms and phone face the parked car.
        const photographer=person(item.skin??'npc_student',0,false,0,true);
        photographer.push(p('#29323c',.39,1.49,0,.032,.135,.19),p('#c5f0f4',.408,1.53,.06,.008,.028,.028));
        stamp(photographer,px,pz,facing,0,null,ground);
      }else if(item.skin!=='npc_student'&&item.localId?.startsWith?.('evening:plaza:')&&distance>23){
        // A23 night: keep the holiday visitor outfit while using the pavement pose.
        const pose=trackGait(item,px,pz,facing,clock,!named&&(item.movingSpeed??0)>.05,look);
        const idle=Math.sin(clock*1.7+(look%13)*.82)*(1-pose.weight);
        stamp(person(item.skin,pose.phase,false,0,false,null,false,false,pose.weight,idle),px,pz,facing,0,null,ground-.07);
      }else stampPerson(item,px,pz,facing,look,!named&&(item.movingSpeed??0)>.05,ground,distance);
      if(umbrella)stamp(umbrellas[look%8],px,pz,facing,0,null,ground);
      decal(shadows,px,pz,0,.87,.67,.455);
    }
    scratch=false;
    featured.finish(); // A22
    uploadInstances();
    shadows.instanceMatrix.needsUpdate=headlights.instanceMatrix.needsUpdate=true;
    // A23 night: the two lamp beams share the vehicle's existing moving decal.
    const wet=rain&&night>.2&&glow.userData.wetVehicle;
    headlightMat.map=tailMaterial.map=wet||glow;
    headlightMat.color.set(wet?'#fff0db':'#f8cc88');
    headlightMat.opacity=night*(rain?.64:.4);
    tails.instanceMatrix.needsUpdate=true;tailMaterial.opacity=rain?night*.44:0;
  }
  updateActors.ready=Promise.all([models.ready,featured.ready]); // A22
  updateActors.loaded=models.loaded;
  updateActors.bounds=models.bounds;
  updateActors.dispose=()=>{featured.dispose();models.dispose();}; // A22
  return updateActors;
}
