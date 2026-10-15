import test from 'node:test';
import assert from 'node:assert/strict';
import {backpackPackage,ownedPackageItem} from '../backpack-files.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('portable files retain item configuration and map geometry without exporting live players',()=>{
 const item={id:'custom-one',name:'Painted sign',configuration:{color:'#ff0000',scale:2},listing:{active:true},modelUrl:'/public/models/sign.glb'};
 const file=backpackPackage({item,world:{id:'world',name:'World',builderScene:{objects:[{id:'wall'}]},players:{private:'excluded'}},objects:{wall:{rotation:[0,1,0],scale:[2,2,2],paint:[123]}}});
 assert.equal(file.schema,'muzikaz-gameplay-package');assert.equal(file.content.item.configuration.scale,2);assert.equal(file.content.objects.wall.paint[0],123);assert.equal(file.content.world.players,undefined);assert.equal(file.content.item.listing,undefined);assert.match(file.assetFiles[0].url,/^https:/);
 assert.equal(ownedPackageItem({success:true,data:file},[item]),item);
 file.content.item.configuration.scale=999;assert.equal(ownedPackageItem(file,[item]).configuration.scale,2,'imports resolve canonical server configuration');
 assert.throws(()=>ownedPackageItem({...file,itemId:'forged'},[item]),/do not currently own/);
});
test('a downloaded file follows traded ownership and cannot recreate a sold item',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'backpack-file-trade-'));t.after(()=>rm(dir,{recursive:true,force:true}));const db=new UserJsonDatabase(join(dir,'users.json'));
 await db.put('seller',{items:[{id:'shared-file',name:'Design',type:'custom-item'}],tokens:{MZK:100}});await db.put('buyer',{items:[],tokens:{MZK:100}});
 const file=backpackPackage({item:(await db.get('seller')).items[0]});await db.listItem('seller','shared-file',10);await db.trade({buyerId:'buyer',sellerId:'seller',itemId:'shared-file',requestId:'trade-file',expectedPriceMzk:10});
 const seller=await db.get('seller'),buyer=await db.get('buyer');assert.throws(()=>ownedPackageItem(file,seller.items),/do not currently own/);assert.equal(ownedPackageItem(file,buyer.items).id,'shared-file');
});
