// A26 interior in camera space. The street stays visible through the windshield.
export function drawCockpit(ctx,w,h,speed,steer){
  ctx.save();
  const dash=h*.68,wheel=Math.min(w*.115,h*.108),wx=w*.205,wy=h*.855;
  const fill=(points,paint)=>{
    ctx.fillStyle=paint;ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.fill();
  };
  const trim=ctx.createLinearGradient(0,dash,0,h);
  trim.addColorStop(0,'#526370');trim.addColorStop(.12,'#25333e');trim.addColorStop(1,'#101b23');
  fill([[0,0],[w*.037,0],[w*.145,dash],[w*.104,dash+8]],'#303c45');
  fill([[w,0],[w*.968,0],[w*.87,dash],[w*.92,dash+8]],'#303c45');
  ctx.fillStyle=trim;ctx.beginPath();ctx.moveTo(0,dash+h*.032);
  ctx.quadraticCurveTo(w*.22,dash-h*.075,w*.52,dash);ctx.lineTo(w,dash+h*.024);
  ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
  const clusterY=dash+h*.049;
  ctx.fillStyle='#101c23';ctx.beginPath();ctx.ellipse(wx,clusterY,wheel*1.07,wheel*.39,0,0,7);ctx.fill();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#a6f4e7';ctx.font='600 '+Math.round(wheel*.42)+'px system-ui';
  ctx.fillText(String(Math.round(speed*3.6)),wx,clusterY);ctx.font=Math.max(9,wheel*.11)+'px system-ui';
  ctx.fillText('km/h',wx,clusterY+wheel*.27);
  ctx.translate(wx,wy);ctx.rotate(steer*.55);
  ctx.strokeStyle='#8799a1';ctx.lineWidth=wheel*.20;ctx.beginPath();ctx.arc(0,0,wheel,0,7);ctx.stroke();
  ctx.strokeStyle='#25353e';ctx.lineWidth=wheel*.18;ctx.beginPath();ctx.arc(0,0,wheel,0,7);ctx.stroke();
  ctx.strokeStyle='#5b6972';ctx.lineWidth=wheel*.095;ctx.lineCap='round';
  for(const a of [.2,Math.PI-.2,Math.PI/2]){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wheel*.91,Math.sin(a)*wheel*.91);ctx.stroke();}
  ctx.fillStyle='#26343e';ctx.beginPath();ctx.ellipse(0,0,wheel*.41,wheel*.27,0,0,7);ctx.fill();
  ctx.restore();
}
