import {streetCrowds} from '../crowds.mjs';
import {createModelAssets} from './model-assets.js';
import {byId,roadAt} from '../world.mjs';
import * as T from '../vendor/three.module.min.js';

const cube=new T.BoxGeometry(1,1,1);
const round=new T.SphereGeometry(.5,10,7);
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
const cab=serviceProfile([[-.46,-.46],[.42,-.46],[.47,-.32],[.44,.15],[.19,.46],[-.38,.46],[-.46,.35]]);
const busShell=serviceProfile([[-.46,-.39],[.40,-.39],[.47,-.26],[.47,.22],[.35,.43],[-.41,.43],[-.47,.30]]);
const compactor=serviceProfile([[-.47,-.40],[.44,-.40],[.47,.25],[.33,.43],[-.28,.43],[-.47,.16]]);
const headColors=['#a97657','#ab785d','#c08968','#926747'];
const outfits={ae:'#547981',planner:'#ba9262',media:'#6387ac',creative:'#a26072',data:'#776993',cx:'#7d8861',
  grandma:'#8b5368',npc_grandma:'#a7656e',npc_client:'#7184a2',npc_boss:'#435264',npc_colleague:'#739780',
  npc_vendor:'#324b62',npc_student:'#296168',npc_elder:'#766953',npc_rider:'#c29b4d'};

