// A27. The fixture visitor and the renderer both consume these metre-scale solids.
import {metersPerUnit as unit} from '../world.mjs?v=0da320b3';
import {venues,venuePoint,canopyReach} from '../venue-entrances.mjs?v=0da320b3';

const palettes={
  home:['#b9a592','#534d49','#705647'],
  breakfast:['#deb688','#783f34','#eacb93'],
  client_hq:['#637977','#42605f','#acc3ba'],
  mrt:['#536d79','#305a70','#90b5bd'],
  department:['#c5af90','#735f56','#d2b893'],
  convenience:['#dde4d3','#226c64','#f3ba64'],
  studio:['#bf9e6e','#6d5140','#a35f46'],
  datalab:['#79929a','#3e5563','#91b6b8'],
  tvstation:['#a7ada8','#394d5e','#abb8bf'],
  gamadiam:['#b08a6b','#665441','#a56b4f'],
  rechao:['#bfa78c','#873f32','#cf965b'],
};

export function placeVenueFront(p,{instance,sign}){
  const v=venues.get(p.id);
  if(!v)return false;
  const {width:w,opening:o,height:h}=v,turn=Math.PI/2-p.viewHeading;
  const box=(kind,color,s,y,d,width,height,depth)=>{
    const at=venuePoint(v,s,d);
    instance(kind,'box',color,at.x*unit,y,at.y*unit,width,height,depth,turn);
  };
  if(p.id==='office'||p.id==='temple'){
    // Complete the lateral returns of the existing hand-modelled lobby/shrine.
    for(const side of [-1,1]){
      const office=p.id==='office';
      box(office?'lobbyGlass':'concrete',office?'#9bb4b3':'#a1644e',
        side*(office?w/2:1.22),1.42,1.16,.16,2.83,2.34);
      if(!office)box('concrete','#a1644e',side*(w/2-.08),1.48,1.80,.16,2.96,3.7);
      if(!office)box('concrete','#a7644e',side*(w+o)/4,1.02,0,(w-o)/2,2.04,.19);
    }
    return false;
  }
  const [wall,frame,accent]=palettes[p.id];
  const food=p.id==='breakfast'||p.id==='rechao';
  const heritage=p.id==='studio'||p.id==='gamadiam';
  const tower=['client_hq','datalab','department','tvstation'].includes(p.id);
  const back=2.28,reach=canopyReach(v),lintel=h-.43;
  const wing=(w-o)/2;
  // Actual front opening, return walls and rear wall. Nothing spans the pedestrian aisle.
  for(const side of [-1,1]){
    const s=side*(o+wing)/2;
    box(tower||p.id==='convenience'?'lobbyGlass':'concrete',wall,s,lintel/2,0,wing,lintel,.17);
    box('metal',frame,side*o/2,lintel/2,-.04,.12,lintel,.21);
    box('concrete',wall,side*(w/2-.09),h/2,back/2,.18,h,back+.2);
    if(tower||p.id==='convenience'){
      box('metal',frame,s,1.02,-.102,wing,.065,.08);
      box('metal',frame,s,h*.43,-.11,.06,h*.82,.08);
    }
  }
  box('concrete',frame,0,h/2,back,w,h,.18);
  box('metal',frame,0,lintel+.15,0,w,.30,.22);
  box('concrete','#aaa397',0,.045,.80,w,.085,3.1);
  box('metal',frame,0,h,(back-reach)/2,w+.24,.18,back+reach);
  box('lobbyLight','#ffe3aa',0,h-.115,.64,Math.min(w-1,3.4),.045,.14);
  box('lobbyLight','#e9bc87',0,lintel-.37,back-.12,o*.84,.16,.055);

  // A lit rear reveal, layered glazing and a skirting strip give the foyer visible depth.
  const inset=o*.76;
  if(food){
    // A service hatch and cooking shelf at the rear leave the whole arcade open.
    box('metal','#615448',0,1.64,back-.12,w*.73,1.12,.06);
    box('metal','#b0aca0',0,1.13,back-.19,w*.79,.12,.22);
    for(let i=0;i<4;i++)box('metal',i%2?'#8f7251':'#b89165',(i-1.5)*.47,1.35,back-.17,.33,.26,.12);
    box('metal','#92877b',0,2.22,back-.18,w*.65,.18,.28);
  }else if(heritage){
    // A lit steel-framed workshop window beyond the open timber leaves.
    box('lobbyLight','#bba079',0,1.63,back-.12,inset,1.26,.06);
    for(let i=-2;i<=2;i++)box('metal','#504d42',i*inset/5,1.63,back-.17,.049,1.3,.045);
    box('metal','#504d42',0,1.61,back-.17,inset,.056,.045);
  }else{
    box('metal','#485c5b',0,1.43,back-.125,inset,2.55,.05);
    for(const side of [-1,1]){
      box('lobbyGlass','#bcc5b6',side*inset*.26,1.58,back-.17,inset*.42,1.67,.03);
      box('metal',frame,side*inset*.49,1.42,back-.18,.065,2.74,.07);
    }
  }
  box('metal',accent,0,.20,back-.17,w-.35,.23,.07);
  for(const side of [-1,1])box('lobbyLight','#f5d59c',side*(o/2+.18),2.03,-.14,.095,.49,.065);
  if(heritage){
    for(const side of [-1,1]){
      // Paired timber sliding leaves parked behind the jambs, brick bond below ochre tile.
      const s=side*(o+wing)/2;
      for(let i=0;i<5;i++)box('metal',i%2?'#755642':'#86674d',s+(i-2)*wing*.15,1.36,-.13,wing*.143,2.59,.09);
      for(let row=0;row<4;row++)for(let col=0;col<4;col++)
        box('concrete',row%2?'#a66750':'#aa7356',s+(col-1.5+(row%2)*.12)*wing*.21,.19+row*.18,-.20,wing*.20,.16,.06);
      box('metal',accent,side*(w/2-.27),h/2,-reach+.27,.23,h,.24);
    }
    for(let i=-4;i<=4;i++)box('metal','#795e46',i*w/10,h-.18,(back-reach)/2,.12,.21,reach+back);
    if(p.id==='studio'){
      // A clerestory above the deep eave follows the ref09 warehouse window rhythm.
      box('concrete','#ae9676',0,h+1.22,back,w,2.53,.28);
      box('metal','#655d4c',0,h+2.53,back-.09,w+.18,.15,.65);
      for(let i=-3;i<=3;i++){
        box('glass','#718078',i*1.42,h+1.26,back-.20,1.19,1.62,.10);
        box('metal','#5c594d',i*1.42,h+1.26,back-.26,.065,1.62,.05);
        box('metal','#5c594d',i*1.42,h+1.26,back-.26,1.20,.065,.05);
      }
      for(let i=0;i<3;i++)box('concrete','#b4aa94',0,.015+i*.012,-.88+i*.25,o+.35,.03+i*.024,.28);
    }
  }else if(food){
    const counterSide=w/2-.67;
    box('metal','#aab1a9',-counterSide,1.05,.83,1.0,.12,.56);
    box('metal','#696f67',-counterSide,.58,.90,.88,.83,.44);
    for(let i=0;i<12;i++)box('metal',i%2?frame:accent,(i-5.5)*w/12,h-.13,-reach,w/12,.25,.12);
    for(const side of [-1,1]){
      const s=side*(w/2-.56);
      box('metal','#8b8170',s,.74,1.13,.76,.09,.76);
      box('metal',frame,s,.36,1.13,.12,.72,.12);
      box('metal',accent,s,.40,.45,.43,.13,.39);
      box('metal',frame,s,.19,.45,.13,.37,.13);
    }
  }else if(p.id==='convenience'){
    for(const [y,col] of [[h+.13,frame],[h-.02,accent]])box('metal',col,0,y,-reach,w+.24,.14,.14);
    for(const side of [-1,1])for(let row=0;row<3;row++){
      const s=side*(w/2-.76);
      box('metal','#bec4b8',s,.65+row*.42,1.49,1.23,.06,.48);
      for(let i=0;i<4;i++)box('metal',[accent,'#92aa89','#ae7363'][(i+row)%3],s+(i-1.5)*.24,.79+row*.42,1.41,.16,.23,.14);
    }
  }else if(p.id==='home'){
    for(let i=0;i<5;i++)box('metal',accent,-w/2+.23+i*.17,1.45,-.12,.075,2.65,.07);
  }else if(tower){
    for(let i=-2;i<=2;i++)box('metal',accent,i*w/5.4,h+.12,-reach/2,.075,.09,reach+.2);
  }
  const at=venuePoint(v,0,-reach-.10);
  sign(p.name,at.x*unit,h-.07,at.y*unit,-Math.PI/2-p.viewHeading,frame,false,Math.min(4.2,w*.77),.43);
  return true;
}
