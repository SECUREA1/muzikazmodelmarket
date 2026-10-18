import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCADE_LIBRARY} from '../public/js/arcade-library.js';
import {newArcadeGame,projectArcadeDevices} from '../public/js/arcade-rules.js';
import {arcadeVisualModel,ARCADE_THEMES,practicePresentation} from '../public/js/arcade-screen.js';
import {paintArcadeCanvas} from '../public/js/arcade-screen-canvas.js';
const project=g=>projectArcadeDevices({m:{gamers:{p:{game:g}}}}).m.gamers.p.game;
test('all thirty library games have themed HTML models and paintable cabinet screens',()=>{
 assert.equal(Object.keys(ARCADE_THEMES).length,30);
 const context=new Proxy({measureText:s=>({width:s.length*8})},{get:(o,key)=>key in o?o[key]:(()=>{}),set:(o,key,v)=>(o[key]=v,true)});
 for(const entry of ARCADE_LIBRARY){const game=entry.kind==='arcade'?project(newArcadeGame(entry.game,n=>0)):null,gamer={credits:100,reels:[0,1,2],hand:[0,14,28,42,12],phase:'hold',question:['Choose',['A','B','C']]};const model=arcadeVisualModel({type:entry.id,game,gamer});assert.equal(model.theme.name,entry.name);assert.match(model.theme.color,/^#[0-9a-f]{6}$/i);assert.ok(model.text);assert.ok(model.columns>0);assert.ok(model.cells.length||model.buttons.length||model.input);assert.doesNotThrow(()=>paintArcadeCanvas(context,model));assert.ok(!model.buttons.some(b=>b.operation==='step'),'rendering never steps live rules');}
});
test('hidden cards and puzzle answers remain hidden in the new visual models',()=>{
 for(const type of ['hangman','scramble','codebreaker','battleship','blackjack','memory','mines','simon']){
  const game=newArcadeGame(type,n=>0),masked=project(game),model=arcadeVisualModel({game:masked});assert.equal(masked.code,undefined);assert.equal(masked.ships,undefined);
  if(type==='blackjack')assert.equal(model.cells.at(-1).text,'?');if(type==='memory')assert.ok(model.cells.every(c=>c.text==='?'));if(type==='hangman')assert.ok(model.cells.every(c=>c.text==='_'));if(type==='simon'){game.phase='repeat';assert.deepEqual(arcadeVisualModel({game:project(game)}).sequence,[]);}
 }
});
test('board controls preserve legal inputs, column mapping and puzzle restrictions',()=>{
 const connect=arcadeVisualModel({game:newArcadeGame('connect4',n=>0)});assert.deepEqual(connect.cells[9].action,{operation:'column',index:2});
 const sudoku=newArcadeGame('sudoku4',n=>0),model=arcadeVisualModel({game:sudoku});for(const i of sudoku.givens)assert.equal(model.cells[i].action,null);
 const simon=arcadeVisualModel({game:newArcadeGame('simon',n=>0)});assert.ok(simon.cells.every(c=>c.action===null));
 const dots=arcadeVisualModel({game:newArcadeGame('dotsboxes',n=>0)});assert.equal(dots.columns,5);assert.equal(new Set(dots.cells.map(c=>c.gridX+','+c.gridY)).size,12);
 const finished=arcadeVisualModel({game:{...newArcadeGame('tictactoe',n=>0),done:true}});assert.ok(finished.cells.every(c=>c.action===null));
});
test('practice machines expose touchable hold cards, reels and answer controls',()=>{
 const gamer={hand:[1,15,28,42,12],phase:'hold',credits:100};const model=arcadeVisualModel({type:'poker',gamer,holds:[2]});assert.equal(model.cells[2].selected,true);assert.deepEqual(model.cells[2].action,{operation:'hold',index:2});assert.equal(model.buttons[0].operation,'draw');assert.equal(arcadeVisualModel({type:'slots',gamer:{reels:[0,1,2]}}).cells.length,3);assert.deepEqual(practicePresentation('trivia',{question:['Question',['A','B']]}).buttons,[['A','answer',0],['B','answer',1]]);
});
