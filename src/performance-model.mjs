const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  date: ['date','data','exitdate','fechamento','trade date'], time: ['time','hora','exittime','trade time'],
  datetime: ['datetime','timestamp','dateandtime','datahora','entrytime','exittime','executiontime','closetime'], profit: ['profit','netprofit','lucro','resultado','pnl','realizedpnl'],
  id: ['id','tradeid','executionid','ordernumber','trade number'], side: ['side','direction','direcao','lado','market position'],
  symbol: ['symbol','instrument','ticker','ativo'], family: ['family','familia','familiainstrumento'], fees: ['commission','commissions','fees','comissao','taxas'], entryMode: ['entrymode','entrytype','entry type','tipoentrada','tipo de entrada'], entryPrice: ['entryprice','entry price','precoentrada','preço de entrada']
};

function matrixOf(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const first = input.split(/\r?\n/, 1)[0] || '';
  const delimiter = [';', ',', '\t'].sort((a,b) => first.split(b).length - first.split(a).length)[0] || ',';
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<input.length;i++){
    const char=input[i];
    if(char==='"'&&quoted&&input[i+1]==='"'){cell+='"';i++;}
    else if(char==='"')quoted=!quoted;
    else if(char===delimiter&&!quoted){row.push(cell.trim());cell='';}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&input[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=char;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return { delimiter, rows, malformed:quoted };
}

export function parseLocalizedNumber(value) {
  let source=String(value??'').trim();
  if(!source)return null;
  const negative=/^\(.*\)$/.test(source)||/^\s*-/.test(source);
  source=source.trim();const accounting=/^\(.*\)$/.test(source);if(accounting)source=source.slice(1,-1);source=source.replace(/^[^\d+-]+|[^\d]+$/g,'').replace(/[\s$€£¥₹]/g,'');if(!/^[+-]?(?:\d+([.,]\d*)?|[.,]\d+)$/.test(source))return null;
  if(source.includes(',')&&source.includes('.')) source=source.lastIndexOf(',')>source.lastIndexOf('.')?source.replace(/\./g,'').replace(',','.'):source.replace(/,/g,'');
  else if(source.includes(',')) { const tail=source.split(',').at(-1); source=tail.length<=2?source.replace(/\./g,'').replace(',','.'):source.replace(/,/g,''); }
  else if((source.match(/\./g)||[]).length>1) { const parts=source.split('.'); const tail=parts.pop(); source=tail.length<=2?`${parts.join('')}.${tail}`:parts.join('')+tail; }
  if((source.match(/[.,]/g)||[]).length===1&&/^[+-]?\d{1,3}\.\d{3}$/.test(source))return null;const number=Number(source);
  if(!Number.isFinite(number))return null;
  return negative? -Math.abs(number):number;
}

function parseDate(value) {
  const source=String(value??'').trim();
  if(!source)return null;
  const datePart=source.split(/[ T]/,1)[0]||source;
  let match=datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if(match){const [,y,m,d]=match;const dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));if(dt.getUTCFullYear()!==Number(y)||dt.getUTCMonth()!==Number(m)-1||dt.getUTCDate()!==Number(d))return null;return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  match=datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if(match){let [,a,b,y]=match;const first=Number(a),second=Number(b);let d,m;if(first>12){d=a;m=b;}else if(second>12){m=a;d=b;}else {d=a;m=b;}const dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));if(dt.getUTCFullYear()!==Number(y)||dt.getUTCMonth()!==Number(m)-1||dt.getUTCDate()!==Number(d))return null;return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  const parsed=new Date(source);return Number.isNaN(parsed.getTime())?null:parsed.toISOString().slice(0,10);
}
function parseTime(value){const match=String(value??'').trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);if(!match)return null;let hour=Number(match[1]),minute=Number(match[2]),second=Number(match[3]||0);if(minute>59||second>59||hour>(match[4]?12:23)||hour<0)return null;if(match[4])hour=hour%12+(match[4].toUpperCase()==='PM'?12:0);return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;}
function periodFromFilename(filename){const text=String(filename).toLowerCase();let match=text.match(/(?:^|\D)(20\d{2})[-_. ](0?[1-9]|1[0-2])(?:\D|$)/);if(match)return `${match[1]}-${String(Number(match[2])).padStart(2,'0')}`;match=text.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_. ](20\d{2})(?:\D|$)/);if(match)return `${match[2]}-${String(Number(match[1])).padStart(2,'0')}`;const months=['january','february','march','april','may','june','july','august','september','october','november','december','janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];const year=text.match(/20\d{2}/)?.[0];if(year){const index=months.findIndex(name=>normalize(text).includes(normalize(name)));if(index>=0)return `${year}-${String(index%12+1).padStart(2,'0')}`;}return '';}
const findCol=(headers,field)=>headers.findIndex(header=>aliases[field].some(alias=>normalize(alias)===header));

export function parsePerformanceCsv(text,filename='arquivo.csv') {
  const {rows,malformed}=matrixOf(text);if(malformed)return {kind:null,filename,records:[],summary:null,warnings:[],errors:['CSV inválido: aspas não fechadas.']};if(!rows.length)return {kind:null,filename,records:[],summary:null,warnings:[],errors:['Arquivo CSV vazio.']};
  const summaryRows=new Map(rows.map(row=>[normalize(row[0]),row.slice(1)]));
  const reportValue=(...names)=>{for(const name of names){const cells=summaryRows.get(normalize(name));const value=cells?.find(cell=>cell.trim()!=='');if(value!==undefined)return parseLocalizedNumber(value);}return null;};
  const summary={period:periodFromFilename(filename),tradeCount:reportValue('# total de negociações','total de negociações','total trades','number of trades'),netProfit:reportValue('lucro líquido total','net profit'),profitFactor:reportValue('fator de lucro','profit factor'),winRate:reportValue('porcentagem de lucro','percent profitable','win rate'),drawdown:reportValue('drawdown máximo','max drawdown','maximum drawdown')};
  const hsgHeaderIndex=rows.findIndex(row=>{const headers=row.map(normalize);return findCol(headers,'entryMode')>=0&&findCol(headers,'entryPrice')>=0&&(findCol(headers,'date')>=0||findCol(headers,'datetime')>=0)&&(findCol(headers,'time')>=0||findCol(headers,'datetime')>=0);});
  if(hsgHeaderIndex>=0){const headers=rows[hsgHeaderIndex].map(normalize),body=rows.slice(hsgHeaderIndex+1),records=[],errors=[];const dateIndex=findCol(headers,'date'),timeIndex=findCol(headers,'time'),dateTimeIndex=findCol(headers,'datetime');const cell=(row,field)=>{const index=findCol(headers,field);return index<0?'':String(row[index]??'').trim();};body.forEach((row,index)=>{if(!row.some(Boolean))return;if(row.length!==headers.length){errors.push(`Linha ${hsgHeaderIndex+index+2}: número de colunas diferente do cabeçalho.`);return;}const raw=dateIndex>=0?row[dateIndex]:row[dateTimeIndex],date=parseDate(raw),rawTime=timeIndex>=0?row[timeIndex]:(String(raw??'').match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/i)||[])[0],entryPrice=parseLocalizedNumber(cell(row,'entryPrice')),entryMode=cell(row,'entryMode');if(!date||!parseTime(rawTime)||entryPrice===null||!entryMode){errors.push(`Linha ${hsgHeaderIndex+index+2}: data, hora, preço ou EntryMode inválido.`);return;}records.push({sourceFile:filename,sourceRow:hsgHeaderIndex+index+2,date,time:parseTime(rawTime),entryPrice,entryMode,side:cell(row,'side'),symbol:cell(row,'symbol'),family:cell(row,'family')});});return{kind:'hsg',filename,records,summary:null,warnings:[],errors};}
  const headerIndex=rows.findIndex(row=>{const headers=row.map(normalize);return findCol(headers,'profit')>=0&&(findCol(headers,'date')>=0||findCol(headers,'datetime')>=0);});
  if(headerIndex<0){if(summary.tradeCount!==null&&summary.netProfit!==null)return {kind:'summary',filename,records:[],summary,warnings:['Relatório agregado importado: os totais ficam disponíveis na aba Geral, mas este arquivo não traz cada trade em sequência. Para desenhar o percurso e simular aprovação ou saque, importe também o CSV Grid individual com Profit e Date/DateTime.'],errors:[]};return {kind:null,filename,records:[],summary:null,warnings:[],errors:['CSV não reconhecido. Envie relatório NinjaTrader agregado ou Grid com coluna Profit.']};}
  const headers=rows[headerIndex].map(normalize),body=rows.slice(headerIndex+1);
  const dateIndex=findCol(headers,'date'),timeIndex=findCol(headers,'time'),dateTimeIndex=findCol(headers,'datetime'),exitIndex=headers.findIndex(h=>['exittime','closetime'].includes(h)),profitIndex=findCol(headers,'profit');
  if(dateIndex<0&&dateTimeIndex<0)return {kind:'grid',filename,records:[],summary:null,warnings:[],errors:['CSV Grid: inclua Date, Data ou DateTime para ordenar as operações.']};
  const records=[],errors=[];
  body.forEach((cells,index)=>{
    if(!cells.some(Boolean))return;if(cells.length!==headers.length){errors.push(`Linha ${headerIndex+index+2}: número de colunas diferente do cabeçalho.`);return;}
    const rawDate=dateIndex>=0?cells[dateIndex]:(exitIndex>=0&&parseDate(cells[exitIndex])?cells[exitIndex]:cells[dateTimeIndex]);
    const date=parseDate(rawDate);const hasOffset=/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(rawDate??''));const rawTime=dateIndex>=0&&exitIndex>=0?cells[exitIndex]:dateTimeIndex>=0?(String(rawDate).match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/i)||[])[0]:timeIndex>=0?cells[timeIndex]:'';
    const profit=parseLocalizedNumber(cells[profitIndex]);
    if(!date||profit===null||hasOffset){errors.push(`Linha ${headerIndex+index+2}: data/Profit inválido ou horário com fuso explícito não suportado; use horário local do CSV.`);return;}
    const cell=(field)=>{const i=findCol(headers,field);return i<0?'':String(cells[i]??'').trim();};
    records.push({id:crypto.randomUUID(),sourceFile:filename,sourceRow:headerIndex+index+2,date,time:parseTime(rawTime),profit,tradeId:cell('id'),side:cell('side'),symbol:cell('symbol'),family:cell('family'),entryMode:cell('entryMode'),entryPrice:parseLocalizedNumber(cell('entryPrice')),fees:parseLocalizedNumber(cell('fees'))||0});
  });
  if(!records.length&&!errors.length)errors.push('CSV Grid não contém operações abaixo do cabeçalho.');
  const warnings=[];if(records.some(trade=>!trade.time))warnings.push('O arquivo não traz horário; a ordem original das linhas será preservada dentro de cada arquivo.');if(body.some(row=>{const value=String(row[dateIndex>=0?dateIndex:dateTimeIndex]??'').split(/[ T]/,1)[0];const match=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{4}$/);return match&&Number(match[1])<=12&&Number(match[2])<=12;}))warnings.push('Datas com dia e mês ambíguos foram interpretadas no formato dia/mês/ano.');
  return {kind:'grid',filename,records,summary:null,warnings,errors};
}

