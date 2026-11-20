import * as T from '../vendor/three.module.min.js';
import {roads,roadNodes,roadAt,metersPerUnit as unit} from '../world.mjs';
import {crossingForNode} from '../street-crossings.mjs';
import {canvasTexture,hash,shapes} from './city-primitives.js';
import {xinyiBusBay,addUtilityPoles} from './furniture.js';
const {plane}=shapes;
// Ground markings for known junctions below the signal generator's
// side-street width threshold. Each entry lists a side street and the
// intersecting OSM ways that receive markings.
const localCrossings=[
  [51797018,[268569312]], // 忠孝東路五段71巷 × 忠孝東路五段
  [1312735559,[289004414]], // 松壽路20巷 × 松廉路
  [323005092,[1335559363,1335559364]], // 松高路20巷 × 松壽路
];

function localCrossingNodes(){
  const keys=new Set(localCrossings.flatMap(([side,main])=>[side,...main]));
  const nodes=new Map([...keys].map(id=>[id,new Set()]));
  for(const [,,,,,{a,b,way}] of roads){
    const wayNodes=nodes.get(way.id);
    if(wayNodes){wayNodes.add(a);wayNodes.add(b);}
  }
  const result=new Map();
  for(const [side,main] of localCrossings){
    for(const id of main){
      for(const node of nodes.get(id)){
        if(!nodes.get(side).has(node))continue;
        if(!result.has(node))result.set(node,new Set());
        result.get(node).add(id);
      }
    }
  }
  return result;
}

