// Character designs are keyed by the story ID because several actors share a skin.
const designs={
  boss_lin:         {coat:'#293b54', trousers:'#303846', accent:'#b86246', hair:'silver', wear:'suit', prop:'case', height:1.80, build:1.04},
  ae_mei:           {coat:'#197c78', trousers:'#303748', accent:'#f2dfb4', hair:'bob', wear:'scarf', prop:'folio', height:1.67, build:.93},
  data_kai:         {coat:'#655785', trousers:'#3c414e', accent:'#ded6ee', hair:'crop', wear:'hoodie', prop:'glasses', height:1.76, build:.91},
  cd_wei:           {coat:'#b85b34', trousers:'#263237', accent:'#f1debe', hair:'quiff', wear:'jacket', prop:'camera', height:1.79, build:1.00},
  breakfast_auntie: {coat:'#b94d63', trousers:'#514353', accent:'#f1c06e', hair:'bun', wear:'apron', height:1.59, build:1.06, skin:'#c98d6e'},
  clerk_ning:       {coat:'#248765', trousers:'#374858', accent:'#ecf4ca', hair:'pony', wear:'uniform', height:1.62, build:.91},
  client_wu:        {coat:'#966841', trousers:'#453d39', accent:'#e2c39a', hair:'part', wear:'jacket', prop:'coffee', height:1.75, build:1.04},
  client_chen:      {coat:'#465d70', trousers:'#303944', accent:'#83b997', hair:'crop', wear:'suit', prop:'glasses', height:1.72, build:1.06},
  client_hsu:       {coat:'#546fa3', trousers:'#283952', accent:'#b4dfec', hair:'updo', wear:'jacket', prop:'case', height:1.69, build:.92},
  vendor_cheng:     {coat:'#553e34', trousers:'#354247', accent:'#e2a844', hair:'cap', wear:'apron', height:1.73, build:1.11, skin:'#bd805d'},
  tv_su:            {coat:'#8e4e71', trousers:'#41364c', accent:'#e8bfa7', hair:'waves', wear:'jacket', prop:'folio', height:1.71, build:.97},
  temple_uncle:     {coat:'#a45136', trousers:'#564838', accent:'#f0ca7d', hair:'silver', wear:'vest', prop:'glasses', height:1.63, build:1.03, skin:'#bf8460'},
  grandma:          {coat:'#855477', trousers:'#524051', accent:'#e6adac', hair:'grayBun', wear:'vest', prop:'cane', height:1.51, build:.98, skin:'#ca9275'},
  rechao_boss:      {coat:'#cf633b', trousers:'#483e47', accent:'#642e49', hair:'updo', wear:'apron', height:1.65, build:1.04},
  rider_jie:        {coat:'#365b5f', trousers:'#263a43', accent:'#e79c35', hair:'helmet', wear:'uniform', prop:'delivery', height:1.77, build:1.01},
  roommate_yu:      {coat:'#cd9261', trousers:'#4b6085', accent:'#f2dcca', hair:'waves', wear:'hoodie', prop:'satchel', height:1.60, build:.91},
  rival_vicky:      {coat:'#a63843', trousers:'#332b3b', accent:'#eed4ad', hair:'partBob', wear:'suit', prop:'folio', height:1.75, build:.94},
};

const hairstyles={
  crop:   {color:'#292528', crown:[-.036,.083,0,.189,.125,.208]},
  silver: {color:'#747176', crown:[-.040,.074,0,.195,.129,.211]},
  part:   {color:'#352a27', crown:[-.031,.082,-.017,.199,.143,.188], tail:[-.090,.002,.048,.115,.182,.115]},
  quiff:  {color:'#332825', crown:[-.005,.112,0,.215,.162,.207], tail:[-.085,.013,0,.125,.180,.185]},
  bob:    {color:'#32252a', crown:[-.033,.082,0,.224,.145,.223], tail:[-.066,-.034,0,.180,.262,.229]},
  partBob:{color:'#422831', crown:[-.016,.087,.022,.221,.155,.193], tail:[-.059,-.031,.027,.183,.234,.193]},
  waves:  {color:'#48302a', crown:[-.039,.083,-.014,.223,.151,.222], tail:[-.094,-.099,0,.168,.376,.245]},
  pony:   {color:'#282427', crown:[-.032,.075,0,.206,.147,.208], tail:[-.143,-.082,0,.117,.30,.117]},
  bun:    {color:'#383034', crown:[-.040,.075,0,.193,.146,.202], tail:[-.109,.100,0,.137,.132,.135]},
  updo:   {color:'#392a27', crown:[-.039,.098,0,.197,.153,.202], tail:[-.118,.156,0,.139,.133,.137]},
  grayBun:{color:'#a39aa1', crown:[-.040,.074,0,.206,.153,.209], tail:[-.121,.063,0,.132,.124,.133]},
  cap:    {color:'#332831', crown:[-.005,.097,0,.254,.136,.254], brim:[.121,.071,0,.165,.029,.216]},
  helmet: {color:'#e79c35', crown:[-.034,.077,0,.264,.185,.241], brim:[.102,.050,0,.094,.033,.226]},
};

