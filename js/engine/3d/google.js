import * as T from '../vendor/three.module.min.js?v=51145f5b';
import {TilesRenderer} from '../vendor/tiles/index.three.js?v=51145f5b';
import {GLTFLoader} from '../vendor/three-examples/loaders/GLTFLoader.js?v=51145f5b';
import {DRACOLoader} from '../vendor/three-examples/loaders/DRACOLoader.js?v=51145f5b';
import {copyrightStrings,rootURL} from '../google-session.js?v=51145f5b';
import {geographicOrigin,geographicBounds,projectMeters} from '../world.mjs?v=51145f5b';

function matrixAtOrigin() {
  const [latitude,longitude]=geographicOrigin;
  const a=6378137,e2=.00669437999014,rad=Math.PI/180;
  const p=latitude*rad,l=longitude*rad,s=Math.sin(p),c=Math.cos(p);
  const n=a/Math.sqrt(1-e2*s*s);
  // An independent approximate urban ground datum; the rendered tiles are not measured.
  const h=35,cl=Math.cos(l),sl=Math.sin(l);
  const point=new T.Vector3((n+h)*c*cl,(n+h)*c*sl,(n*(1-e2)+h)*s);
  const east=new T.Vector3(-sl,cl,0),up=new T.Vector3(c*cl,c*sl,s),south=new T.Vector3(s*cl,s*sl,-c);
  const edge=projectMeters(geographicBounds[2],geographicBounds[1]);
  return new T.Matrix4().set(
    east.x,east.y,east.z,-point.dot(east)-edge.x,
    up.x,up.y,up.z,-point.dot(up),
    south.x,south.y,south.z,-point.dot(south)-edge.y,
    0,0,0,1,
  );
}
export function createGoogleLayer(canvas,scene,camera,view,probe,{movingCamera=false}={}) {
  const tiles=new TilesRenderer(rootURL);
  // Limits apply to the renderer's live working set, never to a disk cache.
  tiles.errorTarget=18;
  tiles.loadSiblings=false;
  const profiles=[
    {error:34,depth:22,bytes:128},
    {error:25,depth:26,bytes:192},
    {error:18,depth:30,bytes:264},
  ];
  let appliedQuality=-1;
  tiles.fetchOptions={cache:'no-store'};
  const draco=new DRACOLoader(tiles.manager);
  draco.setDecoderPath(new URL('../vendor/three-examples/libs/draco/gltf/',import.meta.url).href);
  const gltf=new GLTFLoader(tiles.manager);
  gltf.setDRACOLoader(draco);
  tiles.manager.addHandler(/\.gl(?:tf|b)(?:\?|$)/i,gltf);
  let first=probe.bytes,fail='',level=1;
  tiles.registerPlugin({
    name:'dc-google-auth',
    fetchData(input,opts) {
      const url=probe.authorize(input);
      if(url.pathname==='/v1/3dtiles/root.json') {
        if(first===null) throw new Error('root already issued');
        const response=new Response(first,{headers:{'Content-Type':'application/json'}});
        first=null;
        return Promise.resolve(response);
      }
      return fetch(url,{...opts,cache:'no-store'}).then(response=>{
        if([401,403,429].includes(response.status))fail=response.status===429?'Google 圖磚配額不足':'Google 拒絕圖磚請求';
        return response;
      });
    },
  });
  const wrapper=new T.Group();
  wrapper.matrixAutoUpdate=false;
  wrapper.matrix.copy(matrixAtOrigin());
  wrapper.visible=false;
  wrapper.add(tiles.group);
  scene.add(wrapper);
  tiles.setCamera(camera);
  const started=performance.now();
  const image=new Image();
  image.src=new URL('../vendor/google-maps-attribution.png',import.meta.url).href;
  const zoom=delta=>{level=Math.max(0,Math.min(2,level+delta));};
  const pointers=new Map();
  let baseline=0;
  function wheel(event){
    if(Math.abs(event.deltaY)<4)return;
    event.preventDefault();zoom(event.deltaY>0?1:-1);
  }
  function pointer(event){
    if(event.pointerType!=='touch')return;
    if(event.type==='pointerup'||event.type==='pointercancel'){pointers.delete(event.pointerId);baseline=0;return;}
    if(event.type==='pointerdown'||pointers.has(event.pointerId))pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if(pointers.size!==2)return;
    const [a,b]=pointers.values(),span=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(baseline===0)baseline=span;
    if(Math.abs(span-baseline)>40){zoom(span<baseline?1:-1);baseline=span;}
  }
  canvas.addEventListener('wheel',wheel,{passive:false});
  for(const e of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.addEventListener(e,pointer);
  return {
    image,get distance(){return [19,30,49][level];},
    update(quality) {
      if(quality!==appliedQuality){
        const {error,depth,bytes}=profiles[quality];
        tiles.errorTarget=error;
        tiles.maxDepth=depth;
        tiles.lruCache.maxBytesSize=bytes*1024**2;
        tiles.lruCache.minBytesSize=.72*tiles.lruCache.maxBytesSize;
        appliedQuality=quality;
      }
      tiles.setResolutionFromRenderer(camera,view);
      tiles.update();
      if(!movingCamera&&performance.now()-started>21500&&!tiles.visibleTiles.size)fail='Google 圖磚載入逾時';
      const visible=[...tiles.visibleTiles];
      const sources=copyrightStrings(visible.map(tile=>tile.engineData?.metadata?.asset?.copyright));
      const ready=!fail&&Boolean(tiles.visibleTiles.size)&&Boolean(sources)&&image.complete&&image.naturalWidth>0;
      wrapper.visible=ready;
      return {ready,fail,sources,count:visible.length,errorTarget:tiles.errorTarget,maxDepth:tiles.maxDepth,visibleDepth:Math.max(0,...visible.map(tile=>tile.internal?.depth??0))};
    },
    hide(){wrapper.visible=false;},
    dispose(){
      scene.remove(wrapper);tiles.dispose();draco.dispose();
      canvas.removeEventListener('wheel',wheel);
      for(const e of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.removeEventListener(e,pointer);
    },
  };
}
