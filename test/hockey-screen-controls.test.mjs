import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/js/hockey-game.js',import.meta.url),'utf8');
const inputSource=source.slice(source.indexOf('function input(){'),source.indexOf('async function command('));
const holdSource=source.slice(source.indexOf('const controllerHold='),source.indexOf('mountRadToxController({inlineActions:'));
function controls(){
 const context=vm.createContext({keys:new Set(),pendingActions:new Set(),xrControls:null,document:{querySelector:()=>null},state:null,viewHeading:0,selfId:'local',$:()=>({value:'ice'}),aimFromPointer:true,aim:{x:0,z:0},controllerMove:{x:0,y:0},camera:{aspect:1},hockeyCameraPose:()=>({heading:0}),hockeySkateVector:()=>({x:0,z:0})});
 vm.runInContext(inputSource+holdSource+'globalThis.press=controllerHold;globalThis.readInput=input;',context);
 return context;
}
test('a short on-screen steal tap survives release until one input sample',()=>{
 const game=controls(),steal=game.press('f');steal(true);steal(false);
 assert.equal(game.readInput().poke,true);
 assert.equal(game.readInput().poke,false);
});
test('holding pass keeps it active until release while loft fires and lifts together',()=>{
 const game=controls(),pass=game.press('e');pass(true);
 assert.equal(game.readInput().pass,true);assert.equal(game.readInput().pass,true);
 pass(false);assert.equal(game.readInput().pass,false);
 const loft=game.press('shift',' ');loft(true);loft(false);
 const shot=game.readInput();assert.equal(shot.shoot,true);assert.equal(shot.lift,true);
 assert.equal(game.readInput().shoot,false);
});
test('opening a dialog discards queued gameplay taps',()=>{
 const game=controls(),check=game.press('q');check(true);check(false);
 game.document.querySelector=()=>({open:true});game.readInput();
 game.document.querySelector=()=>null;assert.equal(game.readInput().check,false);
});
