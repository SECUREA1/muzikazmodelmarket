const list=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const label=value=>String(value??'');
const setText=(node,value)=>{value=label(value);if(node.textContent!==value)node.textContent=value;};
const color=value=>/^#[\da-f]{6}$/i.test(value||'')?value:'#84d6d2';
const phaseLabel=value=>({loading:'Loading',securing:'Securing cargo',secured:'Ready to depart',sailing:'Underway',docking:'Dock approach',unloading:'Unloading',waiting:'Waiting for berth',repositioning:'Positioning for backhaul',returning:'Returning to port',idle:'Awaiting dispatch',dispatching:'Preparing next manifest',departing:'Leaving port',queued:'Waiting for berth'})[value]||String(value||'Awaiting dispatch').replaceAll('-',' ');

export function shippingRivalPresentation(record={},actors={}){
 const job=record.job||record.manifest||{},actor=actors[record.actorId||record.shipId||record.vesselId],phase=record.phase||job.phase||actor?.boating?.phase||'idle';
 const waitingFor=record.waitingFor||null,waitingLabel=waitingFor==='commercial berth'?'Waiting for berth':waitingFor==='player passage'?'Giving way to a player':waitingFor==='clear channel'?'Holding for clear channel':null;
 const loaded=Number.isFinite(actor?.boating?.cargoCount)?actor.boating.cargoCount:Array.isArray(job.loaded)?Math.max(0,job.loaded.length-finite(job.unloaded)):finite(job.loadedCount??record.loadedCount),units=finite(job.units??record.units??record.cargoUnits),unloaded=finite(job.unloaded??record.unloaded);
 return {id:String(record.companyId||record.id||record.actorId||''),actorId:record.actorId||record.shipId||record.vesselId||null,company:record.companyName||record.company||record.name||'Shipping company',captain:record.captainName||record.captain||record.crew?.name||'AI captain',color:color(record.color||record.companyColor),phase,waitingFor,phaseLabel:waitingLabel||phaseLabel(phase),originId:job.originId||job.from||record.originId||record.from||null,destinationId:job.destinationId||job.to||record.destinationId||record.to||null,cargoName:job.cargoName||record.cargoName||job.cargoId||record.cargoId||'Freight',loaded,units,unloaded,quality:Number.isFinite(Number(job.quality??record.quality))?finite(job.quality??record.quality):null,etaMs:Number.isFinite(record.etaMs)?Math.max(0,record.etaMs):Number.isFinite(record.etaSeconds)?Math.max(0,record.etaSeconds*1000):null,deliveries:finite(record.stats?.deliveries??record.deliveries),position:actor?.position||record.position||null,yaw:actor?.rotation?.y??record.yaw??record.rotation?.y??0,waypoints:job.waypoints||record.waypoints||[],checkpointIndex:finite(job.checkpointIndex??record.checkpointIndex),message:record.message||job.message||'',raw:record};
}

export function shippingPortPresentation(record={},rivals=[],portId=record.portId||record.id){
 const queue=record.queue??record.waiting;
 const queueCount=Array.isArray(queue)?queue.length:queue!==undefined?finite(queue):list(rivals).filter(rival=>(rival.destinationId||rival.job?.destinationId)===portId&&rival.waitingFor==='commercial berth').length;
 return {queueCount,receivedUnits:finite(record.receivedUnits??record.unloaded),dispatchedUnits:finite(record.dispatchedUnits??record.loaded),arrivals:finite(record.arrivals??record.imports),departures:finite(record.departures??record.exports)};
}

export function shippingLeaguePresentation(competition=null,league={},serverTime=0){
 if(!competition?.id)return {available:false,title:'Strait Freight League',status:'Preparing the next shipping competition.',board:[],summary:'Live shipping dispatch',canJoin:false,canClaim:false};
 const phase=competition.status||'open',remaining=Math.max(0,Math.ceil((finite(phase==='open'?competition.startsAt:competition.endsAt)-finite(serverTime))/1000)),clock=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0'),board=list(competition.leaderboard);
 const status=phase==='open'?'Starts in '+clock:phase==='active'?'Ends in '+clock:'Round complete';
 const rank=finite(league.rank),summary=league.joined?(rank?'League · #'+rank+' · '+finite(league.score)+' pts':'League joined · '+status.toLowerCase()):'Freight League · '+status.toLowerCase();
 return {available:true,id:competition.id,title:competition.name||'Strait Freight League',phase,status,board,summary,canJoin:league.canJoin===true,canClaim:league.canClaim===true,joinId:competition.id,claimId:league.competitionId||null,prizeMzk:finite(league.prizeMzk),message:league.message||''};
}

function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function card(parent,title){const section=element('section','shipping-live-card');section.append(element('h3',null,title));parent.append(section);return section;}
function button(text,attribute){const node=element('button',null,text);node.type='button';if(attribute)node.setAttribute(attribute,'');return node;}
const minutes=ms=>Math.max(1,Math.ceil(ms/60000))+' min';

