import {paving,pavingHeight,pavingPoint,curbWidth} from '../sidewalks.mjs';

import {subtractRectangle} from '../paving-geometry.mjs';

function clippedQuad(buf,s,points,color,u,v){
  if(!s.cutouts){buf.quad(...points,color,u,v);return;}
  const uv=[[0,0],[u,0],[u,v],[0,v]];
  let polygons=[points.map((p,i)=>[...p,...uv[i]])];
  for(const cut of s.cutouts){
    // The lower of two intersecting curb cuts stays visible to both crossings.
    const depth=(r,p)=>(p[0]-r.x)*r.nx+(p[2]-r.z)*r.nz+r.depth/2;
    const mask=s.kind==='ramp'&&cut.kind==='ramp'?p=>
      depth(s,p)-depth(cut,p)+(s.index>cut.index?1:-1)*1e-7:null;
    polygons=polygons.flatMap(p=>subtractRectangle(p,cut,mask));
  }
  for(const polygon of polygons)for(let i=1;i+1<polygon.length;i++){
    const tri=[polygon[0],polygon[i],polygon[i+1]];
    buf.triangle(...tri.map(p=>p.slice(0,3)),color,...tri.map(p=>p.slice(3)));
  }
}

export function drawSidewalks(batch){
  for(const s of paving){
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
}
