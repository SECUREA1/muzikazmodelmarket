import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameMarketplace} from '../public/js/in-game-market.js';

function marketHarness(request){
 const previous={window:globalThis.window,document:globalThis.document};
 const handlers=new Map(),nodes=new Map(),classes=new Set(),previews=[],fullscreenChildren=[];let created=false;
 const node=()=>({textContent:'',innerHTML:'',value:'',dataset:{},setAttribute(){},removeAttribute(){},querySelectorAll(){return [];}});
 const dialog={...node(),open:false,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},addEventListener(name,handler){handlers.set(name,handler);},showModal(){this.open=true;},close(){if(this.open){this.open=false;handlers.get('close')?.();}}};
 globalThis.window={MZKWallet:{walletId:()=> 'guest-test'},addEventListener(){},MUZIKAZ_API:{fetch:request}};
 const createElement=()=>{if(!created){created=true;return dialog;}const listeners=new Map(),close={};const preview={...node(),open:false,attributes:{},setAttribute(name,value){this.attributes[name]=value;},querySelector:()=>close,addEventListener:(name,handler)=>listeners.set(name,handler),showModal(){this.open=true;},close(){if(this.open){this.open=false;listeners.get('close')?.();}},remove(){this.removed=true;},listeners,closeButton:close};previews.push(preview);return preview;};
 globalThis.document={createElement,body:{append(){}},fullscreenElement:{append:element=>fullscreenChildren.push(element)},documentElement:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}},querySelector:selector=>selector==='[data-market-preview-style]'?{}:selector==='dialog[open]'?[dialog,...previews].find(element=>element.open)||null:null};
 return {dialog,nodes,handlers,classes,previews,fullscreenChildren,restore(){Object.assign(globalThis,previous);}};
}
const response=data=>({ok:true,json:async()=>({success:true,data})});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const bootstrap={owner_id:'account:range-member',account:{accountId:'range-member'},csrfToken:'test-csrf'};

test('market use-case checkboxes filter items without equipping an undefined Backpack item',async()=>{
 const asset={id:'owned-rifle',name:'Pulse Rifle',type:'game-upgrade',toolId:'pulse-rifle'};
 const harness=marketHarness(async path=>path==='/api/market/session'?response(bootstrap):path==='/api/wallet/state'?response({tokens:{MZK:100},items:[asset]}):assert.fail('Unexpected request '+path));
 const used=[];
 try{
  const market=createGameMarketplace({canUse:()=>true,onUse:async item=>{used.push(item);}});market.open('pack');await settle();
  assert.match(harness.nodes.get('[data-market-body]').innerHTML,/Use in game/);
  const checkbox={dataset:{marketUse:'build'},checked:true,matches:selector=>selector==='[data-market-use]',closest:selector=>selector==='[data-market-use]'?checkbox:null};
  harness.handlers.get('click')({target:checkbox});harness.handlers.get('change')({target:checkbox});await settle();
  assert.deepEqual(used,[]);assert.match(harness.nodes.get('[data-market-use-toggles]').innerHTML,/data-market-use="build"/);
  const button={dataset:{marketUse:'0'},closest:selector=>selector==='button[data-market-use]'?button:null};
  harness.handlers.get('click')({target:button});await settle();assert.deepEqual(used,[asset]);
 }finally{harness.restore();}
});

test('market announces item activation failures and ignores stale loads after closing and reopening',async()=>{
 let release,loads=0;
 const asset={id:'owned-rifle',name:'Pulse Rifle',type:'game-upgrade',toolId:'pulse-rifle'};
 const harness=marketHarness(async path=>{
  if(path==='/api/market/session')return response(bootstrap);
  if(path==='/api/wallet/state'){if(++loads===1)return new Promise(resolve=>{release=()=>resolve(response({tokens:{MZK:10},items:[{id:'stale',name:'Old item'}]}));});return response({tokens:{MZK:100},items:[asset]});}
  assert.fail('Unexpected request '+path);
 });
 try{
  const market=createGameMarketplace({canUse:()=>true,onUse:()=>{throw Error('This item cannot be equipped here.');}});market.open('pack');await settle();
  market.close();assert.equal(harness.classes.has('game-menu-open'),false);
  market.open('pack');await settle();release();await settle();
  assert.equal(market.dialog.open,true);assert.match(harness.nodes.get('[data-market-body]').innerHTML,/Pulse Rifle/);assert.doesNotMatch(harness.nodes.get('[data-market-body]').innerHTML,/Old item/);
  const button={dataset:{marketUse:'0'},closest:selector=>selector==='button[data-market-use]'?button:null};
  harness.handlers.get('click')({target:button});await settle();assert.equal(harness.nodes.get('[data-market-status]').textContent,'This item cannot be equipped here.');
 }finally{harness.restore();}
});

test('market item previews open accessible fullscreen popups and close with their parent market',async()=>{
 const asset={id:'owned-rifle',name:'Pulse Rifle',type:'game-upgrade',toolId:'pulse-rifle'};
 const harness=marketHarness(async path=>path==='/api/market/session'?response(bootstrap):path==='/api/wallet/state'?response({tokens:{MZK:100},items:[asset]}):assert.fail('Unexpected request '+path));
 let used=0;
 try{
  const market=createGameMarketplace({canUse:()=>true,onUse:async()=>{used++;}});market.open('pack');await settle();
  assert.match(harness.nodes.get('[data-market-body]').innerHTML,/<button type="button" data-market-preview="0" aria-label="Preview Pulse Rifle">Preview item<\/button>/);
  const button={dataset:{marketPreview:'0'},closest:selector=>selector==='[data-market-preview]'?button:null};
  harness.handlers.get('click')({target:button});
  const first=harness.previews[0];assert.equal(first.open,true);assert.equal(first.attributes['aria-label'],'Preview Pulse Rifle');assert.equal(harness.fullscreenChildren.at(-1),first);assert.equal(market.dialog.open,true);assert.equal(used,0);
  let stopped=false;first.listeners.get('keydown')({stopPropagation(){stopped=true;}});assert.equal(stopped,true);
  first.closeButton.onclick();assert.equal(first.removed,true);assert.equal(market.dialog.open,true);assert.equal(harness.classes.has('game-menu-open'),true);
  harness.handlers.get('click')({target:button});const second=harness.previews[1];assert.equal(second.open,true);
  market.close();assert.equal(second.open,false);assert.equal(second.removed,true);assert.equal(harness.classes.has('game-menu-open'),false);
 }finally{harness.restore();}
});
