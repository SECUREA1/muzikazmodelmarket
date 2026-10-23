import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelPage,gameplayOverlayOpen,mountBottomHud} from '../public/js/game-menu-controls.js';
import {readFile} from 'node:fs/promises';
test('six-sector tool pages expose every action once and clamp navigation bounds',()=>{
 for(const total of [0,1,6,9,12,17]){const indexes=[];for(let page=0;page<Math.max(1,Math.ceil(total/6));page++){const slice=wheelPage(total,page);for(let index=slice.start;index<slice.end;index++)indexes.push(index);}assert.deepEqual(indexes,Array.from({length:total},(_,index)=>index));assert.equal(wheelPage(total,-1).page,0);assert.equal(wheelPage(total,100).page,Math.max(0,Math.ceil(total/6)-1));}
});
test('visible popups block action controls while hidden panels do not',()=>{
 const node=(hidden=false,ancestor=false,rects=1)=>({hidden,closest:()=>ancestor?{}:null,getClientRects:()=>Array(rects).fill({})});
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[]}),false);
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[node(true),node(false,true),node(false,false,0)]}),false);
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[node(false)]}),true);
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[{...node(false),checkVisibility:()=>false}]}),false);
});
test('companion maps share game input while actual modal dialogs still block it',()=>{
 const map={localName:'dialog',open:true,hidden:false,dataset:{gameplayBlocking:'false'},matches:()=>false,closest:()=>null,getClientRects:()=>[{}]};
 const root={querySelectorAll:()=>[map]};
 assert.equal(gameplayOverlayOpen(root),false,'an open companion map does not pause gameplay');
 map.matches=selector=>selector===':modal';
 assert.equal(gameplayOverlayOpen(root),true,'a native modal must retain its input boundary');
 assert.equal(gameplayOverlayOpen(root,{except:map}),false,'a dialog may use its own controls');
 map.matches=()=>false;delete map.dataset.gameplayBlocking;
 assert.equal(gameplayOverlayOpen(root),true,'ordinary tools and purchase dialogs keep their input boundary');
});
test('radial menu retains original tool buttons and compact actions share touch and keyboard activation',async()=>{
 const module=await readFile(new URL('../public/js/game-menu-controls.js',import.meta.url),'utf8'),game=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 assert.ok(module.includes('wheel.append(button)'));assert.ok(!module.includes('cloneNode'));
 assert.ok(game.includes("bindGameActionButton(builderActionButton,activateNearbyAction)"));
 assert.ok(game.includes("if(nearbyAction.kind==='yacht-game'){yachtGames.open();return;}"));
 assert.ok(game.includes('gameplayOverlayOpen()||!yachtGames.available()'));
 assert.ok(game.includes('builderPrompt.hidden=true;builderActionButton.hidden=hidden'));
 const yacht=await readFile(new URL('../public/js/yacht-games-ui.js',import.meta.url),'utf8');
 assert.ok(!yacht.includes('yacht-game-entry'));assert.ok(yacht.includes('fullscreenPanel(panel'));

});

test('bottom HUD moves original controls into separate flowing rows without duplicate buttons',t=>{
 const previous=globalThis.document;t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const node=()=>({children:[],append(...items){for(const item of items){if(item.parent)item.parent.children=item.parent.children.filter(child=>child!==item);item.parent=this;this.children.push(item);}}});
 globalThis.document={querySelector:()=>({}),createElement:()=>node()};
 const stage=node(),menu=node(),actions=node(),prompt=node(),status=node(),connection=node(),balance=node();stage.append(menu,actions,prompt,status,connection,balance);
 const stack=mountBottomHud(stage,{menu,actions,prompt,status,connection,balance});
 assert.deepEqual(stage.children,[stack]);assert.equal(stack.children[0],actions);assert.deepEqual(stack.children[1].children,[menu,prompt]);assert.deepEqual(stack.children.slice(2),[status,connection,balance]);
});

test('overlay cache picks up newly added dialogs without scanning the page each frame',t=>{
 const previous=globalThis.MutationObserver;let observer,scans=0;
 globalThis.MutationObserver=class{constructor(callback){this.callback=callback;this.records=[];observer=this;}observe(){}takeRecords(){return this.records.splice(0);}};
 t.after(()=>{if(previous===undefined)delete globalThis.MutationObserver;else globalThis.MutationObserver=previous;});
 const root={nodeType:9,querySelectorAll(){scans++;return [];}};
 assert.equal(gameplayOverlayOpen(root),false);assert.equal(gameplayOverlayOpen(root),false);assert.equal(scans,1);
 const dialog={nodeType:1,localName:'dialog',open:false,hidden:false,isConnected:true,childElementCount:0,matches:()=>true,closest:()=>null,getClientRects:()=>[{}]};
 observer.records.push({addedNodes:[dialog]});assert.equal(gameplayOverlayOpen(root),false);
 dialog.open=true;assert.equal(gameplayOverlayOpen(root),true);
 dialog.hidden=true;assert.equal(gameplayOverlayOpen(root),false);
 dialog.hidden=false;dialog.isConnected=false;assert.equal(gameplayOverlayOpen(root),false);assert.equal(scans,1);
});
