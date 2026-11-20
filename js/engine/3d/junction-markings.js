import {crossings,crosswalks,alleyStops} from '../street-crossings.mjs';
import {metersPerUnit as unit} from '../world.mjs';

export function paintJunctions(strip,mark){
  const ink='#f0eadc';
  function stripe(a,start,end,width,offset=0){
    const point=t=>[a.x+a.dx*t/unit,a.y+a.dy*t/unit];
    strip(point(start),point(end),width,.078,'line',offset,ink,3,.01);
  }
  for(const w of crosswalks){
    const n=Math.max(2,Math.round(w.span/.81)),pitch=w.span/n;
    const a={...w,x:w.x/unit,y:w.y/unit};
    for(let i=0;i<n;i++)stripe(a,-w.depth/2,w.depth/2,pitch*.51,(i+.5-n/2)*pitch);
  }
  for(const j of crossings)for(const a of j.approaches){
    if(!a.reverse)continue;
    stripe(a,a.stop,a.stop+.25,a.laneWidth-.12,a.offset);
    const heading=Math.atan2(a.dy,a.dx)+Math.PI;
    const symbol=(label,along,side)=>mark(label,a.x*unit+a.dx*along-a.dy*side,
      a.y*unit+a.dy*along+a.dx*side,heading);
    const width=Math.min(3.4,a.laneWidth-.25);
    for(const sign of [-1,1]){
      stripe(a,a.box-.68,a.box+.68,.10,a.offset+sign*width/2);
      stripe(a,a.box+sign*.68,a.box+sign*.68+.08,width,a.offset);
    }
    symbol('scooter',a.box,a.offset);
    if(a.turnBox){
      const t={...a,x:a.turnBox.x/unit,y:a.turnBox.y/unit};
      for(const sign of [-1,1]){
        stripe(t,-.95,.95,.1,sign*.8);
        stripe(t,sign*.95,sign*.95+.09,1.6);
      }
    }
  }
  for(const a of alleyStops){
    const w=a.width*unit/(a.forward?2:1),off=a.forward?-w/2:0;
    stripe(a,a.stop,a.stop+.20,w-.18,off);
    mark('慢',a.x*unit+a.dx*(a.stop+1.6)-a.dy*off,a.y*unit+a.dy*(a.stop+1.6)+a.dx*off,Math.atan2(a.dy,a.dx)+Math.PI);
  }
}
