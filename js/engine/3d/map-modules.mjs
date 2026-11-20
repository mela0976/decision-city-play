export const mapModules=['far-city','terrain','roads','buildings-old','buildings-tower','landmarks',
  'storefront','furniture','vegetation','sky-light','night','actors'];

export function selectMapModules(only,skip){
  const parse=value=>new Set(value?value.split(',').map(item=>item.trim()):[]);
  const include=parse(only),exclude=parse(skip);
  for(const name of [...include,...exclude]){
    if(!mapModules.includes(name))throw new Error('Unknown map module: '+name);
  }
  return name=>(include.size===0||include.has(name))&&!exclude.has(name);
}
