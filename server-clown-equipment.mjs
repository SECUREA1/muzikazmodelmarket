import {FUNHOUSE_ITEMS} from './public/js/clown-funhouse-items.js';
import {ensureFunhouseProgress} from './server-clown-funhouse.mjs';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
export function equipOwnedFunhouseItem(player,asset,command={}){
 const item=FUNHOUSE_ITEMS[asset?.buildAssetId];
 if(!item||(!item.funhouseCostume&&!item.funhouseTool))fail('Choose a clown costume or water blaster from your Backpack.',422);
 if(command.enabled!==undefined&&typeof command.enabled!=='boolean')fail('Choose whether to equip this item.',422);
 const state=ensureFunhouseProgress(player),enabled=command.enabled!==false,slot=item.funhouseCostume||'water';
 state.equipment||={};
 if(item.funhouseCostume)state.costume[item.funhouseCostume]=enabled;else state.tool=enabled?'water':null;
 if(enabled)state.equipment[slot]={itemId:command.itemId||asset.id,sku:asset.sku||command.sku};else delete state.equipment[slot];
 state.message=item.name+(enabled?' equipped.':' removed.');
 return {message:state.message,funhouse:state};
}
export function sprayOwnedFunhouseWater(player,command,now){
 if(player.funhouse?.tool!=='water'||player.health<=0)fail('Equip your owned carnival water blaster first.');
 if(now<(player.funhouseWaterReadyAt||0))fail('The water blaster is refilling.',429);
 const direction=command.direction;
 if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)<.1)fail('Choose a valid water-blaster aim.',422);
 const length=Math.hypot(...direction);player.funhouseWaterReadyAt=now+300;
 return {message:'Splash! Carnival water is harmless.',funhouseEffect:{kind:'water-spray',at:now,origin:{x:player.position.x,y:player.position.y+1.25,z:player.position.z},direction:direction.map(value=>value/length)}};
}
