export const VERSION = '1.0.0';
// Young crypto funds lack multi-year channels; the spot pair has the long history.
const SPOT={BTC:['BTC','IBIT','FBTC','BITB','ARKB','HODL','BRRR','EZBC','BTCO','BTCW'],ETH:['ETH','ETHA','FETH','ETHW','CETH','QETH','EZET','ETHV']};
export function spotAlternative(symbol) {
  const coin=Object.keys(SPOT).find(k=>SPOT[k].includes(symbol));
  return coin?coin+'-USD':null;
}
export const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
export function rsi(prices, period=14) {
  if(prices.length<=period) return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=prices[i]-prices[i-1];gain+=Math.max(0,d)/period;loss+=Math.max(0,-d)/period;}
  for(let i=period+1;i<prices.length;i++){const d=prices[i]-prices[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;}
  return loss===0 ? (gain===0?50:100) : 100-100/(1+gain/loss);
}
export function channel(rows,years) {
  if(!rows.length) return null;
  const end=Date.parse(rows.at(-1).date),start=end-years*365.25*86400000;
  const a=rows.filter(r=>Date.parse(r.date)>=start);
  if(a.length<years*252*.85 || Date.parse(a[0].date)>start+60*86400000) return null;
  const xs=a.map(r=>(Date.parse(r.date)-start)/86400000),ys=a.map(r=>Math.log(r.adjusted));
  const xm=mean(xs),ym=mean(ys),slope=xs.reduce((s,x,i)=>s+(x-xm)*(ys[i]-ym),0)/xs.reduce((s,x)=>s+(x-xm)**2,0),intercept=ym-slope*xm;
  const sd=Math.sqrt(mean(xs.map((x,i)=>(ys[i]-intercept-slope*x)**2)));
  const fitted=intercept+slope*xs.at(-1),last=ys.at(-1);
  return {years,slope,annualized:Math.expm1(slope*365.25),position:sd>1e-8?(last-fitted)/(2*sd):0,sd,start,intercept,rows:a,lower:Math.exp(fitted-2*sd),mid:Math.exp(fitted),upper:Math.exp(fitted+2*sd)};
}
export function analyze(asset,now=Date.now()) {
  if(asset?.info?.currency && asset.info.currency!=='USD') throw Error('גרסה זו תומכת בניירות הנסחרים בדולר בלבד.');
  const rows=asset?.history||[];
  if(rows.length<210) throw Error('נדרשים לפחות 210 ימי מסחר תקינים לניתוח.');
  if(rows.some((r,i)=>!(r.close>0&&r.adjusted>0&&Number.isFinite(r.close)&&Number.isFinite(r.adjusted))||!Number.isFinite(Date.parse(r.date))||(i&&r.date<=rows[i-1].date))) throw Error('סדרת המחירים אינה תקינה או אינה ממוינת.');
  const p=rows.map(r=>r.adjusted),last=p.at(-1),price=rows.at(-1).close;
  const ma50=mean(p.slice(-50)),ma200=mean(p.slice(-200)),hi=Math.max(...p.slice(-252)),momentum=last/p.at(-127)-1;
  const age=(now-Date.parse(rows.at(-1).date+'T23:59:59Z'))/86400000;
  const fxAge=asset.fx?(now-Date.parse(asset.fx.date+'T23:59:59Z'))/86400000:0;
  const fresh=age>=-1&&age<=5&&Number.isFinite(fxAge)&&fxAge>=-1&&fxAge<=5;
  const strength=rsi(p),vol=mean(rows.slice(-20).map(r=>r.volume||0)),volumeRatio=vol?rows.at(-1).volume/vol:null;
  const channels=[3,5,10].map(y=>channel(rows,y)).filter(Boolean),long=channels.find(c=>c.years===5)||channels[0];
  let score=0;const reasons=[];
  const add=(yes,points,text)=>{if(yes){score+=points;reasons.push(text);}};
  add(last>ma200,30,'מעל ממוצע 200 יום');add(last>ma50,15,'מעל ממוצע 50 יום');add(ma50>ma200,15,'ממוצע 50 מעל 200');add(momentum>0,15,'מומנטום חצי־שנתי חיובי');add(strength>=40&&strength<=65,15,'RSI בטווח 40–65');add(long&&long.slope>0&&long.position<.5,10,'בערוץ עולה, מתחת לאמצע המחצית העליונה');
  let action='המתן',timing='בדוק שוב לאחר חזרה מעל ממוצע 200 יום';
  if(score>=70&&last>ma200){action='קנה בהדרגה';timing='שליש כעת; שליש בעוד 30 יום; שליש בעוד 60 יום. בדוק מחדש לפני כל שלב.';}
  if(strength>70||(last/ma50-1)>.12||(long&&long.position>1)){action='המתן לכניסה';timing='בדוק מחדש כשהמחיר עד 3% מעל MA50, RSI עד 65, ועדיין מעל MA200.';}
  if(!fresh){action='אין הוראת ביצוע';timing='רענן נתונים לפני החלטה. מחירים ישנים או עתידיים אינם בסיס לפעולה.';}
  return {price,last,ma50:ma50*price/last,ma200:ma200*price/last,above50:last/ma50-1,above200:last/ma200-1,fromHigh:last/hi-1,momentum,rsi:strength,volumeRatio,channels,score,reasons,action,timing,fresh,date:rows.at(-1).date,age,entry:ma50*price/last*1.03};
}
export function validatePortfolio(rows) {
  const seen=new Set();
  for(const r of rows){if(!/^[A-Z0-9.^=-]{1,20}$/.test(r.ticker)||seen.has(r.ticker))throw Error('טיקר חסר, לא תקין או כפול. איחד אחזקות באותו טיקר לשורה אחת.');seen.add(r.ticker);
    for(const k of ['value','target','basis'])if(!Number.isFinite(r[k])||r[k]<0)throw Error('הסכומים ואחוזי היעד חייבים להיות מספרים שאינם שליליים.');if(r.target>100)throw Error('יעד אינו יכול לחרוג מ־100%.');}
}
export function suggestTargets(input,cash=0){
  validatePortfolio(input);
  if(!Number.isFinite(cash)||cash<0)throw Error('סכום מזומן לא תקין.');
  const rows=input.map(r=>({...r})),total=rows.reduce((s,r)=>s+r.value,0)+cash;
  if(total<=0)throw Error('הזן שווי תיק או כסף חדש לפני הצעת יעדים.');
  const ensure=ticker=>{let r=rows.find(r=>r.ticker===ticker&&!r.external);if(!r){if(rows.some(r=>r.ticker===ticker))return null;r={ticker,value:0,basis:0,target:0,external:false};rows.push(r);}return r;};
  for(const r of rows)r.target=r.external?r.value/total*100:0;
  const free=100-rows.filter(r=>r.external).reduce((s,r)=>s+r.target,0);
  if(free<=.01)return rows;
  const externalCore=rows.filter(r=>r.external&&['VOO','SPY','IVV','SPYM','VTI'].includes(r.ticker)).reduce((s,r)=>s+r.value/total,0);
  const intl=ensure('VXUS');const intlTarget=intl?Math.min(10,free*.6):0;if(intl)intl.target=intlTarget;
  let remaining=free-intlTarget;
  if(externalCore<.5){const core=rows.find(r=>!r.external&&['VOO','SPY','IVV','SPYM','VTI'].includes(r.ticker))||ensure('VOO');if(core){core.target=remaining*.6;remaining-=core.target;}}
  const duplicate=rows.some(r=>!r.external&&r.ticker==='VGT'&&r.value>0);
  let satellites=rows.filter(r=>!r.external&&r.value>0&&r.target===0&&r.ticker!=='VXUS'&&!(duplicate&&r.ticker==='IYW'));
  if(!satellites.length){const target=rows.find(r=>!r.external&&r.target>0)||ensure('VOO');if(target)target.target+=remaining;}
  else {const sum=satellites.reduce((s,r)=>s+r.value,0);for(const r of satellites)r.target=remaining*r.value/sum;}
  for(const r of rows)r.target=Math.round(r.target*100)/100;
  const residual=100-rows.reduce((s,r)=>s+r.target,0),largest=[...rows].sort((a,b)=>b.target-a.target)[0];largest.target=Math.round((largest.target+residual)*100)/100;
  return rows;
}
export function plan(rows,cash,{mode='cash',taxRate=0,tolerance=1}={},assets={},now=Date.now()) {
  validatePortfolio(rows);
  if(!Number.isFinite(cash)||cash<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw Error('סכום מזומן או שיעור מס אינו תקין.');
  if(Math.abs(rows.reduce((s,r)=>s+r.target,0)-100)>.01)throw Error('אחוזי היעד חייבים להסתכם ב־100%, כולל הפנסיה וההשתלמות.');
  const total=rows.reduce((s,r)=>s+r.value,0)+cash;if(total<=0)throw Error('הזן שווי תיק או כסף חדש.');
  const enriched=rows.map(r=>({...r,current:r.value/total*100,gap:total*r.target/100-r.value,analysis:assets[r.ticker]?analyze(assets[r.ticker],now):null}));
  const tradable=enriched.filter(r=>!r.external),threshold=total*tolerance/100;
  const sells=mode==='rebalance'?tradable.filter(r=>r.gap<-threshold).map(r=>{const amount=-r.gap,estimatedGain=Math.max(0,r.value-r.basis)*amount/Math.max(1,r.value);return {...r,amount,estimatedTax:estimatedGain*taxRate/100};}):[];
  const tax=sells.reduce((s,r)=>s+r.estimatedTax,0),funds=cash+sells.reduce((s,r)=>s+r.amount,0)-tax;
  const eligible=tradable.filter(r=>r.gap>0&&r.analysis?.fresh&&r.analysis.action==='קנה בהדרגה');
  const need=eligible.reduce((s,r)=>s+r.gap,0),scale=need?Math.min(1,funds/need):0;
  const buys=eligible.map(r=>({...r,amount:r.gap*scale})).filter(r=>r.amount>=1);
  const used=buys.reduce((s,r)=>s+r.amount,0),remaining=funds-used;
  // A planned purchase can never depend on a sale without a verified recent price.
  const blockedSales=sells.some(r=>!r.analysis?.fresh);
  return {total,rows:enriched,sells:blockedSales?[]:sells,buys:blockedSales?[]:buys,tax:blockedSales?0:tax,remaining:blockedSales?cash:remaining,blockedSales,locked:enriched.filter(r=>r.external&&Math.abs(r.gap)>threshold),mode};
}
