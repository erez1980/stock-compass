import {analyze} from './engine.js';
// Requests contain only a ticker. Portfolio amounts and account details stay local.
export async function loadAsset(symbol, assets, endpoint, fetcher=fetch, now=Date.now()) {
  if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) throw Error('הזן טיקר תקין.');
  const existing=assets[symbol];
  if(existing) {
    try { if(analyze(existing,now).fresh) return existing; } catch {}
  }
  if(!endpoint) {
    if(existing) return existing;
    throw Error('שירות חיפוש הטיקרים אינו זמין כרגע. נסה שוב מאוחר יותר.');
  }
  const url=new URL(endpoint);url.searchParams.set('symbol',symbol);
  try {
    const response=await fetcher(url,{signal:AbortSignal.timeout(65000),credentials:'omit'});
    const payload=await response.json();
    if(!response.ok) throw Error(payload.error||'נתוני הטיקר אינם זמינים.');
    const asset=payload.asset;
    if(asset?.symbol!==symbol) throw Error('המקור החזיר טיקר שונה מהטיקר המבוקש.');
    analyze(asset,now); // Validate history before accepting source data.
    assets[symbol]=asset;
    return asset;
  } catch(error) {
    if(existing) return {...existing,warning:'הרענון נכשל; מוצגים הנתונים הקודמים עם התאריך המקורי.'};
    if(error.name==='TimeoutError') throw Error('משיכת הנתונים ארכה זמן רב מדי. נסה שוב.');
    if(error instanceof TypeError) throw Error('לא ניתן להתחבר לשירות הנתונים. בדוק חיבור ונסה שוב.');
    throw error;
  }
}

export async function loadPortfolioAssets(rows,assets,endpoint) {
  const symbols=[...new Set(rows.filter(r=>!r.external).map(r=>r.ticker))];
  const errors=[];
  for(let i=0;i<symbols.length;i+=4) {
    const batch=symbols.slice(i,i+4);
    const results=await Promise.allSettled(batch.map(s=>loadAsset(s,assets,endpoint)));
    results.forEach((r,j)=>{if(r.status==='rejected')errors.push(batch[j]+': '+r.reason.message);});
  }
  return errors;
}
