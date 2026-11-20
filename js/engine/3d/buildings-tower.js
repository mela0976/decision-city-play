
export function towerFacade(variant,tint,variation){
  tint.offsetHSL(0,0,variation);
  return {material:['new','towerB','towerC'][variant],
    scale:[[18,18.75],[18,18.75],[12,11.25]][variant]};
}