// 有寫實 GLB 的角色（assets/models/<key>.glb，model-assets.js 載入）：載入完成後取代下面的程式外形，
// 模型還沒載入或載入失敗時照舊畫程式外形
export const namedNpcFigures={boss_lin:'npc_lin',ae_mei:'npc_mei'};

// 其他角色沒有專屬模型，借用最接近的寫實路人：先對性別與年紀，再看職業與身形。上衣、褲子換成上面設定的顏色，
// 身高照設定縮放，所以和同一款的隨機路人看得出不同。阿嬤沒有站著的長者女性模型（grandma_scooter 坐在代步車上，
// 柑仔店前沒有她的車），照舊畫程式外形
const walkerCast={
  data_kai:'walker_m',        // 二十多歲的數據分析師
  cd_wei:'walker_m2',         // 四十多歲的創意總監：用中年款（年齡優先於服裝款式），也免得和業務 AE 主角的 walker_m 撞臉
  client_wu:'walker_m2',      // 四十多歲的連鎖咖啡行銷經理，咖啡色上衣
  client_chen:'walker_m2',    // 四十歲上下的保健品牌經理，灰藍上衣（年輕男性款和業務 AE 主角同款，換成上班族款）
  vendor_cheng:'walker_m2',   // 四十多歲的雞排攤老闆，短袖、體格壯
  temple_uncle:'walker_m3',   // 六十多歲的廟公
  rider_jie:'walker_m',       // 二十多歲的外送員（河濱旁沒有他的機車，用年輕男性款）
  breakfast_auntie:'walker_f',// 五十多歲的早餐店老闆娘（最年長的女性款）
  clerk_ning:'walker_f2',     // 二十出頭的超商店員，綁馬尾
  client_hsu:'walker_f',      // 三十多歲的品牌經理，西裝外套
  tv_su:'walker_f',           // 四十多歲的電視台業務經理
  rechao_boss:'walker_f',     // 五十多歲的熱炒店老闆娘
  roommate_yu:'walker_f2',    // 二十二歲的實習生室友，毛衣牛仔褲
  rival_vicky:'walker_f',     // 三十多歲的提案總監，鮑伯頭、西裝外套
};
export const namedNpcWalkers=Object.fromEntries(Object.entries(walkerCast).map(([id,model])=>{
  const {coat,trousers,height,build}=designs[id];
  return [id,{model,tint:coat,trousers,height,build}];
}));

