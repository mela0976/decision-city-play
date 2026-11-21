import * as T from '../vendor/three.module.min.js?v=c70e9ac';
import {canvasTexture,hash} from './city-primitives.js?v=c70e9ac';
import {towerStructures} from '../tower-structures.mjs?v=c70e9ac';

const bays=32,floors=8,paneWidth=16,paneHeight=64;
const width=bays*paneWidth,height=floors*paneHeight;

// Near and distant geometry use the same tagged height as flight collision.
export function shellHeight(b,minimum=3){
  return Math.max(minimum,b.modern?b.elevation:Math.min(198,b.elevation));
}

export function towerFacade(variant,tint,variation,curtain){
  if(!curtain){
    tint.offsetHSL(0,0,variation);
    return {material:['new','towerB','towerC'][variant],scale:[[18,18.75],[18,18.75],[12,11.25]][variant]};
  }
  tint.set(['#d0dce1','#d8d8cf','#cfdbd8'][variant]).offsetHSL(0,0,variation*.45);
  return {material:'curtain',scale:[bays*1.35,floors*3.8]};
}

export function curtainMaterial(doc,anisotropy,textures){
  const material=new T.MeshStandardMaterial({color:'#587582',metalness:.37,roughness:.31,side:T.DoubleSide,vertexColors:true});
  if(!textures)return material;
  function atlas(lights){
    const texture=canvasTexture(doc,width,height,ctx=>{
      ctx.fillStyle=lights?'#000':'#294352';
      ctx.fillRect(0,0,width,height);
      for(let row=0;row<floors;row++)for(let bay=0;bay<bays;bay++){
        const x=bay*paneWidth,y=row*paneHeight;
        const room=hash(Math.floor(bay/3),row);
        if(lights){
          if(room>.72){
            ctx.fillStyle=room>.93?'#9faeae':'#d2b792';
            ctx.fillRect(x+1,y+10,paneWidth-2,paneHeight-13);
          }
          continue;
        }
        const tint=Math.round(10*hash(bay,row)+6*Math.sin(bay*Math.PI/8));
        const pane=ctx.createLinearGradient(0,y+9,0,y+paneHeight);
        pane.addColorStop(0,'rgb('+(82+tint)+' '+(108+tint)+' '+(122+tint)+')');
        pane.addColorStop(1,'rgb('+(70+tint)+' '+(91+tint)+' '+(104+tint)+')');
        ctx.fillStyle=pane;ctx.fillRect(x+1,y+9,paneWidth-1,paneHeight-10);
        ctx.fillStyle='#81939a';ctx.fillRect(x,y,1.25,paneHeight);
        ctx.fillStyle='#46565d';ctx.fillRect(x+1,y+1,paneWidth-1,2);
      }
    });
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.anisotropy=anisotropy;
    return texture;
  }
  material.color.set('#fff');
  material.map=atlas(false);
  material.emissiveMap=atlas(true);
  material.emissive.set('#fff');material.emissiveIntensity=0;
  // The same material serves merged OSM walls and instanced landmark storeys.
  // Project in metres after instance scaling, so the grid continues across setbacks.
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 curtainCoord;\n'+shader.vertexShader.replace('#include <uv_vertex>',`
      #include <uv_vertex>
      vec3 wall=position;
      vec3 face=normal;
      #ifdef USE_INSTANCING
        wall=(instanceMatrix*vec4(position,1.)).xyz;
        face=mat3(instanceMatrix)*normal;
      #endif
      vec2 tangent=vec2(-face.z,face.x);
      float along=dot(wall.xz,tangent/max(length(tangent),.001));
      curtainCoord=vec2(along,wall.y);
      vMapUv=vec2(along/43.2,wall.y/30.4);
      vEmissiveMapUv=vMapUv;`);
    shader.fragmentShader='varying vec2 curtainCoord;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      // Abstract neighboring glass blocks break up the horizon reflection. Upper
      // panes pick up the actual time-of-day panorama via the standard PBR pass.
      float block=floor(curtainCoord.x/24.);
      float roof=16.+42.*fract(block*.61803)+8.*sin(curtainCoord.x*.027);
      float sky=smoothstep(roof-7.,roof+9.,curtainCoord.y);
      diffuseColor.rgb*=mix(vec3(.60,.66,.69),vec3(1.28,1.30,1.32),sky);
    `);
  };
  return material;
}

