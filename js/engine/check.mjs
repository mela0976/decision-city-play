import assert from 'node:assert/strict';
import {locations,metersPerUnit,scooterSpeed,roadOptions,toGeo,roads,buildings} from './world.mjs?v=06b0d11';
import {clearPath,planRide,autoRideCruiseSeconds} from './navigation.js?v=06b0d11';

assert.equal(locations.length,15);
assert.equal(new Set(locations.map(site=>site.id)).size,15);
let longest=0,maxPair='',pacedUpper=0;
for (const a of locations) {
  assert(roadOptions(a.x,a.y)[0].d*metersPerUnit<9,a.id+' is not near a mapped road');
  const {lat,lon}=toGeo(a.x,a.y);
  console.log(`${a.id.padEnd(14)} ${a.name} (${lat.toFixed(6)}, ${lon.toFixed(6)}) · ${a.source} · OSM way ${a.road}`);
  for(const b of locations) {
    if(a===b)continue;
    const route=planRide(a,b);
    assert(route?.length,a.id+' cannot reach '+b.id);
    assert(Math.hypot(route.at(-1).x-b.x,route.at(-1).y-b.y)<.1);
    assert(route.every((p,i)=>clearPath(route[i-1]??a,p)),a.id+' has an obstructed static leg to '+b.id);
    const seconds=route.reduce((d,p,i)=>d+Math.hypot(p.x-(route[i-1]??a).x,p.y-(route[i-1]??a).y),0)/scooterSpeed;
    pacedUpper=Math.max(pacedUpper,Math.min(autoRideCruiseSeconds,seconds)+7);
    if(seconds>longest){longest=seconds;maxPair=a.id+' → '+b.id;}
  }
}
assert(pacedUpper<90,`paced ride upper estimate at 30 FPS: ${pacedUpper.toFixed(1)} s`);
console.log(`210 directed pairs; ${roads.length} OSM segments, ${buildings.length} footprints; longest ${maxPair} ${longest.toFixed(1)} s at manual top speed, ${pacedUpper.toFixed(1)} s paced estimate at 30 FPS.`);
