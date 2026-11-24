import * as T from '../vendor/three.module.min.js?v=fced202e';

export function canvasTexture(doc,w,h,paint) {
  const canvas=doc.createElement('canvas');
  Object.assign(canvas,{width:w,height:h});
  paint(canvas.getContext('2d'),w,h);
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=8; // 斜看的招牌與路名牌保持清楚（三.js 會依顯示卡上限截斷）
  return texture;
}
const box=new T.BoxGeometry(1,1,1),plane=new T.PlaneGeometry(1,1),
  cylinder=new T.CylinderGeometry(.5,.5,1,10),crown=new T.IcosahedronGeometry(.55,1),
  dome=new T.SphereGeometry(.5,24,11,0,Math.PI*2,0,Math.PI/2);
export const shapes={box,plane,cylinder,crown,dome};
export const matrix=new T.Object3D(),color=new T.Color();
export const hash=(a,b=0)=>{const v=Math.sin(a*127.1+b*311.7+17.3)*43758.5453;return v-Math.floor(v);};
// 記憶體：手機（觸控為主的裝置）分頁記憶體上限低，載入的貼圖寬高各減半（GPU 與解碼後的 CPU 用量約剩 1/4）。
// 電腦版不變。天空全景圖（pbr.js 自己的 loader）不經過這裡：它占滿整個背景，縮小最容易看出糊，而且只有三張。
export const mobileTextures=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
function halve(texture){
  const image=texture.image,w=image?.naturalWidth||image?.width,h=image?.naturalHeight||image?.height;
  if(!mobileTextures||!w||!h||w<128||h<128)return;
  const canvas=image.ownerDocument?.createElement?.('canvas')??document.createElement('canvas');
  canvas.width=w>>1;canvas.height=h>>1;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  texture.image=canvas;texture.needsUpdate=true;
}
// 手機：先用 img.decode() 在背景解碼，解完才縮圖並交出貼圖；否則 drawImage 會在主執行緒同步解碼整張大圖，造成長幀。
// 與 three.js 的 TextureLoader 相同：先回傳空貼圖，圖好了才設 image 與 needsUpdate（中間不會先上傳一次原尺寸）。
export class TextureLoader extends T.TextureLoader{
  load(url,onLoad,onProgress,onError){
    const texture=new T.Texture(),loader=new T.ImageLoader(this.manager);
    loader.setCrossOrigin(this.crossOrigin);loader.setPath(this.path);
    loader.load(url,image=>{
      const done=()=>{texture.image=image;texture.needsUpdate=true;halve(texture);onLoad?.(texture);};
      if(mobileTextures&&typeof image.decode==='function')image.decode().catch(()=>{}).then(done);
      else done();
    },onProgress,onError);
    return texture;
  }
}
