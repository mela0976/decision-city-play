import * as T from '../vendor/three.module.min.js?v=7c27097e';
import {toWorld,metersPerUnit as unit} from '../world.mjs?v=7c27097e';

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
      diffuseColor.rgb*=mix(vec3(.65,.77,.70),vec3(1.18,1.17,1.08),broad*.61+crowns*.39);
      `);
  };
  function range(startX,startZ,span,run,altitude,orientation,phase,distant=false){
    const geometry=new T.PlaneGeometry(span,run,distant?76:112,distant?16:25);
    geometry.rotateX(-Math.PI/2);
    const points=geometry.attributes.position,colors=[];
    const low=new T.Color(distant?'#82979c':'#5d7359');
    const high=new T.Color(distant?'#596e80':'#2e5147');
    const rock=new T.Color('#829093'),farm=new T.Color('#7d8a61'),tone=new T.Color();
    for(let i=0;i<points.count;i++){
      const x=points.getX(i),z=points.getZ(i);
      const along=T.MathUtils.clamp(x/span+.5,0,1),away=T.MathUtils.clamp(z/run+.5,0,1);
      // Bend the crest across the range. Offset spurs descend at oblique angles into intervening gullies.
      const crest=.44+.18*(valueNoise(along*9+phase,2)-.5);
      const slope=away<crest?away/crest:(1-away)/(1-crest);
      const crestHeight=.42+.39*valueNoise(along*13+phase,4)+.19*valueNoise(along*46+phase,6);
      const spur=valueNoise(along*46+away*7+phase,away*8)-.5;
      const envelope=Math.sin(Math.PI*along)**.62;
      const y=altitude*envelope*(crestHeight*slope**1.22+spur*.18*Math.sin(Math.PI*slope));
      points.setXYZ(i,x*Math.cos(orientation)-z*Math.sin(orientation)+startX,
        y-.12,x*Math.sin(orientation)+z*Math.cos(orientation)+startZ);
      const forest=.29+.48*valueNoise(along*39,away*15+phase);
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
  // Peak anchors from OSM nodes 274937904, 2355932530 and 1519026317.
  // Place stylized profiles beyond the flat playable bounds. Datun is compressed
  // towards the map to preserve its bearing and apparent height within the render distance.
  const elephant=toWorld(25.0265411,121.5755420);
  const tiger=toWorld(25.0313013,121.5836136);
  const datun=toWorld(25.1787406,121.5221914);
  const centerX=width*.47,centerZ=depth*.55;
  const farZ=-1050;
  const northScale=(centerZ-farZ)/(centerZ-datun.y*unit);
  const farX=centerX+(datun.x*unit-centerX)*northScale;
  range(elephant.x*unit,depth+325,width+620,760,264,0,.85);
  range(width*.86,depth+750,width+2100,960,405,0,2.4,true);
  range(width+478,tiger.y*unit,depth+650,870,314,Math.PI/2,1.5);
  range(width*.65,-415,width+2050,784,189,0,2);
  range(farX,farZ,width+950,790,1093*northScale,0,4.4,true);
  return group;
}
