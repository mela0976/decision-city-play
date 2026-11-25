// 號誌燈桿的實際位置：street-crossings.mjs 算出的位置有時落在車道上（大路口、多個節點合併的路口）。
// 立在車道中央的燈桿不對，直接丟掉又會讓那個方向看不到號誌，所以：落在車道上的燈桿沿進路往外、往兩側找最近的路外位置
// （最遠 14 公尺）；找不到才不放。繪製（3d/traffic-signals.js）與碰撞（3d/furniture.js）共用這份結果。
import {crossings} from './street-crossings.mjs?v=267cd4de';
import {carriagewayAt} from './sidewalks.mjs?v=267cd4de';
import {metersPerUnit as unit} from './world.mjs?v=267cd4de';

const clear=(x,y)=>!carriagewayAt(x/unit,y/unit);
export const placedPoles=[];
export const unplacedPoles=[];
for(const j of crossings)for(const p of j.poles){
  if(clear(p.x,p.y)){placedPoles.push(p);continue;}
  let spot=null,best=Infinity;
  // 沿進路方向 (dx,dy) 往外退 t 公尺、垂直方向偏 s 公尺：取離原位置最近、且在路外的點
  for(let t=0;t<=14;t+=1)for(const s of [0,1,-1,2,-2,3,-3,4,-4,5,-5]){
    const x=p.x+p.dx*t+p.dy*s,y=p.y+p.dy*t-p.dx*s;
    const d=Math.hypot(t,s);
    if(d<best&&clear(x,y)){best=d;spot={x,y};}
  }
  if(spot)placedPoles.push({...p,x:spot.x,y:spot.y});else unplacedPoles.push(p);
}
