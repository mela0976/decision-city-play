import {metersPerUnit as unit} from './world.mjs?v=3b7de7a7';

const cell=48;
export const radius={rider:1.03/unit,foot:.29/unit,scooter:1.02/unit,car:2.45/unit,truck:2.9/unit};
export function colliderRadius(car){
  return car.parked?car.r:car.scooter?radius.scooter:car.service==='bus'?5.4/unit:car.service&&car.service!=='taxi'?radius.truck:radius.car;
}
// P2 perf：box 直接寫進給定的物件（碰撞查詢每幀上千次，不再每次配置暫存物件）；數值與原本完全相同。
function box(x,y,r,body,out={}){
  const angle=body?.mode==='foot'?0:body?.heading??0;
  const narrow=body?.mode==='scooter'||body?.scooter;
  const long=narrow||body?.scooter===false;
  out.x=x;out.y=y;out.a=r;
  out.b=body?.width?body.width:long?Math.min(r,(narrow?.37:body.service==='bus'?1.25:body.service?1.02:.95)/unit):r;
  out.u=Math.cos(angle);out.v=Math.sin(angle);
  return out;
}
// P2 perf：外接圓半徑沿用 put/hit 已算好的值（同一個 Math.hypot 結果）；距離先用平方粗篩，
// 明顯分開（留 1e-6 的相對餘量，遠大於 hypot 的捨入誤差）才跳過，邊界附近仍用 Math.hypot 判斷，結果不變。
function overlap(a,b,aReach){
  const dx=b.x-a.x,dy=b.y-a.y,limit=aReach+b.reach,d2=dx*dx+dy*dy;
  if(d2>limit*limit*1.000001||Math.hypot(dx,dy)>limit)return false;
  const parallel=Math.abs(a.u*b.u+a.v*b.v),across=Math.abs(a.u*b.v-a.v*b.u);
  return Math.abs(dx*a.u+dy*a.v)<a.a+b.a*parallel+b.b*across-.03
    &&Math.abs(-dx*a.v+dy*a.u)<a.b+b.a*across+b.b*parallel-.03
    &&Math.abs(dx*b.u+dy*b.v)<b.a+a.a*parallel+a.b*across-.03
    &&Math.abs(-dx*b.v+dy*b.u)<b.b+a.a*across+a.b*parallel-.03;
}
const query={x:0,y:0,a:0,b:0,u:0,v:0};

// Index oriented boxes by an enclosing radius, then test the four separating axes.
// P2 perf：clear() 只清空這一輪用過的格子（Set 留著重用），插入順序與新建 Set 相同，所以 hit() 找到的仍是同一個物件。
export function occupancy(){
  const cells=new Map();
  let touched=[];
  const pool=[];let used=0; // 每輪 clear() 之後重用 item，不再每幀新建數千個物件
  const lo=(v,r)=>Math.floor((v-r)/cell),hi=(v,r)=>Math.floor((v+r)/cell);
  return {
    clear(){
      for(let i=0;i<touched.length;i++)touched[i].length=0; // 陣列清空不重新配置（Set.clear 每次都會重建雜湊表）
      touched.length=0;
      for(let i=0;i<used;i++)pool[i].body=null;
      used=0;
    },
    put(body,r,kind){
      let item=pool[used];
      if(!item)pool[used]=item={body:null,kind:null,x:0,y:0,a:0,b:0,u:0,v:0,reach:0};
      used++;item.body=body;item.kind=kind;
      box(body.x,body.y,r,body,item);
      item.reach=Math.hypot(item.a,item.b);
      const x=item.x,y=item.y,reach=item.reach;
      for(let iy=lo(y,reach),y1=hi(y,reach);iy<=y1;iy++)for(let ix=lo(x,reach),x1=hi(x,reach);ix<=x1;ix++){
        const k=iy*65536+ix;
        let row=cells.get(k);
        if(!row)cells.set(k,row=[]);
        if(!row.length)touched.push(row);
        row.push(item);
      }
      return item;
    },
    remove(item,body=item?.body){
      if(!item||item.body!==body)return; // 舊幀的 handle 已被別人重用：不要誤刪
      item.body=null;
      const x=item.x,y=item.y,reach=item.reach;
      for(let iy=lo(y,reach),y1=hi(y,reach);iy<=y1;iy++)for(let ix=lo(x,reach),x1=hi(x,reach);ix<=x1;ix++){const row=cells.get(iy*65536+ix),i=row?row.indexOf(item):-1;if(i>=0)row.splice(i,1);}
    },
    // pass(item)：選填，傳回 true 的項目當作不存在（例如互卡解套時只穿過其他車，仍要撞得到玩家、行人與固定物）
    hit(x,y,r,ignore,pass){
      const bounds=box(x,y,r,ignore,query);
      const skip=ignore?.ignore??ignore,reach=Math.hypot(bounds.a,bounds.b);
      for(let iy=lo(y,reach),y1=hi(y,reach);iy<=y1;iy++)for(let ix=lo(x,reach),x1=hi(x,reach);ix<=x1;ix++){
        const row=cells.get(iy*65536+ix);
        if(!row||!row.length)continue;
        for(let n=0;n<row.length;n++){const item=row[n];if(item.body!==skip&&overlap(bounds,item,reach)&&!(pass&&pass(item)))return item;}
      }
      return null;
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
