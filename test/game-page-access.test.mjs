import test from 'node:test';
import assert from 'node:assert/strict';
import {gameWorldDestination} from '../public/js/game-page-access.js';

test('map travel opens saved sports arenas in their native game with the saved room id',()=>{
 const customHockey={id:'winter-club',builderScene:{baseEnvironment:{id:'hockey-arena'},gameplay:{hockey:{difficulty:'elite'}}}};
 const rink=new URL(gameWorldDestination(customHockey,{base:'https://example.test/hockey.html',mode:'solo'}));
 assert.equal(rink.pathname,'/hockey.html');
 assert.equal(rink.searchParams.get('environment'),'winter-club');
 assert.equal(rink.searchParams.get('mode'),'solo');
 const arcade=new URL(gameWorldDestination({id:'neon-lounge',builderScene:{layout:'arcade-park'},arcade:{enabled:['billiards']}},{base:'https://example.test/hockey.html',mode:'spectator'}));
 assert.equal(arcade.pathname,'/arcade.html');
 assert.equal(arcade.searchParams.get('environment'),'neon-lounge');
 assert.equal(arcade.searchParams.get('attraction'),'billiards');
 assert.equal(arcade.searchParams.get('mode'),'spectator');
});

test('map travel enters the main world immediately and preserves meeting and solo destinations',()=>{
 const world=new URL(gameWorldDestination({id:'private-garden',multiplayer:false,meetingId:'meet & greet'},{base:'https://example.test/arcade.html',mode:'multiplayer'}));
 assert.equal(world.pathname,'/model-explorer.html');
 assert.equal(world.searchParams.get('environment'),'private-garden');
 assert.equal(world.searchParams.get('house'),'private-garden');
 assert.equal(world.searchParams.get('autoplay'),'1');
 assert.equal(world.searchParams.get('mode'),'solo');
 assert.equal(world.searchParams.get('meet'),'meet & greet');
 const legacy=new URL(gameWorldDestination({id:'basketball'},{base:'https://example.test/hockey.html'}));
 assert.equal(legacy.searchParams.get('environment'),'basketball-arena');
 assert.equal(legacy.searchParams.get('house'),'basketball-arena');
});
