import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelPage,gameplayOverlayOpen} from '../public/js/game-menu-controls.js';
import {readFile} from 'node:fs/promises';
test('six-sector tool pages expose every action once and clamp navigation bounds',()=>{
 for(const total of [0,1,6,9,12,17]){const indexes=[];for(let page=0;page<Math.max(1,Math.ceil(total/6));page++){const slice=wheelPage(total,page);for(let index=slice.start;index<slice.end;index++)indexes.push(index);}assert.deepEqual(indexes,Array.from({length:total},(_,index)=>index));assert.equal(wheelPage(total,-1).page,0);assert.equal(wheelPage(total,100).page,Math.max(0,Math.ceil(total/6)-1));}
});
test('visible popups block action controls while hidden panels do not',()=>{
 const node=(hidden=false,ancestor=false,rects=1)=>({hidden,closest:()=>ancestor?{}:null,getClientRects:()=>Array(rects).fill({})});
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[]}),false);
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[node(true),node(false,true),node(false,false,0)]}),false);
 assert.equal(gameplayOverlayOpen({querySelectorAll:()=>[node(false)]}),true);
});
test('radial menu retains original tool buttons and compact actions share touch and keyboard activation',async()=>{
 const module=await readFile(new URL('../public/js/game-menu-controls.js',import.meta.url),'utf8'),game=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 assert.ok(module.includes('wheel.append(button)'));assert.ok(!module.includes('cloneNode'));
 assert.ok(game.includes("builderActionButton.addEventListener('click',activateNearbyAction)"));
 assert.ok(game.includes("e.target.closest('button,a,summary,[role=button]')"));
 assert.ok(game.includes('gameplayOverlayOpen()||now<actionMessageUntil'));
 assert.ok(game.includes('builderPrompt.hidden=true;builderActionButton.hidden=hidden'));
});
