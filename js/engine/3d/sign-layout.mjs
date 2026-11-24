// Street-side coordinates are metres. The frame of a panel uses Three's rotation about Y.
import {buildings,buildingHeightAt,metersPerUnit as unit,nearestOnRoad,roads,toWorld} from '../world.mjs?v=70a6a7b0';
import {urbanInfill} from '../infill.mjs?v=70a6a7b0';
import {mallPromenade,neonDistrict} from '../neon-districts.mjs?v=70a6a7b0';
import {hash} from './city-primitives.js?v=70a6a7b0';

const cell=24;
// P2 perf：同樣的格子走訪順序（先 z 後 x、格內依加入順序），只是不再每格建立閉包與呼叫 some()。
function grid(){
  const cells=new Map();
  const key=(i,j)=>i+j*65536;
  return {
    add(item,x0,z0,x1,z1){
      for(let j=Math.floor(z0/cell);j<=Math.floor(z1/cell);j++)
        for(let i=Math.floor(x0/cell);i<=Math.floor(x1/cell);i++){
          const k=key(i,j);
          let list=cells.get(k);
          if(!list)cells.set(k,list=[]);
          list.push(item);
        }
    },
    at(x,z){return cells.get(key(Math.floor(x/cell),Math.floor(z/cell)))??[];},
    any(x,z,r,predicate){
      for(let j=Math.floor((z-r)/cell);j<=Math.floor((z+r)/cell);j++)
        for(let i=Math.floor((x-r)/cell);i<=Math.floor((x+r)/cell);i++){
          const list=cells.get(key(i,j));
          if(list)for(let n=0;n<list.length;n++)if(predicate(list[n]))return true;
        }
      return false;
    }
  };
}

export function boxesOverlap(a,b){
  if(Math.abs(a.y-b.y)*2>=a.h+b.h)return false;
  const dx=b.x-a.x,dz=b.z-a.z;
  const ax=Math.cos(a.angle),az=-Math.sin(a.angle),bx=Math.cos(b.angle),bz=-Math.sin(b.angle);
  const c=Math.abs(ax*bx+az*bz),s=Math.abs(ax*bz-az*bx);
  return Math.abs(dx*ax+dz*az)*2<a.w+b.w*c+b.d*s &&
    Math.abs(-dx*az+dz*ax)*2<a.d+b.w*s+b.d*c &&
    Math.abs(dx*bx+dz*bz)*2<b.w+a.w*c+a.d*s &&
    Math.abs(-dx*bz+dz*bx)*2<b.d+a.w*s+a.d*c;
}

// The horizontal clear distance between the two oriented rectangular lightboxes.
function bladeGap(a,b){
  function cornersToBox(from,to){
    const c=Math.cos(from.angle),s=Math.sin(from.angle),u=Math.cos(to.angle),v=Math.sin(to.angle);
    let min=Infinity;
    for(const end of [-1,1])for(const face of [-1,1]){
      const x=from.x-to.x+end*from.w*c/2+face*from.d*s/2;
      const z=from.z-to.z-end*from.w*s/2+face*from.d*c/2;
      min=Math.min(min,Math.hypot(Math.max(0,Math.abs(x*u-z*v)-to.w/2),
        Math.max(0,Math.abs(x*v+z*u)-to.d/2)));
    }
    return min;
  }
  return boxesOverlap({...a,y:b.y},b)?0:Math.min(cornersToBox(a,b),cornersToBox(b,a));
}

export const mallBuilding=buildings.find(b=>b.shape==='mall');
export function mallFaces(){
  if(!mallBuilding)return [];
  const b=mallBuilding,x=(b.x+b.w/2)*unit,z=(b.y+b.h/2)*unit,w=b.w*unit*.943,d=b.h*unit*.914;
  return [[x+w/2,z,1,0,d],[x,z+d/2,0,1,w],[x-w/2,z,-1,0,d],[x,z-d/2,0,-1,w]]
    .map(([x,z,nx,nz,width],i)=>({x,z,nx,nz,width,top:17,seed:b.osmId+i*17,
      owner:b.osmId,face:i,bays:Math.max(1,Math.round(width/6)),source:'mall'}));
}

