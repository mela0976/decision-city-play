import * as T from '../vendor/three.module.min.js';

export function createBasin(width,depth) {
  const group=new T.Group();
  const forestMaterial=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  forestMaterial.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',
      T.ShaderChunk.fog_fragment.replaceAll('vFogDepth','(vFogDepth * .59)'));
    shader.vertexShader=shader.vertexShader.replace('void main() {',
      'varying vec3 forestPosition; void main() { forestPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('void main() {',
      'varying vec3 forestPosition; void main() {').replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 f=forestPosition;
      float broad=.55+.45*sin(f.x*.021+sin(f.z*.075))*cos(f.z*.031-f.x*.062);
      float crowns=.57+.43*sin(f.x*.76+sin(f.z*.27))*cos(f.z*.61-f.x*.24);
      diffuseColor.rgb*=mix(vec3(.56,.71,.57),vec3(1.25,1.21,.92),broad*.61+crowns*.39);
      `);
  };
  function range(startX,startZ,span,run,altitude,orientation,phase){
    const geometry=new T.PlaneGeometry(span,run,112,34);
    geometry.rotateX(-Math.PI/2);
    const points=geometry.attributes.position,colors=[];
    const low=new T.Color('#596846'),high=new T.Color('#223c32'),tone=new T.Color();
    for(let i=0;i<points.count;i++){
      const x=points.getX(i),z=points.getZ(i);
      const along=x/span+.5,away=z/run+.5;
      const ridge=.7+.16*Math.sin(along*19+phase)+.13*Math.sin(along*37+phase*.6)+.06*Math.cos(along*70);
      const envelope=Math.sin(Math.PI*away)**1.35*Math.sin(Math.PI*along)**.65;
      const y=altitude*ridge*envelope+envelope*(Math.sin(along*115+away*47)*5+Math.sin(away*91)*3);
      points.setXYZ(i,x*Math.cos(orientation)-z*Math.sin(orientation)+startX,
        y-.12,x*Math.sin(orientation)+z*Math.cos(orientation)+startZ);
      const forest=.5+.28*Math.sin(along*147+away*66)*Math.sin(away*99-along*31);
      tone.copy(low).lerp(high,Math.min(.95,forest*.38+y/altitude*.68));
      colors.push(tone.r,tone.g,tone.b);
    }
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    group.add(new T.Mesh(geometry,forestMaterial));
  }
  range(width*.55,depth+370,width+1300,840,285,0,.85);
  range(width*.75,depth+730,width+2500,980,365,0,2.4);
  range(width+568,depth*.64,depth+1500,900,325,Math.PI/2,1.5);
  range(width*.62,-590,width+3800,1150,370,0,2);
  return group;
}
