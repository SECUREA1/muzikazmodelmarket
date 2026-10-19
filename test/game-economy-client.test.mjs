import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEconomy} from '../public/js/game-economy-client.js';
test('client gates locked upgrades, keeps basics free, and prevents duplicate use while paying',async()=>{
 let calls=0,shops=0,release;
 const client=new GameEconomy({inventory:{economyAction:async()=>{calls++;await new Promise(resolve=>release=resolve);return {balanceAfterMzk:98};}},announce(){},shop(){shops++;}});
 assert.equal((await client.use('material:studs')).ok,true);assert.equal(calls,0);
 assert.equal((await client.use('tool:scanner')).ok,false);assert.equal(shops,1);assert.equal(calls,0);
 client.items=[{sku:'tool:scanner',name:'Scanner',owned:true,useCostMzk:2}];
 const first=client.use('tool:scanner');assert.equal((await client.use('tool:scanner')).ok,false);assert.equal(calls,1);
 release();assert.equal((await first).balance,98);
 client.items=[];assert.equal((await client.use('tool:scanner')).ok,false,'selling an upgrade removes client access');
});

test('temporary range loans unlock tool buttons without granting ownership or changing paid use',async()=>{
 const previous=globalThis.document;let loanActive=true,capture,shops=0,payments=0;
 const buttons=['pulse-rifle','jetpack'].map(tool=>({dataset:{radTool:tool},locked:null,badge:{textContent:''},classList:{toggle(_name,value){buttons.find(button=>button.classList===this).locked=value;}},closest(){return null;},querySelector(){return this.badge;}}));
 globalThis.document={querySelector(){return null;},querySelectorAll(){return buttons;}};
 const client=new GameEconomy({inventory:{economyAction:async()=>{payments++;return {balanceAfterMzk:99};}},announce(){},shop(){shops++;},allowTemporaryUse:sku=>loanActive&&sku==='tool:pulse-rifle'});
 client.items=[{sku:'tool:pulse-rifle',name:'Pulse Rifle',owned:false,priceMzk:50,useCostMzk:1},{sku:'tool:jetpack',name:'Jetpack',owned:false,priceMzk:100}];
 client.install({addEventListener(name,handler,useCapture){assert.equal(name,'click');assert.equal(useCapture,true);capture=handler;}});
 const click=button=>{let prevented=false,stopped=false;capture({target:{closest:()=>button},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});return {prevented,stopped};};
 try{
  client.decorate();
  assert.equal(buttons[0].locked,false);assert.match(buttons[0].badge.textContent,/Range loan/);
  assert.equal(buttons[1].locked,true);assert.equal(client.owns('tool:pulse-rifle'),false);
  assert.deepEqual(click(buttons[0]),{prevented:false,stopped:false});assert.equal(shops,0);
  assert.deepEqual(click(buttons[1]),{prevented:true,stopped:true});assert.equal(shops,1);
  assert.equal((await client.use('tool:pulse-rifle')).ok,false,'temporary access does not buy an item or bypass paid-use ownership');assert.equal(payments,0);
  client.items[0].owned=true;client.decorate();assert.equal(buttons[0].badge.textContent,'Range use · free here');assert.equal(client.owns('tool:pulse-rifle'),true);assert.equal((await client.use('tool:pulse-rifle')).ok,true);assert.equal(payments,1,'owned items retain their normal per-use charge');
  loanActive=false;client.decorate();assert.equal(buttons[0].badge.textContent,'1 MZK / use');assert.deepEqual(click(buttons[0]),{prevented:false,stopped:false});
  client.items[0].owned=false;loanActive=false;client.decorate();assert.equal(buttons[0].locked,true);assert.match(buttons[0].badge.textContent,/50 MZK/);
  assert.deepEqual(click(buttons[0]),{prevented:true,stopped:true});
 }finally{globalThis.document=previous;}
});