export function previewPerformanceImports(existingSets,parsedFiles) {
  const errors=parsedFiles.flatMap(file=>file.errors.map(message=>`${file.filename}: ${message}`));
  const summaries=parsedFiles.filter(file=>file.kind==='summary').map(file=>({filename:file.filename,summary:file.summary}));
  const files=parsedFiles.filter(file=>file.kind==='grid');
  const fileOrder=new Map(files.map((file,index)=>[file.filename,index]));
  const records=files.flatMap(file=>file.records).sort((a,b)=>a.date.localeCompare(b.date)||(a.time&&b.time?a.time.localeCompare(b.time):0)||(fileOrder.get(a.sourceFile)-fileOrder.get(b.sourceFile))||a.sourceRow-b.sourceRow);
  const entryRows=parsedFiles.filter(file=>file.kind==='hsg').flatMap(file=>file.records),usedEntryRows=new Set();let entryMatches=0;const canonicalSide=value=>{const side=normalize(value);if(['buy','long','compra','comprador'].includes(side))return'buy';if(['sell','short','venda','vendedor'].includes(side))return'sell';return side;};
  for(const trade of records){if(trade.entryMode||!trade.time)continue;const matches=entryRows.map((row,index)=>({row,index})).filter(({row,index})=>!usedEntryRows.has(index)&&row.date===trade.date&&row.time&&Math.abs((Number(row.time.slice(0,2))*3600+Number(row.time.slice(3,5))*60+Number(row.time.slice(6,8)))-(Number(trade.time.slice(0,2))*3600+Number(trade.time.slice(3,5))*60+Number(trade.time.slice(6,8))))<=120&&(!row.side||!trade.side||canonicalSide(row.side)===canonicalSide(trade.side))&&(row.family||trade.family?(!row.family||!trade.family||normalize(row.family)===normalize(trade.family)):(!row.symbol||!trade.symbol||normalize(row.symbol)===normalize(trade.symbol)))&&(row.entryPrice==null||trade.entryPrice==null||Math.abs(row.entryPrice-trade.entryPrice)<=0.25));if(matches.length){const match=matches[0];trade.entryMode=match.row.entryMode;trade.entryFile=match.row.sourceFile;usedEntryRows.add(match.index);entryMatches++;}}
  const existingIds=new Set((existingSets||[]).flatMap(set=>(set.trades||[]).map(t=>t.tradeId).filter(Boolean)));
  const existingSignatures=new Set((existingSets||[]).flatMap(set=>(set.trades||[]).map(tradeSignature)));
  const seenIds=new Set(),seenSignatures=new Set(),duplicates=[];
  for(const trade of records){const signature=tradeSignature(trade);const duplicate=existingSignatures.has(signature)||seenSignatures.has(signature);if(duplicate)duplicates.push(trade);if(trade.tradeId)seenIds.add(trade.tradeId);seenSignatures.add(signature);}
  const ranges=files.map(file=>({filename:file.filename,start:file.records.map(t=>t.date).sort()[0]||'',end:file.records.map(t=>t.date).sort().at(-1)||''}));
  const overlaps=[];for(let i=0;i<ranges.length;i++)for(let j=i+1;j<ranges.length;j++){const a=ranges[i],b=ranges[j];if(a.start&&b.start&&a.start<=b.end&&b.start<=a.end)overlaps.push(`${a.filename} ↔ ${b.filename}`);}
  for(const set of existingSets||[])for(const range of ranges){const dates=(set.trades||[]).map(t=>t.date).filter(Boolean).sort();if(dates.length&&range.start&&range.start<=dates.at(-1)&&dates[0]<=range.end)overlaps.push(`${range.filename} ↔ conjunto ${set.name}`);}
  const seenSummaryPeriods=new Set();for(const item of summaries){if(!item.summary.period)continue;const key=item.summary.period;if(seenSummaryPeriods.has(key))overlaps.push(`Relatórios agregados duplicados no período ${key}`);seenSummaryPeriods.add(key);for(const set of existingSets||[])if((set.summaries||[]).some(saved=>saved.summary?.period===key))overlaps.push(`Relatório ${item.filename} ↔ conjunto ${set.name} (${key})`);}
  const filesByDay=new Map();for(const trade of records){const entry=filesByDay.get(trade.date)||{files:new Set(),count:0,missingTime:false};entry.files.add(trade.sourceFile);entry.count++;entry.missingTime ||= !trade.time;filesByDay.set(trade.date,entry);}
  const sequenceReliable=[...filesByDay.values()].every(entry=>!entry.missingTime||entry.count===1&&entry.files.size===1);
  const warnings=parsedFiles.flatMap(f=>f.warnings);if(entryRows.length&&!records.length)errors.push('CSV HSG reconhecido. Importe também o CSV Grid com Profit para associar as entradas às operações.');if(entryRows.length)warnings.push(`${entryMatches} operação(ões) associada(s) entre CSV Grid e CSV HSG; ${entryRows.length-entryMatches} linha(s) HSG sem par correspondente.`);
  return {errors,summaries,records,duplicates:duplicates.length,duplicateIds:new Set(duplicates.map(t=>t.id)),ranges,overlaps:[...new Set(overlaps)],sequenceReliable,entryMatches,entryRows:entryRows.length,sources:parsedFiles.map(file=>file.filename),warnings:[...new Set(warnings)]};
}
function tradeSignature(trade){return [trade.date,trade.time||'',trade.profit,trade.side,trade.symbol].join('|');}

