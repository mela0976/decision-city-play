import * as T from '../vendor/three.module.min.js?v=93389064';
import {GLTFLoader} from '../vendor/three-examples/loaders/GLTFLoader.js?v=93389064';
import {DRACOLoader} from '../vendor/three-examples/loaders/DRACOLoader.js?v=93389064';

const optionalVehicles={garbage_truck:6.5,bus:12};
const catalog={
  rider_scooter:['length',1.9],grandma_scooter:['length',1.72],walker_m:['height',1.72],
  walker_f:['height',1.66],
  // 2026-11-24 Higgsfield 寫實路人：中年男上班族、長者、年輕女生、高中女生
  walker_m2:['height',1.72],walker_m3:['height',1.66],walker_f2:['height',1.62],walker_f3:['height',1.58],car_ev:['length',4.7],scooter_parked:['length',1.9],
  // 2026-11-25 具名角色的寫實模型（Tripo 圖生 3D：靜態網格、沒有骨架；檔案已轉成面向 +Z，同 walker）：
  // 林總、美玲姐。身高同 named-npcs.js 的程式外形（美玲姐含跟鞋）
  npc_lin:['height',1.80],npc_mei:['height',1.67],
};
// 靜態人物模型（npc_*）同時畫幾個：每位角色同時只會出現一次，留兩個位置就夠，超過就畫程式外形
const figureSlots=2;
// 寫實路人的身高（公尺）：具名角色借用路人模型時，用它換算成角色設定的身高
export const modelHeight=key=>catalog[key]?.[0]==='height'?catalog[key][1]:undefined;
// 換衣服顏色時不能染到皮膚：依骨架權重標出手、頭、脖子，短袖款（中年上班族、長者、高中女生）再加整段前臂。
// （walker_m／walker_f 另有依膚色判斷的遮罩，只拿來調膚色；粉紅西裝外套也是暖色，拿它擋換色會讓外套染不上色）
const bareSkin=/^(Left|Right)Hand$|^Head$|^neck$|^head(_end|front)$/,bareForearm=/^(Left|Right)ForeArm$/;
const shortSleeves=new Set(['walker_m2','walker_m3','walker_f3']);
// 每款路人的上衣與褲子在綁定姿勢的高度（佔模型高度的比例，依貼圖顏色逐段量出）：[上衣下緣, 上衣上緣, 褲管下緣, 褲頭]。
// 換色只染這兩段，西裝外套下擺不會被染成褲子的顏色，皮鞋、腰帶也不變色；沒列的模型用原本的通用範圍
const clothingBands={
  walker_m:[.446,.835,.075,.428],walker_f:[.494,.83,.052,.469],
  walker_m2:[.582,.84,.055,.552],walker_m3:[.587,.835,.05,.553],walker_f2:[.565,.835,.068,.535],
};
// 具名角色正面站姿時前臂要內旋多少（弧度），只有長者款需要
const palmTurn={walker_m3:.9};
const bandGlsl=(low,high,soft)=>`smoothstep(${(low-soft).toFixed(3)},${(low+soft).toFixed(3)},dcGarmentHeight)*(1.-smoothstep(${(high-soft).toFixed(3)},${(high+soft).toFixed(3)},dcGarmentHeight))`;
function markBareSkin(key,source){
  if(!key.startsWith('walker_'))return;
  source.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    const bones=o.skeleton.bones.map(b=>bareSkin.test(b.name)||shortSleeves.has(key)&&bareForearm.test(b.name));
    const index=o.geometry.getAttribute('skinIndex'),weight=o.geometry.getAttribute('skinWeight');
    if(!index||!weight)return;
    const mask=new Float32Array(index.count);
    for(let i=0;i<index.count;i++){
      let sum=0;
      for(let k=0;k<4;k++)if(bones[index.getComponent(i,k)])sum+=weight.getComponent(i,k);
      mask[i]=Math.min(1,sum);
    }
    o.geometry.setAttribute('dcBare',new T.BufferAttribute(mask,1));
  });
}
// 檔案裡沒寫車頭方向的模型（看頭燈與尾燈在哪一端）：car_ev 頭燈 LED ice white 在 -X、尾燈在 +X；
// scooter_parked 頭燈 White light guides 在 -X、Red rear lenses 在 +X（原本沒轉，停車格的機車整台反過來停）；
// bus 檔案已宣告 '-X'，這裡留著給沒有宣告的替代檔。其他模型（騎士、路人）不轉。
// 檢查：tests/evidence/engine/model-forward.mjs（Node）與 tests/evidence/game/scripts/probe-home-truck.body.js 的 lineup（截圖）。
const undeclaredForward={car_ev:'-X',scooter_parked:'-X',bus:'-X'};

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
      markBareSkin(key,source);
      source.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3());
      if(axis==='length'&&size.z>size.x)source.rotation.y+=Math.PI/2;
      // 引擎讓模型的 +X 朝 heading（draw 的 rotation.y=-heading）。車頭方向的宣告在 glTF scene 的 extras，
      // GLTFLoader 把它放在 model.scene.userData，不在 model.userData（那是檔案最外層的 extras）。
      // 原本只讀 model.userData，garbage_truck 的 '-X' 讀不到，路上的垃圾車倒著開、家門口那台車頭朝錯邊。
      const declaredForward=source.userData?.forward??model.userData?.forward??undeclaredForward[key];
      if(typeof declaredForward==='string'&&declaredForward.startsWith('-'))source.rotation.y+=Math.PI;
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
        const inst=new T.InstancedMesh(geometry,obj.material,600); // 停車格整排機車也用寫實模型（原本 180）
        inst.count=0;inst.frustumCulled=false;inst.castShadow=true;inst.receiveShadow=true;
        scene.add(inst);batches.push(inst);
      });
      assets.set(key,{template,animations:model.animations,dimensions,bottom,batches,pool:[],used:0,figure:key.startsWith('npc_')});
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
    draw(key,x,z,heading,{moving=false,dt=0,tint,trousers,stature=1,build=1,complexion=0,speed=1.28,ground=0,lean=0,pitch=0,impact=null,idlePose=0,lod=1,breathe=false,dye=1}={}){
      const asset=assets.get(key);
      if(!asset)return false;
      if(asset.batches.length){
        if(asset.used>=600)return false;
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
      if(asset.figure){
        if(asset.used>=figureSlots)return false;
        const slot=asset.used++;
        let item=asset.pool[slot];
        if(!item){
          // clone 共用幾何與材質（不套路人的換色 shader），每位角色就是一個 mesh、一次 draw call
          const object=asset.template.clone(true);
          object.traverse(o=>{if(o.isMesh)o.castShadow=true;});
          scene.add(object);
          // 兩位角色的呼吸與晃動錯開相位，不會同步起伏
          item={object,clock:[...key].reduce((sum,c)=>sum+c.charCodeAt(0),slot*3)%7};
          asset.pool.push(item);
        }
        // 沒有骨架，用整個模型的變形做待機：原點在腳底，所以縮放與旋轉都不會讓腳離地。
        // 呼吸約 4 秒一次（身高 ±0.5%、胸寬 ±0.3%），再加上繞腳踝的輕微左右、前後晃動（頭頂約 1 公分）
        const t=item.clock+=dt,breath=Math.sin(t*1.55),wide=stature*(1+.003*breath);
        item.object.scale.set(wide,stature*(1+.005*breath),wide);
        item.object.position.set(x,ground,z);
        item.object.rotation.set(Math.sin(t*.83)*.006,-heading,Math.sin(t*.59+1.3)*.004,'YXZ');
        item.object.visible=true;
        return true;
      }
      if(asset.used>=256)return false; // 每款寫實路人最多同時 256 個（人多的地方也不退回圓頭小人）
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
          const span=Math.max(.001,max.y-min.y),bare=Boolean(o.geometry.getAttribute('dcBare'));
          const tintMaterial=original=>{
            const material=original.clone();
            material.onBeforeCompile=shader=>{
              shader.uniforms.garmentTint=paint;
              shader.uniforms.garmentEnabled=colored;
              shader.uniforms.skinTone=skinTone;
              shader.uniforms.pantsTint=pants;shader.uniforms.pantsEnabled=pantsEnabled;
              shader.vertexShader=(bare?'attribute float dcBare;\n':'')+'varying float dcGarmentHeight;varying float dcBareMask;\n'+shader.vertexShader;
              shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
                '#include <begin_vertex>\ndcGarmentHeight=(position.y-('+min.y.toFixed(6)+'))/'+span.toFixed(6)+';dcBareMask='+(bare?'dcBare':'0.')+';');
              shader.fragmentShader='varying float dcGarmentHeight;varying float dcBareMask; uniform vec3 garmentTint; uniform float garmentEnabled;uniform float skinTone; uniform vec3 pantsTint; uniform float pantsEnabled;\n'+shader.fragmentShader;
              const fit=clothingBands[key];
              const band=fit?bandGlsl(fit[0],fit[1],.014):key==='rider_scooter'?'smoothstep(.54,.59,dcGarmentHeight)*(1.-smoothstep(.76,.83,dcGarmentHeight))':
                'smoothstep(.51,.57,dcGarmentHeight)*(1.-smoothstep(.76,.82,dcGarmentHeight))';
              const legs=fit?bandGlsl(fit[2],fit[3],.012):'smoothstep(.12,.17,dcGarmentHeight)*(1.-smoothstep(.47,.54,dcGarmentHeight))';
              // walker_m／walker_f：外套敞開處露出的深色褲頭不染外套色（否則腰間一圈暗紅帶）；這兩款的上衣都是淺色，不會被排除
              const walker=key==='walker_f'||key==='walker_m';
              shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', `
                #include <map_fragment>
                float garment=${band};
                float light=dot(diffuseColor.rgb,vec3(.25,.55,.20));
                ${walker?'garment*=smoothstep(.05,.13,light);':''}
                ${walker?`
                  // The original albedo atlas shares skin, hair and clothing.
                  vec3 texel=diffuseColor.rgb;
                  float warm=smoothstep(.035,.12,texel.r-texel.g)*smoothstep(.012,.06,texel.r-texel.b);
                  float head=smoothstep(.79,.84,dcGarmentHeight);
                  float hands=smoothstep(.36,.47,dcGarmentHeight)*(1.-smoothstep(.72,.80,dcGarmentHeight));
                  float skinMask=warm*smoothstep(.085,.20,texel.r)*max(head,hands);
                `:''}
                float clothed=1.-dcBareMask;
                diffuseColor.rgb=mix(diffuseColor.rgb,garmentTint*(.38+light*.85),min(1.,garment*garmentEnabled*.53)*clothed);
                float pantsBand=${legs};
                diffuseColor.rgb=mix(diffuseColor.rgb,pantsTint*(.52+light*.93),min(1.,pantsBand*pantsEnabled*.69)*clothed);
                ${walker?'diffuseColor.rgb*=mix(vec3(1.),vec3(1.02,1.06,.99)*(1.+skinTone),skinMask);':''}
              `);
              if(walker){
                shader.fragmentShader=shader.fragmentShader
                  .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,max(.72,roughnessFactor),skinMask);')
                  .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor*=1.-skinMask;');
              }
            };
            material.customProgramCacheKey=()=>key+'-'+min.y+'-'+span+(bare?'-bare':'');
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
        // idlePose 0–4 是路人的幾種站姿（轉身、看旁邊、抬手）；5 是具名角色的正面站姿：身體與頭都朝前、雙手自然垂下
        const facing=idlePose===5;
        if(chest)chest[0].quaternion.copy(chest[2]).multiply(idleSway.setFromAxisAngle(vertical,(facing?0:(idlePose-2)*.07)+Math.sin(item.idleClock*1.7+idlePose)*.018));
        if(head)head[0].quaternion.copy(head[2]).multiply(idleSway.setFromAxisAngle(vertical,facing?Math.sin(item.idleClock*.41+1)*.03:(2-idlePose)*.105));
        for(const [joint,,rest] of forearms){
          const side=joint.name==='LeftForeArm'?1:-1;
          const bend=facing?.14:idlePose===1&&side===1?.80:idlePose===2&&side===-1?.64:idlePose===3?.40:.08;
          joint.quaternion.copy(rest).multiply(idleSway.setFromAxisAngle(sideAxis,side*bend));
          // 長者款綁定姿勢的掌心朝前，手放下後像攤開手；正面站姿把前臂內旋，讓掌心朝向大腿
          if(facing&&palmTurn[key])joint.quaternion.multiply(idleSway.setFromAxisAngle(vertical,side*palmTurn[key]));
        }
      }
      if(item.action){
        item.action.timeScale=Math.max(.24,Math.min(1.8,speed/1.28));
        // 遠處的寫實路人（lod>1）每 lod 格才更新一次走路動畫，省 CPU；累積的時間一次補上，步伐速度不變
        item.lodDt=(item.lodDt??0)+dt;item.lodN=(item.lodN??0)+1;
        if(lod<=1||item.lodN%lod===0){item.mixer.update(item.lodDt);item.lodDt=0;}
      }
      // dye 是換色濃度（1 是路人原本的程度）；具名角色用較濃的顏色，才看得出是角色設定的衣服
      item.colored.value=tint&&key!=='grandma_scooter'?dye:0;
      if(tint)item.paint.value.set(tint);
      item.skinTone.value=complexion;
      item.pantsEnabled.value=trousers?dye:0;
      if(trousers)item.pants.value.set(trousers);
      // 具名角色站著時加上和林總、美玲姐一樣的呼吸（約 4 秒一次，身高 ±0.5%）與繞腳底的輕晃；原點在腳底，腳不離地
      const idle=breathe&&!moving?1:0,t=idle*(item.idleClock??0),breath=idle*Math.sin(t*1.55);
      const wide=stature*build*(1+.003*breath);
      item.object.scale.set(wide,stature*(1+.005*breath),wide);
      item.object.position.set(x,ground,z);
      item.object.rotation.set(idle*Math.sin(t*.83)*.006,-heading,idle*Math.sin(t*.59+1.3)*.004,'YXZ');
      item.object.visible=true;
      return true;
    },
    loaded:()=>[...assets.keys()].sort(),
    pending:key=>pending.has(key),
    bounds:()=>Object.fromEntries([...assets].map(([key,m])=>[key,{dims:m.dimensions,bottom:m.bottom}])),
    dispose(){disposed=true;decoder.dispose();},
  };
}
