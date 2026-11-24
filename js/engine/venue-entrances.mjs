// A27. All dimensions are metres, relative to the mapped road stop.
// Positive side follows the facade, positive depth runs from the street into the lobby.
import {byId,metersPerUnit as unit} from './world.mjs?v=fced202e';

const plans = {
  // [side, threshold depth, frontage width, clear opening, canopy height]
  home:        [2.2, 3.4, 4.2, 1.55, 3.05],
  breakfast:   [-2.1, 5.0, 5.6, 3.4, 3.0],
  office:      [0, 6.17, 14.1, 3.32, 4.95],
  client_hq:   [2.7, 2.9, 5.2, 2.4, 4.4],
  mrt:         [0, 4.1, 2.45, 1.8, 2.55],
  department:  [0, 7.25, 8.4, 3.1, 4.3],
  convenience: [2.0, 9.8, 6.4, 2.25, 3.2],
  studio:      [0, 8.0, 11.0, 3.5, 4.15],
  datalab:     [2.7, 7.65, 6.2, 2.5, 3.8],
  tvstation:   [1.0, 4.8, 5.8, 2.25, 3.65],
  temple:      [-9.4, 5.45, 7.35, 2.1, 3.55],
  gamadiam:    [0, 8.75, 6.1, 2.1, 3.15],
  rechao:      [4.2, 6.25, 6.2, 3.6, 3.05],
};
export const venues=new Map(Object.entries(plans).map(([id,[side,depth,width,opening,height]])=>{
  const site=byId.get(id),a=site.viewHeading;
  return [id,{id,site,side,depth,width,opening,height,sin:Math.sin(a),cos:Math.cos(a)}];
}));
export function venuePoint(v,side=0,depth=0){
  const s=v.side+side,d=v.depth+depth;
  return {x:v.site.x+(s*v.sin+d*v.cos)/unit,y:v.site.y+(d*v.sin-s*v.cos)/unit};
}
export function venueLocal(v,p){
  const x=(p.x-v.site.x)*unit,y=(p.y-v.site.y)*unit;
  return {side:x*v.sin-y*v.cos-v.side,depth:x*v.cos+y*v.sin-v.depth};
}
// Reserve the approach for the pedestrian. This also covers mapped plazas with a flush kerb.
export function atVenueMouth(v,p,approach=2.25){
  if(!v||Math.abs(p.x-v.site.x)>22/unit||Math.abs(p.y-v.site.y)>22/unit)return false;
  const {side,depth}=venueLocal(v,p);
  return Math.abs(side)<v.opening/2+.35&&depth>=-approach&&depth<2.35;
}
export function activeVenue(p){
  if(p.mode!=='foot'||p.vehicle)return null;
  for(const v of venues.values()){
    if(Math.abs(p.x-v.site.x)>22/unit||Math.abs(p.y-v.site.y)>22/unit)continue;
    const {side,depth}=venueLocal(v,p);
    if(Math.abs(side)<=v.opening/2-.15&&depth>=1.05&&depth<=1.95)return v;
  }
  return null;
}
export const canopyReach=v=>v.id==='studio'?2.7:v.id==='office'?2.8:v.id==='temple'?.85:1.05;
export const canopyBounds=[...venues.values()].map(v=>{
  const footprint=[[-1,-canopyReach(v)],[1,-canopyReach(v)],[1,2.3],[-1,2.3]].map(([side,d])=>{
    const p=venuePoint(v,side*(v.width/2+.12),d);
    return [p.x*unit,p.y*unit];
  });
  const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
  return {footprint,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),
    bottom:v.height-.26,top:v.height+.23};
});