export function summarizePerformanceTrades(trades,sequenceReliable=true){
  const wins=trades.filter(t=>t.profit>0),losses=trades.filter(t=>t.profit<0),netProfit=trades.reduce((sum,t)=>sum+t.profit,0),grossWins=wins.reduce((sum,t)=>sum+t.profit,0),grossLoss=Math.abs(losses.reduce((sum,t)=>sum+t.profit,0)),averageWin=wins.length?grossWins/wins.length:0,averageLoss=losses.length?grossLoss/losses.length:0;
  let equity=0,peak=0,maxDrawdown=0;const curve=[];for(const trade of trades){equity+=trade.profit;peak=Math.max(peak,equity);maxDrawdown=Math.min(maxDrawdown,equity-peak);curve.push({id:trade.id,date:trade.date,equity,drawdown:equity-peak});}
  const days=new Map();for(const trade of trades){const item=days.get(trade.date)||{date:trade.date,profit:0,trades:0};item.profit+=trade.profit;item.trades++;days.set(trade.date,item);}
  const directions=new Map(),hours=new Map(),byEntry=new Map(),heatmap=new Map();const weekdayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];for(const trade of trades){if(trade.side){const item=directions.get(trade.side)||{side:trade.side,trades:0,profit:0};item.trades++;item.profit+=trade.profit;directions.set(trade.side,item);}if(trade.time){const hour=Number(trade.time.slice(0,2)),item=hours.get(hour)||{hour,trades:0,profit:0};item.trades++;item.profit+=trade.profit;hours.set(hour,item);const weekday=new Date(`${trade.date}T00:00:00Z`).getUTCDay(),key=`${weekday}:${hour}`,cell=heatmap.get(key)||{weekday,hour,trades:0,profit:0};cell.trades++;cell.profit+=trade.profit;heatmap.set(key,cell);}if(trade.entryMode){const key=trade.entryMode,item=byEntry.get(key)||{mode:key,trades:0,profit:0};item.trades++;item.profit+=trade.profit;byEntry.set(key,item);}}
  return {tradeCount:trades.length,wins:wins.length,losses:losses.length,grossWins,grossLoss,averageWin,averageLoss,payoff:averageLoss?averageWin/averageLoss:averageWin?Infinity:0,expectancy:trades.length?netProfit/trades.length:0,netProfit,profitFactor:grossLoss?grossWins/grossLoss:grossWins?Infinity:0,winRate:trades.length?wins.length/trades.length:0,maxDrawdown:sequenceReliable?Math.abs(maxDrawdown):null,equityCurve:sequenceReliable?curve:[],byDay:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),byDirection:[...directions.values()],byHour:[...hours.values()].sort((a,b)=>a.hour-b.hour),byEntry:[...byEntry.values()],heatmap:[...heatmap.values()],weekdayNames};
}

