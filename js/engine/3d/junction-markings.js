import {crossings,crosswalks,paintedCrosswalks,alleyStops} from '../street-crossings.mjs?v=1448599f';
import {metersPerUnit as unit} from '../world.mjs?v=1448599f';

export function paintJunctions(strip,mark){
  const ink='#f0eadc';
  function stripe(a,start,end,width,offset=0){
    const point=t=>[a.x+a.dx*t/unit,a.y+a.dy*t/unit];
    strip(point(start),point(end),width,.078,'line',offset,ink,3,.01);
  }
  for(const w of [...crosswalks,...paintedCrosswalks]){
    const span=w.paintSpan??w.span;
    const n=Math.max(2,Math.round(span/.81)),pitch=span/n;
    const a={...w,x:(w.paintX??w.x)/unit,y:(w.paintY??w.y)/unit};
    for(let i=0;i<n;i++)stripe(a,-w.depth/2,w.depth/2,pitch*.51,(i+.5-n/2)*pitch);
  }
  for(const j of crossings)for(const a of j.approaches){
    // 方向箭頭（11/20 拆模組時漏掉了，這裡補回）：有出路的車道一個、有進路的車道一個，朝各自的行車方向。
    // 路段太短就不畫，不要畫到路外面。
    if(a.paintLength>=a.arrow+1.5){
      const arrowAt=(along,side,heading)=>mark('↑',a.x*unit+a.dx*along-a.dy*side,a.y*unit+a.dy*along+a.dx*side,heading);
      const forwardHeading=Math.atan2(a.dy,a.dx);
      if(a.forward)arrowAt(a.arrow,a.reverse?a.laneWidth/2:0,forwardHeading);
      if(a.reverse)arrowAt(a.arrow,a.offset,forwardHeading+Math.PI);
    }
    if(!a.reverse)continue;
    // 停止線與機車待轉格也要有足夠的路段長度才畫（原本就有這個判斷，拆模組時一起漏掉）
    const roomForStop=a.paintLength>=a.stop+.55,roomForBox=a.paintLength>=a.box+2;
    if(roomForStop)stripe(a,a.stop,a.stop+.25,a.laneWidth-.12,a.offset);
    const heading=Math.atan2(a.dy,a.dx)+Math.PI;
    const symbol=(label,along,side)=>mark(label,a.x*unit+a.dx*along-a.dy*side,
      a.y*unit+a.dy*along+a.dx*side,heading);
    const width=Math.min(3.4,a.laneWidth-.25);
    if(roomForBox)for(const sign of [-1,1]){
      stripe(a,a.box-.68,a.box+.68,.10,a.offset+sign*width/2);
      stripe(a,a.box+sign*.68,a.box+sign*.68+.08,width,a.offset);
    }
    if(roomForBox)symbol('scooter',a.box,a.offset);
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
