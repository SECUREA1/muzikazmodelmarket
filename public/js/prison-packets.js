/** Prison supplies use recreation tokens and remain independent of MZK and
 * escape contraband. Call these rules only after validating the world station. */
const freeze=value=>Object.freeze(value);
export const PRISON_SUPPLY_CAPACITY=8;
export const PRISON_SUPPLY_ITEM_LIMIT=4;
export const PRISON_SUPPLY_COOLDOWN_MS=10000;
export const PRISON_SUPPLY_ITEMS=freeze({
 snack:freeze({id:'snack',name:'Canteen snack',description:'A small snack restores 18 energy and 4 morale.',effects:freeze({energy:18,morale:4})}),
 water:freeze({id:'water',name:'Water bottle',description:'Fresh water restores 8 energy and 3 health.',effects:freeze({energy:8,health:3})}),
 juice:freeze({id:'juice',name:'Recreation juice',description:'A fruit drink restores 18 morale and 6 energy.',effects:freeze({morale:18,energy:6})}),
 'first-aid':freeze({id:'first-aid',name:'First-aid pouch',description:'Basic first aid restores 24 health.',effects:freeze({health:24})})
});
export const PRISON_PACKETS=freeze([
 freeze({id:'canteen',name:'Canteen packet',description:'Pack a snack and water for the rest of your shift.',cost:4,items:freeze({snack:1,water:1}),requirements:freeze({})}),
 freeze({id:'recreation',name:'Recreation packet',description:'Two fruit drinks and a snack for a break between games.',cost:6,items:freeze({juice:2,snack:1}),requirements:freeze({})}),
 freeze({id:'workshop',name:'Workshop packet',description:'A first-aid pouch and water, available after completing an honest shift.',cost:8,items:freeze({'first-aid':1,water:1}),requirements:freeze({completed:'work'})}),
 freeze({id:'guard-duty',name:'Guard duty packet',description:'First aid, water and juice for a guard on a long patrol.',cost:9,items:freeze({'first-aid':1,water:1,juice:1}),requirements:freeze({role:'guard'})})
]);
const owns=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const fail=message=>({ok:false,message});
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const bounded=value=>Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
function supplies(player){return Object.fromEntries(Object.keys(PRISON_SUPPLY_ITEMS).map(id=>[id,count(player?.supplies?.[id])]));}
function eligible(player,now){
 if(!player||!['prisoner','guard'].includes(player.role))return 'Start a prison shift before using supplies.';
 if(!Number.isFinite(now)||now<0)return 'The prison supply clock is unavailable.';
 if(player.escaped)return 'Return to intake before using prison supplies.';
 if(player.caughtUntil>now)return 'Wait until your detention ends before using supplies.';
 return null;
}
/** UI availability text uses the same requirements as the server-side rules. */
export function prisonPacketRequirement(player,packetId){
 const packet=PRISON_PACKETS.find(row=>row.id===packetId);
 if(!packet)return 'Choose an available prison packet.';
 if(packet.requirements.role&&player?.role!==packet.requirements.role)return 'Start a guard shift at intake to buy this packet.';
 if(packet.requirements.completed&&!player?.completed?.includes(packet.requirements.completed))return 'Complete three workshop sorting jobs to unlock this packet.';
 return null;
}
export function prisonSupplyCounts(player){return supplies(player);}
export function purchasePrisonPacket(player,packetId,{now=Date.now()}={}){
 const problem=eligible(player,now);if(problem)return fail(problem);
 const packet=PRISON_PACKETS.find(row=>row.id===packetId);
 if(!packet)return fail('Choose an available prison packet.');
 const requirement=prisonPacketRequirement(player,packetId);if(requirement)return fail(requirement);
 if(!Number.isSafeInteger(player.tokens)||player.tokens<packet.cost)return fail('You need '+packet.cost+' recreation tokens for this packet.');
 if(Number.isFinite(player.packetLastPurchaseAt)&&now-player.packetLastPurchaseAt<500)return fail('Wait a moment before buying another packet.');
 const contents=supplies(player),incoming=Object.values(packet.items).reduce((sum,value)=>sum+value,0),carried=Object.values(contents).reduce((sum,value)=>sum+value,0);
 if(carried+incoming>PRISON_SUPPLY_CAPACITY)return fail('Your supply pouch holds '+PRISON_SUPPLY_CAPACITY+' items. Use supplies before buying another packet.');
 if(Object.entries(packet.items).some(([id,quantity])=>contents[id]+quantity>PRISON_SUPPLY_ITEM_LIMIT))return fail('Carry at most '+PRISON_SUPPLY_ITEM_LIMIT+' of each supply. Use an item before restocking.');
 for(const [id,quantity]of Object.entries(packet.items))contents[id]+=quantity;
 player.tokens-=packet.cost;player.supplies=contents;player.packetLastPurchaseAt=now;
 return {ok:true,message:packet.name+' collected. '+packet.cost+' recreation tokens spent.',packetId:packet.id,items:{...packet.items}};
}
export function usePrisonItem(player,itemId,{now=Date.now()}={}){
 const problem=eligible(player,now);if(problem)return fail(problem);
 if(!owns(PRISON_SUPPLY_ITEMS,itemId))return fail('Choose an item from your supply pouch.');
 const supply=PRISON_SUPPLY_ITEMS[itemId],contents=supplies(player);
 if(contents[itemId]<1)return fail('You do not have a '+supply.name.toLowerCase()+'.');
 if(Number.isFinite(player.packetLastUsedAt)&&now-player.packetLastUsedAt<PRISON_SUPPLY_COOLDOWN_MS)return fail('Wait '+Math.ceil((PRISON_SUPPLY_COOLDOWN_MS-(now-player.packetLastUsedAt))/1000)+' seconds before using another supply.');
 if(!Object.keys(supply.effects).some(stat=>bounded(player[stat])<100))return fail('Your stats are already full. Save this item for later.');
 const effects={};for(const [stat,increase]of Object.entries(supply.effects)){const before=bounded(player[stat]),after=Math.min(100,before+increase);effects[stat]=after-before;}
 for(const stat of Object.keys(effects))player[stat]=bounded(player[stat])+effects[stat];
 contents[itemId]--;player.supplies=contents;player.packetLastUsedAt=now;
 const recovery=Object.entries(effects).filter(([,value])=>value>0).map(([stat,value])=>'+'+value+' '+stat).join(', ');
 return {ok:true,message:supply.name+' used: '+recovery+'.',itemId:supply.id,effects};
}
