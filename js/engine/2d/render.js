import {createMapRenderer,drawTouch} from '../overlay.js?v=3b7de7a7';
import {createWindshield} from './windshield.js?v=3b7de7a7'; // A26
import {placeLabel,uiLabel} from '../labels.mjs?v=3b7de7a7'; // i18n
import { buildings, byId, columns, height, locations, random, river, roads, rows, water, width } from '../world.mjs?v=3b7de7a7';

const ink='#242b30';
const paper='#fff2cd';
const tileSize=512;
const markerColors={mission:'#f8ca55',book:'#70c9fa',npc:'#f589a7',home:'#9ddc7c',egg:'#d0a4f1',side:'#59e2cf'};
const outfits={ae:'#51beb1',planner:'#e6aa59',media:'#37a1dc',creative:'#e77898',data:'#928ada',cx:'#b6ca61',
  grandma:'#cf6f89',npc_grandma:'#cf6f89',npc_client:'#849ad6',npc_boss:'#4e6781',npc_colleague:'#57ba95',
  npc_vendor:'#ef9a5b',npc_student:'#75b9cf',npc_elder:'#ad9374',npc_rider:'#efcb54'};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

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
function label(ctx,value,x,y,color=paper,size=13,maxWidth=320) {
  ctx.font=`700 ${size}px system-ui, sans-serif`;
  const w=Math.min(maxWidth,ctx.measureText(value).width)+14;
  box(ctx,x-w/2+3,y+3,w,size+10,ink,null);
  box(ctx,x-w/2,y,w,size+10,color);
  ctx.textBaseline='middle';
  ctx.fillStyle=ink;
  ctx.textAlign='center';
  ctx.fillText(value,x,y+(size+10)/2,w-14);
  ctx.textAlign='left';
}
function tree(ctx,x,y,seed) {
  dot(ctx,x+5,y+5,15,'#51594955');
  dot(ctx,x,y,14,'#447e69',ink);
  dot(ctx,x-4,y-4,9,'#82ab65');
  dot(ctx,x+3,y+2,3,'#d1cc84');
}
function scooter(ctx,x,y,heading,color,grandma=false) {
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(heading);
  if (grandma) {
    for (const ax of [-10,9]) for (const ay of [-8,5]) box(ctx,ax,ay,6,4,ink,null);
    box(ctx,-13,-7,28,14,'#a95c82');
    box(ctx,6,-6,9,12,'#c19962');
    line(ctx,[[8,-5],[8,5]],'#f3db91',2);
  } else {
    box(ctx,-13,-3,27,6,ink,null);
    box(ctx,-10,-5,21,10,color);
    box(ctx,5,-7,3,14,ink,null);
  }
  box(ctx,-11,-4,4,8,'#ea6757',null);
  dot(ctx,12,0,3,paper);
  ctx.restore();
}
function zebra(ctx,x,y,vertical) {
  ctx.save();
  ctx.translate(x,y);
  if (vertical) ctx.rotate(Math.PI/2);
  for (let dy=-42;dy<44;dy+=11) box(ctx,-10,dy,20,5,'#f3e4c0',null);
  ctx.restore();
}
function ground(ctx,left,top) {
  box(ctx,left,top,tileSize,tileSize,'#d8c7a6',null);
  for (let y=top+5;y<top+tileSize;y+=11) for (let x=left+5;x<left+tileSize;x+=11) {
    if (random(x+31*y)>0.37) box(ctx,x,y,1.3,1.3,'#73594b35',null);
  }
  for(const object of water) {
    const points=object.points;
    if(points.length<2)continue;
    if(!points.some(p=>p.x>left-800&&p.x<left+tileSize+800&&p.y>top-800&&p.y<top+tileSize+800))continue;
    const pts=points.map(p=>[p.x,p.y]);
    if(points.length>4 && Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<2)polygon(ctx,pts,'#528da4',null);
    else if(object.name==='基隆河')line(ctx,pts,'#528da4',1040);
  }
  const visibleRoads=roads.filter(([ax,ay,bx,by,w])=>Math.max(ax,bx)>=left-w && Math.min(ax,bx)<=left+tileSize+w
    && Math.max(ay,by)>=top-w && Math.min(ay,by)<=top+tileSize+w);
  ctx.lineCap='round';
  for (const [ax,ay,bx,by,w] of visibleRoads) line(ctx,[[ax,ay],[bx,by]],'#ead8b5',w+25);
  for (const [ax,ay,bx,by,w] of visibleRoads) line(ctx,[[ax,ay],[bx,by]],ink,w+3);
  for (const [ax,ay,bx,by,w] of visibleRoads) line(ctx,[[ax,ay],[bx,by]],'#656f72',w);
  for (const [ax,ay,bx,by] of visibleRoads) {
    ctx.setLineDash([16,18]);
    line(ctx,[[ax,ay],[bx,by]],'#e8c777',2);
    ctx.setLineDash([]);
  }
  ctx.lineCap='butt';
  for (const x of columns) for (const y of rows) {
    box(ctx,x-63,y-58,126,116,'#656f72',null);
    for (const offset of [-77,77]) {
      zebra(ctx,x+offset,y,false);
      zebra(ctx,x,y+offset,true);
    }
    for (const dx of [-85,85]) for (const dy of [-85,85]) tree(ctx,x+dx,y+dy,x+y+dx+dy);
  }
  for (const b of buildings) {
    if (b.x+b.w+35<left || b.x-30>left+tileSize || b.y+b.h+35<top || b.y-45>top+tileSize) continue;
    box(ctx,b.x-6,b.y-12,b.w+12,b.h+22,'#e8d9b9',null);
    line(ctx,[[b.x-6,b.y-11],[b.x+b.w+6,b.y-11]],'#a38d75',1);
    const parkY=b.y-20;
    if (b.id || random(b.x+b.y)>0.73) {
      for (let i=0;i<5;i++) {
        const px=b.x+14+i*21;
        line(ctx,[[px-8,parkY-12],[px-8,parkY+8],[px+8,parkY+8]],'#fcede0',1);
        if (random(px*11+b.y)>0.22) scooter(ctx,px,parkY,Math.PI/2,b.color);
      }
    }
    if (b.id==='night_market' || b.id==='rechao' || b.id==='breakfast') {
      for (let i=0;i<3;i++) {
        const x=b.x+b.w+12,y=b.y+i*31;
        box(ctx,x,y,27,22,i%2?'#f3c464':'#d65d54');
        for (let d=4;d<26;d+=8) box(ctx,x+d,y,3,22,paper,null);
        box(ctx,x+4,y+24,7,7,'#d7483c');
        box(ctx,x+16,y+24,7,7,'#d7483c');
      }
      const x=b.x+b.w+51,y=b.y+15;
      box(ctx,x-12,y-8,28,34,'#a7ce56');
      polygon(ctx,[[x-6,y+3],[x+8,y+3],[x+5,y+17],[x-3,y+17]],paper);
      line(ctx,[[x+2,y+4],[x+5,y-3],[x+10,y-3]],ink,1.5);
      for (const dx of [-2,2,5]) dot(ctx,x+dx,y+14,1.2,ink);
    }
  }
  for (let y=Math.floor(top/113)*113;y<top+tileSize+120;y+=113) {
    if (rows.some(row=>Math.abs(row-y)<103)) continue;
    box(ctx,64,y-26,108,59,'#b5b688',null);
    line(ctx,[[71,y+28],[164,y+28]],'#e8dcc0',2);
    tree(ctx,87,y,3);
    tree(ctx,142,y-7,5);
    box(ctx,107,y+10,31,5,'#aa7152');
  }

}

