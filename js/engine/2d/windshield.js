// A26 perspective view for the Canvas renderer, using the same OSM geometry as the map.
import {buildings,metersPerUnit as unit,roads} from '../world.mjs?v=c0252f8';
import {drawCockpit} from '../car-cockpit.js?v=c0252f8';

export function createWindshield(){
  const range=125/unit,refresh=15/unit;
  let lastX=Infinity,lastY=Infinity,streets=[],blocks=[];
  return (ctx,w,h,state)=>{
    const p=state.player;
    if(Math.hypot(p.x-lastX,p.y-lastY)>refresh){
      lastX=p.x;lastY=p.y;
      const nearby=(x0,y0,x1,y1)=>Math.max(x0,x1)>=p.x-range&&Math.min(x0,x1)<=p.x+range&&
        Math.max(y0,y1)>=p.y-range&&Math.min(y0,y1)<=p.y+range;
      streets=roads.filter(([x0,y0,x1,y1,,edge])=>edge.way.layer===0&&nearby(x0,y0,x1,y1));
      blocks=buildings.filter(b=>nearby(b.x,b.y,b.x+b.w,b.y+b.h));
    }
    const night=state.time<6||state.time>=19;
    const horizon=h*.44,focal=Math.min(w*.89,h*1.10),cos=Math.cos(p.heading),sin=Math.sin(p.heading);
    const sky=ctx.createLinearGradient(0,0,0,horizon);
    sky.addColorStop(0,night?'#18243d':'#73b6d2');sky.addColorStop(1,night?'#5a5662':'#dbe9dc');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon+1);
    ctx.fillStyle=night?'#48424c':'#baa98f';ctx.fillRect(0,horizon,w,h-horizon);
    const camera=(x,y,z=0)=>[(cos*(y-p.y)-sin*(x-p.x))*unit,z-1.25,(cos*(x-p.x)+sin*(y-p.y))*unit];
    function face(vertices,paint){
      const points=[];
      let a=vertices.at(-1);
      for(const b of vertices){
        if((a[2]<.45)!==(b[2]<.45)){
          const t=(.45-a[2])/(b[2]-a[2]);
          points.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),.45]);
        }
        if(b[2]>=.45)points.push(b);
        a=b;
      }
      if(points.length<3)return;
      ctx.beginPath();
      for(let i=0;i<points.length;i++){
        const [side,up,depth]=points[i],x=w/2+focal*side/depth,y=horizon-focal*up/depth;
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      }
      ctx.closePath();ctx.fillStyle=paint;ctx.fill();
    }
    for(const [ax,ay,bx,by,width,edge] of streets){
      const half=width/(2*edge.d),dx=(bx-ax)*half,dy=(by-ay)*half;
      face([camera(ax-dy,ay+dx),camera(bx-dy,by+dx),camera(bx+dy,by-dx),camera(ax+dy,ay-dx)],
        night?'#353a48':'#687478');
    }
    const walls=[];
    function wall(a,b,height,color){
      const left=camera(a.x,a.y),right=camera(b.x,b.y);
      if(Math.max(left[2],right[2])<.45)return;
      const top=v=>[v[0],v[1]+height,v[2]];
      walls.push({depth:(left[2]+right[2])/2,vertices:[left,right,top(right),top(left)],color});
    }
    for(const b of blocks){
      for(let i=1;i<b.polygon.length;i++){
        const a=b.polygon[i-1],end=b.polygon[i];
        const color=Math.abs(a.x-end.x)>Math.abs(a.y-end.y)?b.color:(night?'#485260':'#838984');
        wall(a,end,b.elevation,color);
      }
    }
    for(const car of [...state.cars,...(state.featuredParked??[])]){
      if(car.hidden||Math.hypot(car.x-p.x,car.y-p.y)>range)continue;
      const u=Math.cos(car.heading??0),v=Math.sin(car.heading??0);
      const bus=car.service==='bus';
      const length=(car.scooter ? 1 : bus ? 5.8 : 2.35)/unit;
      const width=(car.scooter ? .35 : bus ? 1.25 : .95)/unit;
      const corners=[[-length,-width],[length,-width],[length,width],[-length,width]]
        .map(([x,y])=>({x:car.x+u*x-v*y,y:car.y+v*x+u*y}));
      for(let i=0;i<4;i++)wall(corners[i],corners[(i+1)%4],bus?2.9:1.4,car.color??'#9aaeba');
    }
    for(const f of walls.sort((a,b)=>b.depth-a.depth))face(f.vertices,f.color);
    if(night){ctx.fillStyle='#15223c52';ctx.fillRect(0,0,w,h);}
    drawCockpit(ctx,w,h,p.speed*unit,state.carSteer??0);
  };
}
