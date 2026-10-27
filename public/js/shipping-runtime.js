import {SHIP_STOCK_TRADES} from './shipping-market.js';

// A bridge is a boat-relative floor origin. Tracked headset transforms are
// intentionally outside this calculation so looking and leaning stay natural.
export function shippingHelmFloorPose(boat,seat=[0,5.4,5],eyeHeight=1.65){
 const number=(value,fallback=0)=>Number.isFinite(value)?value:fallback,yaw=number(boat?.rotation?.y),origin=boat?.position||{},x=number(seat[0]),y=number(seat[1],5.4),z=number(seat[2],5);
 return {x:number(origin.x)+x*Math.cos(yaw)+z*Math.sin(yaw),y:number(origin.y)+y-Math.max(.5,number(eyeHeight,1.65)),z:number(origin.z)-x*Math.sin(yaw)+z*Math.cos(yaw)};
}

// Headset actions use the same server operations as the sports panel. No menu
// entry opens a DOM-only chart that an immersed player cannot see or operate.
export function shippingHeadsetMenu(state={},handlers={}){
 const action=handlers.action||(()=>false),status=handlers.status||(()=>false),read=label=>({label,keepOpen:true,run:()=>status(label)}),phase=state.phase||state.job?.phase||'ready',items=[];
 if(!state.enabled)return [];
 items.push(read('Hormuz shipping · '+phase));
 if(state.message)items.push(read(state.message));
 if(state.boardingId)items.push({label:'Board available cargo ship',run:()=>action('board',{entityId:state.boardingId})});
 if(state.job&&['loading','secured','sailing','unloading'].includes(phase)){
  const primary=state.next;
  if(primary&&primary.operation!=='chart')items.push(primary.enabled===false||state.primaryEnabled===false?read(state.primaryLabel||primary.label||'Cargo operation pending'):{label:state.primaryLabel||primary.label||'Next cargo action',run:()=>action(primary.operation,primary.fields||{})});
  if(phase==='loading'){
   items.push({label:'Load port side',run:()=>action('load',{side:'port'})},{label:'Load starboard side',run:()=>action('load',{side:'starboard'})},{label:'Remove last port cargo',run:()=>action('remove',{side:'port'})},{label:'Remove last starboard cargo',run:()=>action('remove',{side:'starboard'})},{label:'Secure balanced cargo',run:()=>action('secure')});
  }
  if(phase==='secured')items.push({label:'Depart on the marked route',run:()=>action('depart')});
  if(phase==='sailing')items.push({label:'Follow the shipping route',run:()=>action('navigate')},{label:'Dock at assigned berth',run:()=>action('dock')});
  if(phase==='unloading')items.push({label:'Unload one cargo unit',run:()=>action('unload')});
  const job=state.job,point=job.waypoints?.[job.checkpointIndex||0];
  items.push(read('Cargo · '+(job.loaded?.length||0)+' / '+(job.units||0)+' · Quality '+Math.round(job.quality??100)+'%'));
  if(point&&phase==='sailing')items.push(read('Next waypoint · '+(point.name||'Shipping channel')));
  items.push({label:'Cancel cargo quest',run:()=>action('cancel')});
 }else{
  const allowed=new Set((state.availableContracts||[]).map(entry=>typeof entry==='string'?entry:entry.id));
  for(const offer of state.contracts||[]){
   const title=offer.title||offer.name||offer.id;
   if(allowed.has(offer.id))items.push({label:'Accept · '+title,run:()=>action('accept',{contractId:offer.id})});
  }
  if(!allowed.size)items.push(read('Visit a cargo dock with an unlocked ship to accept its quests.'));
  if(state.aboard&&handlers.navigate)for(const port of state.ports||[])items.push({label:'Sail to · '+port.name,run:()=>handlers.navigate(port.id)});
  if(state.canTrade)for(const trade of SHIP_STOCK_TRADES)if(Number(state.supplies?.[trade.stockId])>=trade.cost)items.push({label:'Exchange stock · '+trade.name,run:()=>action('trade',{tradeId:trade.id})});
 }
 if(state.aboard){
  const handling=['loading','secured','unloading'].includes(phase);
  if(handlers.manual&&!handling)items.push({label:'Take manual helm',run:()=>handlers.manual()});
  if(handlers.anchor&&!handling)items.push({label:state.anchored?'Raise anchor':'Stop and drop anchor',run:()=>handlers.anchor()});
  if(handlers.exitVehicle&&Math.abs(state.speed||0)<=.8)items.push({label:'Leave stopped cargo ship',run:()=>handlers.exitVehicle()});
 }
 const competition=state.competition,league=state.league||{};
 if(competition?.id){
  items.push(read((competition.name||'Freight League')+' · '+(competition.status||'open')));
  const edge=competition.status==='open'?competition.startsAt:competition.endsAt;
  if(competition.status!=='finished'&&Number.isFinite(edge)&&Number.isFinite(state.serverTime)){const seconds=Math.max(0,Math.ceil((edge-state.serverTime)/1000));items.push(read((competition.status==='open'?'League starts in ':'League time remaining ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')));}
  if(league.canJoin===true)items.push({label:'Join Freight League',run:()=>action('join-league',{competitionId:competition.id})});
  if(league.joined)items.push(read('Your league score · '+(Number(league.score)||0)+' points · '+(Number(league.deliveries)||0)+' deliveries'+(league.rank?' · Rank '+league.rank:'')));
  for(const [index,row]of (competition.leaderboard||[]).slice(0,6).entries())items.push(read('League '+(row.rank||index+1)+'. '+(row.name||row.companyId||'Captain')+(row.ai?' · AI':'')+' · '+(Number(row.score)||0)+' points · '+(Number(row.deliveries)||0)+' deliveries'));
 }
 // A previous round can remain claimable after the shared next round starts.
 // Only the player's server-approved claim target identifies that receipt.
 if(league.canClaim===true&&league.competitionId)items.push({label:'Claim Freight League prize'+(Number.isFinite(league.prizeMzk)?' · '+league.prizeMzk+' MZK':''),run:()=>action('claim-league',{competitionId:league.competitionId})});
 for(const rival of (Array.isArray(state.rivals)?state.rivals:[]).slice(0,4)){
  const job=rival.job||{},origin=(state.ports||[]).find(port=>port.id===job.originId)?.name?.split(' · ')[0],destination=(state.ports||[]).find(port=>port.id===job.destinationId)?.name?.split(' · ')[0],phase=job.phase||rival.phase||'dispatch';
  const count=phase==='unloading'?Number(job.unloaded)||0:Array.isArray(job.loaded)?job.loaded.length:Number(job.loaded)||0;
  items.push(read('AI '+(rival.companyName||rival.name||'Shipping rival')+' · '+(rival.captainName||rival.captain||'Captain')+' · '+phase+(origin&&destination?' · '+origin+' to '+destination:'')+(job.units?' · Cargo '+count+'/'+job.units:'')));
 }
 const economies=Array.isArray(state.portEconomy)?state.portEconomy:Object.entries(state.portEconomy||{}).map(([portId,data])=>({portId,...data})),nearby=economies.find(port=>(port.portId||port.id)===state.nearestPort);
 if(nearby){
  const title=(state.ports||[]).find(port=>port.id===(nearby.portId||nearby.id))?.name?.split(' · ')[0]||'Current port',deliveries=Number(nearby.deliveries??nearby.arrivals??nearby.imports)||0;
  items.push(read(title+' live port · '+deliveries+' deliveries'+(nearby.queueLength!==undefined?' · '+(Number(nearby.queueLength)||0)+' ships queued':'')));
  if(nearby.stock)items.push(read('Warehouse stock · '+Object.values(nearby.stock).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0)+' cargo units'));
  for(const [cargoId,units]of Object.entries(nearby.demand||{}).filter(([,value])=>Number(value)>0).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,2))items.push(read('Port demand · '+((state.cargo||[]).find(cargo=>cargo.id===cargoId)?.name||cargoId)+' · '+units+' units below target'));
 }
 for(const event of (Array.isArray(state.dispatch)?state.dispatch:[]).slice(-2))if(event.message)items.push(read(event.message));
 items.push({label:'Radio the harbourmaster',run:()=>action('radio')},{label:'Request convoy escort',run:()=>action('escort')});
 if(state.canTrade)items.push({label:'Dock repair and refuel',run:()=>action('service')});
 for(const [id,quantity]of Object.entries(state.supplies||{}))if(Number(quantity)>0)items.push(read('Stock · '+id+' · '+quantity));
 items.push({label:'Return to the bridge',run:()=>handlers.helm?.()},{label:'Exit VR',run:()=>handlers.endSession?.()});return items;
}

