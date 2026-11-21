// Split a textured polygon by one half-plane, interpolating position, height and UV.
// P2 perf：每個頂點的距離只算一次（存在暫存陣列），內插點用迴圈建立；整個多邊形落在同一側時
// 直接回傳原陣列（頂點與順序都和複製出來的一樣，呼叫端只讀不改）。數值運算順序與原本相同，結果逐位元一致。
let dists=new Float64Array(64);
function distances(n){if(dists.length<n)dists=new Float64Array(n*2);return dists;}
function splitBy(vertices,d){
  const n=vertices.length,outside=[],inside=[];
  for(let i=0;i<n;i++){
    const a=vertices[i],j=i+1===n?0:i+1,da=d[i],db=d[j];
    (da>=0?inside:outside).push(a);
    if((da>=0)===(db>=0))continue;
    const b=vertices[j],k=da/(da-db),p=new Array(a.length);
    for(let m=0;m<a.length;m++)p[m]=a[m]+(b[m]-a[m])*k;
    inside.push(p);outside.push(p);
  }
  return {inside,outside};
}
// 0：全部在外側；1：全部在內側（>=0）；2：要切
function sideOf(d,n){
  let any=false,all=true;
  for(let i=0;i<n;i++){if(d[i]>=0)any=true;else all=false;}
  return all?1:any?2:0;
}
function split(vertices,dist){
  const d=distances(vertices.length);
  for(let i=0;i<vertices.length;i++)d[i]=dist(vertices[i]);
  return splitBy(vertices,d);
}
export function subtractRectangle(vertices,ramp,mask){
  let remaining=vertices;
  const pieces=[];
  if(mask){
    const {inside,outside}=split(remaining,mask);
    if(outside.length>=3)pieces.push(outside);
    if(inside.length<3)return pieces;
    remaining=inside;
  }
  for(let e=0;e<4;e++){
    const dx=e===0?ramp.dx:e===1?-ramp.dx:e===2?ramp.nx:-ramp.nx;
    const dz=e===0?ramp.dz:e===1?-ramp.dz:e===2?ramp.nz:-ramp.nz;
    const limit=e<2?ramp.half:ramp.depth/2;
    const n=remaining.length,d=distances(n);
    for(let i=0;i<n;i++){const p=remaining[i];d[i]=limit-(p[0]-ramp.x)*dx-(p[2]-ramp.z)*dz;}
    const side=sideOf(d,n);
    if(side===0){if(n>=3)pieces.push(remaining);break;}
    if(side===1){if(n<3)break;continue;}
    const {inside,outside}=splitBy(remaining,d);
    if(outside.length>=3)pieces.push(outside);
    if(inside.length<3)break;
    remaining=inside;
  }
  return pieces;
}

// A25 subtract a convex polygon given as [[x,z],...] in counter-clockwise or clockwise order.
export function subtractConvex(vertices,poly){
  let area=0;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];area+=a[0]*b[1]-b[0]*a[1];}
  const sign=area>0?1:-1;
  let remaining=vertices;
  const pieces=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    // Inside of the edge (towards the polygon) is positive.
    const n=remaining.length,d=distances(n);
    for(let k=0;k<n;k++){const p=remaining[k];d[k]=sign*((b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0]));}
    const side=sideOf(d,n);
    if(side===0){if(n>=3)pieces.push(remaining);return pieces;}
    if(side===1){if(n<3)return pieces;continue;}
    const {inside,outside}=splitBy(remaining,d);
    if(outside.length>=3)pieces.push(outside);
    if(inside.length<3)return pieces;
    remaining=inside;
  }
  return pieces;
}
