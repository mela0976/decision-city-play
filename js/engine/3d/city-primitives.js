import * as T from '../vendor/three.module.min.js?v=7c27097e';

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
