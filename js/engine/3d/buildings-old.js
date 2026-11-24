import * as T from '../vendor/three.module.min.js?v=70a6a7b0';
import {inWuxing,metersPerUnit as unit} from '../world.mjs?v=70a6a7b0';
import {visitWuxingArcades} from '../wuxing-arcades.mjs?v=70a6a7b0';
import {neonDistrict} from '../neon-districts.mjs?v=70a6a7b0';
import {urbanInfill} from '../infill.mjs?v=70a6a7b0';
import {placeTree} from './vegetation.js?v=70a6a7b0';
import {canvasTexture,hash} from './city-primitives.js?v=70a6a7b0';

const wallSwatches=['#dcb795','#decfaf','#c5c8c2','#bbc9b3','#cfab9c','#c2b5ae'];
const apartmentMaterials=['old','oldB','oldC'];
// Each atlas spans three household bays but the source images contain 6, 3 and 5 storeys.
const atlasStoreys=[6,3,5];
const storey=3.15;
const podium=3.8;

// Normalized glazing bounds per storey, in image order from roof to street.
const glazingBands=[
  [[.055,.155],[.20,.303],[.37,.482],[.535,.643],[.70,.815],[.856,.965]],
  [[.123,.305],[.413,.592],[.708,.892]],
  [[.054,.145],[.215,.322],[.405,.513],[.625,.729],[.795,.944]],
];

export function apartmentWindowMask(doc,kind){
  const variant=apartmentMaterials.indexOf(kind);
  if(variant<0)return null;
  const bands=glazingBands[variant];
  const households=bands.flatMap((band,floor)=>[0,1,2].map(bay=>({band,bay,floor})));
  households.sort((a,b)=>hash(a.floor*3+a.bay,variant+7)-hash(b.floor*3+b.bay,variant+7));
  return canvasTexture(doc,256,256,(ctx,w,h)=>{
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,w,h);
    for(const {band:[top,bottom],bay,floor} of households.slice(0,Math.round(households.length*.30))){
      const left=(bay+.11)*w/3, width=w*.63/3, height=(bottom-top)*h;
      ctx.fillStyle=hash(floor,bay+variant)>.27?'#d7a76a':'#97a9b9';
      ctx.fillRect(left,top*h,width,height);
      ctx.fillStyle='#282624';
      ctx.fillRect(left+width*.51,top*h,width*.035,height);
    }
  });
}

export function oldFacade(variant,tint,id){
  tint.lerp(new T.Color(wallSwatches[Math.floor(hash(id,23)*wallSwatches.length)]),.42+.3*hash(id,29))
    .offsetHSL((hash(id,31)-.5)*.025,0,(hash(id,37)-.5)*.10);
  return {material:apartmentMaterials[variant],scale:[14.7,storey*atlasStoreys[variant]]};
}

function roofFixtures(roof,point,top,seed){
  const shedSide=hash(seed,71)>.5?1:-1;
  if(hash(seed,73)<.68){
    const left=shedSide>0?.04:-.72,right=shedSide>0?.72:-.04;
    const front=-.44,back=.42;
    const eave=top+1.66,ridge=top+2.02;
    const a=point(left,front,top),b=point(right,front,top);
    const c=point(right,back,top),d=point(left,back,top);
    const e=point(left,front,eave),f=point(right,front,eave);
    const g=point(right,back,ridge),h=point(left,back,ridge);
    const paint=hash(seed,75)<.55?'#89a1b4':'#b4b5a7';
    roof.quad(a,e,f,b,paint);
    roof.quad(b,f,g,c,paint);
    roof.quad(c,g,h,d,paint);
    roof.quad(d,h,e,a,paint);
    roof.quad(e,h,g,f,paint,1.6,1);
  }

  const tankX=-shedSide*.34,tankZ=.26,segments=8;
  for(let i=0;i<segments;i++){
    const rim=(index,y)=>{
      const angle=index/segments*Math.PI*2;
      return point(tankX+.11*Math.cos(angle),tankZ+.14*Math.sin(angle),y);
    };
    const bottom=top+.12,lid=top+1.03;
    roof.quad(rim(i,bottom),rim(i,lid),rim(i+1,lid),rim(i+1,bottom),
      i%2?'#afb9bb':'#d4d8d6',.14,.18);
    roof.triangle(point(tankX,tankZ,lid+.06),rim(i+1,lid),rim(i,lid),'#d2d4cd');
  }
}