/** Ambient port captions establish a baseline on entry and never replay a
 * historical cargo log or interrupt a player's active handling operation. */
export function createShippingActivityAnnouncements({announce=()=>{}}={}){
 let scope=null,sequence=-1,lastAt=0,disposed=false;const seen=new Set();
 const reset=()=>{scope=null;sequence=-1;lastAt=0;seen.clear();};
 return {update(snapshot,selfId,environment){
  if(disposed)return;const shipping=snapshot?.shipping,self=snapshot?.players?.[selfId];
  if(shipping?.enabled!==true||!self||self.health<=0||environment?.id&&shipping.environmentId&&environment.id!==shipping.environmentId){if(scope!==null)reset();return;}
  const world=environment?.id||shipping.environmentId,events=Array.isArray(shipping.dispatch)?shipping.dispatch:Array.isArray(shipping.activity)?shipping.activity:[],now=Number(snapshot.serverTime)||0;
  if(scope!==world){reset();scope=world;sequence=snapshot.sequence??-1;for(const event of events)if(event.id)seen.add(event.id);return;}
  if(Number.isFinite(snapshot.sequence)&&snapshot.sequence<sequence)return;sequence=snapshot.sequence??sequence;
  const boat=snapshot.actors?.[self.vehicleId],position=boat?.position||self.position,nearby=self.shipping?.nearbyPortId;
  let latest=null;
  for(const event of events){
   if(!event.id||seen.has(event.id))continue;seen.add(event.id);
   if(!['departed','arrived','delivered','departure','arrival','delivery','port-alert'].includes(event.type)||!event.message||!Number.isFinite(event.at)||now-event.at<0||now-event.at>12000)continue;
   const port=(shipping.ports||[]).find(port=>port.id===event.portId),point=port?.berth||port;
   if(event.portId!==nearby&&(!position||!point||Math.hypot(position.x-point.x,position.z-point.z)>160))continue;
   if(!latest||event.at>latest.at)latest=event;
  }
  if(seen.size>100)for(const id of [...seen].slice(0,seen.size-60))seen.delete(id);
  if(!latest||now-lastAt<15000||['loading','secured','sailing','unloading'].includes(self.shipping?.job?.phase))return;
  lastAt=now;announce(latest.message);
 },reset,dispose(){reset();disposed=true;}};
}

