import {buildings,metersPerUnit as unit,water} from '../world.mjs?v=51145f5b';

// This long north-facing wall follows the mapped outline of the factory itself.
// Keep each bay parallel to its wall even where the old factory bends.
const factory=buildings.find(b=>b.osmId===229059792);
function visitArcade(visit){
  const ring=factory.polygon;
  const winding=Math.sign(ring.reduce((area,p,i)=>{
    const q=ring[(i+1)%ring.length];
    return area+p.x*q.y-q.x*p.y;
  },0));
  for(let i=0;i<ring.length;i++){
    const p=ring[i],q=ring[(i+1)%ring.length];
    const dx=(q.x-p.x)*unit,dz=(q.y-p.y)*unit,len=Math.hypot(dx,dz);
    const tx=dx/len,tz=dz/len,nx=winding*tz,nz=-winding*tx;
    if(nz>-.57||len<2.4)continue;
    const bays=Math.max(1,Math.round(len/3.6)),width=len/bays,turn=-Math.atan2(tz,tx);
    for(let j=0;j<bays;j++){
      const at=(u,y,d)=>[p.x*unit+tx*((j+.5)*width+u)+nx*d,y,p.y*unit+tz*((j+.5)*width+u)+nz*d];
      visit(at,width,turn,i+j);
    }
  }
}

export function placeArcadeColumns(instance){
  visitArcade((at,w,turn)=>{
    // Include the thickness of the lower glazing in the same collision visitor.
    instance('metal','box','#424c47',...at(0,1.53,.435),w*.75+.11,2.23,.13,turn);
    instance('concrete','box','#b39670',...at(-w/2+.12,1.48,1.64),.29,2.96,.34,turn);
  });
}

export function addFactoryFront(instance,batch){
  visitArcade((at,w,turn,seed)=>{
    const box=(shade,u,y,d,width,h,depth,kind='concrete')=>
      instance(kind,'box',shade,...at(u,y,d),width,h,depth,turn);
    box('#b39a73',0,4.93,.28,w+.025,3.84,.24);
    box('#74684e',0,2.98,1.02,w+.03,.20,1.88);
    box('#c2ac87',0,3.12,1.92,w+.02,.19,.15);
    box('#bbaa8c',0,6.86,.46,w+.02,.18,.69);
    // Face tiles and window lights have no visible back or sides. Deposit only
    // their outward quad into the existing chunk, retaining true depth for the arcade.
    const [x,,z]=at(0,0,0),brick=batch(x,z,'metal'),panes=batch(x,z,'glass');
    function face(buffer,shade,u,y,d,width,height){
      const l=u-width/2,r=u+width/2,b=y-height/2,t=y+height/2;
      buffer.quad(at(l,b,d),at(r,b,d),at(r,t,d),at(l,t,d),shade);
    }
    for(let row=0;row<12;row++){
      const y=3.43+row*.275;
      face(brick,'#987f60',0,y,.43,w,.019);
      for(let j=0;j<4;j++)face(brick,'#9b8362',(j-1.65+(row%2)*.43)*w/4,y+.138,.431,.021,.258);
    }
    for(const y of [1.53,5.06]){
      const pane=w*.75;
      if(y>2)box('#424c47',0,y,.435,pane+.11,2.23,.13,'metal');
      for(let col=0;col<4;col++)for(let row=0;row<3;row++){
        const tone=['#686e60','#707a6d','#58645c','#798173'][(seed+col+row*3)%4];
        face(panes,tone,(col-1.5)*pane/4,y+(row-1)*.67,.535,pane/4-.052,.615);
      }
      box('#938669',0,y-1.12,.51,pane+.21,.12,.32);
    }
    if(seed%2===0)box('#dbc99d',0,2.80,1.17,.48,.065,.22,'window');
  });
  placeArcadeColumns(instance);
}

// The selectable studio entrance uses the same placement visitor for graphics and physics.
export function placeStudioEntrance(p,{instance,sign}){
  const a=p.viewHeading,turn=Math.PI/2-a;
  const at=(s,y,d)=>[p.x*unit+s*Math.sin(a)+d*Math.cos(a),y,p.y*unit-s*Math.cos(a)+d*Math.sin(a)];
  const box=(tint,u,y,d,w,h,l,kind='concrete')=>instance(kind,'box',tint,...at(u,y,d),w,h,l,turn);
  for(let i=-2;i<=2;i++){
    const u=i*2.15;
    box('#bc9f76',u,1.95,8.2,2.16,3.90,.22);
    box('#555e56',u,1.83,8.045,1.72,2.48,.12,'metal');
    for(let col=0;col<3;col++)for(let row=0;row<4;row++)
      box(['#66746a','#7b8171','#58675e'][(col+row)%3],u+(col-1)*.52,1.01+row*.55,7.965,.47,.49,.045,'glass');
    box('#b99d77',u-1.01,1.62,5.58,.24,3.24,.28);
    box('#af9977',u,3.29,6.85,2.16,.18,3.00);
    box('#83765e',u,3.44,5.45,2.16,.13,.21);
    for(let j=0;j<4;j++)box('#9f8668',u,3.53+j*.10,8.075,2.14,.014,.04);
  }
  const [x,,z]=at(0,0,5.33);
  sign(p.name,x,3.35,z,-Math.PI/2-a,'#655940',false,2.93,.36);
  return true;
}

export function addPondWalk(batch){
  const ring=water.find(w=>w.id===20039406).points;
  const winding=Math.sign(ring.reduce((area,p,i)=>{
    const q=ring[(i+1)%ring.length];return area+p.x*q.y-q.x*p.y;
  },0));
  function edge(i,offset,y){
    const p=ring[i],a=ring[i-1],b=ring[(i+1)%ring.length];
    const dx=b.x-a.x,dz=b.y-a.y,length=Math.hypot(dx,dz);
    return [p.x*unit+winding*offset*dz/length,y,p.y*unit-winding*offset*dx/length];
  }
  // Flush decking on the land side of the ecological pond; reeds sit in the shallows.
  for(const [first,last] of [[27,63],[83,125]]){
    for(let i=first;i<last;i++){
      const a=edge(i,.32,.092),b=edge(i+1,.32,.092),c=edge(i+1,2.05,.092),d=edge(i,2.05,.092);
      const deck=batch(a[0],a[2],'metal'),grass=batch(a[0],a[2],'grass');
      const lerp=(p,q,t)=>p.map((v,k)=>v+(q[k]-v)*t);
      const count=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[2]-a[2])/.24));
      for(let j=0;j<count;j++){
        const t=j/count,next=(j+.95)/count;
        const corners=[lerp(a,b,t),lerp(a,b,next),lerp(d,c,next),lerp(d,c,t)];
        deck.quad(...(winding>0?corners:corners.reverse()),['#94826a','#a08a6e','#8e7d65'][(i+j)%3]);
      }
      const base=edge(i,-.21,.06);
      for(let j=0;j<12;j++){
        const angle=j*2.39996+i,dx=Math.cos(angle),dz=Math.sin(angle),x=base[0]+dx*.23,z=base[2]+dz*.23;
        const h=.35+(j%5)*.11,leaf=[[x-.07,.06,z],[x+.07,.06,z],[x+dx*.30,h,z+dz*.30]];
        grass.triangle(...leaf,'#727b49');grass.triangle(...leaf.reverse(),'#68773e');
      }
    }
  }
}
