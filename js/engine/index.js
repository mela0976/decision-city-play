import {createRenderer as create2D} from './2d/render.js';
import {googleKey,probeGoogle} from './google-session.js';
import {createSimulation} from './simulation.js';

function layerFor(canvas) {
  const layer=canvas.ownerDocument.createElement('canvas');
  layer.className='dc-engine-overlay';
  layer.setAttribute('aria-hidden','true');
  Object.assign(layer.style,{
    position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',
  });
  canvas.after(layer);
  return layer;
}

export async function createEngine({canvas,minimapCanvas}) {
  Object.assign(canvas.style,{width:'100dvw',height:'100dvh'});
  for(const side of ['top','right','bottom','left']) {
    canvas.style.setProperty('--dc-safe-'+side,`env(safe-area-inset-${side}, 0px)`);
  }
  const query=new URLSearchParams(canvas.ownerDocument.defaultView.location.search);
  let draw,lastState,dispose3D;
  if (query.get('engine')==='2d') {
    draw=create2D(canvas,minimapCanvas);
    canvas.dataset.engine='2d';
    canvas.dataset.engineReason='網址指定 2D';
  } else {
    let failureContext=false;
    let overlay;
    const fallback=()=>{
      if (canvas.dataset.engine==='2d') return;
      dispose3D?.();
      draw=create2D(overlay??(failureContext?layerFor(canvas):canvas),minimapCanvas);
      canvas.dataset.engine='2d';
      canvas.dataset.engineReason='WebGL 不可使用或初始化失敗';
      canvas.removeAttribute('data-engine-stats');
    };
    try {
      const {createRenderer}=await import('./3d/render.js');
      const context=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
      if (!context) throw Error('WebGL 2 unavailable');
      failureContext=true;
      overlay=layerFor(canvas);
      const mode=query.get('engine');
      let storage;
      try{storage=canvas.ownerDocument.defaultView.localStorage;}catch{}
      const key=mode==='stylized'?'':googleKey(query,storage);
      const googleLayer=key?async(...args)=>{
        const probe=await probeGoogle(key);
        if(!probe.ok){canvas.dataset.engineReason=probe.reason;return null;}
        try{
          const {createGoogleLayer}=await import('./3d/google.js');
          return createGoogleLayer(...args,probe);
        }catch{
          canvas.dataset.engineReason='Google 圖磚載入器不可使用';
          return null;
        }
      }:null;
      canvas.dataset.engineReason=mode==='stylized'?'網址指定程式化 3D':key?'程式化街景；實景於高空啟用':'未設定 Google Maps 金鑰';
      const draw3D=createRenderer(canvas,minimapCanvas,overlay,context,googleLayer,mode==='google');
      canvas.dataset.engine='stylized';
      dispose3D=draw3D.dispose;
      draw=state=>{
        lastState=state;
        try { draw3D(state); }
        catch(error) {
          if(query.has('collisionAudit'))console.error(error);
          fallback();
          draw(state);
        }
      };
      canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault();
        fallback();
        if (lastState) draw(lastState);
      },{once:true});
    } catch(error) {
      if(query.has('collisionAudit'))console.error(error);
      fallback();
    }
  }
  return createSimulation(canvas,state=>draw(state),minimapCanvas);
}
