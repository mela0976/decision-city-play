// 結局判定：照 endings.json 的順序比對，第一個符合的就是結局；最後一筆不設門檻當保底。

export function matchesEnding(ending, meters) {
  const min = ending.min || {};
  const minOk = Object.entries(min).every(([id, value]) => (meters[id] ?? 0) >= value);
  const liverOk = ending.maxLiver == null || (meters.liver ?? 0) <= ending.maxLiver;
  return minOk && liverOk;
}

export function pickEnding(endings, meters) {
  return endings.find((ending) => matchesEnding(ending, meters)) || endings[endings.length - 1];
}

/** 除錯用：算出一組剛好落在指定結局門檻上的數值，再交給 pickEnding 真的判一次。 */
export function metersForEnding(ending) {
  const min = ending.min || {};
  const hasGate = Object.keys(min).length > 0 || ending.maxLiver != null;
  return {
    brand: min.brand ?? 0,
    sales: min.sales ?? 0,
    trust: min.trust ?? 0,
    liver: hasGate ? Math.min(ending.maxLiver ?? 50, 99) : 99,
  };
}
