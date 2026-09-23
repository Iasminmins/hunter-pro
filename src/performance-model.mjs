const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  date: ['date','data','exitdate','fechamento','trade date'], time: ['time','hora','exittime','trade time'],
  datetime: ['datetime','timestamp','dateandtime','datahora','entrytime','exittime','executiontime','closetime'], profit: ['profit','netprofit','lucro','resultado','pnl','realizedpnl'],
  id: ['id','tradeid','executionid','ordernumber','trade number'], side: ['side','direction','direcao','lado','market position'],
  symbol: ['symbol','instrument','ticker','ativo'], fees: ['commission','commissions','fees','comissao','taxas']
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
  const headerIndex=rows.findIndex(row=>{const headers=row.map(normalize);return findCol(headers,'profit')>=0&&(findCol(headers,'date')>=0||findCol(headers,'datetime')>=0);});
  if(headerIndex<0){if(summary.tradeCount!==null&&summary.netProfit!==null)return {kind:'summary',filename,records:[],summary,warnings:['Relatório agregado: não preserva a ordem dos trades.'],errors:[]};return {kind:null,filename,records:[],summary:null,warnings:[],errors:['CSV não reconhecido. Envie relatório NinjaTrader agregado ou Grid com coluna Profit.']};}
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
    records.push({id:crypto.randomUUID(),sourceFile:filename,sourceRow:headerIndex+index+2,date,time:parseTime(rawTime),profit,tradeId:cell('id'),side:cell('side'),symbol:cell('symbol'),fees:parseLocalizedNumber(cell('fees'))||0});
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
  return {errors,summaries,records,duplicates:duplicates.length,duplicateIds:new Set(duplicates.map(t=>t.id)),ranges,overlaps:[...new Set(overlaps)],sequenceReliable,warnings:[...new Set(parsedFiles.flatMap(f=>f.warnings))]};
}
function tradeSignature(trade){return [trade.date,trade.time||'',trade.profit,trade.side,trade.symbol].join('|');}

export function summarizePerformanceTrades(trades,sequenceReliable=true){
  const wins=trades.filter(t=>t.profit>0),losses=trades.filter(t=>t.profit<0),netProfit=trades.reduce((sum,t)=>sum+t.profit,0),grossWins=wins.reduce((sum,t)=>sum+t.profit,0),grossLoss=Math.abs(losses.reduce((sum,t)=>sum+t.profit,0));
  let equity=0,peak=0,maxDrawdown=0;const curve=[];for(const trade of trades){equity+=trade.profit;peak=Math.max(peak,equity);maxDrawdown=Math.min(maxDrawdown,equity-peak);curve.push({id:trade.id,date:trade.date,equity,drawdown:equity-peak});}
  const days=new Map();for(const trade of trades){const item=days.get(trade.date)||{date:trade.date,profit:0,trades:0};item.profit+=trade.profit;item.trades++;days.set(trade.date,item);}
  const directions=new Map();for(const trade of trades){if(!trade.side)continue;const item=directions.get(trade.side)||{side:trade.side,trades:0,profit:0};item.trades++;item.profit+=trade.profit;directions.set(trade.side,item);}
  return {tradeCount:trades.length,netProfit,grossWins,grossLoss,profitFactor:grossLoss?grossWins/grossLoss:grossWins?Infinity:0,winRate:trades.length?wins.length/trades.length:0,maxDrawdown:sequenceReliable?Math.abs(maxDrawdown):null,equityCurve:sequenceReliable?curve:[],byDay:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),byDirection:[...directions.values()]};
}

