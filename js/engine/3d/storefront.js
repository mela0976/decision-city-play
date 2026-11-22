import * as T from '../vendor/three.module.min.js?v=c9f6d84';
import {locations,ways,metersPerUnit as unit} from '../world.mjs?v=c9f6d84';
import {canvasTexture,shapes} from './city-primitives.js?v=c9f6d84';
import {xinyiBusBay} from './furniture.js?v=c9f6d84';
const {plane}=shapes;
// The rear quad reverses its positions so both sides keep the same reading order.
const blade=new T.BufferGeometry();
blade.setAttribute('position',new T.Float32BufferAttribute([
  -.5,-.5,.08,.5,-.5,.08,.5,.5,.08,-.5,.5,.08,
  .5,-.5,-.08,-.5,-.5,-.08,-.5,.5,-.08,.5,.5,-.08,
],3));
blade.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));
blade.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);

export function createStorefront({doc,anisotropy,group,signs,loadAd,nightEnabled}) {
  const streetBands=new Map(),signCache=new Map();
  function storefrontAt(x,z){
    const ix=Math.floor(x/16),iz=Math.floor(z/16),used=new Set();
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      for(const neighbor of streetBands.get((ix+dx)+','+(iz+dz))??[]){
        if(Math.hypot(neighbor.x-x,neighbor.z-z)<14)used.add(neighbor.key);
      }
    }
    const near=(id,radius)=>locations.some(site=>site.id===id&&Math.hypot(site.x*unit-x,site.y*unit-z)<radius);
    const options=near('night_market',180)?'gh':near('home',220)||near('temple',220)?'abcdefkl':'abcdef';
    const seed=(Math.floor(x/7)+Math.floor(z/5))%options.length;
    let key=options[seed];
    for(let i=0;i<options.length;i++){
      if(!used.has(key))break;
      key=options[(seed+i+1)%options.length];
    }
    const tile=ix+','+iz;
    if(!streetBands.has(tile))streetBands.set(tile,[]);
    streetBands.get(tile).push({x,z,key});
    return 'shop'+key;
  }
  function sign(visible,name,x,y,z,rotation,tint='#233c57',large=false,w=large?6:3.2,h=large?1.2:.69,style='paint') {
    const vertical=h>w,key=name+'/'+tint+'/'+vertical+'/'+style;
    if(!signCache.has(key)){
      const texture=canvasTexture(doc,vertical?96:512,vertical?256:110,(ctx,iw,ih)=>{
        if(style==='acrylic'){
          const face=ctx.createLinearGradient(0,0,iw,ih);
          face.addColorStop(0,'#dad1af');face.addColorStop(.12,'#fff7de');
          face.addColorStop(.82,'#e1d4b6');face.addColorStop(1,'#9b9077');
          ctx.fillStyle=face;
        }else ctx.fillStyle=style==='led'?'#262428':tint;
        ctx.fillRect(0,0,iw,ih);
        ctx.strokeStyle=style==='acrylic'?tint:'#eddfc4';ctx.lineWidth=4;ctx.strokeRect(6,6,iw-12,ih-12);
        ctx.font=vertical?'700 43px system-ui':'700 55px system-ui';
        ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillStyle=style==='acrylic'?tint:style==='led'?'#ff9b58':'#fff4d8';
        if(vertical)Array.from(name).forEach((char,i)=>ctx.fillText(char,iw/2,(i+1)*ih/(name.length+1),iw*.83));
        else ctx.fillText(name,iw*.5,ih*.51,iw-28);
        if(style==='led'){
          ctx.fillStyle='rgba(28,22,26,.62)';
          for(let row=3;row<ih;row+=4)ctx.fillRect(0,row,iw,1);
        }
      });
      texture.anisotropy=anisotropy;
      signCache.set(key,new T.MeshBasicMaterial({map:texture,side:style==='flag'?T.DoubleSide:T.FrontSide}));
    }
    const doubleFace=vertical&&(style==='acrylic'||style==='led');
    const mark=new T.Mesh(doubleFace?blade:plane,signCache.get(key));
    mark.position.set(x,y,z);mark.rotation.y=rotation;mark.scale.set(w,h,1);
    mark.userData.vertical=vertical;
    mark.userData.detailStyle=style;
    if(!visible)return mark;
    group.add(mark);signs.push(mark);
    if(vertical&&nightEnabled&&style!=='flag'){
      const reflection=new T.Mesh(plane,new T.MeshBasicMaterial({map:signCache.get(key).map,
        transparent:true,side:T.DoubleSide,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
      reflection.position.set(x,.081,z);
      reflection.rotation.set(-Math.PI/2,0,-rotation);
      reflection.scale.set(w,-h*1.8,1);
      reflection.visible=false;group.add(reflection);mark.userData.reflection=reflection;
    }
    return mark;
  }
  const loadedAds=[],adMaterials=new Map();
  function billboard(id,x,y,z,rotation,w,h){
    let material=adMaterials.get(id);
    if(!material){
      material=new T.MeshStandardMaterial({color:'#9d9b8e',metalness:.15,roughness:.43,side:T.FrontSide});
      adMaterials.set(id,material);
      loadAd(id).then(texture=>{
        if(!texture)return;
        material.map=material.emissiveMap=texture;
        material.color.set('#fff');material.emissive.set('#fff');material.needsUpdate=true;
        loadedAds.push('ad_'+id);
      });
    }
    const panel=new T.Mesh(plane,material);
    panel.position.set(x,y,z);panel.rotation.y=rotation;panel.scale.set(w,h,1);
    group.add(panel);signs.push(panel);
  }
  return {sign,billboard,loadedAds,adMaterials,storefrontAt,signCache};
}

export function addBillboards(billboard) {
  for(const [i,id] of ['department','mrt','office','client_hq','night_market','convenience','studio','datalab'].entries()){
    const site=locations.find(p=>p.id===id),a=site.viewHeading;
    const side=i===0?-4.0:i===1?2.65:-4.9,depth=i<2?4.4:3.4;
    const x=(site.x*unit)+Math.sin(a)*side+Math.cos(a)*depth;
    const z=(site.y*unit)-Math.cos(a)*side+Math.sin(a)*depth;
    const wide=i>=4;
    billboard(i+1,x,wide?4.9:2.14,z,-Math.PI/2-a,wide?5.4:2.12,wide?2.7:2.12);
  }
  const bayPoster=xinyiBusBay(8.7,1.71);
  billboard(3,bayPoster.x,1.40,bayPoster.z,Math.PI-bayPoster.heading,1.22,1.48);
}

export function addStreetNames(sign) {
  const named=new Set();
  for(const way of ways){
    if(!way.name||named.has(way.name)||!['primary','secondary','tertiary'].includes(way.kind))continue;
    named.add(way.name);
    const p=way.points[Math.floor(way.points.length/2)];
    sign(way.name,p.x*unit,4.0,p.y*unit,0,'#235d46');
    sign(way.name,p.x*unit,4.0,p.y*unit-.06,Math.PI,'#235d46');
  }
}

export function updateSigns(signs,x,z,rain,night) {
  for(const sign of signs){
    sign.visible=(!sign.userData.suppressWith?.userData.authored||sign.userData.detailStyle!=='paint')&&
      Math.hypot(sign.position.x-x,sign.position.z-z)<(sign.userData.vertical?49:sign.userData.roadMark?165:85);
    const reflection=sign.userData.reflection;
    if(reflection){reflection.visible=sign.visible&&rain&&night>.1;reflection.material.opacity=night*.22;}
  }
}
