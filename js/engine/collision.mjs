import {metersPerUnit as unit} from './world.mjs';

const cell=48;
export const radius={rider:1.03/unit,foot:.29/unit,scooter:1.02/unit,car:2.45/unit,truck:2.9/unit};
export function colliderRadius(car){
  return car.scooter?radius.scooter:car.service==='bus'?5.2/unit:car.service&&car.service!=='taxi'?radius.truck:radius.car;
}
function box(x,y,r,body){
  const angle=body?.mode==='foot'?0:body?.heading??0;
  const narrow=body?.mode==='scooter'||body?.scooter;
  const long=narrow||body?.scooter===false;
  if(body?.width)return {x,y,a:r,b:body.width,u:Math.cos(angle),v:Math.sin(angle)};
  return {x,y,a:r,b:long?Math.min(r,(narrow?.37:body.service?1.02:.95)/unit):r,
    u:Math.cos(angle),v:Math.sin(angle)};
}
function overlap(a,b){
  const dx=b.x-a.x,dy=b.y-a.y;
  if(Math.hypot(dx,dy)>Math.hypot(a.a,a.b)+Math.hypot(b.a,b.b))return false;
  const parallel=Math.abs(a.u*b.u+a.v*b.v),across=Math.abs(a.u*b.v-a.v*b.u);
  return Math.abs(dx*a.u+dy*a.v)<a.a+b.a*parallel+b.b*across-.03
    &&Math.abs(-dx*a.v+dy*a.u)<a.b+b.a*across+b.b*parallel-.03
    &&Math.abs(dx*b.u+dy*b.v)<b.a+a.a*parallel+a.b*across-.03
    &&Math.abs(-dx*b.v+dy*b.u)<b.b+a.a*across+a.b*parallel-.03;
}

// Index oriented boxes by an enclosing radius, then test the four separating axes.
export function occupancy(){
  const cells=new Map();
  function visit(x,y,r,fn){
    for(let iy=Math.floor((y-r)/cell);iy<=Math.floor((y+r)/cell);iy++){
      for(let ix=Math.floor((x-r)/cell);ix<=Math.floor((x+r)/cell);ix++){
        if(fn(iy*65536+ix))return true;
      }
    }
    return false;
  }
  return {
    clear:()=>cells.clear(),
    put(body,r,kind){
      const item={body,kind,...box(body.x,body.y,r,body)};
      item.reach=Math.hypot(item.a,item.b);
      visit(item.x,item.y,item.reach,k=>{
        let row=cells.get(k);
        if(!row)cells.set(k,row=new Set());
        row.add(item);
      });
      return item;
    },
    remove(item){if(item)visit(item.x,item.y,item.reach,k=>{cells.get(k)?.delete(item);});},
    hit(x,y,r,ignore){
      let found=null;
      const bounds=box(x,y,r,ignore);
      visit(x,y,Math.hypot(bounds.a,bounds.b),k=>{
        for(const item of cells.get(k)??[]){
          if(item.body!==(ignore?.ignore??ignore)&&overlap(bounds,item)){found=item;return true;}
        }
        return false;
      });
      return found;
    },
  };
}

export function sweep(x,y,nx,ny,test,step=3.8){
  const count=Math.max(1,Math.ceil(Math.hypot(nx-x,ny-y)/step));
  for(let i=1;i<=count;i++){
    const px=x+(nx-x)*i/count,py=y+(ny-y)*i/count;
    if(test(px,py)){
      let lo=(i-1)/count,hi=i/count;
      if(step<3)for(let k=0;k<5;k++){
        const t=(lo+hi)/2;
        if(test(x+(nx-x)*t,y+(ny-y)*t))hi=t;else lo=t;
      }
      return {x:x+(nx-x)*lo,y:y+(ny-y)*lo};
    }
  }
  return {x:nx,y:ny};
}
