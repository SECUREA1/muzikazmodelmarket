import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameLoadingDisplay} from '../public/js/game-loading-display.js';
function fixture(t){
 t.mock.timers.enable({apis:['setTimeout']});
 const nodes=new Map(),root={hidden:true,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{style:{},textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;}});return nodes.get(selector);}};
 const classes=new Set(),stage={attributes:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},setAttribute(key,value){this.attributes[key]=value;}};
 return {root,stage,nodes,loader:createGameLoadingDisplay({root,stage})};
}
test('finishing an old world cannot dismiss a new map loader',t=>{
 const {root,stage,loader}=fixture(t);loader.show(1,'Main floor');loader.finish();t.mock.timers.tick(100);loader.show(2,'Harbour');t.mock.timers.tick(1000);
 assert.equal(root.hidden,false);assert.equal(stage.attributes['aria-busy'],'true');assert.equal(root.querySelector('[data-level-loader-message]').textContent,'Harbour');loader.finish();t.mock.timers.tick(260);assert.equal(root.hidden,true);assert.equal(stage.attributes['aria-busy'],'false');
});
test('failed loads retain their error and cannot hide a later successful map load',t=>{
 const {root,loader}=fixture(t);loader.show(1,'Loading');loader.update(62);loader.fail('Connection lost');assert.equal(root.querySelector('[data-level-loader-message]').textContent,'Connection lost');assert.equal(root.querySelector('[data-level-loader-percent]').textContent,'62%');loader.show(2,'Retrying');t.mock.timers.tick(1000);assert.equal(root.hidden,false);
});
