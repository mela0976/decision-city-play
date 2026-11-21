// i18n：地圖上的地點、地標與「玩家」標籤，以及引擎畫在街景上的介面字（自動駕駛車的標籤、2D 的捷運入口、底圖來源標註）。
// 遊戲層用 engine.setLabels() 傳入譯名；沒傳就用世界資料的中文名。
// 世界資料（world.mjs）、3D 招牌與路名牌維持中文，不經過這裡。
const labels={places:null,landmarks:null,player:null,ui:null};
// 介面字的中文原文；遊戲層用 ui 傳同樣的鍵覆寫
const uiDefaults={
  autopilot:'自動駕駛中',
  mrtEntrance:'捷運入口',
  credit:'底圖：Google Maps　遊戲角色與道路：本作／OSM',
};
export function setLabels({places,landmarks,player,ui}={}) { // i18n
  labels.places=places&&typeof places==='object'?{...places}:null;
  labels.landmarks=landmarks&&typeof landmarks==='object'?{...landmarks}:null;
  labels.player=typeof player==='string'&&player?player:null;
  labels.ui=ui&&typeof ui==='object'?{...ui}:null;
}
export const placeLabel=site=>labels.places?.[site?.id]||site?.name||''; // i18n
export const landmarkLabel=landmark=>labels.landmarks?.[landmark?.shape]||landmark?.name||''; // i18n
export const playerLabel=()=>labels.player||'◆ 玩家'; // i18n
export const uiLabel=key=>{const v=labels.ui?.[key];return typeof v==='string'&&v?v:uiDefaults[key]??'';}; // i18n
