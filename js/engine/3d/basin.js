import * as T from '../vendor/three.module.min.js';

const noise=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
function valueNoise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const a=noise(ix,iy),b=noise(ix+1,iy),c=noise(ix,iy+1),d=noise(ix+1,iy+1);
  return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
}

export function createBasin(width,depth) {
  const group=new T.Group();
  const forestMaterial=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  forestMaterial.onBeforeCompile=shader=>{
    // Distance haze reads the live fog colour, so dusk and night tint the ranges instead of leaving brown slabs.
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',
      `#ifdef USE_FOG
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,.5*smoothstep(500.,2600.,vFogDepth));
        gl_FragColor.rgb=mix(vec3(dot(gl_FragColor.rgb,vec3(.33))),gl_FragColor.rgb,1.-.3*smoothstep(900.,2600.,vFogDepth));
      #endif
      `+T.ShaderChunk.fog_fragment.replaceAll('vFogDepth','(vFogDepth * .59)'));
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
    const low=new T.Color('#596846'),high=new T.Color('#223c32'),rock=new T.Color('#7b7a72'),farm=new T.Color('#7d8a58'),tone=new T.Color();
    for(let i=0;i<points.count;i++){
      const x=points.getX(i),z=points.getZ(i);
      const along=x/span+.5,away=z/run+.5;
      const ridge=.66+.15*Math.sin(along*19+phase)+.12*Math.sin(along*37+phase*.6)+.07*Math.cos(along*70+phase*1.7)
        +.05*Math.sin(along*103+phase*2.3)+.16*(valueNoise(along*26+phase*5,away*5)-.5)+.06*(valueNoise(along*90,away*18+phase)-.5);
      const envelope=Math.sin(Math.PI*away)**1.35*Math.sin(Math.PI*along)**.65;
      const y=altitude*ridge*envelope+envelope*(Math.sin(along*115+away*47)*5+Math.sin(away*91)*3);
      points.setXYZ(i,x*Math.cos(orientation)-z*Math.sin(orientation)+startX,
        y-.12,x*Math.sin(orientation)+z*Math.cos(orientation)+startZ);
      const forest=.5+.28*Math.sin(along*147+away*66)*Math.sin(away*99-along*31);
      const level=Math.max(0,y/altitude);
      // Three bands by elevation: farmland and low buildings, forest, bare rock near the ridge.
      tone.copy(low).lerp(high,Math.min(.95,forest*.38+level*.68));
      tone.lerp(farm,Math.max(0,.55-level*3.2)*.5);
      tone.lerp(rock,Math.max(0,Math.min(.6,(level-.74)*2.6))*(.65+.35*valueNoise(along*60,away*40)));
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
