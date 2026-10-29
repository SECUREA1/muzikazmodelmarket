/** The reusable native model and its harmless local interaction contract. */
export const FOREST_SNAKE_ITEMS=Object.freeze({
 'timberland-snake':Object.freeze({name:'Mossback · Wandering Forest Snake',description:'A thirteen-metre emerald forest python with a rippling body, golden eyes and a fondness for strange observations. Roams Timberland and speaks when passing nearby.',dimensions:Object.freeze([2.7,1.15,13.2]),priceMzk:240})
});
export const FOREST_SNAKE_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(FOREST_SNAKE_ITEMS).map(([id,item])=>[id,[item.name,item.description,item.dimensions]])));
export function forestSnakeNativeItem(id='timberland-snake'){
 const item=FOREST_SNAKE_ITEMS[id];if(!item)return null;
 const text='The mushrooms keep moving the moon. I have asked them politely to stop.';
 const function_data={behavior:'interact',action:'none',forestSnake:true,destructible:false,damage:0,interactionKey:'e',interactionDistance:8,prompt:'Talk to Mossback · E / Use'};
 return {id,buildAssetId:id,name:item.name,description:item.description,dimensions:item.dimensions,type:'creature',assetType:'creature',category:'creatures',priceMzk:item.priceMzk,behavior:'interact',action:'none',animation:'slither',procedural:true,assetKind:'premade',size:100,color:'#4e7350',image:'/public/images/forest-harvest/mossback.svg',thumbnailUrl:'/public/images/forest-harvest/mossback.svg',function_data,dialogueSettings:{text}};
}
