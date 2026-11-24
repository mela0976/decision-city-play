import {buildings,metersPerUnit as unit,roadAt,toWorld} from './world.mjs?v=70a6a7b0';

// OpenStreetMap level-2 footways. The deck is overhead scenery and has no ground supports.
const mallCrossing=[[25.0370629,121.5668505],[25.03706,121.5670378]]; // OSM 310909470
const skywalks=[
  mallCrossing,
  [[25.0373699,121.5677703],[25.0375249,121.5677739]], // OSM 663679151, adjoining retail entrance
  [ // OSM way 310909564
    [25.0394975,121.5670195],[25.0394937,121.5672215],
  ],
  [ // OSM way 331340437
    [25.0386949,121.5670275],[25.0386741,121.5672215],[25.037868,121.5672034],[25.0378273,121.567005],
  ],
  [ // OSM way 1339394551
    [25.0401281,121.567033],[25.0399442,121.5670294],[25.0394975,121.5670195],[25.0394134,121.5670176],
    [25.0393685,121.567043],[25.0392301,121.5670399],[25.038808,121.5670304],
  ],
  [ // OSM way 1339394552
    [25.038808,121.5670304],[25.0386949,121.5670275],[25.0378273,121.567005],[25.0377049,121.5670019],
    [25.0376808,121.566974],[25.0376828,121.566842],[25.0376684,121.5668418],
  ],
  [ // OSM way 1339401648
    [25.0375335,121.5673099],[25.037527,121.5676581],[25.0375249,121.5677739],[25.0375221,121.5679197],
    [25.0375985,121.5679215],[25.0375968,121.5680127],[25.037586,121.5685931],
  ],
  [ // OSM way 1339401656
    [25.0376684,121.5668418],[25.0373665,121.5668363],[25.0373404,121.5668358],[25.0373316,121.5668412],
    [25.0372096,121.566839],[25.0371871,121.5668528],[25.0370629,121.5668505],[25.0362245,121.5668349],
  ],
  [ // OSM way 257896676
    [25.0362245,121.5668349],[25.0361882,121.5669035],[25.0361596,121.5669367],[25.0361273,121.5669622],
    [25.03609,121.5669797],[25.0360353,121.5669867],[25.0356738,121.5670106],[25.0354322,121.5670057],
    [25.0354355,121.566809],[25.0349218,121.5667985],[25.0349236,121.5666939],[25.0349267,121.566513],
    [25.034931,121.5662684],[25.0349321,121.5662064],[25.0349533,121.5658941],
  ],
  [ // OSM way 321947680
    [25.03609,121.5669797],[25.0361222,121.5670166],[25.03706,121.5670378],[25.0371724,121.5670403],
    [25.0372243,121.5671],[25.0372227,121.5671889],[25.0373608,121.567192],[25.0373592,121.5672739],
    [25.0373592,121.5672771],[25.0375183,121.5673025],[25.0375335,121.5673099],[25.0375746,121.56733],
    [25.0375939,121.5673394],[25.0376668,121.5672623],[25.0376679,121.5671989],[25.037868,121.5672034],
  ],
];

// Retail footprints with untagged heights on the mapped pedestrian axis.
const mallWings=new Set([269773066,269773067,391309615,663679150]);
const eastLimit=toWorld(25,121.572).x;
export const isTowerBlock=b=>b.modern&&b.x<eastLimit&&(b.elevation>=17||mallWings.has(b.osmId));

function canopyFor(b){
  let side;
  const ring=b.polygon;
  const winding=Math.sign(ring.reduce((sum,a,i)=>{
    const c=ring[(i+1)%ring.length];
    return sum+a.x*c.y-c.x*a.y;
  },0));
  for(let i=0;i<ring.length;i++){
    const a=ring[i],c=ring[(i+1)%ring.length];
    const dx=(c.x-a.x)*unit,dz=(c.y-a.y)*unit,len=Math.hypot(dx,dz);
    if(len<7||len<=(side?.length??0))continue;
    const x=(a.x+c.x)*unit/2,z=(a.y+c.y)*unit/2;
    const nx=winding*dz/len,nz=-winding*dx/len;
    if(!roadAt(x/unit,z/unit,-72)||roadAt((x+nx*2.85)/unit,(z+nz*2.85)/unit,0))continue;
    side={x:x+nx*1.42,z:z+nz*1.42,ux:dx/len,uz:dz/len,nx,nz,length:len};
  }
  if(!side)return;
  return {...side,length:Math.min(side.length*.63,17),width:2.84,bottom:6.21,top:6.6};
}

let cached;
export function towerStructures(){
  if(cached)return cached;
  const bridges=[];
  for(const line of skywalks)for(let i=1;i<line.length;i++){
    const a=toWorld(...line[i-1]),b=toWorld(...line[i]);
    const dx=(b.x-a.x)*unit,dz=(b.y-a.y)*unit,length=Math.hypot(dx,dz);
    if(length<.8)continue;
    bridges.push({x:(a.x+b.x)*unit/2,z:(a.y+b.y)*unit/2,ux:dx/length,uz:dz/length,
      length,width:3.28,bottom:6.28,top:9,crossing:line===mallCrossing});
  }
  const canopies=buildings.filter(b=>isTowerBlock(b)&&!b.shape&&b.elevation>=8).map(canopyFor).filter(Boolean);
  cached={bridges,canopies,all:[...bridges,...canopies]};
  return cached;
}

// The hop rises and descends vertically, with a straight level cruise. Intersect
// each phase with the actual overhead rectangles; ground navigation stays open.
export function towerBlocksHop(x0,z0,x1,z1,halfLength,halfWidth,heading,altitude){
  const ux=Math.cos(heading),uz=Math.sin(heading);
  const a=halfLength*unit,b=halfWidth*unit,travel=Math.hypot(x1-x0,z1-z0)*unit;
  function overlaps(deck,x,z,extent){
    const dx=x-deck.x,dz=z-deck.z;
    const c=Math.abs(ux*deck.ux+uz*deck.uz),s=Math.abs(ux*deck.uz-uz*deck.ux);
    const l=deck.length/2+.07,w=deck.width/2;
    return Math.abs(dx*ux+dz*uz)<=extent+l*c+w*s&&Math.abs(dz*ux-dx*uz)<=b+l*s+w*c&&
      Math.abs(dx*deck.ux+dz*deck.uz)<=l+extent*c+b*s&&Math.abs(dz*deck.ux-dx*deck.uz)<=w+extent*s+b*c;
  }
  return towerStructures().all.some(deck=>{
    if(altitude+1.65<deck.bottom)return false;
    if(altitude<=deck.top+.1)return overlaps(deck,(x0+x1)*unit/2,(z0+z1)*unit/2,a+travel/2);
    return overlaps(deck,x0*unit,z0*unit,a)||overlaps(deck,x1*unit,z1*unit,a);
  });
}