export function createRoads({batch,furnitureInstance,doc,group,signs,enabled}) {
  const roadMarkMaterials=new Map();
  const strip=(a,b,span,y,kind,off=0,tint='#fff',uvScale=3,minLength=.1)=>{
    const ax=a[0]*unit,az=a[1]*unit,bx=b[0]*unit,bz=b[1]*unit;
    const len=Math.hypot(bx-ax,bz-az);
    if(len<minLength)return;
    const nx=-(bz-az)/len,nz=(bx-ax)/len,half=span/2;
    const p=(x,z,side)=>[x+nx*(side*half+off),y,z+nz*(side*half+off)];
    batch((ax+bx)*.5,(az+bz)*.5,kind).quad(p(ax,az,-1),p(bx,bz,-1),p(bx,bz,1),p(ax,az,1),tint,len/uvScale,span/uvScale);
  };
  function addRoadMark(arrows,x,z,heading){
    if(!enabled)return;
    if(!roadMarkMaterials.has(arrows)){
      const image=canvasTexture(doc,256,128,(ctx,w,h)=>{
        ctx.font='bold 76px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle='#e5dfcb';
        if(arrows==='scooter'){
          ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=9;ctx.beginPath();
          for(const x of [83,173]){ctx.moveTo(x+16,84);ctx.arc(x,84,16,0,Math.PI*2);}
          ctx.moveTo(83,84);ctx.lineTo(154,84);ctx.lineTo(173,54);ctx.lineTo(160,40);
          ctx.lineTo(191,40);ctx.moveTo(86,53);ctx.lineTo(123,53);ctx.stroke();
        }else ctx.fillText(arrows,w/2,h/2,w*.94);
      });
      roadMarkMaterials.set(arrows,new T.MeshBasicMaterial({map:image,transparent:true,depthWrite:false}));
    }
    const mark=new T.Mesh(plane,roadMarkMaterials.get(arrows));
    mark.position.set(x,.078,z);mark.rotation.set(-Math.PI/2,0,-heading-Math.PI/2,'YXZ');
    mark.scale.set(arrows==='scooter'?1.4:2.25,arrows==='↑'?2.0:1.30,1);
    mark.userData.roadMark=true;group.add(mark);signs.push(mark);
  }
  return {strip,addRoadMark, build(){
    const busMark=xinyiBusBay(10,-1.66);
    addRoadMark('公車專用',busMark.x,busMark.z,busMark.heading);
    const reverseBusMark=xinyiBusBay(10,-1.66,true);
    addRoadMark('公車專用',reverseBusMark.x,reverseBusMark.z,reverseBusMark.heading);
    for(const reverse of [false,true]){
      // Mark the mapped bay approach. The furniture module supplies the same
      // carriageway alignment for the shelter and its platform.
      const start=xinyiBusBay(-10,-3.12,reverse),end=xinyiBusBay(28,-3.12,reverse);
      strip([start.x/unit,start.z/unit],[end.x/unit,end.z/unit],.13,.051,'line',0,'#ede8da');
      for(const [offset,label] of [[18,'40'],[25,'↑']]){
        const point=xinyiBusBay(offset,-1.66,reverse);
        addRoadMark(label,point.x,point.z,point.heading);
      }
    }
    const covers=new Set(),localNodes=localCrossingNodes();
    for(const [ax,ay,bx,by,w,{a:from,b:to,way,forward,reverse}] of roads) {
      const a=[ax,ay],b=[bx,by],span=w*unit;
      if(way.kind==='pedestrian') {strip(a,b,span,.07,'paving');continue;}
      const d=Math.hypot(bx-ax,by-ay),length=d*unit;
      const at=t=>[ax+(bx-ax)*t/d,ay+(by-ay)*t/d];
      const paint=(start,end,width,y,kind,offset,tint,uvScale)=>{
        if(end>start+.01)strip(at(start/unit),at(end/unit),width,y,kind,offset,tint,uvScale,.01);
      };
      const arterial=['primary','secondary','tertiary'].includes(way.kind);
      const asphalt=hash(way.id,31)>.55?'#dedcda':'#f3efeb';
      strip(a,b,span,.02,'road',0,asphalt,4.2);
      const crossingFrom=crossingForNode.get(from)?.approaches.find(arm=>arm.to===to);
      const crossingTo=crossingForNode.get(to)?.approaches.find(arm=>arm.to===from);
      const localFrom=!crossingFrom&&localNodes.get(from)?.has(way.id);
      const localTo=!crossingTo&&localNodes.get(to)?.has(way.id);
      const start=crossingFrom?.arrow??(localFrom?Math.min(length,forward&&!reverse?7:13):0);
      const end=length-(crossingTo?.arrow??(localTo?Math.min(length,13):0));
      const twoWay=forward&&reverse;
      const laneCount=Math.max(1,Math.round(span/(twoWay?6.2:3.1)));
      for(const [local,inbound,atStart] of [[localFrom,reverse,true],[localTo,forward,false]]){
        if(!local||length<7)continue;
        const across=(near,far,width,offset,tint)=>{
          const range=atStart?[near,far]:[length-far,length-near];
          paint(...range,width,.073,'line',offset,tint);
        };
        const crossingStart=4.9,crossingEnd=6.9;
        const stripes=Math.floor((span-.68)/1.6);
        for(let n=-stripes;n<=stripes;n++){
          across(crossingStart,crossingEnd,.40,n*.80,hash(from,n+80)>.24?'#f3ecdb':'#d0c9ba');
        }
        if(!inbound)continue;
        const offset=twoWay?span*.25*(atStart?-1:1):0;
        const approachWidth=(twoWay?span/2:span)-.28;
        const waitForScooters=arterial&&span>=8;
        const stop=waitForScooters?11.2:8.5;
        if(length<stop+.7)continue;
        across(stop,stop+.34,approachWidth,offset,'#f4eddf');
        if(!waitForScooters)continue;
        const boxStart=8.3,boxEnd=10.9,boxWidth=Math.min(approachWidth,span*.48);
        for(const side of [-1,1]){
          across(boxStart,boxEnd,.11,offset+side*boxWidth/2,'#e5dfd1');
        }
        for(const t of [boxStart,boxEnd])across(t,t+.11,boxWidth,offset,'#e5dfd1');
        const heading=Math.atan2(by-ay,bx-ax);
        const [px,pz]=at((atStart?9.6:length-9.6)/unit);
        addRoadMark('scooter',px*unit-Math.sin(heading)*offset,pz*unit+Math.cos(heading)*offset,
          heading+(atStart?Math.PI:0));
        if(length>=17){
          const [x,z]=at((atStart?14.5:length-14.5)/unit);
          addRoadMark('↑',x*unit-Math.sin(heading)*offset,z*unit+Math.cos(heading)*offset,
            heading+(atStart?Math.PI:0));
        }
      }
      const tactile=way.name==='松壽路'||way.name==='菸廠路';
      for(const side of [-1,1]){
        strip(a,b,1.6,.050,'paving',side*(span/2+.77),'#fff',2.6);
        strip(a,b,.14,.059,'curb',side*(span/2+.06),'#eee7d9');
        if(tactile&&length>5){
          paint(.4,length-.4,.28,.055,'paving',side*(span/2+.91),'#dcc17c',.56);
        }
        if(length<=11||!way.name)continue;
        const roadEdge=side*(span/2-.22);
        strip(a,b,.06,.028,'curb',side*(span/2-.05),'#55595a');
        const fromJunction=crossingFrom||localFrom,toJunction=crossingTo||localTo;
        if(arterial&&way.kind!=='tertiary'&&way.name!=='忠孝東路五段'){
          paint(.45,length-.45,.10,.039,'line',roadEdge,'#d86c5d');
        }else{
          if(fromJunction)paint(.45,Math.min(length-.45,9),.10,.039,'line',roadEdge,'#d86c5d');
          if(toJunction)paint(Math.max(fromJunction?9:.45,length-9),length-.45,.10,.039,'line',roadEdge,'#d86c5d');
        }
        if(length>18&&hash(way.id,side+41)>.48){
          const drainAt=length*(.32+.33*hash(from,side+55));
          paint(drainAt,drainAt+.48,.27,.040,'curb',side*(span/2-.17),'#3a3c3d');
          for(let bar=1;bar<5;bar++){
            const t=drainAt+bar*.096;
            paint(t,t+.023,.22,.043,'curb',side*(span/2-.17),'#777671');
          }
        }
      }
      if(span>4.8&&twoWay){
        if(arterial&&span>9){
          for(const offset of [-.125,.125])paint(start,end,.10,.035,'line',offset,'#d4ae53');
        }else for(let t=start+.4;t<end-.2;t+=8){
          paint(t,Math.min(end,t+3.8),.10,.036,'line',0,'#d6b96e');
        }
      }
      if((arterial||way.name==='菸廠路')&&laneCount>1){
        const laneWidth=span/(twoWay?laneCount*2:laneCount);
        for(let lane=1;lane<laneCount;lane++){
          const offsets=twoWay?[-lane*laneWidth,lane*laneWidth]:[lane*laneWidth-span/2];
          for(const offset of offsets){
            const stopFrom=crossingFrom?Math.min(end,start+15):start;
            const stopTo=crossingTo?Math.max(stopFrom,end-15):end;
            paint(start,stopFrom,.10,.043,'line',offset,'#e6dfd0');
            paint(stopTo,end,.10,.043,'line',offset,'#e6dfd0');
            for(let t=stopFrom;t<stopTo;t+=10){
              const tint=hash(from,Math.round(t)+61)>.22?'#ede7d8':'#c8c2b4';
              paint(t,Math.min(stopTo,t+4),.10,.043,'line',offset,tint);
            }
          }
        }
      }
      if(length>18&&way.layer===0&&way.name){
        // Broad, low-contrast wear reads through the existing asphalt map.
        const wearStart=Math.max(1,start),wearEnd=Math.min(length-1,end);
        for(const side of [-1,1]){
          paint(wearStart,wearEnd,Math.min(.46,span*.10),.025,'road',side*span*.30,'#d4d2cf',4.2);
        }
        const seamAt=length*(.29+.36*hash(from,47));
        if(hash(from,48)>.50)paint(seamAt,seamAt+.05,span*.88,.028,'road',0,'#a5a19d');
        const patchAt=length*(.28+.31*hash(from,51));
        const patchEnd=patchAt+1.3+hash(from,50)*2.5;
        const patchOffset=(hash(from,52)-.5)*span*.55;
        if(hash(from,53)>.27&&patchEnd<length-2){
          const patchWidth=1+hash(from,54)*1.1;
          paint(patchAt-.06,patchEnd+.06,patchWidth+.12,.030,'road',patchOffset,'#918a85');
          paint(patchAt,patchEnd,patchWidth,.031,'road',patchOffset,hash(from,55)>.4?'#b7b2ae':'#d5ccc1',3);
        }
      }
      if(way.name&&!arterial&&d*unit>25&&(span<9)){
        addUtilityPoles({instance:furnitureInstance,way,by,ay,bx,ax,span,d,at});
      }
      if(length>17&&way.name&&hash(from,67)>.65){
        const t=length*(.44+.22*hash(from,68)),pt=at(t/unit);
        const offset=(hash(from,69)-.5)*span*.32,heading=Math.atan2(by-ay,bx-ax);
        const x=pt[0]*unit-Math.sin(heading)*offset,z=pt[1]*unit+Math.cos(heading)*offset;
        const key=Math.floor(x/9)+','+Math.floor(z/9);
        if(!covers.has(key)){
          covers.add(key);
          const buf=batch(x,z,'road');
          for(const [radius,y,tint] of [[.44,.032,'#a59f98'],[.345,.036,'#6a6864'],[.296,.040,'#afa89b']]){
            for(let i=0;i<10;i++){
              const a=i*Math.PI/5,b=a+Math.PI/5;
              const ax=radius*Math.cos(a),az=radius*Math.sin(a);
              const bx=radius*Math.cos(b),bz=radius*Math.sin(b);
              buf.triangle([x,y,z],[x+bx,y,z+bz],[x+ax,y,z+az],tint,
                [.5,.5],[.5+bx/4.2,.5+bz/4.2],[.5+ax/4.2,.5+az/4.2]);
            }
          }
          for(const off of [-.12,-.04,.04,.12]){
            paint(t+off,t+off+.022,.35,.044,'road',offset,'#6a6764');
          }
        }
      }
    }
    // A cap closes the asphalt wedge between angled OSM segments.
    for(const n of roadNodes){
      if(n.around.length<2||!n.out.length)continue;
      const x=n.x*unit,z=n.y*unit,w=Math.max(...n.out.map(e=>e.w))*unit*.49;
      const buf=batch(x,z,'road'),y=.024,uv=(dx,dz)=>[(x+dx)/4.2,(z+dz)/4.2];
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,b=a+Math.PI/4;
        const ax=w*Math.cos(a),az=w*Math.sin(a),bx=w*Math.cos(b),bz=w*Math.sin(b);
        buf.triangle([x,y,z],[x+bx,y,z+bz],[x+ax,y,z+az],'#f1efed',uv(0,0),uv(bx,bz),uv(ax,az));
      }
    }
  }};
}

export function paveFront(batch,ax,az,bx,bz,nx,nz,length,maxDepth=10) {
  const mx=(ax+bx)/2,mz=(az+bz)/2;
  for(let d=.5;d<=maxDepth;d+=.25){
    if(!roadAt((mx+nx*d)/unit,(mz+nz*d)/unit,-.25/unit))continue;
    const edge=Math.max(.15,d-.37);
    batch(mx,mz,'paving').quad([ax,.047,az],[bx,.047,bz],
      [bx+nx*edge,.047,bz+nz*edge],[ax+nx*edge,.047,az+nz*edge],'#e7dfd1',length/3,edge/3);
    break;
  }
}