export function createSignLayout(){
  const streets=grid(),obstacles=grid(),awnings=grid(),occupied=grid(),blades=grid(),shops=[],panels=[];
  function indexBox(index,p){
    const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle));
    const rx=(c*p.w+s*p.d)/2,rz=(s*p.w+c*p.d)/2;
    index.add(p,p.x-rx,p.z-rz,p.x+rx,p.z+rz);
  }
  // The pedestrian passage through the department-store block is absent from the drivable road graph.
  const south=toWorld(25.03764,121.567104),north=toWorld(25.03881,121.567125);
  const promenade=[south.x,south.y,north.x,north.y,9/unit,
    {d:Math.hypot(north.x-south.x,north.y-south.y),way:{layer:0,name:'香堤大道',kind:'pedestrian'}}];
  for(const road of [...roads,promenade]){
    const [ax,az,bx,bz,w,e]=road;
    if(e.way.layer!==0)continue;
    const reach=w*unit/2+40;
    streets.add(road,Math.min(ax,bx)*unit-reach,Math.min(az,bz)*unit-reach,
      Math.max(ax,bx)*unit+reach,Math.max(az,bz)*unit+reach);
  }
  for(const p of urbanInfill())if(p.housing)indexBox(obstacles,{x:p.x,z:p.z,y:p.height/2,
    w:p.width,h:p.height,d:p.depth,angle:-(p.heading??0)});
  // The mall's model is an axis-aligned podium within the survey polygon.
  if(mallBuilding){
    const b=mallBuilding;
    indexBox(obstacles,{x:(b.x+b.w/2)*unit,z:(b.y+b.h/2)*unit,y:9.5,
      w:b.w*unit*.94,d:b.h*unit*.91,h:19,angle:0});
  }
  function obstructed(p){
    return buildingHeightAt(p.x/unit,p.z/unit,p.w/(2*unit),p.d/(2*unit),-p.angle,mallBuilding)>p.y-p.h/2||
      obstacles.any(p.x,p.z,Math.hypot(p.w,p.d)/2,b=>boxesOverlap(p,b));
  }
  function streetAt(x,z,nx,nz,designated){
    let closest=Infinity,street=null;
    const setback=neonDistrict(x/unit,z/unit)?40:17;
    for(const road of streets.at(x,z)){
      const hit=nearestOnRoad(x/unit,z/unit,road),d=hit.d*unit;
      if(d>=closest||d>road[4]*unit/2+setback)continue;
      const vx=hit.x*unit-x,vz=hit.y*unit-z;
      if(!designated&&(vx*nx+vz*nz<.64*d||
        Math.abs((road[2]-road[0])*nx+(road[3]-road[1])*nz)>.68*road[5].d))continue;
      // A party wall may be near a road on the far side of another building.
      if(!designated&&d>1){
        const offset=.25,span=d-offset;
        if(obstructed({x:x+vx*(offset+span/2)/d,z:z+vz*(offset+span/2)/d,y:1.6,
          w:span,h:.1,d:.06,angle:-Math.atan2(vz,vx)}))continue;
      }
      closest=d;street=road;
    }
    return street;
  }
  function frontage(face){
    const exterior=new Set();
    if(face.width<2)return exterior;
    const {x,z,nx,nz,width,bays,source}=face;
    const span=width/bays;
    for(let i=0;i<bays;i++){
      const t=span*(i+.5)-width/2,cx=x+nz*t,cz=z-nx*t;
      const street=streetAt(cx,cz,nx,nz,source==='mall'||source==='infill');
      if(!street&&source!=='infill'&&source!=='mall')continue;
      exterior.add(i);
      shops.push({...face,x:cx,z:cz,bay:i,span,street,primary:null});
    }
    return exterior;
  }
  function obstacle(kind,shape,color,x,y,z,w,h,d,angle=0){
    // Ground furniture is below the signs. Reserve elevated awnings, balconies and AC units.
    if(shape!=='box'||y+h/2<=2.3||y-h/2>=16)return;
    const fixture={x,y,z,w,h,d,angle};
    indexBox(obstacles,fixture);
    if(h<.5&&w>1.2&&d>.85)indexBox(awnings,fixture);
  }
  // Sight lines from street eye height to both lower corners catch a fascia hidden behind
  // a long arcade eave even when the panel and the roof have disjoint bounding boxes.
  function behindAwning(p){
    const s=p.shop,eyeDistance=8;
    for(const corner of [-.48,0,.48]){
      const x=p.x+Math.cos(p.angle)*p.w*corner,z=p.z-Math.sin(p.angle)*p.w*corner,y=p.y-p.h/2;
      const dx=s.nx*eyeDistance,dz=s.nz*eyeDistance,dy=1.65-y;
      if(awnings.any(x+dx/2,z+dz/2,eyeDistance/2+.1,b=>{
        const c=Math.cos(b.angle),t=Math.sin(b.angle),rx=x-b.x,rz=z-b.z;
        let enter=0,leave=1;
        for(const [start,travel,half] of [[rx*c-rz*t,dx*c-dz*t,b.w/2],
          [rx*t+rz*c,dx*t+dz*c,b.d/2],[y-b.y,dy,b.h/2]]){
          if(Math.abs(travel)<1e-7){if(Math.abs(start)>=half)return false;continue;}
          const a=(-half-start)/travel,e=(half-start)/travel;
          enter=Math.max(enter,Math.min(a,e));leave=Math.min(leave,Math.max(a,e));
          if(enter>=leave)return false;
        }
        return true;
      }))return true;
    }
    return false;
  }
  function fit(shop,w,h,bottom,offset,plate,style,reach=.19,projecting=false,aboveRoof=false){
    const {x,z,nx,nz,span}=shop;
    const d=.12,alongWidth=projecting?d:w;
    // A tall balcony can consume the second-floor fascia band. Leave that slot empty above it.
    if(style==='upper'&&bottom>(shop.modern||shop.source==='mall'?7.65:6.65))return null;
    if(bottom<.25||(!aboveRoof&&bottom+h>shop.top-.04)||Math.abs(offset)+alongWidth/2>span/2-.04)return null;
    const p={x:x+nx*reach+nz*offset,z:z+nz*reach-nx*offset,y:bottom+h/2,
      w,h,d,angle:Math.atan2(nx,nz)+(projecting?Math.PI/2:0),plate,style,shop};
    if(obstructed(p)||behindAwning(p)||occupied.any(p.x,p.z,Math.hypot(w,d)/2,other=>boxesOverlap(p,other)))return null;
    if(projecting){
      // Measure the gap between blade footprints, including blades on adjacent angled faces.
      if(blades.any(p.x,p.z,1.2+w/2,b=>bladeGap(p,b)<1.2))return null;
      indexBox(blades,p);
    }
    panels.push(p);indexBox(occupied,p);
    return p;
  }
  function arrange(){
    // Adjacent end bays on two faces of a building use different printed plates.
    const corners=new Map();
    for(const shop of shops){
      const {seed,bay,bays,span,top,owner}=shop;
      const mall=mallPromenade(shop.x/unit,shop.z/unit),count=mall?16:11;
      const k=seed+23*bay;
      let plate=Math.floor(hash(k,7)*count);
      const ends=[];
      for(const direction of [-1,1]){
        if(direction<0?bay!==0:bay!==bays-1)continue;
        const x=shop.x+direction*shop.nz*span/2,z=shop.z-direction*shop.nx*span/2;
        const end=shop.ends?.[direction<0?0:1];
        ends.push(owner+'/'+(end??(Math.round(x*100)+'/'+Math.round(z*100))));
      }
      while(ends.some(end=>corners.get(end)?.has(plate)))plate=(plate+1)%count;
      for(const end of ends){if(!corners.has(end))corners.set(end,new Set());corners.get(end).add(plate);}
      const base=shop.modern?4.95:3.68;
      // Where the roof itself hides a wall-mounted shop name, use its actual outer fascia.
      const canopies=new Set();
      awnings.any(shop.x,shop.z,6,b=>{canopies.add(b);return false;});
      for(const b of canopies){
        const dx=b.x-shop.x,dz=b.z-shop.z,c=Math.cos(b.angle),t=-Math.sin(b.angle);
        if(Math.abs(c*shop.nz-t*shop.nx)<.98||
          Math.abs(dx*shop.nz-dz*shop.nx)>b.w/2-.1)continue;
        const reach=dx*shop.nx+dz*shop.nz+b.d/2+.075;
        if(reach<.4||reach>5.5||b.y<2.6||b.y>6.8)continue;
        const w=Math.min(span*.82,6.4,b.w*.93),h=w*.223;
        shop.primary=fit(shop,w,h,b.y+b.h/2+.04,0,16+plate,'primary',reach);
        if(shop.primary)break;
      }
      for(const scale of [1,.79,.58,.45]){
        if(shop.primary)break;
        const w=Math.min(span*.85,6.4)*scale,h=w*.223;
        const low=Math.min(base,top-h-.10);
        for(const bottom of [low,low+.9,low-.65,low+1.7,top-h-.08,2.35,1.95]){
          for(const offset of [0,-1,1]){
            shop.primary=fit(shop,w,h,bottom,offset*(span-w)*.44,16+plate,'primary');
            if(shop.primary)break;
          }
          if(shop.primary)break;
        }
        if(shop.primary)break;
      }
      // A narrow or unusually low awning can occupy the usual wall plane. Mount a short
      // fascia on its street-facing edge, still checking the full case against all solids.
      if(!shop.primary){
        const w=Math.min(2.2,span*.70),h=w*.223;
        for(const reach of [.45,.85,1.5,1.9]){
          for(const bottom of [Math.min(3.35,top-h-.09),2.7,2.25]){
            shop.primary=fit(shop,w,h,bottom,0,16+plate,'primary',reach);
            if(shop.primary)break;
          }
          if(shop.primary)break;
        }
      }
    }
    const commercial=shops.filter(s=>s.primary&&neonDistrict(s.x/unit,s.z/unit));
    for(const shop of commercial){
      const k=shop.seed+23*shop.bay,span=shop.span,top=shop.top;
      const count=mallPromenade(shop.x/unit,shop.z/unit)?16:11;
      // Reserve a junction for the projecting face. On irregular footprints the opposite
      // end of the same tenant is a second mounting point, still inside its frontage.
      const limit=top-.12;
      const bottom=Math.max(4.65,Math.min(6.2,shop.primary.y+shop.primary.h/2+.28))+.45*hash(k,3);
      if(limit-bottom>=1.8){
        const height=Math.min(5.8+2.25*hash(k,13),limit-bottom);
        const width=Math.min(1.6,height*.28);
        const rim=Math.max(0,span/2-.26);
        for(const t of [rim,-rim]){
          for(const reach of [.20,.52,.85,1.25]){
            shop.blade=fit(shop,width,height,bottom,t,Math.floor(hash(k,67)*count),'vertical',width/2+reach,true);
            if(shop.blade)break;
          }
          if(shop.blade)break;
        }
      }
      // Below the second-floor windows the fascia is flush, leaving both junctions free.
      const upperW=Math.min(6,span*.78),upperH=upperW*.223;
      const upperBase=Math.max(Math.min(6.35,top-upperH-.12),shop.primary.y+shop.primary.h/2+.50);
      const print=16+(shop.primary.plate-16+1+Math.floor(hash(k,31)*(count-1)))%count;
      for(const y of [upperBase,upperBase+.75]){
        for(const reach of [.19,.48]){
          shop.upper=fit(shop,upperW,upperH,y,0,print,'upper',reach);
          if(shop.upper)break;
        }
        if(shop.upper)break;
      }
      // A third-storey advertisement takes a separate broad wall bay above the shop fascias.
      if(span>=3.8){
        const width=Math.min(7.5,span*.84),height=width*.5625;
        const y=Math.max(9.4,upperBase+upperH+.65)+hash(k,53)*.65;
        for(const base of [y,y+1.5]){
          shop.poster=fit(shop,width,height,base,0,32+Math.floor(hash(k,43)*count),'poster');
          if(shop.poster)break;
        }
      }
    }
    // A low row has no second-storey wall. Bridge consecutive empty bays with a blade on
    // a parapet-mounted steel upright. Keep its foot and both arms at the tenant junction.
    const byFace=new Map();
    for(const shop of commercial){
      const face=shop.owner+'/'+shop.face;
      if(!byFace.has(face))byFace.set(face,new Map());
      byFace.get(face).set(shop.bay,shop);
    }
    function framedBlade(s,accept=()=>true){
      const k=s.seed+23*s.bay,rim=s.span/2-.22,plate=Math.floor(hash(k,67)*(mallPromenade(s.x/unit,s.z/unit)?16:11));
      const base=Math.max(5.2,Math.min(7,s.primary.y+s.primary.h/2+.4));
      const h=4.5+hash(k,11),w=h*.275,angle=Math.atan2(s.nx,s.nz);
      function bar(t,reach,y,width,height,depth){
        return {x:s.x+s.nx*reach+s.nz*t,z:s.z+s.nz*reach-s.nx*t,y,w:width,h:height,d:depth,angle};
      }
      for(const y of [base,base+1.2,base+2.1])for(const t of [-rim,rim]){
        if(!accept(t))continue;
        for(const reach of [.20,.65,1.25,1.85,2.3,2.9,3.6,4.3]){
          const mount=y+h*.84,foot=Math.min(s.top-.55,y-.18),postDepth=.12;
          const frame=bar(t,reach-postDepth/2-.0001,(foot+mount)/2,.12,mount-foot,postDepth);
          if(obstructed(frame)||occupied.any(frame.x,frame.z,.12,b=>boxesOverlap(frame,b)))continue;
          // Each rail runs from the outermost solid wall/eave to the post. A recessed
          // shop under a deep canopy can therefore use the structural edge of the canopy.
          const rails=[];
          for(const at of [foot+.055,Math.min(s.top-.08,foot+.42)]){
            const end=reach-postDepth;
            let low=0,high=end;
            for(let i=0;i<9;i++){
              const mid=(low+high)/2,probe=bar(t,(mid+end)/2,at,.09,.085,end-mid);
              if(obstructed(probe))low=mid;else high=mid;
            }
            const length=end-high;
            if(length>.002)rails.push(bar(t,high+length/2,at,.09,.085,length));
          }
          if(rails.some(r=>occupied.any(r.x,r.z,r.d/2+.1,b=>boxesOverlap(r,b))))continue;
          const p=fit(s,w,h,y,t,plate,'vertical',reach+w/2,true,true);
          if(!p)continue;
          s.blade=p;p.frame=[frame,...rails];
          for(const part of p.frame)indexBox(obstacles,part);
          return true;
        }
      }
      return false;
    }
    // Count physical plates along each continuous stretch, starting at its first tenant edge.
    // Fill a deficient ten-metre section at a junction inside that same section.
    for(const bays of byFace.values())for(const [first,origin] of bays){
      if(bays.has(first-1))continue;
      const run=[];
      for(let i=first;bays.has(i);i++)run.push(bays.get(i));
      const along=(x,z)=>(x-origin.x)*origin.nz-(z-origin.z)*origin.nx+origin.span/2;
      for(let start=0;start+10<=run.length*origin.span;start+=10){
        const inside=t=>t>=start&&t<start+10;
        const local=run.flatMap(s=>[s.primary,s.upper,s.poster,s.blade]).filter(p=>p&&inside(along(p.x,p.z)));
        let total=local.length,vertical=local.some(p=>p.style==='vertical');
        for(const s of run){
          if(total>=3&&vertical)break;
          if(!s.blade&&framedBlade(s,t=>inside(along(s.x,s.z)+t))){total++;vertical=true;}
          if(total>=3||s.upper)continue;
          // A recessed window or a broad balcony may only leave a short strip of free wall.
          const w=Math.min(3.4,s.span*.55),h=w*.223;
          const base=Math.max(5.3,s.primary.y+s.primary.h/2+.52);
          const plate=16+(s.primary.plate-15)%11;
          for(const offset of [0,(s.span-w)*.38,-(s.span-w)*.38]){
            if(!inside(along(s.x,s.z)+offset))continue;
            for(const reach of [.19,.5,1.2,1.9,2.5]){
              for(const y of [base,base+.8]){
                s.upper=fit(s,w,h,y,offset,plate,'upper',reach);
                if(s.upper)break;
              }
              if(s.upper)break;
            }
            if(s.upper){total++;break;}
          }
        }
        if(total>=3)continue;
        for(const s of run){
          if(s.poster||!inside(along(s.x,s.z))||s.span<3.8)continue;
          const w=Math.min(6.4,s.span*.82),h=w*.5625;
          const plate=32+(s.primary.plate-16+3)%11;
          for(const y of [12.5,15.7,19]){
            s.poster=fit(s,w,h,y,0,plate,'poster');
            if(s.poster)break;
          }
          // When there is no free third-floor wall, the parapet itself is the sign base.
          if(!s.poster&&s.top>=9.4){
            s.poster=fit(s,w,h,s.top+.01,0,plate,'poster',-.22,false,true);
            if(s.poster)s.poster.onRoof=true;
          }
          if(s.poster&&++total>=3)break;
        }
      }
    }
    for(const bays of byFace.values())for(const [i,s] of bays){
      const other=bays.get(i-1);
      if(s.blade||other?.blade)continue;
      if(other||s.span>=10){
        if(!framedBlade(s)&&other)framedBlade(other);
      }
    }
    // A party line joining two separate OSM buildings is also a tenant junction.
    const leading=grid();
    for(const s of commercial)if(!s.bay&&!s.blade){
      const x=s.x-s.nz*s.span/2,z=s.z+s.nx*s.span/2;
      leading.add({s,x,z},x-.4,z-.4,x+.4,z+.4);
    }
    for(const s of commercial)if(s.bay===s.bays-1&&!s.blade){
      const x=s.x+s.nz*s.span/2,z=s.z-s.nx*s.span/2;
      for(const edge of leading.at(x,z)){
        const n=edge.s;
        if(n.blade||n.owner===s.owner||n.street?.[5].way.name!==s.street?.[5].way.name||
          s.nx*n.nx+s.nz*n.nz<.98||Math.hypot(edge.x-x,edge.z-z)>.4)continue;
        if(framedBlade(s))break;
        framedBlade(n);
      }
    }
    return panels;
  }
  return {frontage,obstacle,arrange,shops,obstructed,behindAwning};
}