export function simulateEvaluation(trades,profile,sequenceReliable=true){
  if(!trades.length)return {status:'unavailable',reason:'Importe um CSV Grid com uma operação por linha.'};
  if(!sequenceReliable)return {status:'unavailable',reason:'A ordem dos trades é ambígua. Reimporte um arquivo com data e horário.'};
  const start=Number(profile.startingBalance),target=Number(profile.profitTarget),maxDD=Number(profile.maxDrawdown),dailyLimit=profile.guard_dailyStop===false?0:Number(profile.stopDaily||profile.dailyLossLimit),minDays=Number(profile.minimumDays)||0,consistency=Number(profile.consistencyPct);
  if(![start,target,maxDD,dailyLimit,minDays].every(Number.isFinite)||start<=0||target<=0||maxDD<=0||dailyLimit<0||minDays<=0)return {status:'pending',reason:'Preencha saldo inicial, meta, drawdown máximo e dias mínimos.'};
  if(!profile.sessionTimeZone)return {status:'pending',reason:'Informe o fuso IANA usado pelos horários do CSV (ex.: America/New_York).'};
  try{new Intl.DateTimeFormat('en-US',{timeZone:profile.sessionTimeZone}).format(new Date());}catch{return {status:'pending',reason:'O fuso informado não é válido. Use um identificador IANA, como America/New_York.'};}
  if(trades.some(trade=>!trade.time&&profile.dailyResetTime&&profile.dailyResetTime!=='00:00'))return {status:'pending',reason:'Com reinício diário diferente de 00:00, todos os trades precisam incluir horário.'};
  let equity=start,peak=start,endOfDayPeak=start,day='',dayPnl=0,dayTradeCount=0,dayStops=0,hitTarget=false;
  const violations=[],days=new Set(),dayProfits=new Map(),dayTradeIds=new Map(),equityCurve=[{trade:0,equity:0}];
  const rules={profitTarget:{label:'Meta de lucro',status:'in_progress',current:0,target},dailyLoss:{label:'Limite diário',status:dailyLimit>0?'within_limit':'not_configured',current:0,target:dailyLimit,violatedTradeIds:[]},maxDrawdown:{label:'Drawdown máximo',status:'within_limit',current:0,target:maxDD,violatedTradeIds:[]}};
  const sessionDay=trade=>{if(!trade.time||!profile.dailyResetTime||profile.dailyResetTime==='00:00')return trade.date;const clock=trade.time.slice(0,5);if(clock>=profile.dailyResetTime)return trade.date;const prior=new Date(`${trade.date}T00:00:00Z`);prior.setUTCDate(prior.getUTCDate()-1);return prior.toISOString().slice(0,10);};
  for(let i=0;i<trades.length;i++){
    const trade=trades[i],tradeDay=sessionDay(trade);
    if(day!==tradeDay){day=tradeDay;dayPnl=0;dayTradeCount=0;dayStops=0;days.add(day);}
    const maxTrades=profile.guard_maxTrades===false?Infinity:Number(profile.maxTrades)||Infinity,maxStops=profile.guard_maxStops===false?Infinity:Number(profile.maxStops)||Infinity,dailyTarget=profile.guard_dailyTarget===false?Infinity:Number(profile.dailyTarget)||Infinity;
    if(dayTradeCount>=maxTrades||dayStops>=maxStops||dayPnl>=dailyTarget)continue;
    dayTradeCount++;equity+=trade.profit;dayPnl+=trade.profit;equityCurve.push({trade:i+1,day:days.size,equity:equity-start,date:trade.date});if(trade.profit<0)dayStops++;
    dayProfits.set(day,(dayProfits.get(day)||0)+trade.profit);const ids=dayTradeIds.get(day)||[];ids.push(trade.id);dayTradeIds.set(day,ids);peak=Math.max(peak,equity);
    const isDayEnd=i===trades.length-1||sessionDay(trades[i+1])!==tradeDay;
    const dd=profile.drawdownType==='trailing'?peak-equity:profile.drawdownType==='eod'?endOfDayPeak-equity:start-equity;
    if(dailyLimit>0){rules.dailyLoss.current=Math.max(rules.dailyLoss.current,Math.max(0,-dayPnl));if(dayPnl<=-dailyLimit&&rules.dailyLoss.status!=='violated'){rules.dailyLoss.status='violated';rules.dailyLoss.violatedTradeIds.push(trade.id);violations.push(trade.id);}}
    if(profile.drawdownType!=='eod'||isDayEnd)rules.maxDrawdown.current=Math.max(rules.maxDrawdown.current,dd);
    if((profile.drawdownType!=='eod'||isDayEnd)&&dd>=maxDD&&rules.maxDrawdown.status!=='violated'){rules.maxDrawdown.status='violated';rules.maxDrawdown.violatedTradeIds.push(trade.id);violations.push(trade.id);}
    if(profile.drawdownType==='eod'&&isDayEnd)endOfDayPeak=Math.max(endOfDayPeak,equity);
    if(equity-start>=target)hitTarget=true;
  }
  const totalProfit=equity-start;hitTarget=totalProfit>=target;rules.profitTarget.current=Math.max(0,totalProfit);rules.profitTarget.status=hitTarget?'met':'in_progress';
  const ruleRows=[rules.profitTarget,rules.dailyLoss,rules.maxDrawdown];if(minDays>0)ruleRows.push({label:'Dias mínimos',status:days.size>=minDays?'met':'in_progress',current:days.size,target:minDays});
  let consistencyViolated=false;if(consistency>0){const [bestDayKey,bestDay]=[...dayProfits.entries()].sort((a,b)=>b[1]-a[1])[0]||['',0],share=totalProfit>0?bestDay/totalProfit:0;consistencyViolated=share>consistency/100;ruleRows.push({label:'Consistência diária',status:consistencyViolated?'violated':'within_limit',current:share*100,target:consistency,violatedTradeIds:consistencyViolated?(dayTradeIds.get(bestDayKey)||[]):[]});}
  const status=violations.length||consistencyViolated?'failed':hitTarget&&days.size>=minDays?'passed':'in_progress';
  return{status,equity,totalProfit,days:days.size,equityCurve,rules:ruleRows,violatedTradeIds:[...new Set([...violations,...ruleRows.filter(rule=>rule.status==='violated').flatMap(rule=>rule.violatedTradeIds||[])])],assumption:`${profile.drawdownType==='trailing'?'Drawdown dinâmico intraday recalculado a cada trade.':profile.drawdownType==='eod'?'Drawdown atualizado somente no fechamento do dia.':'Drawdown estático contra o saldo inicial.'} Dia de sessão definido pelo horário ${profile.dailyResetTime||'00:00'} no fuso ${profile.sessionTimeZone||'não informado'}. Limites operacionais configurados são aplicados à sequência observada.`};
}