// Descriptors are built once, outside the per-frame scratch pool. Local +X faces forward.
export function createNamedNpcModels(box,ball,limb){
  const models=new Map();
  for(const [id,design] of Object.entries(designs)){
    const {coat,trousers,accent,hair,wear,prop,height,build,skin='#d39b7c'}=design;
    const head=1.53;
    const parts=[
      ball(trousers,-.010,.806,0,.255,.238,.315),
      ball(coat,-.014,1.060,0,.275,.510,.350),
      ball(coat,-.012,1.235,0,.235,.215,.402),
      ball(skin,.009,1.353,0,.124,.174,.125),
      ball(skin,.015,head,0,.220,.262,.202),
      ball(skin,.118,head-.021,0,.055,.054,.051),
      ball('#995f54',.111,head-.064,0,.018,.012,.043),
    ];
    const {color,crown,tail,brim}=hairstyles[hair];
    const hairPart=([x,y,z,w,h,d])=>ball(color,x,head+y,z,w,h,d);
    parts.push(hairPart(crown));
    if(tail)parts.push(hairPart(tail));
    if(brim)parts.push(hairPart(brim));

    for(const side of [-1,1]){
      const ear=side*.094;
      const carry=side===1&&['case','folio','coffee','cane'].includes(prop);
      const tuck=carry&&(prop==='folio'||prop==='coffee');
      const hand=[tuck?.205:carry?.104:.028,tuck?1.067:.785,side*(tuck?.175:.222)];
      const elbow=[-.021,1.015,side*.222];
      const ankle=[side*.047,.088,side*.102];
      parts.push(
        ball(skin,.003,head-.019,ear,.068,.074,.044),
        ball('#35282a',.112,head+.010,side*.041,.021,.025,.019),
        limb(trousers,[-.005,.863,side*.076],ankle,.158,.149),
        ball('#302d37',ankle[0]+.048,.053,ankle[2],.233,.106,.126),
        limb(coat,[-.005,1.239,side*.161],elbow,.125),
        ball(coat,...elbow,.095,.106,.099),
        limb(coat,elbow,hand,.096),
        ball(skin,...hand,.075,.096,.078),
      );
      if(wear==='jacket'||wear==='suit'){
        parts.push(limb(accent,[.091,1.290,side*.081],[.124,1.172,side*.029],.031));
      }
      if(prop==='glasses'){
        parts.push(ball('#372b32',.118,head+.008,side*.044,.026,.051,.071),
          ball('#b6c5c9',.130,head+.008,side*.044,.012,.035,.052));
      }
    }

    if(wear==='suit')parts.push(box(accent,.125,1.114,0,.028,.208,.035));
    if(wear==='scarf')parts.push(ball(accent,.025,1.333,0,.17,.092,.181),
      limb(accent,[.099,1.316,-.037],[.117,1.107,.019],.068,.084));
    if(wear==='hoodie')parts.push(ball(coat,-.109,1.293,0,.192,.182,.244),
      box(accent,.129,.991,0,.020,.060,.161));
    if(wear==='uniform')parts.push(box(accent,.122,1.161,0,.047,.079,.258),
      box('#eef0dc',.143,1.218,.066,.021,.033,.065));
    if(wear==='vest')parts.push(ball(accent,.078,1.064,0,.105,.361,.272));
    if(wear==='apron')parts.push(box(accent,.121,1.095,0,.055,.251,.243),
      box(accent,.118,.822,0,.081,.310,.290),
      box(coat,.162,.867,0,.012,.072,.118));

    if(prop==='case')parts.push(box('#483730',.104,.615,.259,.262,.223,.082),
      box('#483730',.104,.746,.242,.106,.065,.035));
    if(prop==='folio')parts.push(box('#51424e',.205,1.030,.190,.045,.267,.190,-.14),
      box('#e0c4a7',.228,1.109,.190,.011,.031,.142,-.14));
    if(prop==='coffee')parts.push(ball('#e8d1a8',.208,1.126,.177,.096,.121,.096),
      ball('#57443b',.208,1.177,.177,.099,.029,.099));
    if(prop==='camera')parts.push(box('#312e33',.119,1.035,0,.074,.093,.157),
      ball('#465a62',.165,1.036,0,.067,.072,.072),
      limb('#40303a',[.035,1.339,-.079],[.120,1.060,0],.021),
      limb('#40303a',[.035,1.339,.079],[.120,1.060,0],.021));
    if(prop==='cane')parts.push(limb('#654830',[.132,.758,.232],[.190,.029,.259],.045),
      ball('#654830',.108,.787,.240,.124,.050,.056));
    if(prop==='delivery')parts.push(box(accent,-.223,1.067,0,.256,.375,.346),
      box('#60452e',-.353,1.137,0,.013,.043,.294));
    if(prop==='satchel')parts.push(ball('#894f49',-.039,.920,-.234,.209,.211,.136),
      limb('#894f49',[.065,1.286,.121],[.123,.956,-.147],.032));

    const scale=height/1.73;
    for(const part of parts){
      part.y*=scale;
      part.h*=scale;
      part.z*=build;
      part.d*=build;
    }
    models.set(id,parts);
  }
  return models;
}
