// The shrine occupies the narrow parcel beside the Fude Street marker.
// Positive depth faces the altar; dimensions and heights are in metres.
import {metersPerUnit as unit} from '../world.mjs?v=b28f5ae';

function templeFrame(p){
  const a=p.viewHeading,s=Math.sin(a),c=Math.cos(a);
  return {turn:Math.PI/2-a,at:(u,h,d)=>[
    p.x*unit+(u-9.4)*s+d*c,h,p.y*unit-(u-9.4)*c+d*s
  ]};
}

// The physics visitor receives only solids that reach walking height.
export function placeTempleCourt(p,instance){
  const {at,turn}=templeFrame(p);
  const part=(kind,shape,tint,u,h,d,w,height,depth)=>instance(kind,shape,tint,...at(u,h,d),w,height,depth,turn);
  const box=(color,...args)=>part('concrete','box',color,...args);
  const round=(color,u,y,d,w,h)=>part('concrete','cylinder',color,u,y,d,w,h,w);
  box('#664338',0,1.62,9.15,7.35,3.24,.36);
  for(const side of [-1,1]){
    box('#9e684d',side*3.51,1.58,7.4,.34,3.16,3.6);
    box('#5e322b',side*2.38,1.48,7.48,1.65,2.96,.2);
    for(const u of [1.22,3.22]){
      round('#948b7b',side*u,.16,5.45,.49,.32);
      round('#aa352a',side*u,1.70,5.45,.34,2.84);
    }
  }
  // A27 keep the censer to one side of the entry aisle.
  // Offering table, bronze tripod censer and brick paper furnace.
  box('#79442d',0,.64,7.95,1.82,1.28,.64);
  for(const u of [-.27,.27])round('#67583c',u-2.1,.24,3.35,.13,.47);
  round('#685c42',-2.1,.57,3.35,.75,.30);
  round('#998154',-2.1,.75,3.35,.91,.14);
  box('#93634d',3.60,.78,2.70,1.08,1.56,1.04);
  box('#59443c',3.60,1.59,2.70,1.18,.13,1.14);
  // Banyan and the granite furniture below its crown.
  round('#796757',-4.48,1.70,3.22,.87,3.40);
  round('#847f74',-3.48,.37,1.85,.37,.74);
  round('#a69d8e',-3.48,.79,1.85,.96,.13);
  for(const [u,d] of [[-4.38,1.54],[-2.70,1.29],[-3.13,2.71]]){
    round('#736e62',u,.18,d,.24,.36);
    round('#9a9283',u,.40,d,.42,.085);
  }
}

