import {GOOGLE_MAPS_API_KEY} from './config.js?v=4c63fb3';

export const rootURL='https://tile.googleapis.com/v1/3dtiles/root.json';

export function googleKey(query,storage,configured=GOOGLE_MAPS_API_KEY) {
  let stored='';
  try{stored=storage?.getItem('dc-gmkey')??'';}catch{}
  return query.get('gmkey')?.trim()||stored.trim()||configured.trim();
}
export function authorizeTiles(key) {
  let session='';
  return input=>{
    const url=new URL(input,rootURL);
    if(url.origin!=='https://tile.googleapis.com'||!url.pathname.startsWith('/v1/3dtiles/')) {
      throw new Error('unexpected-tiles-source');
    }
    const provided=url.searchParams.get('session');
    if(provided)session=provided;
    else if(session && url.pathname!=='/v1/3dtiles/root.json')url.searchParams.set('session',session);
    url.searchParams.set('key',key);
    return url;
  };
}
export function copyrightStrings(values) {
  const counts=new Map();
  for(const value of values)for(const name of new Set((value??'').split(';').map(s=>s.trim()).filter(Boolean))){
    counts.set(name,(counts.get(name)??0)+1);
  }
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([s])=>s).join('; ');
}
export async function probeGoogle(key,fetcher=fetch) {
  const authorize=authorizeTiles(key);
  let response;
  try{response=await fetcher(authorize(rootURL),{cache:'no-store',signal:AbortSignal.timeout(7300)});}
  catch{return {ok:false,reason:'連線失敗或逾時'};}
  if(!response.ok)return {ok:false,reason:response.status===429?'Google 圖磚配額不足':`Google 拒絕請求（HTTP ${response.status}）`};
  let data;
  try{data=await response.json();}catch{return {ok:false,reason:'圖磚根檔格式錯誤'};}
  if(typeof data?.asset?.version!=='string'||!data?.root?.boundingVolume)return {ok:false,reason:'圖磚根檔格式錯誤'};
  return {ok:true,bytes:JSON.stringify(data),authorize};
}
