import * as T from '../vendor/three.module.min.js';
import {buildings,roadAt,metersPerUnit as unit} from '../world.mjs';
import {placeFrontage,placeRoof} from './frontage.js';
import {hash} from './city-primitives.js';
import {addApartmentRoof,oldFacade} from './buildings-old.js';
import {towerFacade} from './buildings-tower.js';

// The two mapped Songshan warehouses and the preservation block at Four Four South Village.
const historicFootprints=new Map([[228920407,'studio'],[228920409,'studio'],[441377762,'village'],[1131522120,'museum']]);
export function addBuildings({neon,oldBatch,oldRoofDetailBatch,oldStoreDetailBatch,towerBatch,oldInstance,towerInstance,storeBatch,storeInstance,nightInstance,textWall,paveFront,storefrontAt,sign,materials,landmark}) {
  for(const b of buildings) {
    const batch=b.modern?towerBatch:oldBatch,instance=b.modern?towerInstance:oldInstance;
    const localShape=historicFootprints.get(b.osmId);
    if((b.shape||localShape) && landmark(localShape?{...b,shape:localShape}:b))continue;
    const x=(b.x+b.w/2)*unit,z=(b.y+b.h/2)*unit;
    const points=b.polygon.map(p=>new T.Vector2(p.x*unit,p.y*unit));
    const h=Math.max(3,Math.min(198,b.elevation)),roof=batch(x,z,b.modern?'roof':'roofTop');
    const roofFaces=T.ShapeUtils.triangulateShape(points,[]);
    for(const face of roofFaces){
      const corners=face.slice().reverse().map(i=>points[i]);
      roof.triangle(...corners.map(p=>[p.x,h,p.y]),'#c7c1b8',
        ...corners.map(p=>[(p.x-b.x*unit)/(b.w*unit),(p.y-b.y*unit)/(b.h*unit)]));
    }
    if(b.walkup&&h>=12)addApartmentRoof(oldRoofDetailBatch(x,z,'roofTop'),points,roofFaces,h,b.osmId);
    else if(b.residential&&h>=23)addApartmentRoof(roof,points,roofFaces,h,b.osmId);
    const facadeVariant=Math.min(2,Math.floor(hash(b.osmId,7)*3));
    const tint=new T.Color(b.color).lerp(new T.Color('#ebe6dc'),.68);
    const facade=b.modern?towerFacade(facadeVariant,tint,(hash(b.osmId,19)-.5)*.1):oldFacade(facadeVariant,tint,b.osmId);
    const upper=batch(x,z,facade.material);
    const [baseW,baseH]=facade.scale;
    const jitter=.85+.3*hash(b.osmId,11),tileWidth=baseW*jitter,tileHeight=baseH*(.94+.12*hash(b.osmId,12));
    const uOffset=hash(b.osmId,13),mirror=hash(b.osmId,17)>.5?-1:1;
    const faceKinds=[];
    const houseTint=new T.Color();
    const frontageBatch=b.modern?storeBatch:oldStoreDetailBatch;
    const podium=Math.min(3.5,h-.16);
    let frontage=null;
    const winding=Math.sign(points.reduce((sum,p,i)=>{
      const c=points[(i+1)%points.length];
      return sum+p.x*c.y-c.x*p.y;
    },0))||1;
    for(let i=0;i<points.length;i++){
      const a=points[i],c=points[(i+1)%points.length],length=a.distanceTo(c);
      const p=(v,y)=>[v.x,y,v.y];
      const mx=(a.x+c.x)/2,mz=(a.y+c.y)/2,streetFace=roadAt(mx/unit,mz/unit,-72);
      const storefront=batch(x,z,b.modern?'new':'shop');
      if(length<.01)continue;
      const nx=(c.y-a.y)/length,nz=(a.x-c.x)/length;
      if(b.modern)storefront.quad(p(a,0),p(c,0),p(c,podium),p(a,podium),tint,length/tileWidth,podium/tileHeight);
      else textWall(storefront,p(a,0),p(c,0),p(c,podium),p(a,podium),nx*winding,nz*winding,tint,length/4.2,1,'osm');
      if(streetFace)neon?.frontage(mx,mz,nx*winding,nz*winding,length,h,b.osmId+i*17); // A22 OSM frontage
      if(streetFace&&length>1){
        const sign=winding;
        const shift=new T.Vector2(nx*.024*sign,nz*.024*sign);
        const left=a.clone().add(shift),right=c.clone().add(shift);
        const beltHeight=b.modern?4.7:6.8,top=Math.min(h-.02,beltHeight);
        // Every street face is cut into shopfront units, each picking its own sign.
        const units=b.modern?1:Math.max(1,Math.round(length/6.5));
        for(let k=0;k<units;k++){
          const l0=left.clone().lerp(right,k/units),r0=left.clone().lerp(right,(k+1)/units);
          const kind=b.modern?['shopi','shopj'][(b.osmId+i+k)%2]:storefrontAt((l0.x+r0.x)/2,(l0.y+r0.y)/2);
          faceKinds[i]??=kind;
          const uLen=length/units/(beltHeight*2);
          textWall(frontageBatch(x,z,kind),p(l0,.015),p(r0,.015),p(r0,top),p(l0,top),
            nx*sign,nz*sign,'#fff',units>1?uLen:length/(beltHeight*2),top/beltHeight,'osm',
            units>1?hash(b.osmId+i*7,k+5)*Math.max(0,1-uLen):0);
        }
        if(!b.modern)paveFront(a.x,a.y,c.x,c.y,nx*sign,nz*sign,length);

      }
      if(b.residential&&length>=4.0){
        const bays=Math.max(1,Math.round(length/4.9));
        for(let bay=0;bay<bays;bay++){
          const start=a.clone().lerp(c,bay/bays),end=a.clone().lerp(c,(bay+1)/bays);
          const seed=b.osmId+i*11+bay*37;
          houseTint.copy(tint).offsetHSL((hash(seed,33)-.5)*.065,0,(hash(seed,37)-.5)*.15);
          const phase=Math.floor(hash(seed,39)*3)/3;
          const vPhase=Math.floor(hash(seed,44)*5)*3.15/baseH;
          upper.quad(p(start,podium),p(end,podium),p(end,h),p(start,h),houseTint,1/3,
            (h-podium)/baseH,phase,vPhase);
        }
      }else upper.quad(p(a,podium),p(c,podium),p(c,h),p(a,h),tint,mirror*length/tileWidth,(h-podium)/tileHeight,
        mirror>0?uOffset:uOffset+length/tileWidth);
      if(length>1&&h>6){
        // Dark plinth, parapet cap and storey bands break up the flat wall.
        const out=winding*.06,band=batch(x,z,'curb'),o=new T.Vector2(nx*out,nz*out);
        const ring=(y0,y1,tintBand,push=1)=>band.quad(p(a.clone().addScaledVector(o,push),y0),p(c.clone().addScaledVector(o,push),y0),
          p(c.clone().addScaledVector(o,push),y1),p(a.clone().addScaledVector(o,push),y1),tintBand,1,1);
        if(!streetFace)ring(0,.25,'#6b665e');
        ring(h-.5,h,'#bdb7aa',1.4);
        if(!b.modern)for(let y=podium+34;y<h-5;y+=34)ring(y,y+.32,'#c9c2b2');
        if(!b.modern&&h>12&&length>5){
          // Air-conditioner condensers and balcony slabs, only built near the camera.
          const count=Math.floor(hash(b.osmId+i,41)*3);
          const upperFloors=Math.min(7,Math.floor((h-podium-1.1)/3.4));
          for(let k=0;k<count;k++){
            const t=.15+.7*hash(b.osmId+i,43+k),floor=1+Math.floor(hash(b.osmId+i,47+k)*upperFloors);
            const yy=podium+floor*3.4+.8,turnAngle=-Math.atan2(c.y-a.y,c.x-a.x);
            const px=a.x+(c.x-a.x)*t+nx*winding*.2,pz=a.y+(c.y-a.y)*t+nz*winding*.2;
            if(hash(b.osmId+i,53+k)>.4)instance('metal','box','#a7a9a6',px,yy,pz,.7,.5,.3,turnAngle);
            else{
              instance('concrete','box','#b9b4a8',px+nx*winding*.3,yy-.55,pz+nz*winding*.3,1.2,.1,.6,turnAngle);
              instance('metal','box','#5d605f',px+nx*winding*.58,yy-.1,pz+nz*winding*.58,1.2,.9,.04,turnAngle);
            }
          }
        }
      }
      if((!b.modern&&(b.osmId%3!==0||h>50))||length<5||length<=(frontage?.length??0))continue;
      if(streetFace){
        const nx=(c.y-a.y)/length,nz=(a.x-c.x)/length;
        const side=(mx-x)*nx+(mz-z)*nz<0?-1:1;
        frontage={a,c,length,face:[side*nx,side*nz],kind:faceKinds[i]??(b.modern?'shopi':'shopa')};
      }
    }
    if(frontage){
      const storefrontSign=(...args)=>{
        const mark=sign(...args);
        if(mark.userData.vertical)mark.userData.suppressWith=materials[frontage.kind];
      };
      placeFrontage(b,frontage.a,frontage.c,frontage.face,{instance:storeInstance,sign:storefrontSign});
      if(b.modern){
        const {a,c,face,length}=frontage,height=Math.min(4.9,h-.05),width=Math.min(length,37);
        const dx=(c.x-a.x)/length,dz=(c.y-a.y)/length,[nx,nz]=face;
        const [lx,lz]=[a.x+nx*.098,a.y+nz*.098],rx=lx+dx*width,rz=lz+dz*width;
        const centerX=(lx+rx)/2,centerZ=(lz+rz)/2;
        const normal=(dx*nz-dz*nx)>0;
        const left=normal?[lx,lz]:[rx,rz],right=normal?[rx,rz]:[lx,lz];
        textWall(storeBatch(centerX,centerZ,'mall'),[left[0],.1,left[1]],[right[0],.1,right[1]],
          [right[0],height,right[1]],[left[0],height,left[1]],nx,nz,'#e8e5dc',width/10,.52,'osm');
        const angle=-Math.atan2(dz,dx);
        if(!roadAt((centerX+nx*.92)/unit,(centerZ+nz*.92)/unit,0)){
          storeInstance('metal','box','#8c9691',centerX+nx*.89,height-.39,centerZ+nz*.89,width,.16,1.79,angle);
          storeInstance('concrete','box','#c4beb0',centerX+nx*.76,.033,centerZ+nz*.76,width,.066,1.70,angle);
        }
      }

      if(!b.modern){
        const a=frontage.a,c=frontage.c,n=frontage.face;
        const xx=(a.x+c.x)/2+n[0]*2.3,zz=(a.y+c.y)/2+n[1]*2.3;
        nightInstance('reflection','plane','#ffc78e',xx,.085,zz,Math.min(frontage.length,10),5.5,1,
          -Math.atan2(c.y-a.y,c.x-a.x),-Math.PI/2);
      }
      if(!b.residential)placeRoof(b,x,z,instance);
    }
  }
}
