import * as T from '../vendor/three.module.min.js?v=7c913f1f';

// The HDR scene is sampled once at full resolution. Bright texels contribute to
// an eight-tap ring in the composite, while local lamp glows stay world-space.
export function createBloom(renderer) {
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  const post=new T.Scene();
  const camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const size=new T.Vector2();
  const uniforms={source:{value:target.texture},pixel:{value:new T.Vector2()},strength:{value:0}};
  const material=new T.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,
    vertexShader:`varying vec2 screenUV;
      void main(){screenUV=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`varying vec2 screenUV;uniform sampler2D source;
      uniform vec2 pixel;uniform float strength;
      vec3 high(vec2 p){
        vec3 rgb=texture2D(source,p).rgb;
        return rgb*smoothstep(.52,1.75,max(rgb.r,max(rgb.g,rgb.b)));
      }
      void main(){
        vec3 sum=vec3(0.);
        for(int i=0;i<8;i++){
          float phi=float(i)*.785398;
          sum+=high(screenUV+vec2(cos(phi),sin(phi))*pixel*(6.+mod(float(i),2.)*4.));
        }
        gl_FragColor=vec4(texture2D(source,screenUV).rgb+sum*(strength/8.),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const screen=new T.Mesh(new T.PlaneGeometry(2,2),material);
  screen.frustumCulled=false;
  post.add(screen);
  return {
    render(scene,view,amount) {
      if(amount<.02) {
        renderer.render(scene,view);
        return;
      }
      renderer.getDrawingBufferSize(size);
      if(size.x!==target.width || size.y!==target.height) target.setSize(size.x,size.y);
      uniforms.pixel.value.set(1/size.x,1/size.y);
      uniforms.strength.value=amount;
      renderer.setRenderTarget(target);
      renderer.render(scene,view);
      renderer.setRenderTarget(null);
      renderer.render(post,camera);
    },
  };
}
