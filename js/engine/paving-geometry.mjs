// Split a textured polygon by one half-plane, interpolating position, height and UV.
function split(vertices,dist){
  const outside=[],inside=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],da=dist(a),db=dist(b);
    (da>=0?inside:outside).push(a);
    if((da>=0)===(db>=0))continue;
    const k=da/(da-db),p=a.map((v,j)=>v+(b[j]-v)*k);
    inside.push(p);outside.push(p);
  }
  return {inside,outside};
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
  for(const [dx,dz,limit] of [[ramp.dx,ramp.dz,ramp.half],[-ramp.dx,-ramp.dz,ramp.half],
    [ramp.nx,ramp.nz,ramp.depth/2],[-ramp.nx,-ramp.nz,ramp.depth/2]]){
    const {inside,outside}=split(remaining,p=>limit-(p[0]-ramp.x)*dx-(p[2]-ramp.z)*dz);
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
    const {inside,outside}=split(remaining,p=>sign*((b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0])));
    if(outside.length>=3)pieces.push(outside);
    if(inside.length<3)return pieces;
    remaining=inside;
  }
  return pieces;
}