const part=(shape,color,x,y,z,w,h,d,roll=0)=>({shape,color,x,y,z,w,h,d,roll});
const p=(...args)=>part('box',...args);
const ball=(...args)=>part('round',...args);
const tire=(x,y,z,size=.58)=>part('wheel','#252329',x,y,z,size,size,.16);
const metal=(...args)=>p('#87908e',...args);
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
  return [tire(-.68,.30,0),{...tire(.71,.30,0),yaw:steer*.65},
    ball(paint,-.16,.53,0,1.54,.56,.42),p('#28272a',-.38,.79,0,.79,.15,.39),
    ball(paint,.55,.73,0,.49,.64,.44),metal(.58,.60,0,.08,.65,.08,-.22),
    {...metal(.46,1.01,0,.12,.065,.72),yaw:steer},p('#d9edf4',.795,.89,0,.043,.065,.34),
    p('#a2d3df',.79,.81,0,.045,.028,.29),
    p('#253e54',.48,1.046,0,.15,.026,.24),
    part('wheel','#bcc2ba',.69,.30,.093,.31,.31,.031),
    ...(electric?[p('#557c82',.04,.49,0,.66,.18,.35),p('#85c0bd',.04,.50,.184,.52,.025,.016)]:[]),
    ball('#343339',-.68,.48,0,.70,.25,.28),p('#c94833',-.91,.59,0,.048,.13,.23),p('#d8d2c0',-.942,.442,0,.035,.12,.25),
    ball(paint,.72,.51,0,.37,.2,.45),p('#303439',.04,.43,0,.52,.08,.39),
    ...[-1,1].flatMap(s=>[p('#35353a',.46,1.08,s*.32,.045,.19,.068),ball('#5c6268',.44,1.20,s*.352,.093,.079,.17)]),
    p('#656666',-.67,.31,.25,.53,.12,.13)];
}
const profile={
  ae:['#586d7b','#2b313b','briefcase'],planner:['#aa9069','#433d3d','satchel'],
  media:['#5175a1','#3e434d','backpack'],creative:['#9e5555','#41424a','scarf'],
  data:['#6e6481','#343843','glasses'],cx:['#6a8267','#464842','vest'],
};
function limb(color,a,b,w,d=w) {
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const entry=ball(color,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,Math.hypot(dx,dy,dz)+w*.52,d,Math.atan2(-dx,dy));
  entry.pitch=Math.atan2(dz,Math.hypot(dx,dy));
  return entry;
}
function person(skin,phase,riding=false,seat=0) {
  const grandma=skin.includes('grandma');
  const [shirt,pants,accessory]=profile[skin]??[outfits[skin]??'#536573',grandma?'#4b4146':'#3e4147',
    skin==='npc_student'?'backpack':skin==='npc_boss'?'briefcase':''];
  const skinColor=headColors[skin.length%headColors.length];
  const swing=riding?0:Math.sin(phase)*.21;
  const hip=riding?(grandma?-.45:-.34):0;
  const pelvis=riding?seat+.46:.86,shoulder=pelvis+.49;
  const headX=riding?hip+.17:0,headY=shoulder+.235;
  const body=[
    ball(pants,hip,pelvis,0,.30,.24,.285),
    ball(shirt,hip+.058,pelvis+.29,0,.265,.52,.365),
    ball(shirt,hip+.072,shoulder-.075,0,.255,.18,.43),
    ball('#d1ccb9',hip+.124,shoulder-.017,0,.146,.088,.158),
    ball(skinColor,headX,headY-.152,0,.12,.19,.12),
  ];
  if(riding) {
    const shell=grandma?'#ba8c88':skin==='npc_rider'?'#cba666':'#d5d1c4';
    body.push(ball(shell,headX,headY+.022,0,.285,.279,.276),
      ball('#343f49',headX+.103,headY-.005,0,.127,.125,.242),
      ball('#899ba1',headX+.158,headY+.022,0,.022,.058,.157));
  } else {
    const hair=grandma?'#a69d97':'#2c2525';
    body.push(ball(skinColor,headX,headY,0,.216,.246,.192),ball(hair,headX-.036,headY+.071,0,.188,.156,.199),
      ball(skinColor,headX+.102,headY-.019,0,.053,.057,.068));
    if(grandma)body.push(part('hat','#c3ab6b',headX,headY+.12,0,.49,.145,.50));
  }
  for(const s of [-1,1]) {
    const knee=[riding?hip+.51:s*swing*.8,riding?.58:.48,s*.14];
    const ankle=[riding?hip+.52:s*swing,riding?.34:.14,s*.13];
    const elbow=[riding?hip+.36:-s*swing*.64,shoulder-.205,s*.235];
    const hand=[riding?(grandma?.29:.46):-s*swing*.9,riding?(grandma?.96:1.00):pelvis-.01,s*.255];
    body.push(limb(pants,[hip,pelvis,s*.105],knee,.15),limb(pants,knee,ankle,.113),
      ball('#332e31',ankle[0]+.064,ankle[1]-.085,s*.13,.231,.115,.121),
      limb(shirt,[hip+.07,shoulder-.102,s*.178],elbow,.13),
      limb(shirt,elbow,hand,.092),ball(skinColor,...hand,.083,.091,.086));
  }
  if(accessory==='backpack'||accessory==='satchel') {
    body.push(ball('#363940',hip-.13,pelvis+.29,accessory==='satchel'?.16:0,.215,.35,.28));
    for(const s of [-1,1]) body.push(limb('#33333a',[hip+.173,shoulder,s*.137],[hip+.173,pelvis+.17,s*.137],.034));
  }
  if(accessory==='briefcase'&&!riding)body.push(p('#584339',swing*.82,pelvis-.23,.28,.31,.25,.12));
  if(accessory==='scarf')body.push(ball('#e2b56b',hip+.09,shoulder+.058,0,.20,.083,.182));
  if(accessory==='glasses'&&!riding)body.push(p('#34373d',headX+.102,headY+.031,0,.038,.036,.17));
  if(accessory==='vest')body.push(p('#c4c09a',hip+.197,pelvis+.27,0,.022,.28,.10));
  return body;
}
function car(color) {
  const glass='#334651';
  return [
    ball(color,0,.65,0,4.65,.84,1.82),p(color,0,.49,0,4.37,.22,1.84),
    ball(glass,-.22,1.07,0,2.77,.85,1.72),p('#43535c',-.32,1.48,0,1.62,.035,1.28),
    p('#c9e6ea',2.25,.73,0,.10,.061,1.53),p('#db555b',-2.26,.76,0,.09,.068,1.52),
    p('#222d35',2.28,.49,0,.06,.14,.82),p('#a4cccc',-.07,1.52,0,.19,.08,.31),
    ...[-1,1].flatMap(s=>[
      tire(1.34,.35,s*.76,.69),tire(-1.36,.35,s*.76,.69),
      part('wheel','#98a8af',1.34,.35,s*.853,.45,.45,.025),
      part('wheel','#98a8af',-1.36,.35,s*.853,.45,.45,.025),
      p('#303c45',-.05,.91,s*.89,.18,.03,.025),p('#303c45',-.69,.91,s*.89,.18,.03,.025),
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

const sidewalkWardrobe=[
  ['#a16261','#34373a',.93,1.02],['#58796e','#706358',1.04,.92],['#bc966c','#494356',.96,1.06],
  ['#7887a1','#b0a189',1.02,.95],['#7b566f','#353e48',1.07,1.11],['#b3a88f','#44564e',.94,.97],
  ['#587384','#7a5547',1.04,1.06],['#8b7855','#39384a',.98,.94],
];
const dummy=new T.Object3D();
const color=new T.Color();
const local=new T.Vector3();

export function createActors(scene,glow,parkedScooters=[]) {
  const models=createModelAssets(scene);
  const geometries={box:cube,round,wheel,hat,cab,busShell,compactor};
  const material=new T.MeshStandardMaterial({roughness:.63});
  const groups=Object.fromEntries(Object.entries(geometries).map(([name,geo])=>{
    const coat=['cab','busShell','compactor'].includes(name)?new T.MeshStandardMaterial({roughness:.31,metalness:.51}):material;
    const mesh=new T.InstancedMesh(geo,coat,1200);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.count=0;
    mesh.frustumCulled=false;
    mesh.castShadow=true;
    scene.add(mesh);
    return [name,mesh];
  }));
  const farScooters=new Map();
  const carModels=new Map();
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
  function stamp(descriptors,x,z,heading,lean) {
    const cos=Math.cos(heading),sin=Math.sin(heading);
    for (const d of descriptors) {
      const mesh=groups[d.shape];
      if (mesh.count>=mesh.instanceMatrix.count) continue;
      local.set(d.x,d.y,d.z).applyAxisAngle(axis,lean);
      dummy.position.set(x+local.x*cos-local.z*sin,local.y+.07,z+local.x*sin+local.z*cos);
      dummy.rotation.set(lean+(d.pitch??0),-heading+(d.yaw??0),d.roll,'YXZ');
      dummy.scale.set(d.w,d.h,d.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count,dummy.matrix);
      mesh.setColorAt(mesh.count,color.set(d.color));
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
  function updateActors(state,scale,night,rain,turn,photorealistic,walkerPortrait=null,eye=null,previewBus=null,previewDelivery=null,scalePortrait=null) {
    models.begin();
    for (const mesh of Object.values(groups)) mesh.count=0;
    headlights.count=shadows.count=tails.count=0;
    const {player,clock}=state;
    const x=player.x*scale,z=player.y*scale;
    const dt=Math.max(0,Math.min(.05,clock-last));last=clock;
    const riding=player.mode==='scooter',grandma=player.skin==='grandma';
    const lean=riding?turn*Math.min(.46,player.speed*scale*.045)*(grandma?.4:1):0;
    const pitch=riding?T.MathUtils.clamp((state.acceleration??0)*.007,-.056,.051):0;
    const ground=(roadAt(player.x,player.y)?.02:.065)+Math.abs(pitch)*.64;
    const stand=!riding&&player.speed<.5?state.standingPoint:null;
    const avatarX=stand?stand.x*scale:x,avatarZ=stand?stand.y*scale:z;
    const avatar=riding?(grandma?'grandma_scooter':'rider_scooter'):['creative','media','grandma'].includes(player.skin)?'walker_f':'walker_m';
    const loadedAvatar=models.draw(avatar,avatarX,avatarZ,player.heading,{
      dt,moving:player.speed>1,speed:player.speed*scale,ground,lean,pitch,tint:outfits[player.skin],
    });
    state.avatarModel=loadedAvatar?avatar:models.pending(avatar)?'loading':'procedural';
    if(!loadedAvatar&&(riding||!models.pending(avatar))){
      if(riding)stamp(twoWheeler(grandma,outfits[player.skin],turn,player.skin==='data'),x,z,player.heading,lean);
      stamp(person(player.skin,clock*player.speed*.22,riding,grandma?.31:.51),avatarX,avatarZ,player.heading,lean);
    }
    if(!photorealistic)for(const prop of parkedScooters){
      if(Math.hypot(x-prop.x,z-prop.z)>43)continue;
      if(Math.hypot(x-prop.x,z-prop.z)>24||!models.draw('scooter_parked',prop.x,prop.z,prop.heading))
        stamp(twoWheeler(false,'#788b91',0),prop.x,prop.z,prop.heading,0);
    }
    decal(shadows,avatarX,avatarZ,player.heading,riding?2.35:.93,.8,.47);
    if (riding && night>.1) {
      decal(headlights,x+Math.cos(player.heading)*4,z+Math.sin(player.heading)*4,player.heading,7.7,2.45,.49);
    }
    for (const item of state.cars) {
      if(item.hidden)continue;
      const px=item.x*scale,pz=item.y*scale;
      const distance=Math.hypot(px-x,pz-z);
      if(distance>104&&!state.inActorView?.(item,true))continue;
      if(item.scooter) {
        if(!farScooters.has(item.color)) {
          farScooters.set(item.color,{
            close:[...twoWheeler(false,item.color,0),...person('npc_rider',0,true,.51)],
            distant:[tire(-.66,.3,0),tire(.64,.3,0),p(item.color,0,.62,0,1.55,.42,.43),
              p('#81705a',-.13,1.31,0,.34,.67,.43),ball('#cfcbc0',-.08,1.66,0,.27,.26,.26),p('#333a41',.055,1.65,0,.035,.084,.18)],
          });
        }
        const model=farScooters.get(item.color);
        const detailed=distance<28&&models.draw('rider_scooter',px,pz,item.heading);
        if(!detailed)stamp(distance<24?model.close:model.distant,px,pz,item.heading,0);
      } else {
        if(!carModels.has(item.color)) carModels.set(item.color,car(item.color));
        const taxi=item.service==='taxi';
        const asset=item.service==='waste'?'garbage_truck':item.service==='bus'?'bus':!item.service||taxi?'car_ev':null;
        const loaded=asset&&Math.hypot(px-(eye?.x??x),pz-(eye?.z??z))<=60&&
          models.draw(asset,px,pz,item.heading,{tint:asset==='car_ev'?(taxi?'#ffbf2c':item.color):undefined});
        if(!loaded)stamp(truckModels[item.service]??carModels.get(item.color),px,pz,item.heading,0);
        if(taxi)stamp([p('#ecd66b',-.08,1.57,0,.34,.12,.34),p('#fff2b2',.01,1.59,0,.041,.075,.26)],px,pz,item.heading,0);
        if(item.signal&&item.signalUntil>clock&&Math.floor(clock*5)%2===0){
          const front=item.service==='bus'?5.2:2.31;
          stamp([p('#ffaa39',front,.77,item.signal*.79,.053,.12,.19),p('#ffaa39',-front,.77,item.signal*.79,.053,.12,.19)],px,pz,item.heading,0);
        }
      }
      if(distance<57) decal(shadows,px,pz,item.heading,item.scooter?2.3:4.4,item.scooter?.8:1.9,.46);
      if(night>.1) {
        const length=rain?13:9.5;
        decal(headlights,px+Math.cos(item.heading)*length*.49,pz+Math.sin(item.heading)*length*.49,
          item.heading,length,rain?2.45:3.5,.088);
        if(rain)decal(tails,px-Math.cos(item.heading)*2.7,pz-Math.sin(item.heading)*2.7,
          item.heading,4.35,item.scooter?.45:1.2,.088);
      }
    }
    function stampPerson(skin,px,pz,facing,index,moving=false,speed=0,standing=false){
      const style=sidewalkWardrobe[index%sidewalkWardrobe.length];
      const female=standing?index%2===0:['npc_student','npc_grandma','creative','media'].includes(skin);
      const elder=skin==='npc_elder'||skin==='npc_grandma';
      const stature=(elder?.94:1)*style[2],type=female?'walker_f':'walker_m';
      if(!models.draw(type,px,pz,facing,{dt,moving,speed,tint:style[0],trousers:style[1],stature,
        build:style[3],complexion:((index*11)%7-3)*.034})){
        stamp(person(skin,moving?clock*7+px:0),px,pz,facing,0);
        return;
      }
      if(elder||index%9===7)stamp([part('hat','#afa178',0,1.68*stature,0,.46,.16,.46)],px,pz,facing,0);
      else if(index%5===1||index%5===3){
        stamp([ball('#433f49',-.16,1.16*stature,0,.21,.42,.30),
          p('#5a5560',-.055,1.23*stature,.13,.17,.28,.027),p('#5a5560',-.055,1.23*stature,-.13,.17,.28,.027)],px,pz,facing,0);
      }
    }
    if(!photorealistic)for(const id of ['home','night_market','client_hq']){
      const site=byId.get(id),heading=site.viewHeading,fx=Math.cos(heading),fz=Math.sin(heading);
      const sx=site.x*scale,sz=site.y*scale;
      if(Math.hypot(x-sx,z-sz)>39)continue;
      const at=(side,front)=>[sx+fz*side+fx*front,sz-fx*side+fz*front];
      if(id!=='client_hq'&&!previewBus){
        const [truckX,truckZ]=at(-3.8,.95),direction=heading-Math.PI/2;
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
    const persons=[...state.npcs,...streetCrowds,...state.walkers];
    if(walkerPortrait)persons.unshift(walkerPortrait);
    for (const [i,item] of persons.entries()) {
      if(i>0&&item===walkerPortrait)continue;
      if(item.hidden)continue;
      const px=item.x*scale,pz=item.y*scale;
      if(item!==walkerPortrait&&Math.hypot(px-x,pz-z)>60&&!state.inActorView?.(item,true))continue;
      const named=item.id!=null||item.standing;
      const facing=item.heading??-Math.PI/2;
      stampPerson(item.skin??'npc_vendor',px,pz,facing,i,!named&&(item.movingSpeed??0)>.05,item.movingSpeed,Boolean(item.standing));
      decal(shadows,px,pz,0,.87,.67,.455);
    }
    for (const mesh of Object.values(groups)) {
      mesh.instanceMatrix.needsUpdate=true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    }
    shadows.instanceMatrix.needsUpdate=headlights.instanceMatrix.needsUpdate=true;
    headlightMat.opacity=night*(rain?.64:.4);
    tails.instanceMatrix.needsUpdate=true;tailMaterial.opacity=rain?night*.44:0;
  }
  updateActors.loaded=models.loaded;
  updateActors.bounds=models.bounds;
  updateActors.dispose=models.dispose;
  return updateActors;
}
