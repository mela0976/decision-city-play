// Shared geometry for the Rainbow riverside promenade (metres). Ground vegetation uses it to
// keep reeds and trees off the bike path that location-dressing.js lays along the bank.
import {metersPerUnit as unit,water,riverWidthMeters,byId,toWorld} from './world.mjs?v=2717b081';

export const promenade={pathIn:24.6,pathOut:27.8,reach:105};
let bank;

export function riversideBank(){
  if(bank!==undefined)return bank;
  const river=water.find(w=>w.name==='基隆河'&&w.points.length<60),site=byId.get('riverside');
  if(!river||!site)return bank=null;
  const focus=toWorld(25.0532,121.5711),half=riverWidthMeters/2,sx=site.x*unit,sz=site.y*unit;
  const pts=river.points.map(q=>[q.x*unit,q.y*unit]);
  // Unit land-side normals per segment, mitred at the vertices so offset bands stay joined.
  const normals=pts.slice(1).map((b,i)=>{
    const a=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
    const flip=(sx-a[0])*-dz+(sz-a[1])*dx<0?-1:1;
    return [-dz/l*flip,dx/l*flip];
  });
  const miter=pts.map((_,i)=>{
    const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];
    const mx=a[0]+b[0],mz=a[1]+b[1],l=Math.hypot(mx,mz)||1,cos=Math.max(.5,(mx*b[0]+mz*b[1])/l);
    return [mx/l/cos,mz/l/cos];
  });
  const offsetAt=(i,f,off)=>{
    const a=pts[i],b=pts[i+1],ma=miter[i],mb=miter[i+1],o=half+off;
    return [a[0]+(b[0]-a[0])*f+(ma[0]*(1-f)+mb[0]*f)*o,a[1]+(b[1]-a[1])*f+(ma[1]*(1-f)+mb[1]*f)*o];
  };
  const near=(x,z,margin=0)=>Math.hypot(x-focus.x*unit,z-focus.y*unit)<promenade.reach+margin;
  return bank={pts,normals,offsetAt,near};
}

// True on the paved band (plus a small verge) of the promenade, in metres.
export function onRiversidePath(x,z,verge=.8){
  const b=riversideBank();
  if(!b||!b.near(x,z,12))return false;
  const half=riverWidthMeters/2;
  for(let i=0;i<b.pts.length-1;i++){
    const [ax,az]=b.pts[i],[bx,bz]=b.pts[i+1],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;
    if(!l2)continue;
    const t=((x-ax)*dx+(z-az)*dz)/l2;
    if(t<0||t>1)continue;
    const off=(x-ax)*b.normals[i][0]+(z-az)*b.normals[i][1]-half;
    if(off>promenade.pathIn-verge&&off<promenade.pathOut+verge)return true;
  }
  return false;
}
