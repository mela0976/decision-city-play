const jade=['#62877f','#47716d','#729d91','#35534f'];
const glass=['#638489','#7d9ca3','#496b78','#88abb0'];
const stone='#a79884';

export function buildLandmark(b,{x,z,w,d,block,pole,instance}) {
  const shape=b.shape;
  if(shape==='spire') {
    block('highglass','#7d948b',x,13,z,w*.73,26,d*.76);
    for(const side of [-1,1]){
      for(let floor=1;floor<=7;floor++){
        block('metal','#8f9f99',x,floor*3.55,z+side*d*.382,w*.735,.11,.10);
        block('metal','#8f9f99',x+side*w*.368,floor*3.55,z,.10,.11,d*.775);
      }
      for(let pl=-5;pl<=5;pl++){
        block('highglass','#607f78',x+pl*w*.062,13,z+side*d*.389,.17,26,.10);
        block('highglass','#607f78',x+side*w*.375,13,z+pl*d*.063,.10,26,.17);
      }
    }
    block('highglass','#56716a',x,75,z,w*.32,144,d*.39);
    for(let tier=0;tier<8;tier++) {
      const y=33+tier*13.2, span=w*(.75-tier*.038), depth=d*(.89-tier*.039);
      for(let level=0;level<6;level++) {
        const f=.69+level*.066;
        block('highglass',jade[(tier+level)%jade.length],x,y+level*1.54,z,span*f,1.59,depth*f);
      }
      block('highglass','#92ab9c',x,y+9.35,z,span*1.06,.67,depth*1.07);
      block('highglass','#667b71',x,y+10.9,z,span*.68,3.0,depth*.70);
      for(const s of [-1,1]) {
        block('highglass','#93a69a',x+s*span*.39,y+5.1,z-depth*.404,.3,9,.36);
        block('highglass','#93a69a',x-span*.389,y+5.1,z+s*depth*.39,.36,9,.3);
      }
    }
    block('highglass',jade[1],x,137,z,6.8,12,5.8);
    block('highglass','#a1a99b',x,148,z,2.37,13,2.4);
    pole('highglass','#e0d1b0',x,156,z,.29,7);
    pole('towerLights','#e96350',x,159.7,z,.63,.46);
    block('towerLights','#76b292',x,142.0,z,6.75,.27,5.85);
    return true;
  }
  if(shape==='twist') {
    pole('highglass','#a6a7a0',x,38,z,3.1,76);
    for(let floor=0;floor<20;floor++) {
      const a=(floor-9.5)*Math.PI/38,y=2.8+floor*3.8;
      block('highglass',glass[floor%4],x,y+1.25,z,w*.67,3.42,d*.56,a);
      block('highglass','#d4cbbc',x,y,z,w*1.01,.49,d*.72,a);
      for(const q of [-1,1]) {
        const xx=x+Math.cos(a)*q*w*.38,zz=z-Math.sin(a)*q*w*.38;
        block('highglass','#698159',xx,y+.34,zz,4.32,.51,d*.50,a);
        for(const f of [-1,0,1]) {
          instance('grass','crown','#72955e',xx-Math.sin(a)*f*1.6,y+1.04,zz-Math.cos(a)*f*1.6,1.85,1.58,1.63);
        }
      }
    }
    return true;
  }
  if(shape==='dome') {
    block('metal','#868984',x,1.43,z,w*.99,2.86,d*.95);
    instance('metal','dome','#c0c2c4',x,2.2,z,w*1.00,d*.65,d*.96);
    for(let i=0;i<26;i++) {
      const a=i*Math.PI*2/26;
      pole('metal','#aaaead',x+Math.cos(a)*w*.5,1.83,z+Math.sin(a)*d*.47,.27,2.8);
    }
    return true;
  }
  if(shape==='office') {
    const h=266,w0=w*.93,d0=d*.93;
    block('glass','#b9cdda',x,137,z,w0-.60,252,d0-.60);
    block('glass','#9db3bb',x,5.1,z,w0*.88,10.2,d0*.85);
    block('window','#d5bd90',x,3.9,z-d0*.433,w0*.69,5.7,.09);
    for(const s of [-1,1]){
      for(let floor=0;floor<54;floor++){
        const y=12+floor*4.65;
        const tint=glass[floor%4];
        block('highglass',tint,x,y,z+s*d0*.503,w0,.25,.36);
        block('highglass',tint,x+s*w0*.503,y,z,.36,.25,d0);
        if(floor%4!==2){
          block('glass','#a3b8c0',x,y+.67,z+s*d0*.497,w0*.98,1.22,.16);
          block('glass','#a3b8c0',x+s*w0*.497,y+.67,z,.16,1.22,d0*.98);
        }
      }
      for(let bay=-8;bay<=8;bay++){
        const u=bay/17;
        block('metal','#c4ccce',x+u*w0,135,z+s*d0*.505,.10,246,.22);
        block('metal','#c4ccce',x+s*w0*.505,135,z+u*d0,.22,246,.10);
      }
      for(const t of [-1,1]){
        block('metal','#d6dedb',x+t*w0*.46,136,z+s*d0*.51,.58,248,.64);
        block('metal','#b3bfc1',x+t*w0*.35,6,z+s*d0*.48,.57,12,.53);
      }
    }
    block('metal','#aabbbf',x,h-3,z,w0*.96,1.35,d0*.96);
    block('glass','#708d95',x,h-1.6,z,w0*.65,3.1,d0*.71);
    block('metal','#bac3bf',x,9.2,z-d0*.51,w0*.81,.42,7.4);
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
  if(shape==='datalab' || shape==='construction') {
    const h=shape==='construction'?76:45;
    for(let f=0;f<h;f+=3.6) {
      block('glass',glass[Math.floor(f/3.6)%4],x,f+1.8,z,w*.85,3.5,d*.8);
      block('metal','#a0aaa7',x,f+3.54,z,w*.89,.12,d*.83);
    }
    for(let j=-3;j<=3;j++) {
      block('metal','#aab2a9',x+j*w*.121,h*.49,z-d*.41,.12,h,.13);
      block('metal','#aab2a9',x-w*.432,h*.49,z+j*d*.108,.13,h,.12);
    }
    if(shape==='construction') {
      block('dark','#726954',x,h-2,z,w*.9,4,d*.9);
      const a=x+w*.41;
      block('signal','#e3b749',a,h+5,z,.51,15,.52);
      block('signal','#e3b749',a+7,h+11,z,22,.37,.47);
      block('metal','#625745',a+15,h+6.6,z,.04,8,.06);
      for(let i=0;i<6;i++) block('signal','#e3b749',a+1.2+i*2.8,h+10.8,z,2.72,.11,.35,0);
    }
    return true;
  }
  if(shape==='memorial' || shape==='cityhall' || shape==='studio') {
    const h=shape==='memorial'?7:shape==='cityhall'?15:5.4;
    block('concrete',shape==='studio'?'#8e604d':stone,x,h/2,z,w*.93,h,d*.9);
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
    if(shape==='studio') for(let i=-2;i<=2;i++) {
      block('metal','#65564d',x+i*w*.18,h+.35,z,w*.19,.85,d*.94);
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
