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
