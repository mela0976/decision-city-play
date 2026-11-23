import { byId, civicWalkway, height, locations, river, roads, water, width } from './world.mjs?v=f213092';

const ink='#242b30';
const paper='#fff2cd';
const markerColors={mission:'#f8ca55',book:'#70c9fa',npc:'#f589a7',home:'#9ddc7c',egg:'#d0a4f1',side:'#59e2cf'};
function box(ctx,x,y,w,h,color,edge=ink) {
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w,h);
  if (edge) {
    ctx.strokeStyle=edge;
    ctx.lineWidth=2;
    ctx.strokeRect(x,y,w,h);
  }
}
function line(ctx,points,color,size) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle=color;
  ctx.lineWidth=size;
  ctx.stroke();
}
function polygon(ctx,points,color,edge=ink) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fillStyle=color;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle=edge;
    ctx.lineWidth=2;
    ctx.stroke();
  }
}
function dot(ctx,x,y,r,color,edge) {
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle=color;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle=edge;
    ctx.lineWidth=2;
    ctx.stroke();
  }
}
function text(ctx,value,x,y,size,color=ink,weight=700) {
  ctx.font=`${weight} ${size}px system-ui, sans-serif`;
  ctx.textBaseline='middle';
  ctx.fillStyle=color;
  ctx.fillText(value,x,y);
}
function arrow(ctx,x,y,angle,color) {
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  polygon(ctx,[[13,0],[-8,-8],[-4,0],[-8,8]],color);
  ctx.restore();
}
export function surface(canvas,ctx) {
  const rect=canvas.getBoundingClientRect();
  const w=Math.round(rect.width),h=Math.round(rect.height);
  if (!w || !h) return null;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const bw=Math.round(w*dpr),bh=Math.round(h*dpr);
  if (canvas.width!==bw) canvas.width=bw;
  if (canvas.height!==bh) canvas.height=bh;
  ctx.setTransform(bw/w,0,0,bh/h,0,0);
  return {w,h};
}

export function createMapRenderer(minimapCanvas) {
  const map=minimapCanvas.getContext("2d",{alpha:false});
  let base=null,baseKey=null;
  return function drawMap(state) {
    const size=surface(minimapCanvas,map);
    if (!size) return;
    const {w,h}=size;
    const margin=state.largeMap?18:7;
    const scale=Math.min((w-margin*2)/width,(h-margin*2)/height);
    if (scale<=0) return;
    const ox=(w-width*scale)/2, oy=(h-height*scale)/2;
    const point=(x,y)=>[ox+x*scale,oy+y*scale];
    const key=w+','+h+','+Number(state.largeMap)+','+minimapCanvas.width;
    if (key!==baseKey) {
      baseKey=key;
      base=new OffscreenCanvas(minimapCanvas.width,minimapCanvas.height);
      const bg=base.getContext('2d',{alpha:false});
      bg.setTransform(base.width/w,0,0,base.height/h,0,0);
      box(bg,0,0,w,h,'#17272e',null);
      box(bg,ox,oy,width*scale,height*scale,'#41483f',null);
      for(const w of water) {
        if(w.points.length<2)continue;
        const pts=w.points.map(p=>point(p.x,p.y));
        if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.32 && pts.length>4) polygon(bg,pts,'#408399',null);
        else if(w.name==='基隆河')line(bg,pts,'#408399',Math.max(1,900*scale));
      }
      line(bg,[point(civicWalkway.x,civicWalkway.y0),point(civicWalkway.x,civicWalkway.y1)],'#8aa88b',1.7);
      for (const [x,y,bx,by,rw] of roads) line(bg,[point(x,y),point(bx,by)],'#a49479',Math.max(1,rw*scale));
    }
    map.drawImage(base,0,0,w,h);
    if(state.flyover){
      const destination=state.flyover.location;
      dot(map,...point(destination.x,destination.y),4,'#f3c957',ink);
      return;
    }
    for (const location of locations) dot(map,...point(location.x,location.y),state.largeMap?3:2,paper);
    const markerSites=new Map();
    for(const marker of state.markers){
      const loc=byId.get(marker.locationId);
      if(!loc)continue;
      let kinds=markerSites.get(loc);
      if(!kinds)markerSites.set(loc,kinds=new Set());
      kinds.add(marker.kind);
    }
    for(const [loc,kinds] of markerSites){
      const [x,y]=point(loc.x,loc.y),r=state.largeMap?6:3.5;
      for(const kind of kinds) {
        if(kind==='side'){
          const dx=kinds.size>1?r*1.45:0;
          polygon(map,[[x+dx,y-r],[x+dx-r,y+r],[x+dx+r,y+r]],markerColors.side,ink);
        }else dot(map,x-(kinds.has('side')?r:0),y,r,markerColors[kind]??paper,ink);
      }
    }
    const player=point(state.player.x,state.player.y);
    if (state.target) {
      const target=point(state.target.x,state.target.y);
      map.setLineDash([4,4]);
      line(map,[player,target],'#f3c957',1.5);
      map.setLineDash([]);
      const angle=Math.atan2(target[1]-player[1],target[0]-player[0]);
      arrow(map,...target,angle,'#f3c957');
    }
    arrow(map,...player,state.player.heading,'#78ebd1');
  }
}
export function drawTouch(ctx,w,h,state) {
  if(!state.touch)return;
  const c=touchControls(w,h,state.insets,state.googleInset);
  dot(ctx,c.x,c.y,c.radius,'#14273195','#f9e7ba');
  dot(ctx,c.x+state.joy.x*c.radius*.68,c.y+state.joy.y*c.radius*.68,c.radius*.36,'#ecd8a8',ink);
  dot(ctx,c.auto,c.flightY,c.small,state.player.vehicle==='flyingTesla'?'#13889bdb':'#142731d8','#f9e7ba');
  dot(ctx,c.auto,c.y,c.small,'#142731d8','#f9e7ba');
  dot(ctx,c.interact,c.y,c.big,'#142731d8','#f9e7ba');
  ctx.textAlign='center';
  // A26 解鎖前按鈕照樣顯示（點了會提示第五個任務後解鎖），但畫成灰色，看得出還不能用
  const carLocked=!state.carUnlocked;
  if(carLocked)ctx.globalAlpha=.45;
  dot(ctx,c.interact,c.carY,c.carRadius,state.player.mode==='car'?'#13889bdb':'#142731d8',carLocked?'#9a9a9a':'#f9e7ba');
  text(ctx,'🚗',c.interact,c.carY,20,paper);
  if(carLocked)ctx.globalAlpha=1;
  text(ctx,'T',c.auto,c.flightY,c.small*.9,paper);
  text(ctx,'➤',c.auto,c.y,c.small*.9,paper);
  text(ctx,'●',c.interact,c.y,c.big*.60,paper);
  ctx.textAlign='left';
}
export function touchControls(w,h,[,right=0,bottom=0,left=0]=[],extra=0) {
  const radius=Math.max(29,Math.min(42,Math.min(w,h)*.087));
  const reserve=Math.max(extra, h>w?90:74);
  const y=h-bottom-reserve-radius-19,flightY=h-bottom-reserve-radius*2.45-26;
  const carRadius=22,carY=Math.min(flightY,y-radius*.90-4-carRadius-1); // A26 include the action button's hit padding.
  return {x:left+radius+20,y,radius,carRadius,carY,
    auto:w-right-radius*2.45-30,interact:w-right-radius*.90-15,
    flightY,small:radius*.55,big:radius*.90};
}
