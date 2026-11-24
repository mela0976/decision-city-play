import * as T from '../vendor/three.module.min.js?v=2104ee78';
import {canvasTexture,color,matrix,shapes,TextureLoader} from './city-primitives.js?v=2104ee78';

const atlasSlots={leaf:0,pod:1,hedge:2,autumn:3};
const hedgeFaces=[
  [[-.5,-.5,.47],[.5,-.5,.47],[.5,.5,.47],[-.5,.5,.47]],
  [[.5,-.5,-.47],[-.5,-.5,-.47],[-.5,.5,-.47],[.5,.5,-.47]],
  [[-.5,.37,.5],[.5,.37,.5],[.5,.37,-.5],[-.5,.37,-.5]],
  [[0,-.5,-.5],[0,-.5,.5],[0,.5,.5],[0,.5,-.5]],
];
const hedgeNormals=[[0,0,1],[0,0,-1],[0,1,0],[-1,0,0]];

function makeCards(near){
  const geometry=new T.BufferGeometry(),positions=[],hedgePositions=[],hedgeSurfaceNormals=[],uv=[],indices=[];
  const angles=near?[0,Math.PI/3,2*Math.PI/3,Math.PI/6]:[0,Math.PI/2];
  for(let i=0;i<angles.length;i++){
    const angle=angles[i],overhead=near&&i===3;
    const cx=Math.cos(angle),cz=Math.sin(angle);
    const a=positions.length/3;
    hedgePositions.push(...hedgeFaces[i].flat());
    for(let vertex=0;vertex<4;vertex++)hedgeSurfaceNormals.push(...hedgeNormals[i]);
    for(const [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){
      const slope=overhead? y*.87:0;
      positions.push(x*cx-slope*cz,overhead?.13+y*.42:y,x*cz+slope*cx);
      uv.push(x+.5,y+.5);
    }
    indices.push(a,a+1,a+2,a,a+2,a+3);
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('hedgePosition',new T.Float32BufferAttribute(hedgePositions,3));
  geometry.setAttribute('hedgeNormal',new T.Float32BufferAttribute(hedgeSurfaceNormals,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  // The shader substitutes hedge faces, which extend farther than the crown cards.
  geometry.boundingSphere.radius=.88;
  return geometry;
}
const nearCards=makeCards(true),farCards=makeCards(false);

function fallbackAtlas(doc){
  return canvasTexture(doc,128,32,(ctx)=>{
    for(const [index,tint] of ['#5f7b3b','#9c6244','#486039','#747945'].entries()){
      ctx.fillStyle=tint;
      ctx.beginPath();
      if(index===2)ctx.roundRect(65,5,30,23,3);
      else ctx.ellipse(index*32+16,15,15,12,0,0,2*Math.PI);
      ctx.fill();
    }
  });
}

export function vegetationMaterials(doc,manifest,anisotropy){
  const fallback=fallbackAtlas(doc),loader=new TextureLoader();
  return ['near','far'].map((lod,index)=>{
    const material=new T.MeshLambertMaterial({map:fallback,side:T.DoubleSide,alphaTest:index?.36:.46});
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float atlasTile;\nattribute vec3 hedgePosition;\nattribute vec3 hedgeNormal;\n'+
        shader.vertexShader.replace('#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv.x=(vMapUv.x+atlasTile)*.25;\n#endif')
          .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n if (atlasTile==2.0) objectNormal=hedgeNormal;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\n if (atlasTile==2.0) transformed=hedgePosition;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n#if NUM_HEMI_LIGHTS > 0\n reflectedLight.indirectDiffuse += diffuseColor.rgb * hemisphereLights[0].skyColor * .19;\n#endif');
    };
    manifest.then(images=>{
      const asset=images?.['vegetation-'+lod];
      if(!asset)return;
      return loader.loadAsync(new URL('../../../'+asset.src,import.meta.url).href).then(texture=>{
        texture.colorSpace=T.SRGBColorSpace;
        texture.anisotropy=Math.min(index?2:4,anisotropy);
        material.map=texture;
        material.needsUpdate=true;
      });
    }).catch(()=>{}); // Retain the generated alpha atlas if an asset is unavailable.
    return material;
  });
}

export function populateInstances(mesh,items){
  items.forEach(([tint,x,y,z,w,h,d,turn,rx,rz],i)=>{
    matrix.position.set(x,y,z);
    matrix.rotation.set(rx,turn,rz);
    matrix.scale.set(w,h,d);
    matrix.updateMatrix();
    mesh.setMatrixAt(i,matrix.matrix);
    mesh.setColorAt(i,color.set(tint));
  });
  mesh.computeBoundingSphere();
}

export function foliageBatch(items,materials){
  const atlas=new T.InstancedBufferAttribute(Float32Array.from(items,item=>atlasSlots[item[10]]),1);
  const geometries=[nearCards,farCards].map(template=>{
    const geometry=template.clone();
    geometry.setAttribute('atlasTile',atlas);
    return geometry;
  });
  const mesh=new T.InstancedMesh(geometries[0],materials[0],items.length);
  populateInstances(mesh,items);
  mesh.userData.setLod=far=>{
    const index=Number(far);
    if(mesh.geometry!==geometries[index]){
      mesh.geometry=geometries[index];
      mesh.material=materials[index];
    }
  };
  return mesh;
}

export function landscapeTrunkBatch(items,material){
  const mesh=new T.InstancedMesh(shapes.cylinder,material,items.length);
  mesh.receiveShadow=true;
  populateInstances(mesh,items);
  return mesh;
}