export function simulateEvaluation(trades,profile,sequenceReliable=true){
  if(!trades.length)return {status:'unavailable',reason:'Importe um CSV Grid com uma operação por linha.'};
  if(!sequenceReliable)return {status:'unavailable',reason:'A ordem dos trades é ambígua. Reimporte um arquivo com data e horário.'};
  const start=Number(profile.startingBalance),target=Number(profile.profitTarget),maxDD=Number(profile.maxDrawdown),dailyLimit=Number(profile.dailyLossLimit),minDays=Number(profile.minimumDays)||0,consistency=Number(profile.consistencyPct);
  if(!Number.isFinite(start)||!Number.isFinite(target)||!Number.isFinite(maxDD)||start<=0||target<=0||maxDD<=0||!Number.isFinite(dailyLimit)||dailyLimit<=0||!Number.isFinite(minDays)||minDays<=0)return {status:'pending',reason:'Preencha saldo inicial, meta, drawdown máximo, limite diário e dias mínimos.'};if(!profile.sessionTimeZone)return {status:'pending',reason:'Informe o fuso IANA usado pelos horários do CSV (ex.: America/New_York).'};try{new Intl.DateTimeFormat('en-US',{timeZone:profile.sessionTimeZone}).format(new Date());}catch{return {status:'pending',reason:'O fuso informado não é válido. Use um identificador IANA, como America/New_York.'};}if(trades.some(trade=>!trade.time&&profile.dailyResetTime&&profile.dailyResetTime!=='00:00'))return {status:'pending',reason:'Com reinício diário diferente de 00:00, todos os trades precisam incluir horário.'};
  let equity=start,peak=start,day='',dayPnl=0,hitTarget=false;const violations=[],days=new Set(),dayProfits=new Map(),dayTradeIds=new Map();
  const rules={profitTarget:{label:'Meta de lucro',status:'in_progress',current:0,target},dailyLoss:{label:'Limite diário',status:dailyLimit>0?'within_limit':'not_configured',current:0,target:dailyLimit,violatedTradeIds:[]},maxDrawdown:{label:'Drawdown máximo',status:'within_limit',current:0,target:maxDD,violatedTradeIds:[]}};
  const sessionDay=trade=>{if(!trade.time||!profile.dailyResetTime||profile.dailyResetTime==='00:00')return trade.date;const clock=trade.time.slice(0,5);if(clock>=profile.dailyResetTime)return trade.date;const prior=new Date(`${trade.date}T00:00:00Z`);prior.setUTCDate(prior.getUTCDate()-1);return prior.toISOString().slice(0,10);};
  for(const trade of trades){const tradeDay=sessionDay(trade);if(day!==tradeDay){day=tradeDay;dayPnl=0;days.add(day);}equity+=trade.profit;dayPnl+=trade.profit;dayProfits.set(day,(dayProfits.get(day)||0)+trade.profit);const ids=dayTradeIds.get(day)||[];ids.push(trade.id);dayTradeIds.set(day,ids);peak=Math.max(peak,equity);
    const dd=profile.drawdownType==='trailing'?peak-equity:start-equity;rules.maxDrawdown.current=Math.max(rules.maxDrawdown.current,dd);
    if(dailyLimit>0){rules.dailyLoss.current=Math.max(rules.dailyLoss.current,Math.max(0,-dayPnl));if(dayPnl<=-dailyLimit&&rules.dailyLoss.status!=='violated'){rules.dailyLoss.status='violated';rules.dailyLoss.violatedTradeIds.push(trade.id);violations.push(trade.id);}}
    if(dd>=maxDD&&rules.maxDrawdown.status!=='violated'){rules.maxDrawdown.status='violated';rules.maxDrawdown.violatedTradeIds.push(trade.id);violations.push(trade.id);}
    if(equity-start>=target)hitTarget=true;
  }
  const totalProfit=equity-start;hitTarget=totalProfit>=target;rules.profitTarget.current=Math.max(0,totalProfit);rules.profitTarget.status=hitTarget?'met':'in_progress';
  const ruleRows=[rules.profitTarget,rules.dailyLoss,rules.maxDrawdown];
  if(minDays>0)ruleRows.push({label:'Dias mínimos',status:days.size>=minDays?'met':'in_progress',current:days.size,target:minDays});
  let consistencyViolated=false;if(consistency>0){const [bestDayKey,bestDay]=[...dayProfits.entries()].sort((a,b)=>b[1]-a[1])[0]||['',0],share=totalProfit>0?bestDay/totalProfit:0;consistencyViolated=share>consistency/100;ruleRows.push({label:'Consistência diária',status:consistencyViolated?'violated':'within_limit',current:share*100,target:consistency,violatedTradeIds:consistencyViolated?(dayTradeIds.get(bestDayKey)||[]):[]});}
  const status=violations.length||consistencyViolated?'failed':hitTarget&&days.size>=minDays?'passed':'in_progress';
  return {status,equity,totalProfit,days:days.size,rules:ruleRows,violatedTradeIds:[...new Set([...violations,...ruleRows.filter(rule=>rule.status==='violated').flatMap(rule=>rule.violatedTradeIds||[])])],assumption:`${profile.drawdownType==='trailing'?'Drawdown trailing recalculado no fechamento de cada trade.':'Drawdown estático medido contra o saldo inicial.'} Dia de sessão definido pelo horário ${profile.dailyResetTime||'00:00'} no fuso informado para o CSV (${profile.sessionTimeZone||'não informado'}).`};
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