function seededRandom(seed){let value=seed>>>0;return()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function stableSeed(trades,profile){let hash=2166136261;const source=`${trades.map(t=>`${t.date}:${t.time||''}:${t.profit}`).join('|')}|${JSON.stringify(profile)}`;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;}

// Reamostra dias completos com reposição. Isso preserva a distribuição observada
// de resultados diários sem apresentar a sequência histórica como previsão certa.
export function simulateEvaluationScenarios(trades,profile,sequenceReliable=true,runs=1000){
  if(!trades?.length)return{status:'unavailable',reason:'Importe um CSV Grid com uma operação por linha.'};
  if(!sequenceReliable)return{status:'unavailable',reason:'A ordem dos trades é ambígua. Reimporte um CSV Grid com data e horário.'};
  const start=Number(profile.startingBalance),target=Number(profile.profitTarget),maxDD=Number(profile.maxDrawdown),dailyLimit=profile.guard_dailyStop===false?0:Number(profile.stopDaily||profile.dailyLossLimit),minimumDays=Number(profile.minimumDays)||0;
  if(![start,target,maxDD,dailyLimit,minimumDays].every(Number.isFinite)||start<=0||target<=0||maxDD<=0||dailyLimit<0||minimumDays<0)return{status:'pending',reason:'Preencha saldo inicial, meta, limite diário e drawdown máximo.'};
  const daysMap=new Map();for(const trade of trades){const list=daysMap.get(trade.date)||[];list.push(trade);daysMap.set(trade.date,list);}const days=[...daysMap.values()];
  if(!days.length)return{status:'unavailable',reason:'Não há dias operados que possam ser reamostrados.'};
  const random=seededRandom(stableSeed(trades,profile));
  const horizons=[7,14,21,30].map(horizon=>{let passed=0,violated=0,unfinished=0,totalDrawdown=0,curves=Array(horizon).fill(0);const durationDays=[];
    for(let run=0;run<runs;run++){let equity=start,peak=start,eodPeak=start,completedDays=0,failed=false,met=false,maxObservedDD=0;const curve=[];
      for(let dayIndex=0;dayIndex<horizon;dayIndex++){const source=days[Math.floor(random()*days.length)];completedDays++;let dayProfit=0,stops=0,tradeCount=0;const maxTrades=profile.guard_maxTrades===false?Infinity:Number(profile.maxTrades)||Infinity,maxStops=profile.guard_maxStops===false?Infinity:Number(profile.maxStops)||Infinity,dailyTarget=profile.guard_dailyTarget===false?Infinity:Number(profile.dailyTarget)||Infinity;
        for(const trade of source){if(tradeCount>=maxTrades||stops>=maxStops||dayProfit>=dailyTarget)break;tradeCount++;equity+=trade.profit;dayProfit+=trade.profit;if(trade.profit<0)stops++;peak=Math.max(peak,equity);const dd=profile.drawdownType==='trailing'?peak-equity:profile.drawdownType==='eod'?eodPeak-equity:start-equity;maxObservedDD=Math.max(maxObservedDD,dd);if((dailyLimit>0&&dayProfit<=-dailyLimit)||(profile.drawdownType!=='eod'&&dd>=maxDD)){failed=true;break;}if(equity-start>=target&&completedDays>=minimumDays){met=true;break;}}
        if(profile.drawdownType==='eod'&&!failed){const eodDd=eodPeak-equity;maxObservedDD=Math.max(maxObservedDD,eodDd);if(eodDd>=maxDD)failed=true;eodPeak=Math.max(eodPeak,equity);}curve.push(equity);if(failed||met)break;
      }
      const state=failed?'violated':met?'passed':'unfinished';if(state==='passed')passed++;else if(state==='violated')violated++;else unfinished++;totalDrawdown+=maxObservedDD;durationDays.push(curve.length||horizon);
      for(let i=0;i<horizon;i++)curves[i]+=(curve[Math.min(i,curve.length-1)]??start);
    }
    durationDays.sort((a,b)=>a-b);return{days:horizon,passed,violated,unfinished,approvalPct:passed/runs*100,violationPct:violated/runs*100,unfinishedPct:unfinished/runs*100,averageDrawdown:totalDrawdown/runs,durationP10:durationDays[Math.floor((runs-1)*.1)],durationP90:durationDays[Math.floor((runs-1)*.9)],averageEquityCurve:curves.map((value,index)=>({day:index+1,equity:value/runs}))};
  });
  return{status:'complete',runs,sourceDays:days.length,horizons,assumption:'Monte Carlo determinístico: reamostragem com reposição de dias históricos completos. O cenário não prevê resultados futuros.'};
}

export function simulateWithdrawalScenarios(trades,profile,sequenceReliable=true,runs=1000){
  if(!trades?.length)return{status:'unavailable',reason:'Importe um CSV Grid para simular saques.'};
  if(!sequenceReliable)return{status:'unavailable',reason:'A ordem dos trades é ambígua. Reimporte um CSV Grid com data e horário.'};
  const start=Number(profile.startingBalance),maxDD=Number(profile.maxDrawdown),unlock=Number(profile.unlockDd),payout=Number(profile.withdrawalAmount),buffer=Number(profile.prePayoutMargin??profile.safetyBuffer??0),minDays=Number(profile.minimumDays)||0,dailyLimit=profile.guard_dailyStop===false?0:Number(profile.stopDaily||profile.dailyLossLimit),maintenance=Math.max(0,Number(profile.maintenanceLevel)||0);
  if(![start,maxDD,unlock,payout,buffer,minDays,dailyLimit,maintenance].every(Number.isFinite)||start<=0||maxDD<=0||unlock<=0||payout<=0||buffer<0||dailyLimit<0)return{status:'pending',reason:'Configure saldo inicial, drawdown, nível para liberar o saque e valor por saque.'};
  const groups=new Map();for(const trade of trades){const day=groups.get(trade.date)||[];day.push(trade);groups.set(trade.date,day);}const days=[...groups.values()];if(!days.length)return{status:'unavailable',reason:'Não há dias operados para simular.'};
  const random=seededRandom(stableSeed(trades,profile));let paidRuns=0,twoPayoutRuns=0,violatedRuns=0,totalPayouts=0,payoutCount=0,totalDD=0;const curves=Array(30).fill(0),payoutEvents=Array(30).fill(0),unlockEvents=Array(30).fill(0),brokenEvents=Array(30).fill(0);
  const firstPayoutDays=[];for(let run=0;run<runs;run++){let equity=start,peak=start,eodPeak=start,paid=0,count=0,operated=0,violated=false,everViolated=false,unlocked=false,firstPayoutDay=null,maxObservedDD=0;const path=[];
    for(let d=0;d<30;d++){const sampled=days[Math.floor(random()*days.length)];operated++;let dayPnl=0,stops=0,tradeCount=0;const maxTrades=profile.guard_maxTrades===false?Infinity:Number(profile.maxTrades)||Infinity,maxStops=profile.guard_maxStops===false?Infinity:Number(profile.maxStops)||Infinity,dailyTarget=profile.guard_dailyTarget===false?Infinity:Number(profile.dailyTarget)||Infinity;for(const trade of sampled){if(tradeCount>=maxTrades||stops>=maxStops||dayPnl>=dailyTarget)break;tradeCount++;equity+=trade.profit;dayPnl+=trade.profit;if(trade.profit<0)stops++;peak=Math.max(peak,equity);const dd=profile.drawdownType==='trailing'?peak-equity:profile.drawdownType==='eod'?eodPeak-equity:start-equity;maxObservedDD=Math.max(maxObservedDD,dd);if((dailyLimit>0&&dayPnl<=-dailyLimit)||(profile.drawdownType!=='eod'&&dd>=maxDD)){violated=true;everViolated=true;break;}}if(!violated&&profile.drawdownType==='eod'){const eodDd=eodPeak-equity;maxObservedDD=Math.max(maxObservedDD,eodDd);if(eodDd>=maxDD){violated=true;everViolated=true;}eodPeak=Math.max(eodPeak,equity);}if(!unlocked&&equity-start>=unlock){unlockEvents[d]++;unlocked=true;}if(violated){brokenEvents[d]++;if(profile.simulateRestart===true||profile.simulateRestart==='true'){equity=start;peak=start;eodPeak=start;unlocked=false;violated=false;}else break;}
      const available=Math.max(0,equity-start-Math.max(maintenance,unlock)-buffer);if(operated>=minDays&&equity-start>=unlock&&available>=payout){const paidNow=Math.min(payout,available);equity-=paidNow;paid+=paidNow;count++;payoutEvents[d]++;if(firstPayoutDay===null)firstPayoutDay=d+1;if(profile.autoPayout===false||profile.autoPayout==='false')break;}
      path.push(equity);
    }
    if(firstPayoutDay!==null)firstPayoutDays.push(firstPayoutDay);if(paid>0)paidRuns++;if(count>=2)twoPayoutRuns++;if(everViolated)violatedRuns++;totalPayouts+=paid;payoutCount+=count;totalDD+=maxObservedDD;for(let i=0;i<30;i++)curves[i]+=(path[Math.min(i,path.length-1)]??start);
  }
  const markers=[];for(let i=0;i<30;i++){if(unlockEvents[i])markers.push({day:i+1,label:'DD deslocado',probability:unlockEvents[i]/runs*100,color:'#31c9e8'});if(payoutEvents[i])markers.push({day:i+1,label:'Saque',probability:payoutEvents[i]/runs*100,color:'#ffb32f'});if(brokenEvents[i])markers.push({day:i+1,label:'Conta quebrada',probability:brokenEvents[i]/runs*100,color:'#ff5368'});}
  firstPayoutDays.sort((a,b)=>a-b);return{status:'complete',runs,sourceDays:days.length,payoutProbability:paidRuns/runs*100,twoPayoutProbability:twoPayoutRuns/runs*100,violationProbability:violatedRuns/runs*100,averagePayout:totalPayouts/runs,averagePayoutCount:payoutCount/runs,averageDrawdown:totalDD/runs,averagePayoutTotal:totalPayouts/runs,durationP10:firstPayoutDays[Math.floor((firstPayoutDays.length-1)*.1)],durationP90:firstPayoutDays[Math.floor((firstPayoutDays.length-1)*.9)],averageEquityCurve:curves.map((value,index)=>({day:index+1,equity:value/runs})),markers,assumption:'Monte Carlo determinístico: reamostragem com reposição de dias históricos completos. Valores são cenários estatísticos, não promessa de saque.'};
}

export function estimateWithdrawal(trades,profile){
  if(!trades.length)return {status:'unavailable',reason:'Importe operações individuais para estimar um saque.'};
  if(!profile.sequenceReliable)return {status:'unavailable',reason:'A ordem dos trades é ambígua; reimporte um CSV Grid com data e horário.'};
  const required=['startingBalance','safetyBuffer','splitPct','minimumDays','minimumPayout','maximumPayout'];const missing=required.filter(key=>!Number.isFinite(Number(profile[key]))||profile[key]==='');if(missing.length)return {status:'pending',reason:'Configure saldo de referência, buffer e percentual de repasse.'};
  const totalProfit=trades.reduce((sum,t)=>sum+t.profit,0),endingBalance=Number(profile.startingBalance)+totalProfit,days=new Set(trades.map(t=>t.date)).size,eligible=Math.max(0,totalProfit-Number(profile.safetyBuffer)),split=eligible*Math.max(0,Math.min(100,Number(profile.splitPct)))/100;
  const minDays=Number(profile.minimumDays),minPayout=Number(profile.minimumPayout),maxPayout=Number(profile.maximumPayout);if(minDays<0||minPayout<0||maxPayout<minPayout)return {status:'pending',reason:'Revise dias mínimos e limites mínimo/máximo de saque.'};
  const netEstimate=Math.max(0,Math.min(split,maxPayout));
  if(days<minDays)return {status:'pending',reason:`Faltam ${minDays-days} dia(s) para o mínimo configurado.`,totalProfit,endingBalance,eligibleProfit:eligible,grossEligible:split,netEstimate:0,days};
  if(netEstimate<minPayout)return {status:'below_minimum',reason:'O valor estimado ainda está abaixo do saque mínimo configurado.',totalProfit,endingBalance,eligibleProfit:eligible,grossEligible:split,netEstimate,days};
  return {status:'estimate',totalProfit,endingBalance,eligibleProfit:eligible,grossEligible:split,netEstimate,days,assumptions:['O buffer configurado foi reservado antes da divisão.','Limites e dias mínimos refletem apenas os parâmetros preenchidos.']};
}
