import {createRenderer as create2D} from './2d/render.js?v=fced202e';
import {googleKey,probeGoogle} from './google-session.js?v=fced202e';
import {createSimulation} from './simulation.js?v=fced202e';

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
      const {createRenderer}=await import('./3d/render.js?v=fced202e');
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
          const {createGoogleLayer}=await import('./3d/google.js?v=fced202e');
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
      if(query.has('memDebug'))canvas.ownerDocument.defaultView.__dcDraw=draw3D; // 記憶體量測用（tests/evidence/perf）
      const render3D=state=>{
        lastState=state;
        try { draw3D(state); }
        catch(error) {
          if(query.has('collisionAudit'))console.error(error);
          fallback();
          draw(state);
        }
      };
      draw=render3D;
      // E3 context 暫時失去：3D 場景留著，先在覆蓋層用 2D 畫；瀏覽器還回 context 就回到 3D。
      // 只有 3D 本身出錯（fallback）才永久換 2D。
      let lost2D=null,lostReason=null;
      canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault();
        if(canvas.dataset.engine==='2d')return;
        lost2D??=create2D(overlay,minimapCanvas);
        draw=state=>{lastState=state;lost2D(state);};
        lostReason=canvas.dataset.engineReason??'';
        canvas.dataset.engine='2d';
        canvas.dataset.engineReason='WebGL 暫時中斷，等待恢復';
        if (lastState) draw(lastState);
      });
      canvas.addEventListener('webglcontextrestored',()=>{
        if(lostReason===null||draw===render3D)return;
        try{draw3D.restore?.();}
        catch(error){if(query.has('collisionAudit'))console.error(error);}
        draw=render3D;
        canvas.dataset.engine='stylized';
        canvas.dataset.engineReason=lostReason;
        lostReason=null;
        if (lastState) draw(lastState);
      });
    } catch(error) {
      if(query.has('collisionAudit'))console.error(error);
      fallback();
    }
  }
  return createSimulation(canvas,state=>draw(state),minimapCanvas);
}
