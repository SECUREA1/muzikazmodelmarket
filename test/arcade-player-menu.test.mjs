import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCADE_LIBRARY} from '../public/js/arcade-library.js';
import {ARCADE_GUIDES,playerLibrary} from '../public/js/arcade-player-menu.js';
test('every game has concrete play instructions and is reachable in the player library',()=>{assert.equal(Object.keys(ARCADE_GUIDES).length,30);for(const game of ARCADE_LIBRARY){assert.ok(ARCADE_GUIDES[game.id].length>60,game.id);assert.ok(playerLibrary(game.name).some(item=>item.id===game.id));}assert.equal(playerLibrary().length,30);});
test('play style filters describe supported modes and search combines terms',()=>{assert.deepEqual(playerLibrary('','versus').map(g=>g.id).sort(),['connect4','pong','tictactoe']);assert.equal(playerLibrary('','coop').length,14);assert.ok(playerLibrary('dice','cards').some(g=>g.id==='dicepoker'));assert.equal(playerLibrary('no such game').length,0);assert.ok(playerLibrary('hidden word','puzzles').some(g=>g.id==='hangman'));assert.ok(!playerLibrary('','action').some(g=>g.id==='poker'));});
