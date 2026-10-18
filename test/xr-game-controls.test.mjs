import test from 'node:test';
import assert from 'node:assert/strict';
import {xrStick,xrButtonEdges} from '../public/js/xr-game-controls.js';
import {mapWheelSvg,wheelSectorPath} from '../public/js/map-wheel-svg.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {stealBasketball} from '../public/js/basketball-rules.js';
test('headset sticks handle thumbsticks, two-axis controllers, dead zones and diagonal normalization',()=>{
 assert.deepEqual(xrStick({gamepad:{axes:[0,0,.1,-.1]}}),{x:0,y:0});assert.deepEqual(xrStick(null),{x:0,y:0});
 assert.equal(xrStick({gamepad:{axes:[1,0]}}).x,1);assert.equal(xrStick({gamepad:{axes:[1,0,0,0]}}).x,1);const axes=xrStick({gamepad:{axes:[0,0,1,-1]}});assert.ok(Math.abs(Math.hypot(axes.x,axes.y)-1)<1e-10);assert.ok(axes.y<0);
});
test('headset buttons trigger once per press and reset after release',()=>{const source={gamepad:{buttons:[{pressed:true}]}};let edge=xrButtonEdges(source);assert.equal(edge.rising[0],true);assert.equal(xrButtonEdges(source,edge.pressed).rising[0],false);source.gamepad.buttons[0].pressed=false;edge=xrButtonEdges(source,edge.pressed);source.gamepad.buttons[0].pressed=true;assert.equal(xrButtonEdges(source,edge.pressed).rising[0],true);});
test('the native ball is a regulation sphere with three seams, not the generic builder fallback',()=>{const ball=createBuilderModel('basketball');assert.ok(ball.getObjectByName('REGULATION_BASKETBALL').geometry.isBufferGeometry);assert.equal(ball.getObjectByName('REGULATION_BASKETBALL').geometry.type,'SphereGeometry');assert.equal(ball.children.filter(child=>child.name==='BASKETBALL_SEAM').length,3);const size=new THREE.Box3().setFromObject(ball).getSize(new THREE.Vector3());assert.ok(size.x>.24&&size.x<.245);assert.ok(ball.children.every(child=>child.geometry.type!=='BoxGeometry'));});
test('stealing transfers an AI possession and rejects teammates, distant and hidden carriers',()=>{
 const player={actorId:'human',username:'You',basketballRole:'player',basketballTeam:'home',position:{x:0,y:0,z:0}},bot={actorId:'bot',basketballAI:true,basketballRole:'player',basketballTeam:'away',position:{x:1,y:0,z:0},heldId:'ball'};
 const ball={id:'ball',modelId:'basketball',basketballMatchBall:true,holderId:'bot',position:{x:1,y:1,z:0}},sim={basketball:{state:'live',ballId:'ball',possession:'away',settings:{shotClockSeconds:24}},players:{human:player,bot},actors:{ball}};
 assert.throws(()=>stealBasketball(sim,player,1000,{visible:()=>false}),/reach/);bot.position.x=5;assert.throws(()=>stealBasketball(sim,player,1000),/reach/);bot.position.x=1;bot.basketballTeam='home';assert.throws(()=>stealBasketball(sim,player,1000),/opponent/);bot.basketballTeam='away';
 stealBasketball(sim,player,1000);assert.equal(ball.holderId,'human');assert.equal(bot.heldId,null);assert.equal(player.heldId,'ball');assert.equal(sim.basketball.possession,'home');assert.equal(player.basketballSteals,1);
});
test('SVG map sectors form six distinct wedges and safely label untrusted map names',()=>{const worlds=Array.from({length:6},(_,i)=>({env:{id:'map'+i,name:i?'Map '+i:'<script>bad</script>'},count:i}));const svg=mapWheelSvg(worlds,'map0');assert.equal((svg.match(/role="button"/g)||[]).length,6);assert.match(svg,/&lt;script&gt;/);assert.doesNotMatch(svg,/<script>/);assert.equal(new Set(worlds.map((_,i)=>wheelSectorPath(i))).size,6);assert.match(svg,/aria-pressed="true"/);});
