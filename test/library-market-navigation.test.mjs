import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('toolkit shopping opens purchasable items and keeps member sales separate from Backpack',async()=>{
 const source=(await readFile(new URL('../public/js/library-market.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
 const opened=[];let click,created=0,closed=0;
 const marketplace={dialog:{querySelector:()=>({}),setAttribute(){}},open:(...args)=>opened.push(args)};
 vm.runInNewContext(source,{document:{addEventListener:(_name,handler)=>click=handler},createGameMarketplace:()=>{created++;return marketplace;}});
 function choose(dataset,inDialog=false){const button={dataset,closest:()=>inDialog?{close:()=>closed++}:null};click({target:{closest:()=>button}});}
 choose({});assert.equal(opened[0][0],'upgrades');assert.equal(opened[0][1].search,'');
 choose({marketTab:'browse',marketSearch:'Neon Energy Blade'},true);
 assert.equal(opened[1][0],'browse');assert.equal(opened[1][1].search,'Neon Energy Blade');assert.equal(closed,1,'preview closes before opening checkout');
 choose({marketTab:'pack'});assert.equal(opened[2][0],'pack');assert.equal(created,1,'reuse the live marketplace and purchase client');
});