function building(ctx,b,camera,night) {
  const {x,y,w,h,z,color}=b;
  const dx=clamp((x+w/2-camera.x)*z/330,-z,z);
  const dy=clamp((y+h/2-camera.y)*z/315,-z,z);
  const rx=x+dx, ry=y+dy;
  box(ctx,x+6,y+7,w,h,'#2b253640',null);
  const sx=dx<0?x+w:x, side=sx+dx;
  const sy=dy<0?y+h:y, edge=sy+dy;
  polygon(ctx,[[sx,y],[side,ry],[side,ry+h],[sx,y+h]],'#475764');
  polygon(ctx,[[x,sy],[rx,edge],[rx+w,edge],[x+w,sy]],b.tower?'#466073':'#a36d60');
  for (let i=7;i<w-4;i+=13) {
    line(ctx,[[x+i,sy],[rx+i,edge]],'#212a32aa',1.3);
    if (b.tower && Math.abs(dy)>10) line(ctx,[[x+i+3,sy+dy*.3],[x+i+3+dx*.6,sy+dy*.8]],night?'#f4cc75':'#91cbd0',2);
  }
  if(b.polygon) {
    polygon(ctx,b.polygon.map(p=>[p.x+dx,p.y+dy]),color);
    return null;
  }
  box(ctx,rx,ry,w,h,color);
  if (b.id==='temple') {
    polygon(ctx,[[rx-8,ry+20],[rx+17,ry+34],[rx+w*.5,ry+14],[rx+w-17,ry+34],[rx+w+8,ry+20],
      [rx+w-5,ry+53],[rx+w*.5,ry+41],[rx+5,ry+53]],'#db5949');
    line(ctx,[[rx-6,ry+20],[rx+18,ry+34],[rx+w/2,ry+14],[rx+w-18,ry+34],[rx+w+6,ry+20]],'#f5cf68',4);
    for (let i=16;i<w;i+=20) dot(ctx,rx+i,ry+h-10,5,'#eb6549',ink);
  } else if (b.tower) {
    box(ctx,rx+10,ry+9,w-20,h-22,'#b4c6bd');
    for (let i=17;i<w-14;i+=13) box(ctx,rx+i,ry+15,6,h-34,color,null);
    box(ctx,rx+w*.56,ry+21,w*.28,26,'#788b8c');
    line(ctx,[[rx+15,ry+h-18],[rx+w-15,ry+h-18]],paper,2);
  } else {
    for (let i=5;i<w-3;i+=6) line(ctx,[[rx+i,ry+4],[rx+i,ry+h-25]],'#30394c36',1);
    for (let i=0;i<w;i+=10) box(ctx,rx+i,ry+h-21,Math.min(10,w-i),16,i%20?paper:color,null);
    line(ctx,[[rx,ry+h-22],[rx+w,ry+h-22]],ink,2);
    for (let i=5;i<w;i+=26) box(ctx,rx+i,ry+h-4,4,8,ink,null);
    box(ctx,rx+10,ry+12,22,17,'#e1e2c0');
    line(ctx,[[rx+11,ry+20],[rx+31,ry+20]],ink,1);
    line(ctx,[[rx+21,ry+13],[rx+21,ry+28]],ink,1);
  }
  if (b.id==='mrt') {
    box(ctx,rx+13,ry+12,w-35,49,'#286c68');
    for (let i=20;i<w-28;i+=12) line(ctx,[[rx+i,ry+13],[rx+i,ry+60]],'#9be0c4',2);
    label(ctx,uiLabel('mrtEntrance'),rx+w*.46,ry+25,'#baf1d8',11);
  } else if (b.id==='riverside') {
    polygon(ctx,[[rx+10,ry+32],[rx+w/2,ry+4],[rx+w-10,ry+32],[rx+w-20,ry+52],
      [rx+20,ry+52]],'#6c9255');
    for (const i of [24,51,78,105]) line(ctx,[[rx+i,ry+54],[rx+i,ry+72]],'#555f41',3);
  } else if (b.id==='studio') {
    for (const i of [23,48,73]) box(ctx,rx+i,ry+35,22,20,'#444458');
    polygon(ctx,[[rx+21,ry+35],[rx+94,ry+17],[rx+99,ry+31],[rx+25,ry+47]],paper);
    for (let i=27;i<92;i+=15) line(ctx,[[rx+i,ry+35-(i-21)*.24],[rx+i+8,ry+44-(i-21)*.24]],ink,3);
  } else if (b.id==='datalab') {
    for (const i of [22,48,74]) {
      box(ctx,rx+i,ry+28,21,26,'#455874');
      for (const j of [6,13,20]) dot(ctx,rx+i+5,ry+28+j,1.7,'#b4db6c');
    }
  } else if (b.id==='home') {
    for (const i of [23,55,87]) for (const j of [22,45]) box(ctx,rx+i,ry+j,18,12,'#d8c195');
  } else if (b.id==='convenience') {
    box(ctx,rx+1,ry+h-33,w-2,10,'#aada52',null);
    line(ctx,[[rx+1,ry+h-28],[rx+w-1,ry+h-28]],'#f8f2d1',2);
  } else if (b.id==='gamadiam') {
    for (const [i,fill] of [[24,'#dd6a56'],[51,'#f3bc64'],[78,'#77abc3']]) {
      box(ctx,rx+i,ry+30,21,18,fill);
      line(ctx,[[rx+i+4,ry+35],[rx+i+17,ry+35]],paper,2);
    }
  } else if (b.id==='office' || b.id==='client_hq' || b.id==='department') {
    const fill=b.id==='department'?'#f1a7af':b.id==='client_hq'?'#a5a3e7':'#81ceba';
    label(ctx,b.name,rx+w*.45,ry+23,fill,12);
  }
  if (b.id==='tvstation') {
    line(ctx,[[rx+28,ry+32],[rx+28,ry-9]],ink,3);
    line(ctx,[[rx+17,ry+2],[rx+39,ry+2]],ink,2);
    dot(ctx,rx+28,ry-10,3,'#f16056');
  }
  const sign=b.id?b.glyph:b.name;
  const signX=rx+w-9, signY=ry+10;
  box(ctx,signX,signY,18,sign.length*14+7,b.id?paper:color);
  [...sign].forEach((char,index)=>text(ctx,char,signX+3,signY+10+index*14,12));
  if (night) return {x:signX+9,y:signY+9,color:b.id?b.color:'#e0ba64'};
  return null;
}