/** Read confirmed fleet activity. Focusing a company changes the chart only. */
export function mountShippingLivePanels({parent,hud,onAction=()=>{},onFocusRival=()=>{}}){
 const leagueCard=card(parent,'Strait Freight League'),leagueClock=element('p','shipping-league-clock'),board=element('ol','shipping-league-board'),leagueActions=element('div','shipping-load-controls'),join=button('Join Freight League','data-shipping-join-league'),claim=button('Claim league prize','data-shipping-claim-league'),leagueHelp=element('p','shipping-live-note','Join before accepting a shipment. Complete verified deliveries against live shipping crews; quality, distance and cargo count toward your score.');
 leagueClock.dataset.shippingLeagueClock='';board.dataset.shippingLeagueBoard='';leagueActions.append(join,claim);leagueCard.append(leagueClock,board,leagueActions,leagueHelp);
 const fleetCard=card(parent,'Live shipping companies'),rivalsRoot=element('div','shipping-rivals'),detail=element('p','shipping-rival-detail'),clear=button('Show my cargo route','data-shipping-clear-rival');rivalsRoot.dataset.shippingRivals='';detail.dataset.shippingRivalDetail='';fleetCard.append(rivalsRoot,detail,clear);
 const economyCard=card(parent,'Port operations'),economy=element('div','shipping-port-economy');economy.dataset.shippingPortEconomy='';economyCard.append(economy);
 const dispatchCard=card(parent,'Live freight radio'),dispatch=element('ol','shipping-dispatch');dispatch.dataset.shippingDispatch='';dispatch.setAttribute('aria-label','Recent shipping arrivals and departures');dispatchCard.append(dispatch);
 let current=null,leagueState=null,rivalKey='',boardKey='',economyKey='',dispatchKey='',disposed=false;
 const rivalNodes=new Map();
 join.onclick=()=>{if(!join.disabled&&leagueState?.joinId)onAction('join-league',{competitionId:leagueState.joinId});};
 claim.onclick=()=>{if(!claim.disabled&&leagueState?.claimId)onAction('claim-league',{competitionId:leagueState.claimId});};
 clear.onclick=()=>onFocusRival(null);
 function update({competition=null,league={},rivals=[],actors={},portEconomy=[],activity=[],ports=[],cargo=[],selectedPortId=null,selectedRivalId=null,serverTime=0,pending=false}={}){
  if(disposed)return;current={competition,league,rivals,actors,portEconomy,activity,ports,cargo,selectedPortId,selectedRivalId,serverTime,pending};
  const portName=id=>ports.find(port=>port.id===id)?.name?.split(' · ')[0]||id||'Dispatch',cargoName=id=>cargo.find(item=>item.id===id)?.name||String(id||'Cargo').replaceAll('-',' '),fleet=list(rivals).map(item=>shippingRivalPresentation(item,actors));
  leagueState=shippingLeaguePresentation(competition,league,serverTime);setText(leagueCard.querySelector('h3'),leagueState.title);setText(leagueClock,leagueState.status+(leagueState.message?' · '+leagueState.message:''));
  join.disabled=pending||!leagueState.canJoin;join.hidden=!leagueState.available||league.joined===true;claim.disabled=pending||!leagueState.canClaim||!leagueState.claimId;claim.hidden=!leagueState.canClaim;setText(claim,leagueState.prizeMzk?'Claim '+leagueState.prizeMzk+' MZK league prize':'Claim league prize');
  const nextBoard=JSON.stringify(leagueState.board);if(nextBoard!==boardKey){boardKey=nextBoard;board.replaceChildren();for(const [index,entry]of leagueState.board.slice(0,12).entries()){const row=element('li');row.dataset.leagueActor=entry.actorId||entry.companyId||'';const name=element('strong',null,(entry.rank||index+1)+'. '+(entry.name||entry.companyName||'Captain')+(entry.ai?' · AI':''));row.append(name,element('span',null,finite(entry.score)+' pts · '+finite(entry.deliveries)+' deliveries · '+finite(entry.unitsDelivered)+' units'));board.append(row);}if(!leagueState.board.length)board.append(element('li','shipping-live-empty','No completed deliveries in this round yet.'));}
  setText(hud,fleet.length+' live rival '+(fleet.length===1?'crew':'crews')+' · '+leagueState.summary);hud.hidden=!fleet.length&&!leagueState.available;
  const nextRivals=JSON.stringify(fleet.map(item=>[item.id,item.company,item.captain,item.phaseLabel,item.originId,item.destinationId,item.loaded,item.unloaded,item.units,item.etaMs,item.deliveries,item.message,item.color]));
  if(nextRivals!==rivalKey){rivalKey=nextRivals;const ids=new Set();for(const rival of fleet){if(!rival.id)continue;ids.add(rival.id);let row=rivalNodes.get(rival.id);if(!row){const node=button('',null);node.className='shipping-rival';node.dataset.rivalId=rival.id;const title=element('strong'),status=element('span'),route=element('small');node.append(title,status,route);node.onclick=()=>onFocusRival(rival.id);row={node,title,status,route};rivalNodes.set(rival.id,row);rivalsRoot.append(node);}row.node.style.setProperty('--rival-color',rival.color);setText(row.title,rival.company+' · AI');setText(row.status,rival.phaseLabel+' · '+rival.loaded+'/'+rival.units+' cargo'+(rival.etaMs!==null?' · '+minutes(rival.etaMs):''));setText(row.route,portName(rival.originId)+' → '+portName(rival.destinationId));}
   for(const [id,row]of rivalNodes)if(!ids.has(id)){row.node.remove();rivalNodes.delete(id);}if(!fleet.length&&!rivalsRoot.querySelector('.shipping-live-empty'))rivalsRoot.append(element('p','shipping-live-empty','Waiting for the live dispatch fleet to connect.'));else if(fleet.length)rivalsRoot.querySelector('.shipping-live-empty')?.remove();
  }
  for(const [id,row]of rivalNodes)row.node.setAttribute('aria-pressed',String(id===selectedRivalId));
  const focused=fleet.find(rival=>rival.id===selectedRivalId);clear.hidden=!focused;detail.hidden=!focused;
  if(focused)setText(detail,focused.captain+' · '+focused.company+'. '+focused.phaseLabel+' with '+focused.loaded+'/'+focused.units+' '+cargoName(focused.cargoName)+'. '+portName(focused.originId)+' → '+portName(focused.destinationId)+(focused.quality!==null?' · Cargo quality '+Math.round(focused.quality)+'%':'')+' · '+focused.deliveries+' completed deliveries.'+(focused.message?' '+focused.message:''));
  const selected=list(portEconomy).find(port=>(port.portId||port.id)===selectedPortId),portActivity=shippingPortPresentation(selected||{},fleet,selectedPortId),nextEconomy=JSON.stringify([selectedPortId,selected&&[selected.stock,selected.inventory,selected.demand,selected.queue,selected.waiting,selected.imports,selected.exports,selected.loaded,selected.unloaded,selected.receivedUnits,selected.dispatchedUnits,selected.deliveries,selected.arrivals,selected.departures,selected.message],portActivity.queueCount]);
  if(nextEconomy!==economyKey){economyKey=nextEconomy;economy.replaceChildren();economy.append(element('strong',null,portName(selectedPortId)));if(!selected)economy.append(element('p','shipping-live-empty','Select a port to inspect its live stock, demand and dock activity.'));else{
   economy.append(element('p',null,'Dock queue '+portActivity.queueCount+' · '+portActivity.arrivals+(portActivity.arrivals===1?' arrival':' arrivals')+' · '+portActivity.departures+(portActivity.departures===1?' departure':' departures')),element('p',null,portActivity.receivedUnits+(portActivity.receivedUnits===1?' unit received':' units received')+' · '+portActivity.dispatchedUnits+(portActivity.dispatchedUnits===1?' unit dispatched':' units dispatched')));
   const stock=selected.stock||selected.inventory||{},demand=selected.demand||{},goods=new Set([...Object.keys(stock),...Object.keys(demand)]),rows=element('ul');
   for(const id of goods){const quantity=typeof stock[id]==='object'?finite(stock[id].quantity):finite(stock[id]),wanted=typeof demand[id]==='object'?finite(demand[id].quantity??demand[id].demand):finite(demand[id]);rows.append(element('li',null,cargoName(id)+' · '+quantity+' stock'+(wanted?' · '+wanted+' needed':'')));}if(goods.size)economy.append(rows);else economy.append(element('p','shipping-live-note',selected.message||'Port dispatch is preparing its next cargo orders.'));
   if(selected.message&&goods.size)economy.append(element('p','shipping-live-note',selected.message));
  }}
  const recent=list(activity).slice(-8).reverse(),nextDispatch=JSON.stringify(recent);if(nextDispatch!==dispatchKey){dispatchKey=nextDispatch;dispatch.replaceChildren();for(const entry of recent){const row=element('li');row.dataset.shippingEvent=entry.id||'';const title=entry.message||entry.text||((entry.companyName||entry.name||'Freight control')+' · '+phaseLabel(entry.phase||entry.type));row.append(element('span',null,title));if(entry.portId)row.append(element('small',null,portName(entry.portId)));dispatch.append(row);}if(!recent.length)dispatch.append(element('li','shipping-live-empty','Listening for cargo arrivals, departures and completed manifests.'));}
 }
 function reset(){current=null;leagueState=null;rivalKey=boardKey=economyKey=dispatchKey='';rivalNodes.clear();rivalsRoot.replaceChildren();board.replaceChildren();economy.replaceChildren();dispatch.replaceChildren();hud.hidden=true;}
 reset();
 return {update,reset,snapshot:()=>current,dispose(){if(disposed)return;reset();disposed=true;parent.replaceChildren();}};
}
