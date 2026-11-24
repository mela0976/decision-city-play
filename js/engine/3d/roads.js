import * as T from '../vendor/three.module.min.js?v=fced202e';
import {roads,roadNodes,roadAt,roadOptions,inWuxing,toWorld,metersPerUnit as unit} from '../world.mjs?v=fced202e';
import {crossingForNode} from '../street-crossings.mjs?v=fced202e';
import {canvasTexture,hash,shapes} from './city-primitives.js?v=fced202e';
import {xinyiBusBay} from './furniture.js?v=fced202e';
import {paintJunctions} from './junction-markings.js?v=fced202e'; // A24

import {drawSidewalks} from './sidewalks.js?v=fced202e'; // A24
const {plane}=shapes;
const BUS_ROADS=new Set(['忠孝東路四段','忠孝東路五段','仁愛路四段','信義路四段','信義路五段','南京東路五段']);
export function createRoads({batch,furnitureInstance,doc,group,signs,enabled,sidewalks=drawSidewalks}) { // P2 perf：osm-city 可改成先保留位置、稍後才畫人行道
  const roadMarkMaterials=new Map(),symbols=new Map(); // A24
  const strip=(a,b,span,y,kind,off=0,tint='#fff',uvScale=3,minLength=.1)=>{
    const ax=a[0]*unit,az=a[1]*unit,bx=b[0]*unit,bz=b[1]*unit;
    const len=Math.hypot(bx-ax,bz-az);
    if(len<minLength)return;
    // A23 alleys: the asphalt surface at .02 m wins where a parking pad or footway crosses a driveway.
    if(kind==='paving'&&inWuxing((a[0]+b[0])/2,(a[1]+b[1])/2))y=Math.min(y,.015);
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
    if(arrows==='scooter'||arrows==='慢'||arrows==='公車專用'||arrows==='↑'){ // 公車專用也批次畫，大道上上百個不要各佔一次繪製
      if(!symbols.has(arrows))symbols.set(arrows,[]);
      mark.updateMatrix();symbols.get(arrows).push(mark.matrix);return;
    }
    mark.userData.roadMark=true;group.add(mark);signs.push(mark);
  }
  return {strip,addRoadMark, build(){
    if(enabled)sidewalks(batch); // A24 raised street and arcade decks
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
    // Stop each apron at the edge of its intersecting carriageway, including one-way incoming edges.
    const joints=new Map();
    for(const [ax,ay,bx,by,w,{a,b,way}] of roads){
      if(way.layer!==0||!inWuxing((ax+bx)/2,(ay+by)/2))continue;
      const length=Math.hypot(bx-ax,by-ay);
      for(const node of [a,b]){
        if(!joints.has(node))joints.set(node,[]);
        joints.get(node).push({dx:(bx-ax)/length,dy:(by-ay)/length,half:w*unit/2});
      }
    }
    // 全部路口（不只吳興街一帶）：三條以上道路交會的點，標線要在路口邊緣停筆，不要畫進交叉道路的路面
    const allJoints=new Map();
    for(const [ax,ay,bx,by,w,{a,b,way}] of roads){
      if(way.layer!==0||way.kind==='pedestrian')continue;
      const length=Math.hypot(bx-ax,by-ay);
      for(const node of [a,b]){
        if(!allJoints.has(node))allJoints.set(node,[]);
        allJoints.get(node).push({dx:(bx-ax)/length,dy:(by-ay)/length,half:w*unit/2});
      }
    }
    const convenience=toWorld(25.035928,121.567773);
    const covers=new Set();
    paintJunctions(strip,addRoadMark); // A24
    for(const [name,matrices] of symbols){
      const mesh=new T.InstancedMesh(plane,roadMarkMaterials.get(name),matrices.length);
      matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
      mesh.computeBoundingSphere();group.add(mesh);
    }
    for(const [ax,ay,bx,by,w,{a:from,b:to,way,forward,reverse}] of roads) {
      const a=[ax,ay],b=[bx,by],span=w*unit;
      if(way.kind==='pedestrian') {strip(a,b,span,-.008,'paving'); // A24 footways pass below intersecting asphalt
        continue;}
      const d=Math.hypot(bx-ax,by-ay),length=d*unit;
      const at=t=>[ax+(bx-ax)*t/d,ay+(by-ay)*t/d];
      const paint=(start,end,width,y,kind,offset,tint,uvScale)=>{
        if(end>start+.01)strip(at(start/unit),at(end/unit),width,y,kind,offset,tint,uvScale,.01);
      };
      const local=inWuxing((ax+bx)/2,(ay+by)/2)&&way.layer===0;
      const narrow=local&&span<=8;
      const shopFront=way.id===1335559363&&Math.hypot((ax+bx)/2-convenience.x,(ay+by)/2-convenience.y)*unit<38;
      const arterial=['primary','secondary','tertiary'].includes(way.kind);
      const asphalt=hash(way.id,31)>.55?'#dedcda':'#f3efeb';
      strip(a,b,span,.02,'road',0,asphalt,4.2);
      const crossingFrom=crossingForNode.get(from)?.approaches.find(arm=>arm.from===from&&arm.to===to);
      const crossingTo=crossingForNode.get(to)?.approaches.find(arm=>arm.from===to&&arm.to===from);
      const start=crossingFrom?.arrow??0,end=length-(crossingTo?.arrow??0);
      const twoWay=forward&&reverse;
      const laneCount=Math.max(1,Math.round(span/(twoWay?6.2:3.1)));
      const clearance=node=>{
        const arms=joints.get(node);
        if(!arms||arms.length<3)return 0;
        let stop=0;
        for(const arm of arms){
          const cross=Math.abs((bx-ax)/d*arm.dy-(by-ay)/d*arm.dx);
          if(cross>.4)stop=Math.max(stop,arm.half/cross);
        }
        return stop;
      };
      const kerbStart=local?clearance(from):0,kerbEnd=local?length-clearance(to):length;
      const mouth=node=>{
        const arms=allJoints.get(node);
        if(!arms||arms.length<3)return 0;
        let stop=0;
        for(const arm of arms){
          const cross=Math.abs((bx-ax)/d*arm.dy-(by-ay)/d*arm.dx);
          if(cross>.4)stop=Math.max(stop,arm.half/cross);
        }
        return Math.min(stop,length/2);
      };
      const lineFrom=Math.max(start,mouth(from)),lineTo=Math.min(end,length-mouth(to));
      // A24 raised paving and curb profiles are submitted by drawSidewalks.
      for(const side of [-1,1]){
        // The Songshou convenience store faces a paved forecourt. Wuxing alleys share the lane with pedestrians.
        if(shopFront&&side===-1)strip(a,b,7.6,.012,'paving',side*(span/2+3.8),'#d2ccc0',2.8);
        if(local){
          if(narrow||way.name==='吳興街'){
            // Flush scooter apron below the road, with parallel bays behind the drainage channel.
            paint(kerbStart,kerbEnd,3.2,-.040,'road',side*(span/2+1.6),'#b6ada2',4.2);
            for(let t=kerbStart+2;t+5<kerbEnd;t+=9){
              const [px,py]=at((t+2.4)/unit),off=side*(span/2+1.7)/unit;
              if(roadAt(px-(by-ay)/d*off,py+(bx-ax)/d*off))continue;
              paint(t,t+4.8,.065,-.024,'line',side*(span/2+.67),'#dcd6c6');
              for(let k=0;k<=4;k++)paint(t+k*1.18,t+k*1.18+.062,1.64,-.024,'line',side*(span/2+1.49),'#dcd6c6');
            }
          }
        }
        if(length<=11||!way.name)continue;
        const roadEdge=side*(span/2-.22);
        strip(a,b,.06,.028,'curb',side*(span/2-.05),'#55595a');
        const fromJunction=crossingFrom,toJunction=crossingTo;
        if(arterial&&way.kind!=='tertiary'&&way.name!=='忠孝東路五段'){
          paint(lineFrom+.45,lineTo-.45,.10,.039,'line',roadEdge,'#d86c5d');
        }else{
          if(fromJunction)paint(lineFrom+.45,Math.min(lineTo-.45,lineFrom+9),.10,.039,'line',roadEdge,'#d86c5d');
          if(toJunction)paint(Math.max(fromJunction?lineFrom+9:lineFrom+.45,lineTo-9),lineTo-.45,.10,.039,'line',roadEdge,'#d86c5d');
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
      if(span>4.8&&twoWay&&!narrow){
        if(arterial&&span>9){
          for(const offset of [-.125,.125])paint(lineFrom,lineTo,.10,.035,'line',offset,'#d4ae53');
        }else for(let t=lineFrom+.4;t<lineTo-.2;t+=8){
          paint(t,Math.min(lineTo,t+3.8),.10,.036,'line',0,'#d6b96e');
        }
      }
      // 公車專用道：台北這幾條大道在分隔島那一側的內車道是公車專用道（黃實線＋「公車專用」）。
      // 只畫在已經分成兩條單向車道、至少三線的路段；分隔島在哪一側，看哪一側有同名的另一條車道。
      if(BUS_ROADS.has(way.name)&&forward!==reverse&&span>=9&&lineTo-lineFrom>20){
        const mid=at(length/2/unit),nx=-(by-ay)/d,ny=(bx-ax)/d;
        const sameNameAt=side=>roadOptions(mid[0]+nx*side*(span/2+5)/unit,mid[1]+ny*side*(span/2+5)/unit,6)
          .some(o=>o.r[5].way.name===way.name&&o.r[5].way.id!==way.id&&o.d*unit<4);
        const median=sameNameAt(1)?1:sameNameAt(-1)?-1:0;
        if(median){
          const laneW=span/laneCount,inner=median*(span/2-laneW);
          paint(lineFrom+1,lineTo-1,.15,.046,'line',inner,'#d9b442');
          const travel=forward?Math.atan2(by-ay,bx-ax):Math.atan2(ay-by,ax-bx);
          for(let t=lineFrom+18;t<lineTo-12;t+=60){
            const q=at(t/unit),off=median*(span/2-laneW/2)/unit;
            addRoadMark('公車專用',(q[0]+nx*off)*unit,(q[1]+ny*off)*unit,travel);
          }
        }
      }
      if((arterial||way.name==='菸廠路')&&laneCount>1){
        const laneWidth=span/(twoWay?laneCount*2:laneCount);
        for(let lane=1;lane<laneCount;lane++){
          const offsets=twoWay?[-lane*laneWidth,lane*laneWidth]:[lane*laneWidth-span/2];
          for(const offset of offsets){
            const stopFrom=crossingFrom?Math.min(lineTo,lineFrom+15):lineFrom;
            const stopTo=crossingTo?Math.max(stopFrom,lineTo-15):lineTo;
            paint(lineFrom,stopFrom,.10,.043,'line',offset,'#e6dfd0');
            paint(stopTo,lineTo,.10,.043,'line',offset,'#e6dfd0');
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
      // 信義區電線已地下化：不畫電線桿與電線（2026-11-24）
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