function person(ctx,x,y,heading,skin,mode,phase) {
  const color=outfits[skin]??'#e8ac64';
  if (mode==='scooter') scooter(ctx,x,y,heading,color,skin==='grandma');
  else {
    const step=Math.sin(phase)*3;
    dot(ctx,x-3,y+6+step,3,ink);
    dot(ctx,x+3,y+6-step,3,ink);
  }
  dot(ctx,x+3,y+4,8,'#25263555');
  dot(ctx,x,y+1,7,color,ink);
  dot(ctx,x,y-6,5,skin.includes('grandma')?'#f0e8de':mode==='scooter'?'#f4ce5e':'#493638',ink);
  if (skin.includes('grandma')) dot(ctx,x,y-10,3,'#f0e8de',ink);
}
function vehicle(ctx,car,night) {
  ctx.save();
  ctx.translate(car.x,car.y);
  ctx.rotate(car.heading);
  if (night) polygon(ctx,[[12,-5],[63,-14],[63,14],[12,5]],'#fff0ac25',null);
  if (car.scooter) scooter(ctx,0,0,0,car.color);
  else {
    box(ctx,-16,-8,32,16,car.color);
    box(ctx,-7,-6,15,12,'#9cb5bd');
    box(ctx,4,-6,4,12,'#4c636e',null);
    box(ctx,13,-6,3,4,paper,null);
    box(ctx,13,2,3,4,paper,null);
    box(ctx,-16,-6,3,4,'#f26756',null);
    box(ctx,-16,2,3,4,'#f26756',null);
  }
  ctx.restore();
}
function arrow(ctx,x,y,angle,color) {
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  polygon(ctx,[[13,0],[-8,-8],[-4,0],[-8,8]],color);
  ctx.restore();
}
function surface(canvas,ctx) {
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

export function createRenderer(canvas,minimapCanvas) {
  const ctx=canvas.getContext('2d',{alpha:false});
  const drawMap=createMapRenderer(minimapCanvas);
  const drawWindshield=createWindshield(); // A26
  const tiles=new Map();
  function tile(tx,ty) {
    const key=`${tx},${ty}`;
    if (!tiles.has(key)) {
      const layer=new OffscreenCanvas(tileSize,tileSize);
      const terrain=layer.getContext('2d',{alpha:false});
      terrain.translate(-tx*tileSize,-ty*tileSize);
      ground(terrain,tx*tileSize,ty*tileSize);
      tiles.set(key,layer);
      if (tiles.size>42) tiles.delete(tiles.keys().next().value);
    }
    return tiles.get(key);
  }
  function draw(state) {
    const size=surface(canvas,ctx);
    if (!size) return;
    const {w,h}=size;
    const {player,time,clock}=state;
    if(player.mode==='car'&&state.cockpit&&!state.flyover&&!state.largeMap){ // A26
      drawWindshield(ctx,w,h,state);
      drawTouch(ctx,w,h,state);
      drawMap(state);
      ctx.textAlign='left';
      text(ctx,'© OpenStreetMap contributors',14,h-(state.insets?.[2]??0)-14,11,'#fff',500);
      return;
    }
    const target=state.flyover?.location??player;
    const aerial=state.flyover||state.largeMap;
    const blend=aerial?1-(state.flyover?.retreat??0):0;
    const camera={
      x:state.camera.x+(target.x-state.camera.x)*blend,
      y:state.camera.y+(target.y-state.camera.y)*blend,
      zoom:state.camera.zoom*(1-blend)+.19*blend,
    };
    const scale=clamp(Math.min(w/790,h/470),.58,1.65)*camera.zoom;
    const halfX=w/scale/2,halfY=h/scale/2;
    const left=camera.x-halfX, top=camera.y-halfY;
    const right=camera.x+halfX,bottom=camera.y+halfY;
    const visible=(x,y,pad=80)=>x>left-pad && x<right+pad && y>top-pad && y<bottom+pad;
    const day=clamp((Math.cos((time-12)*Math.PI/12)+.16)*1.6,0,1);
    const night=1-day;
    box(ctx,0,0,w,h,'#595c4b',null);
    const jitter=state.shake*9;
    const jx=Math.sin(clock*103)*jitter,jy=Math.cos(clock*127)*jitter;
    ctx.save();
    ctx.translate(w/2+jx,h/2+jy);
    ctx.scale(scale,scale);
    ctx.translate(-camera.x,-camera.y);
    for (let y=Math.floor(top/tileSize);y<=Math.floor(bottom/tileSize);y++) {
      for (let x=Math.floor(left/tileSize);x<=Math.floor(right/tileSize);x++) {
        if (x<0 || y<0 || x*tileSize>=width || y*tileSize>=height) continue;
        ctx.drawImage(tile(x,y),x*tileSize,y*tileSize);
      }
    }
    for (const loc of locations) if (visible(loc.x,loc.y)) {
      const close=Math.hypot(loc.x-player.x,loc.y-player.y)<58;
      dot(ctx,loc.x,loc.y,close?17:8,close?'#f7db827c':'#f7e4b5',close?'#ffe19a':ink);
      if (!close) dot(ctx,loc.x,loc.y,3,ink);
    }
    const lights=[];
    const bodies=[];
    for (const b of buildings) if (visible(b.x+b.w/2,b.y+b.h/2,140)) {
      bodies.push({y:b.y+b.h,draw:()=>{const light=building(ctx,b,camera,night>.15); if (light) lights.push(light);}});
    }
    const streetCars=[...state.cars,...(state.featuredParked??[])]; // A22 show every solid curb vehicle in 2D.
    for (const car of streetCars) if (!car.hidden && visible(car.x,car.y)) bodies.push({y:car.y,draw:()=>vehicle(ctx,car,night>.3)});
    for (const walker of state.walkers) if (!walker.hidden && visible(walker.x,walker.y)) {
      bodies.push({y:walker.y,draw:()=>person(ctx,walker.x,walker.y,0,walker.skin,'foot',clock*5+walker.x)});
    }
    for (const npc of state.npcs) if (visible(npc.x,npc.y)) {
      bodies.push({y:npc.y,draw:()=>person(ctx,npc.x,npc.y,0,npc.skin,'foot',0)});
    }
    const stance=player.mode==='foot'&&player.speed<.5?state.standingPoint??player:player;
    if(player.vehicle==='flyingTesla'||player.mode==='car'){ // A26
      const lift=(player.altitude??0)*4.3;
      bodies.push({y:player.y,draw:()=>{
        if(lift>0)dot(ctx,player.x,player.y,11,'#16233364');
        vehicle(ctx,{x:player.x,y:player.y-lift,heading:player.heading,featuredStyle:player.featuredStyle,color:player.color??'#bed6dd'},night);
      }});
    }else bodies.push({y:stance.y,draw:()=>person(ctx,stance.x,stance.y,player.heading,player.skin,player.mode,clock*player.speed*.29)});
    bodies.sort((a,b)=>a.y-b.y);
    for (const body of bodies) body.draw();

    for (const road of roads) {
      const [ax,ay,bx,by]=road;
      const length=Math.hypot(bx-ax,by-ay);
      const horizontal=ay===by;
      if (!horizontal && ax!==bx) continue;
      for (let d=100;d<length;d+=183) {
        const x=ax+(bx-ax)*d/length+(horizontal?0:77), y=ay+(by-ay)*d/length+(horizontal?-72:0);
        if (!visible(x,y)) continue;
        line(ctx,[[x,y],[x,y-11],[x+7,y-11]],ink,2);
        dot(ctx,x+7,y-11,3,paper);
        if (night>.15) lights.push({x:x+7,y:y-11,color:'#ffdc91',lamp:true});
      }
    }
    if (night>0) box(ctx,left-15,top-15,2*halfX+30,2*halfY+30,`rgba(16,23,57,${night*.62})`,null);
    if (time>15 && time<21) {
      const warm=Math.sin((time-15)/6*Math.PI)*.23;
      box(ctx,left-15,top-15,2*halfX+30,2*halfY+30,`rgba(238,107,46,${warm})`,null);
    }
    if (state.weather==='rain') box(ctx,left-15,top-15,2*halfX+30,2*halfY+30,'#38527535',null);
    for (const light of lights) {
      const radius=light.lamp?39:22;
      const glow=ctx.createRadialGradient(light.x,light.y,1,light.x,light.y,radius);
      glow.addColorStop(0,light.color);
      glow.addColorStop(1,light.color+'00');
      ctx.globalAlpha=night*.66;
      dot(ctx,light.x,light.y,radius,glow);
      if (state.weather==='rain') {
        ctx.fillStyle=light.color;
        ctx.globalAlpha=night*.28;
        ctx.fillRect(light.x-6,light.y+27,12,3);
        ctx.fillRect(light.x-3,light.y+35,6,12);
      }
      ctx.globalAlpha=1;
    }
    if (state.weather==='rain') {
      for (const [i,car] of streetCars.entries()) if (!car.hidden && visible(car.x,car.y)) {
        line(ctx,[[car.x-9,car.y+13],[car.x+11+Math.sin(clock*4+i)*7,car.y+13]],night>.3?'#ffc88775':'#dee9e67a',2);
      }
    }
    const tint=state.filter==='grandma'?'#e5924c34':state.filter==='flashback'?'#ad714355':null;
    if (tint) box(ctx,left-15,top-15,2*halfX+30,2*halfY+30,tint,null);

    for (const loc of locations) if (visible(loc.x,loc.y)&&(!state.flyover||loc.id===target.id)) {
      const close=Math.hypot(loc.x-player.x,loc.y-player.y)<58;
      label(ctx,placeLabel(loc),loc.x,loc.y+17,close?'#ffd765':paper); // i18n
    }
    const sideSites=new Set();
    if(!state.flyover)for (const marker of state.markers) {
      const loc=byId.get(marker.locationId);
      if (visible(loc.x,loc.y)) {
        const color=markerColors[marker.kind]??paper;
        if(marker.kind==='side'){
          const gap=Math.hypot(loc.x-player.x,loc.y-player.y);
          if(gap>430||sideSites.has(loc.id))continue;
          sideSites.add(loc.id);
          polygon(ctx,[[loc.x+15,loc.y-28],[loc.x+8,loc.y-14],[loc.x+22,loc.y-14]],color);
          if(gap<165&&marker.label)label(ctx,marker.label,loc.x+22,loc.y-8,color,10);
          continue;
        }
        polygon(ctx,[[loc.x,loc.y-12],[loc.x-8,loc.y-25],[loc.x,loc.y-36],[loc.x+8,loc.y-25]],color);
        if (marker.label) label(ctx,marker.label,loc.x,loc.y-61,color,11);
      }
    }
    if(!state.flyover)for (const npc of state.npcs) if (visible(npc.x,npc.y)) {
      label(ctx,npc.name,npc.x,npc.y-37,'#f1db9e',11);
      const speech=state.speech.get(npc.id);
      if (speech) label(ctx,speech.text,npc.x,npc.y-66,paper,14);
    }
    ctx.restore();
    if (state.weather==='rain') {
      ctx.beginPath();
      for (let i=0;i<110;i++) {
        const x=(random(i)*w+clock*240)%w,y=(random(i+410)*h+clock*590)%h;
        ctx.moveTo(x,y);
        ctx.lineTo(x-7,y+17);
      }
      ctx.strokeStyle='#c9e7f28a';
      ctx.lineWidth=1.2;
      ctx.stroke();
    }
    if (state.target) {
      const tx=(state.target.x-camera.x)*scale+w/2,ty=(state.target.y-camera.y)*scale+h/2;
      const dx=tx-w/2,dy=ty-h/2;
      if (Math.abs(dx)>w/2-33 || Math.abs(dy)>h/2-38) {
        const edge=Math.min((w/2-30)/Math.abs(dx),(h/2-32)/Math.abs(dy));
        arrow(ctx,w/2+dx*edge,h/2+dy*edge,Math.atan2(dy,dx),'#ffcf55');
      }
    }
    drawTouch(ctx,w,h,state);
    const safeBottom=state.insets?.[2]??0;
    box(ctx,9,h-safeBottom-23,169,17,'#101a22e0',null);
    text(ctx,'© OpenStreetMap contributors',14,h-safeBottom-14,11,'#fff',500);
    drawMap(state);
  }
  return draw;
}

