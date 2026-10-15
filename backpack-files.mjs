import {createHash} from 'node:crypto';
export function backpackPackage({item,world=null,objects={},entities=[]}){
 const content={item:structuredClone(item),world:world?{id:world.id,name:world.name,roomId:world.roomId||world.id,builderScene:world.builderScene||null,modelUrl:world.modelUrl||'',modelUrls:world.modelUrls||[],spawn:world.spawn||null,scale:world.scale||1,rotation:world.rotation||null,streets:world.streets||[],meetingPoints:world.meetingPoints||[]}:null,objects:structuredClone(objects),entities:structuredClone(entities)};
 delete content.item.listing;
 return {serverOrigin:'https://muzikazmodelmarket.onrender.com',assetFiles:item.modelUrl?[{url:new URL(item.modelUrl,'https://muzikazmodelmarket.onrender.com').href,format:/\.gl(?:b|tf)(?:[?#]|$)/i.test(item.modelUrl)?'model':'asset'}]:[],schema:'muzikaz-gameplay-package',version:1,exportedAt:new Date().toISOString(),itemId:item.id,content,sha256:createHash('sha256').update(JSON.stringify(content)).digest('hex'),reuse:'Import while signed in as the current owner. Trading changes server ownership; downloading does not duplicate ownership.'};
}
export function ownedPackageItem(input,items){
 input=input?.data?.schema==='muzikaz-gameplay-package'?input.data:input;
 if(input?.schema!=='muzikaz-gameplay-package'||input.version!==1||typeof input.itemId!=='string')throw Object.assign(new Error('Choose a MUZIKAZ gameplay package version 1.'),{statusCode:400});
 const item=items.find(item=>item.id===input.itemId);
 if(!item)throw Object.assign(new Error('This file references an item you do not currently own. Acquire it through the marketplace before reusing it.'),{statusCode:403});
 return item;
}
