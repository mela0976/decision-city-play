const jade=['#4f8781','#517a7a','#628d89','#355d63'];
const glass=['#638489','#7d9ca3','#496b78','#88abb0'];
const stone='#a79884';

export function buildLandmark(b,{x,z,w,d,block,pole,instance,curtain='glass'}) {
  const shape=b.shape;
  if(shape==='spire') {
    // A two-storey glazed podium recessed between stone piers on all four fronts.
    // Keep every ground-level pier inside the mapped collision footprint and its east notch.
    block('glass','#425e61',x,3,z,w*.548,6,d*.548);
    for(const side of [-1,1]){
      for(const alongX of [true,false]){
        const span=(alongX?w:d)*.56,edge=(alongX?d:w)*.275;
        const face=(kind,tint,u,y,out,width,height,depth)=>{
          if(alongX)block(kind,tint,x+u,y,z+side*(edge+out),width,height,depth);
          else block(kind,tint,x+side*(edge+out),y,z+u,depth,height,width);
        };
        for(let bay=-8;bay<=8;bay++){
          const u=bay*span/17;
          face('glass',bay%3?'#5e7a79':'#74918d',u,3.06,.16,span/17-.22,5.70,.22);
          face('metal','#a49c8c',u,3.04,.32,.14,5.8,.28);
          if(bay%3===0)face('concrete','#c0b5a2',u,4.32,1.37,1.13,8.64,1.48);
        }
        face('metal','#8c9387',0,4.25,.42,span,.17,.30);
        face('concrete','#aba390',0,6.14,1.16,span+.8,.41,3.26);
        face('metal','#8eaaa5',0,6.50,1.93,span*.51,.22,6.10);
        for(let k=-4;k<=4;k++)face('metal','#586f70',k*span*.056,6.32,2.08,.13,.20,5.85);
      }
    }
    for(let floor=0;floor<6;floor++){
      const y=7.5+floor*1.2;
      block('highglass',glass[floor%4],x,y,z,w*.69,1.18,d*.70);
      block('metal','#8b9996',x,y+.51,z,w*.70,.17,d*.71);
    }
    const podiumTop=14.2;
    block('concrete','#a6a497',x,podiumTop,z,w*.72,.38,d*.73);
    for(let section=0;section<5;section++){
      const span=w*(.49-section*.017),depth=d*(.47-section*.017);
      const y=17+section*4.2;
      block('highglass',jade[section%4],x,y,z,span,4.2,depth);
      block('metal','#a79479',x,y+2,z,span*1.015,.20,depth*1.015);
    }
    for(let tier=0;tier<8;tier++){
      const y=36+tier*12.15,span=w*(.46-tier*.009),depth=d*(.43-tier*.008);
      instance('highglass','spireTier',jade[tier%4],x,y+4.88,z,span,9.76,depth);
      block('highglass','#a5b6a6',x,y+9.77,z,span,.24,depth);
      block('highglass','#3c6469',x,y+10.96,z,span*.79,2.40,depth*.79);
      // The paired jade reliefs mark the bottom of each tier on all four façades.
      for(const side of [-1,1]){
        block('highglass','#7b9c96',x,y+1.10,z+side*depth*.438,2.2,1.17,.29);
        block('highglass','#7b9c96',x+side*span*.438,y+1.10,z,.29,1.17,2.2);
      }
    }
    block('highglass',jade[1],x,136,z,19,7.1,17);
    block('highglass','#789595',x,143,z,8.1,8.3,7.5);
    block('metal','#a9b4ab',x,150,z,2.45,13,2.45);
    pole('metal','#d8d1b6',x,157.45,z,.75,5.0);
    pole('towerLights','#e96350',x,159.85,z,.78,.30);
    return true;
  }
  if(shape==='twist') {
    pole('highglass','#a6a7a0',x,38,z,3.1,76);
    for(let floor=0;floor<20;floor++) {
      const a=(floor-9.5)*Math.PI/38,y=2.8+floor*3.8;
      block('highglass',glass[(floor+2)%4],x,y+1.25,z,w*.65,3.42,d*.54,a);
      block('highglass','#b6b7aa',x,y,z,w*.76,.34,d*.63,a);
      for(const q of [-1,1]) {
        const xx=x+Math.cos(a)*q*w*.332,zz=z-Math.sin(a)*q*w*.332;
        block('highglass','#698159',xx,y+.34,zz,4.1,.51,d*.51,a);
        block('highglass','#d0cec3',xx,y+1.93,zz,.38,3.42,d*.54,a);
        for(const f of [-2,-1,0,1,2]) {
          const color=(floor+f)%3===0?'#6b8a59':'#597b4e';
          instance('grass','crown',color,xx-Math.sin(a)*f*3.6,y+1.04,zz-Math.cos(a)*f*3.6,2.52,1.37,2.31);
        }
      }
    }
    return true;
  }
  if(shape==='dome') {
    instance('concrete','cylinder','#a8a49a',x,1.42,z,w*.94,2.86,d*.90);
    instance('glass','cylinder','#79909a',x,3.58,z,w*.956,1.66,d*.925);
    instance('metal','cylinder','#aeb5b7',x,4.48,z,w*.987,.54,d*.96);
    instance('metal','dome','#bfc5c6',x,4.54,z,w*.99,d*.31,d*.964);
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12;
      const px=x+Math.cos(a)*w*.473,pz=z+Math.sin(a)*d*.453;
      pole('metal','#888f92',px,3.49,pz,.29,2.19);
    }
    for(let rib=0;rib<16;rib++){
      const heading=rib*Math.PI/8;
      const at=t=>[
        x+Math.cos(t)*Math.cos(heading)*w*.495,
        4.58+Math.sin(t)*d*.155,
        z+Math.cos(t)*Math.sin(heading)*d*.482,
      ];
      for(let span=0;span<6;span++){
        const a=at(span*.18),b=at((span+1)*.18);
        const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],horizontal=Math.hypot(dx,dz);
        instance('metal','box','#aab2b3',(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,
          Math.hypot(horizontal,dy)+.02,.13,.31,-Math.atan2(dz,dx),0,Math.atan2(dy,horizontal));
      }
    }
    block('metal','#a9b2b1',x,3.79,z-d*.44,w*.39,.34,d*.104);
    return true;
  }
  if(shape==='office') {
    const h=266,w0=w*.93,d0=d*.93;
    block(curtain,'#eceef0',x,137,z,w0-.60,252,d0-.60);
    block('glass','#9db3bb',x,5.1,z,w0*.88,10.2,d0*.85);
    block('window','#d5bd90',x,3.9,z-d0*.433,w0*.69,5.7,.09);
    for(const s of [-1,1]){
      // A23 towers: metric mullions and floor bands are drawn by the curtain material.
      for(const t of [-1,1]){
        block('metal','#d6dedb',x+t*w0*.46,136,z+s*d0*.51,.58,248,.64);
        block('metal','#b3bfc1',x+t*w0*.35,6,z+s*d0*.48,.57,12,.53);
      }
    }
    block('metal','#aabbbf',x,h-3,z,w0*.96,1.35,d0*.96);
    block('glass','#708d95',x,h-1.6,z,w0*.65,3.1,d0*.71);
    block('concrete','#a5a6a0',x,5.1,z,w0*.92,10.2,d0*.86);
    block('glass','#58777f',x,4.65,z-d0*.437,w0*.77,7.9,.26);
    block('metal','#bac3bf',x,8.82,z-d0*.51,w0*.81,.42,7.4);
    for(const f of [-1,1]){
      block('grass','#769261',x+f*(w0/2+5),.18,z,8.2,.38,d0*.98);
      for(let i=0;i<5;i++){
        const cx=x+f*(w0/2+5),cz=z+(i-2)*7.6;
        pole('metal','#7b6952',cx,1.35,cz,.20,2.7);
        instance('grass','crown','#547348',cx,3.6,cz,3.6,2.5,3.3);
      }
    }
    return true;
  }
  if(shape==='museum'){
    block('concrete','#b5b0a1',x,6.5,z,w*.95,13,d*.92);
    block('glass','#afd0d1',x,7.2,z-d*.468,w*.86,10.4,.28);
    block('metal','#bfc2b6',x,12.3,z-d*.48,w*.98,.63,1.9);
    block('metal','#ba503c',x+w*.21,15.3,z,.31,5.1,.31);
    block('metal','#ba503c',x+w*.21,17.75,z,w*.58,.22,.34);
    return true;
  }
  if(shape==='datalab'){
    block('concrete','#a29b89',x,3.5,z,w*.88,7,d*.85);
    block('glass','#647d8b',x,3.7,z-d*.427,w*.71,4.85,.27);
    block('metal','#a7a59b',x,5.8,z-d*.439,w*.80,.36,2.65);
    for(let section=0;section<4;section++){
      const span=w*(.61-section*.041),depth=d*(.86-section*.043);
      const y=7+section*9.5;
      block(curtain,'#e2e6e4',x,y+4.75,z,span,9.5,depth);
      block('metal','#a68a66',x,y+.16,z,span*1.012,.32,depth*1.012);
      // A23 towers: the tier-wide material keeps its metre scale after landmark scaling.
    }
    return true;
  }
  if(shape==='construction') {
    const h=76;
    for(let f=0;f<h;f+=3.6) {
      block('glass',glass[Math.floor(f/3.6)%4],x,f+1.8,z,w*.85,3.5,d*.8);
      block('metal','#a0aaa7',x,f+3.54,z,w*.89,.12,d*.83);
    }
    for(let j=-3;j<=3;j++) {
      block('metal','#aab2a9',x+j*w*.121,h*.49,z-d*.41,.12,h,.13);
      block('metal','#aab2a9',x-w*.432,h*.49,z+j*d*.108,.13,h,.12);
    }
    block('dark','#726954',x,h-2,z,w*.9,4,d*.9);
    const a=x+w*.41;
    block('signal','#e3b749',a,h+5,z,.51,15,.52);
    block('signal','#e3b749',a+7,h+11,z,22,.37,.47);
    block('metal','#625745',a+15,h+6.6,z,.04,8,.06);
    for(let i=0;i<6;i++) block('signal','#e3b749',a+1.2+i*2.8,h+10.8,z,2.72,.11,.35,0);
    return true;
  }
  if(shape==='studio'){
    const h=7.8;
    block('concrete','#c0a679',x,h/2,z,w*.91,h,d*.91);
    block('concrete','#aeaa9c',x,h+.12,z,w*.96,.24,d*.96);
    const alongX=w>d,span=alongX?w:d,depth=alongX?d:w;
    const bays=Math.max(4,Math.round(span/3.8));
    const step=span*.87/bays;
    for(const side of [-1,1]){
      const part=(kind,tint,u,y,v,ww,hh,dd)=>alongX
        ?block(kind,tint,x+u,y,z+v,ww,hh,dd)
        :block(kind,tint,x+v,y,z+u,dd,hh,ww);
      part('concrete','#948572',0,3.65,side*depth*.463,span*.93,.38,.19);
      for(let bay=0;bay<bays;bay++){
        const u=(bay+.5-bays/2)*step;
        part('glass',glass[bay%4],u,5.75,side*depth*.458,step*.76,2.48,.13);
        part('glass','#566363',u,2.08,side*depth*.460,step*.64,2.53,.12);
        for(const t of [-1,0,1]){
          part('metal','#454b48',u+t*step*.25,5.75,side*depth*.47,.072,2.52,.10);
        }
        part('metal','#454b48',u,5.75,side*depth*.47,step*.76,.085,.10);
        part('concrete','#787568',u-step*.45,1.89,side*depth*.473,.33,3.78,.31);
        part('concrete',bay%3?'#af9670':'#9e8970',u+step*.41,5.01,side*depth*.456,.21,2.78,.065);
      }
    }
    return true;
  }
  if(shape==='memorial' || shape==='cityhall') {
    const h=shape==='memorial'?7:15;
    block('concrete',stone,x,h/2,z,w*.93,h,d*.9);
    for(let i=-4;i<=4;i++) {
      const xx=x+i*w*.098;
      block('concrete','#cfc8b8',xx,h*.45,z-d*.48,.48,h*.91,.49);
      block('glass','#536567',xx+.75,h*.49,z-d*.45,.87,h*.60,.12);
    }
    if(shape==='memorial') {
      for(let i=0;i<6;i++) {
        block('metal','#514839',x,h+i*.64,z,w*(1.09-i*.105),.74,d*(1.10-i*.145));
      }
      block('signal','#a88652',x,h+4.0,z,w*.51,.28,.36);
    }
    if(shape==='cityhall') {
      for(const s of [-1,1]) block('concrete','#b9a995',x+s*w*.36,h*.6,z,w*.26,h*1.22,d*.96);
      block('glass','#607d84',x,h*.65,z-d*.457,w*.52,h*.41,.14);
    }
    return true;
  }
  if(shape==='cinema'||shape==='mall'||shape==='village') {
    const h=shape==='village'?3.9:shape==='mall'?19:13;
    block('concrete',shape==='village'?'#b0a08a':'#a49588',x,h/2,z,w*.94,h,d*.91);
    block('glass','#719392',x,h*.49,z-d*.457,w*.74,h*.52,.11);
    if(shape==='village') {
      for(let i=0;i<6;i++) block('metal','#805645',x,h+i*.24,z,w*(1.04-i*.055),.25,d*(1.04-i*.14));
      return true;
    }
    for(let i=0;i<8;i++) {
      const px=x+(i-3.5)*w*.103;
      block('metal','#999789',px,h*.48,z-d*.49,.12,h*.82,.13);
    }
    block('metal','#606d70',x,3.88,z-d*.58,w*.98,.30,2.65);
    block('luminous','#d7b477',x,h*.76,z-d*.466,w*.76,.55,.095);
    return true;
  }
  if(shape==='park') {
    block('grass','#789365',x,.12,z,w,.22,d);
    block('concrete','#a6a38e',x,2.87,z,w*.53,.26,d*.4);
    for(const s of [-1,1]) for(const t of [-1,1]) pole('concrete','#85755f',x+s*w*.24,1.4,z+t*d*.17,.21,2.8);
    return true;
  }
  return false;
}
