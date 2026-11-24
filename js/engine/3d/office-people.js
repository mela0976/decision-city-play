// A25 colleagues use a fixed wardrobe and silhouettes at every viewing distance.
const looks={
  ae_mei: {height:1.65,width:.97,skin:'#c18d70',hair:'#3b2628',cut:'bob',coat:'#8e4357',shirt:'#e8cfaf',pants:'#3c3945',prop:'folio',accent:'#b58353'},
  boss_lin: {height:1.80,width:1.12,skin:'#b98a6c',hair:'#504b49',cut:'side-part',coat:'#283a57',shirt:'#dce1ea',pants:'#2b3549',prop:'tie',accent:'#80565d'},
  n2020_zhe: {height:1.76,width:1.00,skin:'#ba8462',hair:'#24252c',cut:'crop',coat:'#65754f',shirt:'#e7d2ad',pants:'#534739',prop:'notebook',accent:'#895236'},
  n2021_ting: {height:1.58,width:.91,skin:'#d19a7e',hair:'#32272d',cut:'ponytail',coat:'#d58c56',shirt:'#f0ded1',pants:'#3d5767',prop:'phone',accent:'#f0d8b5'},
  n2022_fang: {height:1.69,width:.96,skin:'#c8956c',hair:'#352c27',cut:'bun',coat:'#437775',shirt:'#d4e4d6',pants:'#45485b',prop:'glasses',accent:'#52433f'},
  n2025_pei: {height:1.63,width:.94,skin:'#c4896e',hair:'#59343d',cut:'pageboy',coat:'#6b5583',shirt:'#decde3',pants:'#353846',prop:'portfolio',accent:'#ddaa72'},
};

// 支線帶進辦公室的同事借用最接近的寫實路人模型，上衣、褲子換成上面的配色、身高照設定；
// 林總、美玲姐有專屬模型（named-npcs.js）。模型還沒載入時才畫下面的程式外形
const walkerCast={n2020_zhe:'walker_m',n2021_ting:'walker_f2',n2022_fang:'walker_f2',n2025_pei:'walker_f'};
export const officeWalkers=Object.fromEntries(Object.entries(walkerCast).map(([id,model])=>{
  const {coat,pants,height,width}=looks[id];
  return [id,{model,tint:coat,trousers:pants,height,build:width}];
}));

export function buildOfficePeople(box,ball,limb,part){
  return new Map(Object.entries(looks).map(([id,look])=>[id,buildPerson(look,box,ball,limb,part)]));
}

function buildPerson({height,width,skin,hair,cut,coat,shirt,pants,prop,accent},box,ball,limb,part){
  // Local +X is forward, Y is up, and Z spans the shoulders.
  const garment=(color,x,y,z,w,h,d)=>part('officeGarment',color,x,y,z,w,h,d);
  const shoes='#292a31';
  const handHeight=(prop==='folio'||prop==='phone')?.99:.85;
  const handDepth=handHeight>.85?.17:.018;
  const parts=[
    garment(coat,0,1.105,0,.249,.495,.383),
    garment(pants,-.007,.846,0,.22,.177,.307),
    ball(skin,.015,1.365,0,.117,.155,.115),
    ball(skin,.018,1.500,0,.209,.257,.195),
    ball(skin,.119,1.488,0,.036,.041,.035),
    ball('#8a534b',.111,1.447,0,.014,.012,.051),
    ball(hair,-.014,1.594,0,.219,.137,.206),
    ball(hair,-.072,1.509,0,.12,.222,.199),
    // The lapels flank a shallow shirt inset on the jacket front.
    box(shirt,.121,1.257,0,.032,.182,.145),
    box(coat,.135,1.273,-.073,.028,.167,.041,.01),
    box(coat,.135,1.273,.073,.028,.167,.041,.01),
  ];
  for(const side of [-1,1]){
    const z=side*.105;
    const stance=side*.037;
    const elbow=[-.005,1.075,side*.218];
    const hand=[side===1?handDepth:.018,side===1?handHeight:.845,side*.225];
    parts.push(
      part('officeTrouser',pants,stance,.455,z,.171,.749,.150),
      ball(shoes,stance+.037,.062,z,.231,.124,.134),
      limb(coat,[0,1.297,side*.167],elbow,.122),
      ball(coat,...elbow,.111,.124,.110),
      limb(coat,elbow,hand,.111),
      ball(skin,...hand,.084,.101,.074),
      ball(skin,-.006,1.498,side*.094,.060,.068,.035),
      ball('#3a3031',.112,1.533,side*.042,.012,.019,.025),
      ball('#663f36',.107,1.556,side*.044,.012,.009,.042),
    );
  }
  switch(cut){
    case 'bob':
      parts.push(ball(hair,-.052,1.454,-.080,.165,.245,.091),
        ball(hair,-.052,1.457,.080,.165,.237,.091),
        ball(hair,.075,1.591,.031,.101,.074,.128,-.47),
        ball(accent,.006,1.461,-.104,.024,.037,.025),
        ball(accent,.006,1.461,.104,.024,.037,.025));
      break;
    case 'side-part':
      parts.push(ball('#88827a',-.014,1.54,-.091,.127,.076,.033),
        ball('#88827a',-.014,1.54,.091,.127,.076,.033),
        ball(hair,.053,1.613,.033,.136,.078,.13,-.25));
      break;
    case 'crop':
      parts.push(ball(hair,.008,1.632,.012,.191,.101,.167,-.25));
      break;
    case 'ponytail':
      parts.push(ball(hair,-.137,1.503,0,.136,.158,.121),
        ball(hair,-.145,1.397,0,.120,.236,.110,-.28));
      break;
    case 'bun':
      parts.push(ball(hair,-.096,1.617,0,.157,.149,.154));
      break;
    case 'pageboy':
      parts.push(ball(hair,-.051,1.472,-.080,.167,.170,.092),
        ball(hair,-.051,1.472,.080,.167,.170,.092),
        ball(hair,.077,1.583,0,.091,.067,.189),
        box(accent,.057,1.562,.095,.062,.018,.018,-.40));
      break;
  }
  switch(prop){
    case 'folio':
      parts.push(box(accent,.175,1.025,.151,.058,.227,.176,-.10),
        box('#eee2c8',.175,1.138,.151,.039,.012,.147,-.10),
        box('#785a42',.205,1.025,.078,.008,.219,.018,-.10));
      break;
    case 'tie':
      parts.push(garment(accent,.146,1.245,0,.019,.193,.049));
      break;
    case 'notebook':
      parts.push(garment(accent,.016,.805,.245,.171,.210,.041),
        box('#e4d7b6',.016,.896,.245,.141,.013,.028));
      break;
    case 'phone':
      parts.push(box('#33404c',.185,1.031,.224,.045,.110,.064,-.24));
      break;
    case 'glasses':
      for(const side of [-1,1]){
        const z=side*.045;
        parts.push(box(accent,.117,1.554,z,.018,.008,.066),box(accent,.117,1.513,z,.018,.008,.066),
          box(accent,.114,1.533,z-.029,.018,.043,.008),box(accent,.114,1.533,z+.029,.018,.043,.008));
      }
      parts.push(box(accent,.126,1.535,0,.015,.008,.027));
      break;
    case 'portfolio':
      parts.push(garment(accent,-.010,.755,.251,.233,.298,.044));
      break;
  }
  const scale=height/1.68;
  for(const part of parts){
    part.x*=scale;part.y=part.y*scale-.07;part.z*=scale*width;
    part.w*=scale;part.h*=scale;part.d*=scale*width;
  }
  return parts;
}