// The largest roof triangle's incircle keeps details inside even concave OSM footprints.
export function addApartmentRoof(batch,points,faces,top,seed){
  let bestArea=0,center,radius;
  for(const [i,j,k] of faces){
    const a=points[i],b=points[j],c=points[k];
    const twiceArea=Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y));
    if(twiceArea<=bestArea)continue;
    bestArea=twiceArea;
    const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a),perimeter=ab+bc+ca;
    radius=Math.min(6,twiceArea/perimeter);
    center=[(a.x*bc+b.x*ca+c.x*ab)/perimeter,(a.y*bc+b.y*ca+c.y*ab)/perimeter];
  }
  if(!center||radius<1.15)return;
  roofFixtures(batch,(u,v,y)=>[center[0]+u*radius,y,center[1]+v*radius],top,seed);
}

export function addInfill({neon,batch,oldInstance,oldRoofDetailBatch,oldStoreDetailBatch,towerBatch,terrainBatch,storeBatch,storeInstance,roadBatch,furnitureInstance,treeInstance,textWall}) {
  visitWuxingArcades(oldInstance);
  for(const {x,z,width,depth,height,housing,civic,tree,lot,tin,setback=0,heading=0,streetSide,shop,street} of urbanInfill()){
    const ux=Math.cos(heading),uz=Math.sin(heading);
    const p=(dx,dy,h)=>[x+ux*dx*width/2-uz*dy*depth/2,h,z+uz*dx*width/2+ux*dy*depth/2];
    const seed=Math.round(x*31+z);
    const local=inWuxing(x/unit,z/unit);
    const groundKind=local||civic||lot==='parking'?'paving':lot==='fence'||lot==='bare'?'earth':'park';
    const groundTint=local?'#b1a99e':civic?'#a39f93':lot==='parking'?'#8d8a84':lot==='fence'||lot==='bare'?'#8c8266':'#738759';
    terrainBatch(x,z,groundKind).quad(p(-1,-1,-.083),p(1,-1,-.083),p(1,1,-.083),p(-1,1,-.083),groundTint,width/3,depth/3);
    if(housing){
      const shellBatch=civic?towerBatch:batch;
      const roof=shellBatch(x,z,'roofTop');
      const top=tin?Math.min(height,5.4):height,cut=setback?top-setback*storey:top;
      const base=new T.Color('#e0d8c8');
      const variant=Math.floor(hash(seed,2)*apartmentMaterials.length);
      const facade=civic?{material:'new',scale:[18,18.75]}:oldFacade(variant,base,seed);
      const [scale,vscale]=facade.scale;
      const tintB=base.clone().multiplyScalar(.89);
      const walls=shellBatch(x,z,facade.material);
      const shell=(sx,sy,off,y0,y1,u0,buffer=walls)=>{
        const q=(dx,dy,h)=>p(dx*sx,dy*sy+off,h);
        for(const side of [-1,1]){
          const x0=side,x1=-side;
          buffer.quad(q(x0,-side,y0),q(x1,-side,y0),q(x1,-side,y1),q(x0,-side,y1),
            base,width*sx/scale,(y1-y0)/vscale,u0);
          buffer.quad(q(side,x0,y0),q(side,x1,y0),q(side,x1,y1),q(side,x0,y1),
            tintB,depth*sy/scale,(y1-y0)/vscale,u0);
        }
        if(y1>podium)roof.quad(q(-1,-1,y1),q(-1,1,y1),q(1,1,y1),q(1,-1,y1),tin?'#7f8d93':'#a29b8c');
      };
      const streetApartment=street&&!civic;
      if(streetApartment){
        shell(1,1,0,0,podium,0,shellBatch(x,z,'shop'));
        shell(1,1,0,podium,cut,Math.floor(hash(seed,7)*3)/3);
      }else shell(1,1,0,0,cut,hash(seed,7));
      const roofOffset=-(streetSide??0)*.25;
      if(setback)shell(.78,.75,roofOffset,cut,top,Math.floor(hash(seed,8)*3)/3);
      if(streetApartment)roofFixtures(oldRoofDetailBatch(x,z,'roofTop'),
        setback?(dx,dy,y)=>p(dx*.78,dy*.75+roofOffset,y):p,top,seed);
      if(street){
        const y=streetSide*1.004;
        textWall(storeBatch(x,z,'shop'),p(-1,y,.02),p(1,y,.02),p(1,y,3.6),p(-1,y,3.6),
          -uz*streetSide,ux*streetSide,'#fff',width/7,1,'infill');
        const left=p(-1,y*1.015,.025),right=p(1,y*1.015,.025),nx=-uz*streetSide,nz=ux*streetSide;
        // A24c A low commercial arcade has smaller stalls under its shared eave.
        const glazingBays=Math.max(1,Math.round(width/6.5));
        const sections=neon&&cut<7&&neonDistrict(x/unit,z/unit)?Math.ceil(width/4.8):glazingBays;
        // A24c Render one complete fascia for each actual infill shop section.
        neon?.frontage({x:(left[0]+right[0])/2,z:(left[2]+right[2])/2,nx,nz,width,top:cut,
          seed,owner:'infill/'+x+'/'+z,face:0,bays:sections,source:'infill',
          ends:[-streetSide+'/'+streetSide,streetSide+'/'+streetSide]});
        const doorKinds=[];
        for(let k=0;k<sections;k++){
          const lerp=t=>left.map((v,i)=>v+(right[i]-v)*t),l0=lerp(k/sections),r0=lerp((k+1)/sections);
          const glazingBay=Math.floor((k+.5)*glazingBays/sections); // A24c Retain the original chunk material batch.
          const kind='shop'+'abcdefghijkl'[Math.floor(hash(shop,seed+glazingBay*17+streetSide)*12)];
          const multi=kind<='shopf',uLen=neon?(multi?.25:1):width/sections/12;
          const uStart=neon?(multi?Math.floor(hash(seed,k+60)*4)*.25:0):
            sections>1?hash(seed,k+60)*Math.max(0,1-uLen):0;
          const doorTop=neon?3.52:5.2;
          doorKinds.push({kind,uLen,uStart});
          textWall((streetApartment||neon?oldStoreDetailBatch:storeBatch)(x,z,kind),l0,r0,[r0[0],doorTop,r0[2]],[l0[0],doorTop,l0[2]],nx,nz,'#fff',
            uLen,neon?.43:.82,'infill',uStart);
        }
        // A24c An exposed end facing a crossing street is the return of its corner tenant.
        if(neon)for(const side of [-1,1]){
          const end=p(side*1.004,0,.025),cnx=side*ux,cnz=side*uz;
          const sideFace=neon.frontage({x:end[0],z:end[2],nx:cnx,nz:cnz,width:depth,top:cut,
            seed:seed+side*17,owner:'infill/'+x+'/'+z,face:side,bays:1,source:'return',ends:[side+'/'+side,side+'/'+(-side)]});
          if(sideFace.size){
            const a=p(side*1.004,-1,.025),b=p(side*1.004,1,.025);
            // A24c The same corner tenant continues around the return using its existing material batch.
            const door=doorKinds[side<0?0:sections-1];
            textWall(oldStoreDetailBatch(x,z,door.kind),a,b,[b[0],3.52,b[2]],[a[0],3.52,a[2]],cnx,cnz,
              '#fff',door.uLen,.43,'infill',door.uStart);
          }
        }
        // A24 the covered floor uses the same bay as the roof and posts.
        if(local)continue; // Local covered bays use measured facade-to-road clearance.
        const [cx,,cz]=p(0,streetSide*1.17,0);
        storeInstance('metal','box','#a39984',cx,2.93,cz,width,.38,streetApartment?Math.max(1.12,depth*.18):1.12,-heading);
        storeInstance('glass','box','#8b9c90',cx,2.71,cz,width,.24,.13,-heading);
        for(const side of [-.8,-.27,.27,.8]){
          const [colX,,colZ]=p(side,streetSide*1.17,0);
          storeInstance('concrete','box','#bdb7a9',colX,1.4,colZ,.32,2.8,.32,-heading);
        }
      }
    }else if(lot==='motorcycleBay'){
      const paint=roadBatch(x,z,'line');
      for(let k=0;k<9;k++){
        const u=-.8+k*.19;
        paint.quad(p(u,-.75,-.07),p(u+.009,-.75,-.07),p(u+.009,-.41,-.07),p(u,-.41,-.07),'#d6d1c5');
      }
    }else if(lot==='parking'){
      for(let k=0;k<=5;k++){
        const dx=-1+2*k/5;
        roadBatch(x,z,'line').quad(p(dx-.012,-.85,-.07),p(dx+.012,-.85,-.07),p(dx+.012,.85,-.07),p(dx-.012,.85,-.07),'#e9e4d2');
      }
      for(let k=0;k<5;k++){
        const roll=hash(seed,k+70);
        if(roll>.62)continue;
        const [cx,,cz]=p(-1+(2*k+1)/5,.15,0),paint=['#c9ccd0','#2f3236','#9a2e2e','#e8e6df','#3f5b7a'][Math.floor(roll*8)%5];
        furnitureInstance('metal','box',paint,cx,.55,cz,4.3,.7,1.75,-heading+Math.PI/2);
        furnitureInstance('dark','box','#33383d',cx,1.15,cz,2.2,.5,1.55,-heading+Math.PI/2);
      }
      const [sx,,sz]=p(.9,-.75,0);
      furnitureInstance('metal','box','#5d6d6a',sx,1.2,sz,.1,2.4,.1,0);
    }else if(lot==='fence'){
      const wallTint='#8aa29a';
      furnitureInstance('metal','box',wallTint,...[p(0,-1,0)[0],.95,p(0,-1,0)[2]],width,1.9,.08,-heading);
      furnitureInstance('metal','box',wallTint,...[p(0,1,0)[0],.95,p(0,1,0)[2]],width,1.9,.08,-heading);
      furnitureInstance('metal','box',wallTint,...[p(-1,0,0)[0],.95,p(-1,0,0)[2]],.08,1.9,depth,-heading);
      furnitureInstance('metal','box',wallTint,...[p(1,0,0)[0],.95,p(1,0,0)[2]],.08,1.9,depth,-heading);
      const [mx,,mz]=p(.2,.1,0);
      furnitureInstance('concrete','box','#a9a396',mx,.4,mz,3.2,.8,2.4,-heading);
    }else if(tree||lot==='park'){
      placeTree(treeInstance,x,z,seed,.32);
      if(lot==='park'||civic){
        const [tx,,tz]=p(-.55,.5,0),[ux2,,uz2]=p(.5,-.5,0);
        placeTree(treeInstance,tx,tz,seed+5,.26);
        if(hash(seed,9)>.4)placeTree(treeInstance,ux2,uz2,seed+9,.24);
      }
      if((civic||lot==='park')&&width>8&&depth>6){
        const [bx,,bz]=p(0,.62,0),[px,,pz]=p(.58,-.62,0);
        furnitureInstance('metal','box','#81634d',bx,.48,bz,2.1,.12,.48,-heading);
        for(const offset of [-.61,.61]){
          furnitureInstance('metal','box','#615e56',bx+ux*offset,.23,bz+uz*offset,.11,.46,.41,-heading);
        }
        if(civic){
          furnitureInstance('concrete','box','#b8ad9a',px,.24,pz,1.72,.48,.92,-heading);
          treeInstance('grass','crown','#987467',px,.48,pz,1.60,.44,.85,-heading);
        }
      }
    }
  }
}
