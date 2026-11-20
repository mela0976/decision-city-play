import * as T from '../vendor/three.module.min.js';
import {officeDoor,officeLeaf} from '../office-entrance.mjs';
import {metersPerUnit as unit} from '../world.mjs';

export function createOfficeDoor(parent){
  const box=new T.BoxGeometry(1,1,1);
  const metal=new T.MeshStandardMaterial({color:'#687a79',metalness:.58,roughness:.28});
  const glass=new T.MeshStandardMaterial({color:'#b5d9dc',metalness:.28,roughness:.11,
    transparent:true,opacity:.42,depthWrite:false,envMapIntensity:1.25});
  const highlight=new T.MeshStandardMaterial({color:'#d6e9e5',metalness:.35,roughness:.25});
  const leaves=[];
  for(const side of [-1,1]){
    const leaf=new T.Group();
    leaf.rotation.y=-officeDoor.heading;
    const panel=2*officeDoor.halfLeaf;
    function part(material,x,y,w,h,d){
      const mesh=new T.Mesh(box,material);
      mesh.scale.set(w,h,d);
      mesh.position.set(x,y,0);
      leaf.add(mesh);
    }
    part(glass,0,1.51,panel-.08,2.65,.05);
    for(const edge of [-1,1]){
      part(metal,edge*(panel*.5-.022),1.51,.044,2.76,.10);
      part(metal,0,1.51+edge*1.355,panel,.055,.10);
    }
    part(highlight,-side*(panel*.5-.15),1.15,.055,.37,.12);
    part(highlight,0,1.14,panel-.07,.024,.069);
    parent.add(leaf);
    leaves.push({side,leaf});
  }
  return progress=>{
    for(const {side,leaf} of leaves){
      const {x,y}=officeLeaf(side,progress);
      leaf.position.set(x*unit,0,y*unit);
    }
  };
}
