import {BASKETBALL_BUILDER_ITEMS} from './basketball-stadium.js';
import {HOCKEY_ITEMS} from './hockey-models.js';

// The editor, market, in-game picker and Backpack use the same native asset IDs.
// Adding an authored stadium component here therefore makes it available through
// every Builder entry point without a separate copied list of part names.
const basketballGear=[
 {id:'basketball',name:'Basketball',type:'interactive',category:'basketball',size:58,image:'public/images/backpack/basketball.svg',buildAssetId:'basketball',behavior:'pickup',color:'#ec822f',scale:'24 cm regulation ball',dimensions:[.24,.24,.24],procedural:true,basic:true,priceMzk:0,description:'Regulation basketball. Catch, pass and shoot on your custom court.',function_data:{prompt:'Basketball · E catch · T pass · R shoot',damage:0}},
 {id:'basketball-hoop',name:'Basketball Hoop & Net',type:'interior',category:'basketball',size:82,image:'public/images/backpack/basketball-hoop.svg',buildAssetId:'basketball-hoop',behavior:'decor',color:'#20c8f1',scale:'3.05 m regulation rim',dimensions:[1.873,3.991,2.777],procedural:true,basic:true,priceMzk:0,description:'Regulation rim, woven net, glass backboard and padded support.'},
 ...['home','away'].map(team=>({id:`basketball-jersey-${team}`,name:`${team==='home'?'Home':'Away'} Basketball Jersey`,type:'wearable',category:'basketball',size:66,image:`public/images/backpack/basketball-jersey-${team}.svg`,buildAssetId:`basketball-jersey-${team}`,basketballTeam:team,attachment:{socket:'torso',fit:'avatar',slot:'basketball-jersey'},behavior:'interact',color:team==='home'?'#087f8c':'#b73550',dimensions:[.72,.73,.45],procedural:true,basic:true,priceMzk:0,description:`Equip the ${team==='home'?'Home':'Away'} jersey to join that basketball team.`,function_data:{prompt:`Equip ${team==='home'?'Home':'Away'} basketball jersey`,damage:0}}))
];

export const SPORTS_BUILDER_ITEMS=Object.freeze([...basketballGear,...BASKETBALL_BUILDER_ITEMS,...HOCKEY_ITEMS]);
export const sportsBuilderItem=id=>SPORTS_BUILDER_ITEMS.find(item=>item.id===id||item.buildAssetId===id);

export function sportsBackpackAsset(item){
 return {id:item.id,name:item.name,owner:'MUZIKAZ',type:item.type==='wearable'?'wearables':'props',buildAssetId:item.buildAssetId||item.id,builderCategory:item.category,format:'procedural-3d',behavior:item.behavior||'decor',basic:true,priceMzk:0,useCostMzk:0,visibility:'public',thumbnailUrl:`/${item.image.replace(/^\//,'')}`,description:item.description||item.name,dimensions:item.dimensions,...(item.basketballTeam?{basketballTeam:item.basketballTeam,attachment:item.attachment}:{}),...(item.function_data?{function_data:item.function_data}:{})};
}

export const BUILDER_TRAY_KEY='muzikaz.builder.buildTray';
export function readBuilderTray(storage=globalThis.localStorage){
 try{const value=JSON.parse(storage.getItem(BUILDER_TRAY_KEY)||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'):[];}catch{return [];}
}
export function toggleBuilderTrayItem(item,storage=globalThis.localStorage){
 const tray=readBuilderTray(storage),index=tray.findIndex(entry=>entry.id===item.id),added=index<0;
 if(added)tray.push({id:item.id,name:item.name,type:item.category||item.type,thumbnailUrl:item.image||item.thumbnailUrl||'',addedAt:new Date().toISOString()});else tray.splice(index,1);
 storage.setItem(BUILDER_TRAY_KEY,JSON.stringify(tray));
 return {tray,added};
}
