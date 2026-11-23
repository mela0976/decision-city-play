// A24 accessible ramps and zebra paint share one canonical rectangle.
// x/y are engine world units (east/south), dx/dy is the outward unit vector.
import {crosswalks} from './street-crossings.mjs?v=f213092';
import {metersPerUnit as unit} from './world.mjs?v=f213092';

export function crosswalkEnds(){
  return crosswalks.map(walk=>{
    const ends=[-1,1].map(sign=>{
      const dx=-walk.dy*sign,dy=walk.dx*sign;
      return {x:(walk.x+dx*walk.span/2)/unit,y:(walk.y+dy*walk.span/2)/unit,dx,dy};
    });
    return {junctionId:walk.junctionId,roadId:walk.roadId,depthMeters:walk.depth,ends};
  });
}
