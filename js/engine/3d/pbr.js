import * as T from '../vendor/three.module.min.js?v=f213092';
import {mobileTextures} from './city-primitives.js?v=f213092';

export function surfaceMaps(doc,source,anisotropy,strength){
  const size=mobileTextures?256:512,canvas=doc.createElement('canvas');
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,0,0,size,size);
  const pixels=ctx.getImageData(0,0,size,size).data;
  // P1 perf: luma once per pixel and direct byte writes (was a per-pixel array allocation); same output bytes.
  const lum=new Float64Array(size*size);
  for(let i=0,k=0;i<lum.length;i++,k+=4)lum[i]=(.2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2])/255;
  const luma=(x,y)=>lum[(y+size)%size*size+(x+size)%size];
  const normal=new Uint8Array(pixels.length),rough=new Uint8Array(pixels.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const p=4*(y*size+x),nx=(luma(x-1,y)-luma(x+1,y))*strength;
    const ny=(luma(x,y+1)-luma(x,y-1))*strength;
    const inv=127/Math.hypot(nx,ny,1);
    normal[p]=128+nx*inv;normal[p+1]=128+ny*inv;normal[p+2]=128+inv;normal[p+3]=255;
    rough[p]=255;rough[p+1]=Math.round(255*Math.min(1,.48+.41*lum[y*size+x]));rough[p+2]=255;rough[p+3]=255;
  }
  const texture=data=>{
    const tex=new T.DataTexture(data,size,size);
    tex.wrapS=tex.wrapT=T.RepeatWrapping;
    tex.flipY=true;
    tex.generateMipmaps=true;
    tex.minFilter=T.LinearMipmapLinearFilter;tex.magFilter=T.LinearFilter;
    tex.anisotropy=anisotropy;tex.needsUpdate=true;
    return tex;
  };
  return {normalMap:texture(normal),roughnessMap:texture(rough)};
}

export function makeEnvironment(doc,renderer){
  const canvas=doc.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');
  const sky=ctx.createLinearGradient(0,0,0,256);
  for(const [offset,color] of [[0,'#45648f'],[.43,'#8daec3'],[.51,'#e5d4ae'],[.62,'#655e56'],[1,'#3b3b3e']])
    sky.addColorStop(offset,color);
  ctx.fillStyle=sky;ctx.fillRect(0,0,512,256);
  const halo=ctx.createRadialGradient(175,81,1,175,81,39);
  halo.addColorStop(0,'#fff7df');halo.addColorStop(1,'#fff7df00');
  ctx.fillStyle=halo;ctx.fillRect(130,36,90,90);
  const tex=new T.CanvasTexture(canvas);
  tex.colorSpace=T.SRGBColorSpace;tex.mapping=T.EquirectangularReflectionMapping;
  const generator=new T.PMREMGenerator(renderer),target=generator.fromEquirectangular(tex);
  generator.dispose();tex.dispose();
  return target;
}

export function makePanoramas(doc,renderer){
  const keys=['sky_day','sky_dusk','sky_night'],images=new Map(),reflections=new Map();
  const loader=new T.TextureLoader(),canvas=doc.createElement('canvas');
  canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');
  let disposed=false,generator;
  if(new URLSearchParams(doc.defaultView.location.search).get('textures')!=='0')
    fetch(new URL('../../../assets/manifest.json',import.meta.url))
      .then(r=>r.ok?r.json():null).then(manifest=>{
        for(const key of keys)if(manifest?.images?.[key]&&!disposed)
          loader.load(new URL('../../../assets/tex/'+key+'.webp',import.meta.url).href,texture=>{
            if(disposed){texture.dispose();return;}
            texture.colorSpace=T.SRGBColorSpace;
            images.set(key,texture);
          },undefined,()=>{});
      }).catch(()=>{});
  return {
    at(time){
      const hour=time<=12?time:24-time+1.25;
      const edge=hour<6?1:0;
      const mix=edge?T.MathUtils.smoothstep(6-hour,0,1.25):T.MathUtils.smoothstep(8-hour,0,2);
      const a=images.get(keys[edge]),b=images.get(keys[edge+1]);
      if(!a||!b)return null;
      const step=Math.round(mix*8),key=edge+':'+step;
      if(!reflections.has(key)){
        ctx.globalAlpha=1;ctx.drawImage(a.image,0,0,512,256);
        ctx.globalAlpha=step/8;ctx.drawImage(b.image,0,0,512,256);ctx.globalAlpha=1;
        const source=new T.CanvasTexture(canvas);
        source.colorSpace=T.SRGBColorSpace;source.mapping=T.EquirectangularReflectionMapping;
        generator??=new T.PMREMGenerator(renderer);
        reflections.set(key,generator.fromEquirectangular(source));
        source.dispose();
      }
      return {a,b,mix,reflection:reflections.get(key).texture};
    },
    keys:()=>[...images.keys()],
    // E3 WebGL context 還回來之後，預先算好的反射圖（PMREM）內容已經不見，清掉讓它用到時重算
    reset(){
      for(const reflection of reflections.values())reflection.dispose();
      reflections.clear();
      generator?.dispose();generator=null;
    },
    dispose(){
      disposed=true;
      for(const image of images.values())image.dispose();
      for(const reflection of reflections.values())reflection.dispose();
      generator?.dispose();
    },
  };
}