// Stone spandrels and the arcade fascia sit on the original footprint. The
// enlarged lobby glazing occupies the first two or three commercial storeys.
export function podiumFace(batch,a,b,h,length,id){
  if(h<6||length<3)return;
  const top=Math.min(h-1.6,13,Math.max(6.2,h*.14));
  const wall=batch('curb');
  const face=(lo,hi,tint)=>wall.quad([a.x,lo,a.y],[b.x,lo,b.y],[b.x,hi,b.y],[a.x,hi,a.y],tint);
  face(3.5,4.1,'#a79e90');
  face(top-.65,top-.19,'#bdb9ac');
  face(top-.19,top,'#5c6568');
  const bays=Math.max(1,Math.round(length/4.6));
  const glazing=batch('curtain');
  const panel=(buffer,t0,t1,tint)=>{
    const at=(t,y)=>[a.x+(b.x-a.x)*t,y,a.y+(b.y-a.y)*t];
    buffer.quad(at(t0,4.1),at(t1,4.1),at(t1,top-.65),at(t0,top-.65),tint);
  };
  for(let bay=0;bay<bays;bay++){
    const t=bay/bays;
    panel(wall,t,t+.06/bays,id%2?'#b2aca0':'#919b9e');
    panel(glazing,t+.06/bays,(bay+1)/bays,bay%3?'#e1ded3':'#ebebdf');
  }
  return top;
}

export function towerSkywalks(instance,detail){
  const {bridges,canopies}=towerStructures();
  const near=detail??instance;
  if(detail)for(const {x,z,ux,uz,nx,nz,length:span} of canopies){
    const turn=-Math.atan2(uz,ux);
    near('metal','box','#718488',x,6.52,z,span,.14,2.82,turn);
    near('metal','box','#c9c5b6',x+nx*1.35,6.43,z+nz*1.35,span,.22,.16,turn);
    for(let i=-1;i<=1;i++)near('metal','box','#58686b',x+ux*i*span*.38,6.34,
      z+uz*i*span*.38,.12,.20,2.63,turn);
  }
  for(const {x,z,ux,uz,length:len,crossing} of bridges){
    const turn=-Math.atan2(uz,ux);
    function beam(place,tint,u,y,v,w,h,d){
      place('metal','box',tint,x+ux*u-uz*v,y,z+uz*u+ux*v,w,h,d,turn);
    }
    beam(instance,'#91999a',0,6.46,0,len+.12,.36,3.12);
    beam(instance,'#a3b6b8',0,8.93,0,len+.12,.14,3.28);
    for(const s of [-1,1]){
      beam(instance,'#607c83',0,7.08,s*1.47,len,.82,.10);
      beam(instance,'#c8c8ba',0,7.56,s*1.47,len,.075,.11);
      beam(instance,'#c4c5bc',0,8.8,s*1.52,len,.17,.17);
    }
    if(crossing)for(const side of [-1,1]){
      instance('luminous','box','#ffdfa9',x-uz*side*1.52,8.68,z+ux*side*1.52,len,.085,.09,turn);
    }
    const n=Math.max(1,Math.round(len/3.9));
    for(let bay=0;bay<n;bay++){
      const u=len*((bay+.5)/n-.5);
      if(crossing)for(const side of [-1,1]){
        near('metal','box','#adb7b7',x+ux*u-uz*side*1.47,7.91,z+uz*u+ux*side*1.47,
          Math.hypot(len/n,1.70),.12,.10,turn,0,(bay%2?-1:1)*Math.atan2(1.70,len/n));
      }
      beam(near,'#c0c2b9',u,8.73,0,.10,.13,3.14);
      for(const s of [-1,1])beam(near,'#b2b8b4',u,7.71,s*1.47,.12,2.17,.12);
    }
  }
}
