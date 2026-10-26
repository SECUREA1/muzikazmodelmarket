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
 items.push({label:'Radio the harbourmaster',run:()=>action('radio')},{label:'Request convoy escort',run:()=>action('escort')});
 if(state.canTrade)items.push({label:'Dock repair and refuel',run:()=>action('service')});
 for(const [id,quantity]of Object.entries(state.supplies||{}))if(Number(quantity)>0)items.push(read('Stock · '+id+' · '+quantity));
 items.push({label:'Return to the bridge',run:()=>handlers.helm?.()},{label:'Exit VR',run:()=>handlers.endSession?.()});return items;
}

