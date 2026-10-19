import test from 'node:test';
import assert from 'node:assert/strict';
import {HockeyRooms} from '../hockey-rooms.mjs';

const host={accountId:'host',username:'Host'},guest={accountId:'guest',username:'Guest'},viewer={accountId:'viewer',username:'Viewer'};
const env={hockey:{difficulty:'easy',periodSeconds:90,icing:false}};
function lobby(){let now=0;const rooms=new HockeyRooms({now:()=>now});return {rooms,at:value=>{now=value;},command:(identity,command)=>rooms.command('rink',env,identity,command)};}

test('hockey joins reserve skaters and preserve the first player settings without starting the match',()=>{
 const {rooms,at,command}=lobby();
 const first=command(host,{action:'join',slot:'0-2',settings:{difficulty:'pro',periodSeconds:60,aiFill:false}});
 assert.equal(first.started,false);assert.equal(first.host,'account:host');assert.equal(first.state.host,first.host);
 const opening=structuredClone(first.state);
 const joined=command(guest,{action:'join',slot:'1-1',settings:{difficulty:'elite',periodSeconds:1200,mode:'tournament',aiFill:true}});
 assert.equal(joined.started,false);assert.deepEqual(joined.state.config,opening.config);
 assert.equal(joined.state.players.find(p=>p.human==='account:host').id,'0-2');
 assert.equal(joined.state.players.find(p=>p.human==='account:guest').id,'1-1');
 at(4000);rooms.tick();const waiting=command(guest,{action:'watch'});
 assert.equal(waiting.state.remaining,60);assert.equal(waiting.state.elapsed,0);assert.equal(waiting.state.delay,opening.delay);
 assert.deepEqual(waiting.state.puck,opening.puck);assert.deepEqual(waiting.state.score,[0,0]);
 assert.throws(()=>command(guest,{action:'join',slot:'0-2'}),{statusCode:409});
 const rejoined=command(host,{action:'join',settings:{difficulty:'elite'}});
 assert.equal(rejoined.state.players.filter(p=>p.human).length,2);assert.equal(rejoined.state.config.difficulty,'pro');
});

test('only the hockey host starts the lobby and pending lobby actions never leak into play',()=>{
 const {rooms,at,command}=lobby();command(host,{action:'join'});command(guest,{action:'join'});command(viewer,{action:'spectate'});
 assert.throws(()=>command(guest,{action:'start'}),{statusCode:403});
 assert.throws(()=>command(viewer,{action:'start'}),{statusCode:403});
 for(const action of ['line','goalie','switch','timeout','next','rematch'])assert.throws(()=>command(host,{action}),{statusCode:409});
 command(host,{action:'input',input:{x:1,shoot:true,check:true}});
 at(12000);const started=command(host,{action:'start'});
 assert.equal(started.started,true);assert.equal(started.state.elapsed,0);
 assert.ok(started.state.players.every(p=>!Object.keys(p.input).length));
 assert.throws(()=>command(host,{action:'start'}),{statusCode:409});
 at(12050);rooms.tick();const playing=command(guest,{action:'watch'});
 assert.ok(playing.state.elapsed>0&&playing.state.elapsed<.1,'the clock starts at the host command, without consuming lobby waiting time');
 assert.equal(playing.state.phase,'faceoff');assert.equal(playing.state.stats.hits[0],0);
});

test('players and spectators heartbeat before start, and stale hosts transfer to a waiting player',()=>{
 const {rooms,at,command}=lobby();command(host,{action:'join'});command(guest,{action:'join'});command(viewer,{action:'spectate'});
 at(14000);command(guest,{action:'watch'});command(viewer,{action:'watch'});
 at(16000);rooms.tick();const waiting=command(guest,{action:'watch'});
 assert.equal(waiting.started,false);assert.equal(waiting.host,'account:guest');
 assert.equal(waiting.state.players.filter(p=>p.human).length,1);assert.equal(waiting.state.spectators.length,1);
 assert.equal(command(guest,{action:'start'}).started,true);
 at(32000);rooms.tick();assert.equal(rooms.rooms.size,0);
});

