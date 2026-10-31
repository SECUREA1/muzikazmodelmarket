/** Called inside verified commerce transactions, never from editable game saves. */
export function recordForgeCommerce(data,wallet,kind,eventId){
 const fields={sales:'sales',deliveries:'deliveries',stockOrders:'stockOrders'};
 if(!Object.hasOwn(fields,kind)||typeof wallet!=='string'||!wallet||typeof eventId!=='string'||!eventId)return false;
 data.forge ||= {accounts:{},stationLocks:{}};
 data.forge.accounts ||= {};
 const state=data.forge.accounts[wallet] ||= {job:null,completedItems:0,totalSpentMzk:0,byRecipe:{},badges:[]};
 const commerce=state.commerce ||= {sales:0,deliveries:0,stockOrders:0,events:{}};
 commerce.events ||= {};
 const key=kind+':'+eventId;
 if(Object.hasOwn(commerce.events,key))return false;
 commerce.events[key]=true;
 commerce[fields[kind]]=(Number.isSafeInteger(commerce[fields[kind]])?commerce[fields[kind]]:0)+1;
 return true;
}
