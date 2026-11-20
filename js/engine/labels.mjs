// i18n：地圖上的地點、地標與「玩家」標籤。遊戲層用 engine.setLabels() 傳入譯名；沒傳就用世界資料的中文名。
// 世界資料（world.mjs）、3D 招牌與路名牌維持中文，不經過這裡。
const labels={places:null,landmarks:null,player:null};
export function setLabels({places,landmarks,player}={}) { // i18n
  labels.places=places&&typeof places==='object'?{...places}:null;
  labels.landmarks=landmarks&&typeof landmarks==='object'?{...landmarks}:null;
  labels.player=typeof player==='string'&&player?player:null;
}
export const placeLabel=site=>labels.places?.[site?.id]||site?.name||''; // i18n
export const landmarkLabel=landmark=>labels.landmarks?.[landmark?.shape]||landmark?.name||''; // i18n
export const playerLabel=()=>labels.player||'◆ 玩家'; // i18n