export function addTemple(p,{instance,batch,sign,foliage}){
  placeTempleCourt(p,instance);
  const {at,turn}=templeFrame(p);
  const block=(tint,u,h,d,w,height,depth,kind='concrete')=>
    instance(kind,'box',tint,...at(u,h,d),w,height,depth,turn);
  const ellipsoid=(tint,u,h,d,w,height,depth,kind='concrete')=>
    instance(kind,'crown',tint,...at(u,h,d),w,height,depth,turn);
  const [x,,z]=at(0,0,6);
  const roof=batch(x,z,'metal'),pavers=batch(x,z,'paving');
  // A connected, double-sided hip roof. Tile ribs follow the swept surface along its slope.
  const surf=(u,t,side)=>{
    const end=(Math.abs(u)/4.26)**4;
    return at(u,4.61-1.35*Math.sin(t*1.35)+end*(.75-.22*t),7.34+side*t*(2.63-.76*end));
  };
  for(let i=0;i<48;i++){
    const u=-4.26+i*8.52/48,v=u+8.52/48;
    for(const side of [-1,1]){
      for(let j=0;j<4;j++){
        const t=j/4,next=(j+1)/4;
        const q=[surf(u,t,side),surf(v,t,side),surf(v,next,side),surf(u,next,side)];
        const tint=['#594a40','#69594a','#76614b','#72594a'][(i+j)%4];
        roof.quad(...(side===-1?q:q.reverse()),tint);
        const a=surf(u,t,side),b=surf(u,next,side),c=surf(u+.045,next,side),d=surf(u+.045,t,side);
        c[1]+=.052;d[1]+=.052;
        roof.quad(...(side===1?[a,b,c,d]:[d,c,b,a]),'#927653');
      }
      const lip=surf((u+v)/2,1,side);
      instance('concrete','box','#a15c40',...lip,.184,.16,.16,turn);
    }
    const end=(Math.abs((u+v)/2)/4.26)**4;
    block('#9b5a41',(u+v)/2,4.72+end*.75,7.34,.19,.25,.19);
    block(i%3?'#658b79':'#c99454',(u+v)/2,4.85+end*.75,7.34,.18,.082,.17);
  }
  // Ceramic split tips, glazed relief and painted lintel below the eaves.
  for(const side of [-1,1]){
    for(let i=0;i<7;i++){
      const t=i/6;
      ellipsoid('#638879',side*(3.70+.75*t),5.14+.72*t*t,7.34,.23,.22,.18);
      ellipsoid('#bf8651',side*(3.83+.51*t),5.16+.65*t,7.32+.34*t,.17,.19,.14);
    }
    // Coiling stone dragon bodies, gilded heads and horns on the inner red pillars.
    for(let i=0;i<25;i++){
      const t=i/24,a=t*3.15*Math.PI;
      ellipsoid(i%4?'#899585':'#b29a68',side*1.22+.20*Math.cos(a),.49+2.18*t,
        5.45+.20*Math.sin(a),.135,.20,.14);
    }
    ellipsoid('#b4a37c',side*1.22,2.71,5.20,.29,.24,.39);
    for(const v of [-.085,.085])ellipsoid('#b48850',side*1.22+v,2.87,5.28,.053,.21,.07);
    for(const v of [-.60,0,.60])block('#a36240',side*2.38+v,1.68,7.34,.07,2.28,.065);
    for(const y of [.77,1.17,1.98,2.54])block('#a16542',side*2.38,y,7.34,1.56,.062,.065);
  }
  block('#623c31',0,3.03,5.45,7.16,.38,.36);
  block('#a98350',0,3.15,5.24,7.22,.06,.09);
  for(const u of [-2.65,-1.80,1.80,2.65]){
    block('#776347',u,2.86,5.19,.035,.37,.035);
    ellipsoid('#dc4932',u,2.56,5.19,.40,.46,.40);
    block('#bc934f',u,2.29,5.19,.09,.12,.08);
  }
  const [sx,,sz]=at(0,0,5.21);
  sign('福德祠',sx,3.01,sz,-Math.PI/2-p.viewHeading,'#654337',false,1.64,.44);
  // Reuse only the door panels of the project's original shrine atlas.
  const doors=batch(x,z,'temple');
  function door(u,depth,w,height,atlasU,atlasW){
    doors.quad(at(u+w/2,.12,depth),at(u-w/2,.12,depth),at(u-w/2,height,depth),
      at(u+w/2,height,depth),'#f0d1af',atlasW,.48,atlasU,.07);
  }
  for(const side of [-1,1])door(side*2.38,7.30,1.71,2.85,.16,.10);
  door(0,8.92,3.20,2.97,.408,.178);
  // The paired ridge guardians face an amber pearl; their crests break the skyline.
  for(const side of [-1,1]){
    for(let i=0;i<16;i++){
      const t=i/15,u=side*(.85+t*1.54),y=5.04+.35*Math.sin(t*Math.PI*2);
      ellipsoid(i%4?'#57887b':'#cf9753',u,y,7.34,.22,.155,.17);
      if(i%3===0)ellipsoid('#c1894e',u+.045*side,y+.12,7.34,.094,.19,.11);
    }
    ellipsoid('#5c8f83',side*.80,5.13,7.34,.35,.25,.27);
    ellipsoid('#c19a63',side*.64,5.08,7.32,.22,.13,.18);
    ellipsoid('#cc965e',side*.90,5.34,7.34,.073,.30,.12);
  }
  ellipsoid('#cb8b42',0,5.07,7.34,.36,.36,.36);
  block('#bb8550',0,1.54,8.06,.65,.35,.39);
  ellipsoid('#c79755',0,1.92,8.08,.29,.36,.29);
  for(const u of [-.61,.61])block('#e67e4b',u,1.49,7.75,.09,.39,.09);
  for(const u of [-.18,-.04,.12])block('#b6633f',u-2.1,.98,3.35,.019,.37,.019);
  for(const side of [-1,1])ellipsoid('#88764e',-2.1+side*.47,.78,3.35,.16,.23,.14);
  block('#443a35',3.60,.74,2.165,.63,.58,.035);
  block('#d47d42',3.60,.52,2.139,.52,.095,.024);
  for(let row=0;row<10;row++){
    const y=.12+row*.145;
    for(const side of [-1,1])block('#715245',3.60+side*.43,y,2.171,.19,.018,.033);
    if(y>1.07||y<.38)block('#755547',3.60,y,2.171,.8,.019,.032);
  }
  block('#88604a',3.60,1.92,2.70,.52,.61,.53);
  block('#5c5147',3.60,2.24,2.70,.65,.10,.68);
  for(let i=0;i<9;i++){
    const a=i*2.39996,r=1.58+(i%3)*.27;
    const u=-4.48+r*Math.cos(a),d=3.22+r*Math.sin(a);
    ellipsoid('#685b44',(u-4.48)/2,3.42+(i%2)*.25,(d+3.22)/2,1.72,.58,1.55);
    if(foliage){
      instance('grass','vegetationCards',['#bfccab','#d4dcb6','#b3c3a8'][i%3],
        ...at(u,4.79+(i%3)*.38,d),3.7,2.82,3.53,a,0,0,'leaf');
    }else ellipsoid('#526746',u,4.75+(i%3)*.38,d,3.4,2.22,3.08);
    for(let k=0;k<3;k++){
      const len=1.0+((i*7+k*3)%11)*.15;
      block('#796b50',u+.16*k,3.75-len/2,d+.10*k,.031,len,.039);
    }
  }
  for(let i=0;i<13;i++)for(let j=0;j<10;j++){
    const u=-4.55+i*.71,d=-.20+j*.74,y=.008;
    // A24 keep temple tiles below the adjoining asphalt where the parcel meets the road.
    pavers.quad(at(u,y,d),at(u,y,d+.724),at(u+.696,y,d+.724),at(u+.696,y,d),
      (i*3+j)%5?'#afa397':'#bcac9f',.48,.48);
  }
}
