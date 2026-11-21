// P2 perf：開機時可以晚點做、但最後一定要做完的工作（例如由貼圖算法線圖、夜間遮罩）。
// 排進來的工作依先後順序執行，一次一件、每件之間把主執行緒還給畫面與輸入。
// release() 之前只排隊不執行：開機時主執行緒要先建城市、讓玩家進到街上；開始騎乘（或保險時間到）才放行。
const jobs=[];
let open=false,pending=false;
const post=globalThis.scheduler?.postTask
  ?fn=>globalThis.scheduler.postTask(fn,{priority:'background'})
  :fn=>setTimeout(fn,0);

function pump(){
  if(!open||pending||!jobs.length)return;
  pending=true;
  post(()=>{
    pending=false;
    const job=jobs.shift();
    try{job();}catch(error){console.error(error);}
    pump();
  });
}
export function later(job,first=false){
  if(first)jobs.unshift(job);else jobs.push(job);
  pump();
}
export function release(){
  if(open)return;
  open=true;
  pump();
}
// 玩家一直停在選單也會在幾秒後開始做，不會永遠擱著
export function releaseAfter(ms){
  setTimeout(release,ms);
}

// 開機到上街之間（選職能、序幕、開場影片）主執行緒多半閒著：這段時間先做「提早做也不改結果」的暖身工作
// （例如把已下載的貼圖先上傳到 GPU），一次一件、背景優先，不必等 release()。
const warmJobs=[];
let warming=false;
function pumpWarm(){
  if(warming||!warmJobs.length)return;
  warming=true;
  post(()=>{
    warming=false;
    const job=warmJobs.shift();
    try{job();}catch(error){console.error(error);}
    pumpWarm();
  });
}
export function warm(job){
  warmJobs.push(job);
  pumpWarm();
}
// 貼圖預先上傳：由 render.js 交給 renderer.initTexture（上傳內容與第一次繪製時相同）
let uploader=null;
export function setUploader(fn){uploader=fn;}
export function preload(texture){
  warm(()=>{if(uploader&&texture.image)uploader(texture);});
}
// 測試用：立刻依序做完所有排隊中的工作（含暖身）
export function drain(){
  open=true;
  while(jobs.length||warmJobs.length){
    const job=warmJobs.length?warmJobs.shift():jobs.shift();
    job();
  }
}
