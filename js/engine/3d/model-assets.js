import * as T from '../vendor/three.module.min.js?v=eb4dc5b';
import {GLTFLoader} from '../vendor/three-examples/loaders/GLTFLoader.js?v=eb4dc5b';
import {DRACOLoader} from '../vendor/three-examples/loaders/DRACOLoader.js?v=eb4dc5b';

const optionalVehicles={garbage_truck:6.5,bus:12};
const catalog={
  rider_scooter:['length',1.9],grandma_scooter:['length',1.72],walker_m:['height',1.72],
  walker_f:['height',1.66],car_ev:['length',4.7],scooter_parked:['length',1.9],
};

function cloneRig(template){
  const clone=template.clone(true),old=[],copies=[];
  template.traverse(o=>old.push(o));
  clone.traverse(o=>copies.push(o));
  const map=new Map(old.map((o,i)=>[o,copies[i]]));
  old.forEach((o,i)=>{
    if(!o.isSkinnedMesh)return;
    const skeleton=o.skeleton.clone();
    skeleton.bones=o.skeleton.bones.map(b=>map.get(b));
    copies[i].bind(skeleton,o.bindMatrix);
  });
  return clone;
}

export function createModelAssets(scene){
  const loader=new GLTFLoader(),decoder=new DRACOLoader();
  decoder.setDecoderPath(new URL('../vendor/three-examples/libs/draco/gltf/',import.meta.url).href);
  loader.setDRACOLoader(decoder);
  const assets=new Map(),pending=new Set(),matrix=new T.Object3D(),instanceTint=new T.Color();
  const idleSway=new T.Quaternion(),vertical=new T.Vector3(0,1,0),sideAxis=new T.Vector3(0,0,1);
  let disposed=false;
  async function load(key,axis,length){
    const url=new URL('../../../assets/models/'+key+'.glb',import.meta.url);
    pending.add(key);
    try{
      const answer=await fetch(url);
      if(!answer.ok)return;
      const model=await loader.parseAsync(await answer.arrayBuffer(),new URL('.',url).href);
      if(disposed)return;
      const source=model.scene;
      source.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3());
      if(axis==='length'&&size.z>size.x)source.rotation.y+=Math.PI/2;
      const declaredForward=model.userData?.forward;
      const reversed=typeof declaredForward==='string'?declaredForward.startsWith('-'):key==='bus';
      if(key==='car_ev'||optionalVehicles[key]&&reversed)source.rotation.y+=Math.PI;
      if(axis==='height')source.rotation.y+=Math.PI/2;
      source.updateMatrixWorld(true);
      bounds.setFromObject(source);bounds.getSize(size);
      const factor=length/(axis==='height'?size.y:size.x);
      if(!Number.isFinite(factor))return;
      const center=bounds.getCenter(new T.Vector3());
      const pivot=new T.Group(),template=new T.Group();
      pivot.add(source);pivot.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
      pivot.scale.setScalar(factor);template.add(pivot);template.updateMatrixWorld(true);

      const adjusted=new T.Box3().setFromObject(template);
      const dimensions=adjusted.getSize(new T.Vector3()).toArray().map(n=>+n.toFixed(3));
      const bottom=+adjusted.min.y.toFixed(3);
      const batches=[];
      if(key==='car_ev'||key==='scooter_parked'||key==='rider_scooter'||optionalVehicles[key])template.traverse(obj=>{
        if(!obj.isMesh||obj.isSkinnedMesh)return;
        const geometry=obj.geometry.clone().applyMatrix4(obj.matrixWorld);
        const inst=new T.InstancedMesh(geometry,obj.material,180);
        inst.count=0;inst.frustumCulled=false;inst.castShadow=true;inst.receiveShadow=true;
        scene.add(inst);batches.push(inst);
      });
      assets.set(key,{template,animations:model.animations,dimensions,bottom,batches,pool:[],used:0});
    }catch{}finally{pending.delete(key);}
  }
  const defaults=Object.entries(catalog).map(([key,[axis,length]])=>load(key,axis,length));
  const optional=fetch(new URL('../../../assets/manifest.json',import.meta.url))
    .then(response=>response.ok?response.json():null).then(manifest=>
      Promise.all(Object.entries(optionalVehicles)
        .filter(([key])=>manifest?.models?.[key]&&!disposed)
        .map(([key,length])=>load(key,'length',length)))).catch(()=>{});
  return {
    ready:Promise.all([...defaults,optional]),
    begin(){
      for(const asset of assets.values()){
        asset.used=0;
        for(const item of asset.pool)item.object.visible=false;
        for(const batch of asset.batches)batch.count=0;
      }
    },
    draw(key,x,z,heading,{moving=false,dt=0,tint,trousers,stature=1,build=1,complexion=0,speed=1.28,ground=0,lean=0,pitch=0,impact=null,idlePose=0}={}){
      const asset=assets.get(key);
      if(!asset)return false;
      if(asset.batches.length){
        if(asset.used>=180)return false;
        matrix.position.set(x,impact?.center??ground,z);
        matrix.rotation.set(impact?.roll??lean,-heading,impact?.pitch??pitch,'YXZ');
        matrix.scale.set(1,1,1);
        if(impact){
          const {length,height,width}=impact.spec;
          const [modelLength,modelHeight,modelWidth]=asset.dimensions;
          const fit=Math.min(1,2*length/modelLength,2*height/modelHeight,2*width/modelWidth);
          matrix.scale.setScalar(fit);
          // Keep the model's normal ground origin at the underside of the body.
          matrix.translateY(-height);
        }
        matrix.updateMatrix();
        for(const batch of asset.batches){
          const idx=batch.count++;
          batch.setMatrixAt(idx,matrix.matrix);batch.instanceMatrix.needsUpdate=true;
          batch.setColorAt(idx,instanceTint.set(tint??'#fff'));batch.instanceColor.needsUpdate=true;
        }
        asset.used++;
        return true;
      }
      if(asset.used>=64)return false;
      const slot=asset.used++;
      if(!asset.pool[slot]){
        const object=cloneRig(asset.template),mixer=new T.AnimationMixer(object),standingPose=[];
        object.traverse(joint=>{
          if(!joint.isBone)return;
          const rotation=joint.quaternion.clone();
          const forearm=/^(Left|Right)Arm$/.test(joint.name)&&joint.children.find(b=>/ForeArm/.test(b.name));
          if(forearm){
            const down=new T.Vector3(.055,-1,joint.name.startsWith('Left')?.11:-.11);
            const parent=joint.parent.getWorldQuaternion(new T.Quaternion());
            const direction=forearm.position.clone().applyQuaternion(rotation).normalize();
            rotation.premultiply(new T.Quaternion().setFromUnitVectors(direction,down.applyQuaternion(parent.invert()).normalize()));
          }
          standingPose.push([joint,joint.position.clone(),rotation,joint.scale.clone()]);
        });
        const paint={value:new T.Color('#898b8d')},colored={value:0},skinTone={value:0},pants={value:new T.Color('#41474f')},pantsEnabled={value:0};
        object.traverse(o=>{
          if(!o.isMesh)return;
          o.geometry.computeBoundingBox();
          const {min,max}=o.geometry.boundingBox;
          const span=Math.max(.001,max.y-min.y);
          const tintMaterial=original=>{
            const material=original.clone();
            material.onBeforeCompile=shader=>{
              shader.uniforms.garmentTint=paint;
              shader.uniforms.garmentEnabled=colored;
              shader.uniforms.skinTone=skinTone;
              shader.uniforms.pantsTint=pants;shader.uniforms.pantsEnabled=pantsEnabled;
              shader.vertexShader='varying float dcGarmentHeight;\n'+shader.vertexShader;
              shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
                '#include <begin_vertex>\ndcGarmentHeight=(position.y-('+min.y.toFixed(6)+'))/'+span.toFixed(6)+';');
              shader.fragmentShader='varying float dcGarmentHeight; uniform vec3 garmentTint; uniform float garmentEnabled;uniform float skinTone; uniform vec3 pantsTint; uniform float pantsEnabled;\n'+shader.fragmentShader;
              const band=key==='rider_scooter'?'smoothstep(.54,.59,dcGarmentHeight)*(1.-smoothstep(.76,.83,dcGarmentHeight))':
                'smoothstep(.51,.57,dcGarmentHeight)*(1.-smoothstep(.76,.82,dcGarmentHeight))';
              shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
                '#include <map_fragment>\nfloat garment='+band+';\nfloat light=dot(diffuseColor.rgb,vec3(.25,.55,.20));\ndiffuseColor.rgb=mix(diffuseColor.rgb,garmentTint*(.38+light*.85),garment*garmentEnabled*.53);\nfloat headBand=smoothstep(.8,.86,dcGarmentHeight);\nfloat pantsBand=smoothstep(.12,.17,dcGarmentHeight)*(1.-smoothstep(.47,.54,dcGarmentHeight));\ndiffuseColor.rgb=mix(diffuseColor.rgb,pantsTint*(.52+light*.93),pantsBand*pantsEnabled*.69);\ndiffuseColor.rgb*=1.+skinTone*headBand*mix(.48,1.,smoothstep(.04,.35,light));');
            };
            material.customProgramCacheKey=()=>key+'-'+min.y+'-'+span;
            return material;
          };
          o.material=Array.isArray(o.material)?o.material.map(tintMaterial):tintMaterial(o.material);
          o.castShadow=true;
        });
        const chest=standingPose.find(([joint])=>/spine|chest/i.test(joint.name));
        const head=standingPose.find(([joint])=>joint.name==='Head');
        const forearms=standingPose.filter(([joint])=>/^(Left|Right)ForeArm$/.test(joint.name));
        scene.add(object);asset.pool.push({object,mixer,active:undefined,paint,colored,skinTone,pants,pantsEnabled,standingPose,chest,head,forearms});
      }
      const item=asset.pool[slot];
      const walk=asset.animations.find(c=>/walk|run|move/i.test(c.name));
      const clip=moving?walk:null;
      if(clip!==item.active){
        item.mixer.stopAllAction();
        item.action=clip?item.mixer.clipAction(clip).reset().play():null;
        item.active=clip;
        if(!clip)for(const [joint,position,rotation,scale] of item.standingPose){
          joint.position.copy(position);joint.quaternion.copy(rotation);joint.scale.copy(scale);
        }
      }
      if(!moving&&key.startsWith('walker_')){
        item.idleClock=(item.idleClock??0)+dt;
        const {chest,head,forearms}=item;
        if(chest)chest[0].quaternion.copy(chest[2]).multiply(idleSway.setFromAxisAngle(vertical,(idlePose-2)*.07+Math.sin(item.idleClock*1.7+idlePose)*.018));
        if(head)head[0].quaternion.copy(head[2]).multiply(idleSway.setFromAxisAngle(vertical,(2-idlePose)*.105));
        for(const [joint,,rest] of forearms){
          const side=joint.name==='LeftForeArm'?1:-1;
          const bend=idlePose===1&&side===1?.80:idlePose===2&&side===-1?.64:idlePose===3?.40:.08;
          joint.quaternion.copy(rest).multiply(idleSway.setFromAxisAngle(sideAxis,side*bend));
        }
      }
      if(item.action){
        item.action.timeScale=Math.max(.24,Math.min(1.8,speed/1.28));
        item.mixer.update(dt);
      }
      item.colored.value=tint&&key!=='grandma_scooter'?1:0;
      if(tint)item.paint.value.set(tint);
      item.skinTone.value=complexion;
      item.pantsEnabled.value=trousers?1:0;
      if(trousers)item.pants.value.set(trousers);
      item.object.scale.set(stature*build,stature,stature*build);
      item.object.position.set(x,ground,z);item.object.rotation.y=-heading;
      item.object.visible=true;
      return true;
    },
    loaded:()=>[...assets.keys()].sort(),
    pending:key=>pending.has(key),
    bounds:()=>Object.fromEntries([...assets].map(([key,m])=>[key,{dims:m.dimensions,bottom:m.bottom}])),
    dispose(){disposed=true;decoder.dispose();},
  };
}