test('spectator-first rooms accept the first player settings and transfer the host on spectate or leave',()=>{
 const {command}=lobby();command(viewer,{action:'spectate'});
 const joined=command(host,{action:'join',settings:{difficulty:'normal',periodSeconds:75}});
 assert.equal(joined.state.spectators.length,1);assert.equal(joined.state.config.difficulty,'normal');assert.equal(joined.state.config.icing,false);
 command(guest,{action:'join'});const watching=command(host,{action:'spectate'});
 assert.equal(watching.host,'account:guest');assert.equal(watching.state.spectators.length,2);
 const left=command(guest,{action:'leave'});assert.equal(left.role,'left');assert.equal(left.host,null);
 const returned=command(host,{action:'join',settings:{periodSeconds:60}});assert.equal(returned.host,'account:host');assert.equal(returned.state.spectators.length,1);
 assert.equal(command(host,{action:'join',settings:null}).state.players.filter(p=>p.human).length,1);
});

test('hockey rematches preserve players and tournament advancement keeps winner control',()=>{
 const {rooms,command}=lobby();command(host,{action:'join'});command(guest,{action:'join'});command(host,{action:'start'});
 const state=rooms.rooms.get('rink').state;state.phase='finished';state.score=[2,1];
 assert.throws(()=>command(guest,{action:'rematch'}),{statusCode:403});
 const rematch=command(host,{action:'rematch'});assert.equal(rematch.started,true);assert.deepEqual(rematch.state.score,[0,0]);assert.equal(rematch.state.players.filter(p=>p.human).length,2);
 const tournament=lobby();tournament.command(host,{action:'join',settings:{mode:'tournament'}});tournament.command(guest,{action:'join'});tournament.command(host,{action:'start'});
 const final=tournament.rooms.rooms.get('rink').state;final.phase='finished';final.score=[0,2];final.winner=1;final.tournament.finalists=['Visitors','Ice Wolves'];
 const next=tournament.command(host,{action:'next'});assert.equal(next.started,true);assert.equal(next.state.tournament.round,1);assert.equal(next.host,'account:guest');
 assert.equal(next.role,'spectator');assert.ok(next.state.spectators.some(p=>p.id==='account:host'&&p.eliminated));
});

test('quick hockey button releases survive until the next server tick without repeating later',()=>{
 const {rooms,at,command}=lobby();command(host,{action:'join'});command(host,{action:'start'});
 const state=rooms.rooms.get('rink').state,player=state.players.find(player=>player.human==='account:host');
 state.phase='playing';player.cooldown=0;player.x=0;player.z=0;state.puck.owner=player.id;
 command(host,{action:'input',input:{pass:true,x:1}});
 const released=command(host,{action:'input',input:{x:0}});
 assert.equal(released.state.players.find(player=>player.human==='account:host').input.pass,true);
 assert.equal(released.state.players.find(player=>player.human==='account:host').input.x,0);
 at(50);rooms.tick();assert.equal(player.animation,'pass');assert.equal(player.input.pass,false);assert.equal(state.puck.owner,null);
 player.cooldown=0;state.puck.owner=player.id;at(100);rooms.tick();
 assert.equal(state.puck.owner,player.id,'consumed tap must not make another pass on a later tick');
});

test('a lone hockey host can begin immediately with active AI filling all remaining positions',()=>{
 const {rooms,at,command}=lobby();const joined=command(host,{action:'join',slot:'1-3',settings:{aiFill:false}});
 assert.equal(joined.started,false);assert.equal(joined.state.config.aiFill,false);
 at(3000);rooms.tick();assert.equal(command(host,{action:'watch'}).state.elapsed,0,'the host can still leave the lobby open for friends');
 const started=command(host,{action:'start'});
 assert.equal(started.started,true);assert.equal(started.state.config.aiFill,true);
 assert.equal(started.state.players.filter(player=>player.human).length,1);
 assert.equal(started.state.players.find(player=>player.human===started.selfId).id,'1-3');
 assert.equal(started.state.players.filter(player=>!player.human).length,11);
 for(const team of [0,1])assert.equal(started.state.players.filter(player=>player.team===team&&player.onIce).length,6);
 const positions=new Map(started.state.players.map(player=>[player.id,{x:player.x,z:player.z}]));
 for(let now=3500;now<=7000;now+=500){at(now);rooms.tick();command(host,{action:'watch'});}
 const playing=command(host,{action:'watch'});
 assert.equal(playing.state.phase,'playing');assert.ok(playing.state.remaining<started.state.remaining);
 assert.ok(playing.state.players.some(player=>!player.human&&!player.goalie&&Math.hypot(player.x-positions.get(player.id).x,player.z-positions.get(player.id).z)>.2),'AI skaters take part after opening faceoff');
 const replacement=command(guest,{action:'join',slot:'0-2'});assert.equal(replacement.started,true);assert.equal(replacement.state.players.filter(player=>player.human).length,2,'a friend can still take over an AI skater after Begin');
});
