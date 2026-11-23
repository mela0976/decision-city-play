import {paving,pavingHeight,pavingPoint,curbWidth,fillets,surfaceAt} from '../sidewalks.mjs?v=441539d';
import {metersPerUnit as unit} from '../world.mjs?v=441539d';

import {subtractConvex,subtractRectangle} from '../paving-geometry.mjs?v=441539d';

// P2 perf：同樣的切割順序與三角化，只是改用迴圈、不再每步建立閉包與展開陣列；送進 buffer 的參數逐位元相同。
const cornerUv=[[0,0],[0,0],[0,0],[0,0]];
function subtractEach(polygons,clip){
  const out=[];
  for(let i=0;i<polygons.length;i++){const pieces=clip(polygons[i]);for(let k=0;k<pieces.length;k++)out.push(pieces[k]);}
  return out;
}
function clippedQuad(buf,s,points,color,u,v){
  if(!s.cutouts&&!s.fillets){buf.quad(points[0],points[1],points[2],points[3],color,u,v);return;}
  cornerUv[1][0]=u;cornerUv[2][0]=u;cornerUv[2][1]=v;cornerUv[3][1]=v;
  const first=new Array(4);
  for(let i=0;i<4;i++){const p=points[i];first[i]=[p[0],p[1],p[2],cornerUv[i][0],cornerUv[i][1]];}
  let polygons=[first];
  // A25 rounded kerb corners: the same triangles that collision and surface queries subtract.
  if(s.fillets)for(const f of s.fillets)for(const tri of f.triangles)polygons=subtractEach(polygons,p=>subtractConvex(p,tri));
  for(const cut of s.cutouts??[]){
    // The lower of two intersecting curb cuts stays visible to both crossings.
    const depth=(r,p)=>(p[0]-r.x)*r.nx+(p[2]-r.z)*r.nz+r.depth/2;
    const mask=s.kind==='ramp'&&cut.kind==='ramp'?p=>
      depth(s,p)-depth(cut,p)+(s.index>cut.index?1:-1)*1e-7:null;
    polygons=subtractEach(polygons,p=>subtractRectangle(p,cut,mask));
  }
  for(const polygon of polygons)for(let i=1;i+1<polygon.length;i++){
    const a=polygon[0],b=polygon[i],c=polygon[i+1];
    buf.triangle([a[0],a[1],a[2]],[b[0],b[1],b[2]],[c[0],c[1],c[2]],color,[a[3],a[4]],[b[3],b[4]],[c[3],c[4]]);
  }
}

// P2 perf：可只畫一部分（某個區塊）的鋪面與圓角；預設照舊畫全部，順序不變。
export function drawSidewalks(batch,pavingList=paving,filletList=fillets){
  for(const s of pavingList){
    const sidewalk=s.kind==='sidewalk',ramp=s.kind==='ramp';
    const deck=batch(s.x,s.z,'paving');
    const vertex=(t,d,offset=0)=>{
      const {x,z}=pavingPoint(s,t,d);
      return [x,pavingHeight(s,t,d)+offset,z];
    };
    const a=-s.half,b=s.half;
    const band=(buf,lo,hi,color,uv,offset=0)=>{
      clippedQuad(buf,s,[vertex(a,lo,offset),vertex(b,lo,offset),vertex(b,hi,offset),vertex(a,hi,offset)],
        color,(b-a)/uv,(hi-lo)/uv);
    };
    band(deck,sidewalk?curbWidth:0,s.depth,sidewalk||ramp?'#f9f6ed':'#e1cbb4',sidewalk||ramp?2:1.15);
    if(ramp){
      band(deck,.28,.60,'#ecc76c',.32,.005);
      continue;
    }
    const stone=batch(s.x,s.z,'curb'),front=vertex(a,0),back=vertex(b,0);
    clippedQuad(stone,s,[[front[0],.02,front[2]],[back[0],.02,back[2]],back,front],'#9b9a99',1,1);
    if(!sidewalk)continue;
    band(stone,0,curbWidth,'#f1eee7',1);
    band(deck,.85,1.17,'#ecc76c',.34,.004);
    band(deck,.92,.939,'#b39049',.34,.007);
    band(deck,1.075,1.094,'#b39049',.34,.007);
  }
  // A25 asphalt where a corner was rounded, and the kerb face along the arc.
  for(const f of filletList){
    if(!f.cut.length)continue;
    const road=batch(f.x,f.z,'road'),stone=batch(f.x,f.z,'curb');
    const at=([x,z],y)=>[x,y,z],uv=([x,z])=>[x/4.2,z/4.2];
    for(const tri of f.triangles)road.triangle(...tri.map(p=>at(p,.019)),'#e9e6e2',...tri.map(uv));
    for(let k=0;k+1<f.arc.length;k++){
      const a=f.arc[k],b=f.arc[k+1],mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
      const len=Math.hypot(mx-f.cx,mz-f.cz)||1;
      const probe=surfaceAt((mx+(f.cx-mx)/len*.06)/unit,(mz+(f.cz-mz)/len*.06)/unit);
      if(!probe||probe.slab.kind==='footway'||probe.height<=.03)continue;
      const h=probe.height,quad=[at(a,.02),at(b,.02),at(b,h),at(a,h)];
      stone.quad(...quad,'#9b9a99',1,1);
      stone.quad(...[...quad].reverse(),'#9b9a99',1,1);
    }
  }
}
