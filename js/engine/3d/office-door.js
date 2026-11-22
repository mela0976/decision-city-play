import * as T from '../vendor/three.module.min.js?v=c9f6d84';
import {venuePoint} from '../venue-entrances.mjs?v=c9f6d84'; // A27
import {officeDoor,officeLeaf} from '../office-entrance.mjs?v=c9f6d84';
import {metersPerUnit as unit} from '../world.mjs?v=c9f6d84';

export function createOfficeDoor(parent,venue=null){ // A27 share the sliding glass hardware
  const halfLeaf=venue?venue.opening/4:officeDoor.halfLeaf;
  const box=new T.BoxGeometry(1,1,1);
  const metal=new T.MeshStandardMaterial({color:'#687a79',metalness:.58,roughness:.28});
  const glass=new T.MeshStandardMaterial({color:'#b5d9dc',metalness:.28,roughness:.11,
    transparent:true,opacity:.42,depthWrite:false,envMapIntensity:1.25});
  const highlight=new T.MeshStandardMaterial({color:'#d6e9e5',metalness:.35,roughness:.25});
  const leaves=[],transform=new T.Object3D();
  for(const side of [-1,1]){
    const leaf=new T.Group();
    leaf.rotation.y=venue?Math.PI/2-venue.site.viewHeading:-officeDoor.heading;
    const panel=2*halfLeaf;
    const parts=new Map();
    function part(material,x,y,w,h,d){
      if(!parts.has(material))parts.set(material,[]);
      parts.get(material).push([x,y,w,h,d]);
    }
    part(glass,0,1.51,panel-.08,2.65,.05);
    for(const edge of [-1,1]){
      part(metal,edge*(panel*.5-.022),1.51,.044,2.76,.10);
      part(metal,0,1.51+edge*1.355,panel,.055,.10);
    }
    part(highlight,-side*(panel*.5-.15),1.15,.055,.37,.12);
    part(highlight,0,1.14,panel-.07,.024,.069);
    for(const [material,pieces] of parts){
      const mesh=new T.InstancedMesh(box,material,pieces.length);
      pieces.forEach(([x,y,w,h,d],index)=>{
        transform.position.set(x,y,0);
        transform.scale.set(w,h,d);
        transform.updateMatrix();
        mesh.setMatrixAt(index,transform.matrix);
      });
      mesh.computeBoundingSphere();
      leaf.add(mesh);
    }
    parent.add(leaf);
    leaves.push({side,leaf});
  }
  return progress=>{
    for(const {side,leaf} of leaves){
      const {x,y}=venue?venuePoint(venue,side*(halfLeaf+(2*halfLeaf+.08)*progress)):officeLeaf(side,progress); // A27
      leaf.position.set(x*unit,0,y*unit);
    }
  };
}

export function placeOfficeReception(obj){
  // A23 landmarks2: warm timber soffit, bronze fins and polished stone reception.
  for(let i=-9;i<=9;i++){
    obj('metal','box',i%2?'#987a5c':'#ad9070',i*.52,4.77,4.88,.42,.095,2.71);
    if(i%3===0)obj('lobbyLight','box','#ffe1a6',i*.52,4.70,4.80,.045,.040,2.46);
  }
  for(const side of [-1,1]){
    obj('concrete','box','#a5957e',side*3.53,.51,7.53,1.25,1.02,.58);
    obj('metal','box','#d1b795',side*3.53,1.07,7.48,1.36,.11,.66);
    for(const u of [2.06,2.28,2.50,2.72,2.94])
      obj('lobbyTrim','box','#a6886a',side*u,2.72,7.89,.072,4.16,.21);
    obj('lobbyLight','box','#ffdfaa',side*3.25,2.49,7.83,.12,1.94,.12);
  }
}
