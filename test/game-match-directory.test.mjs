import test from 'node:test';
import assert from 'node:assert/strict';
import {listGameMatches} from '../game-match-directory.mjs';
import {HockeyRooms} from '../hockey-rooms.mjs';
import {ArcadeRooms} from '../arcade-rooms.mjs';
import {RangeRooms} from '../range-rooms.mjs';

const now=100000;
const hockey={id:'rink',name:'Ice arena',game:'hockey',visibility:'public',multiplayer:true,playable:true,playUrl:'hockey.html?environment=wrong&mode=solo&view=broadcast'};
const basketball={id:'court',name:'Basketball court',basketball:true,visibility:'public',multiplayer:true,playable:true,roomId:'court-room',playUrl:'model-explorer.html?environment=court&house=court-room&autoplay=1'};
const arcade={id:'park',name:'Arcade park',game:'arcade',visibility:'public',multiplayer:true,playable:true,arcade:{enabled:['basketball','billiards'],basketballMode:'full',teamSize:3}};
const range={id:'qualification',name:'Firing range',game:'firing-range',layout:'firing-range',visibility:'public',multiplayer:true,playable:true};
const alice={accountId:'alice',username:'Alice'},bob={accountId:'bob',username:'Bob'},viewer={accountId:'viewer',username:'Viewer'};
const url=value=>new URL(value,'https://muzikaz.com/');

test('public playable game destinations offer correct runtimes, enabled games and human slots',()=>{
 const matches=listGameMatches({environments:[hockey,basketball,arcade],now});
 assert.equal(matches.length,4);
 const rink=matches.find(match=>match.game==='hockey');
 assert.equal(rink.capacity,10);assert.equal(rink.players,0);assert.equal(rink.openSlots,10);assert.equal(rink.status,'available');assert.equal(rink.canJoin,true);
 assert.equal(url(rink.joinUrl).pathname,'/hockey.html');assert.equal(url(rink.joinUrl).searchParams.get('view'),'broadcast');
 for(const match of matches){
  for(const [key,mode] of [['joinUrl','multiplayer'],['spectateUrl','spectator']]){
   const target=url(match[key]);
   assert.equal(target.searchParams.get('environment'),match.mapId);assert.equal(target.searchParams.get('mode'),mode);assert.equal(target.searchParams.get('matchmaking'),'1');
  }
 }
 const court=matches.find(match=>match.game==='basketball');
 assert.equal(court.capacity,10);assert.equal(url(court.joinUrl).pathname,'/model-explorer.html');assert.equal(url(court.joinUrl).searchParams.get('house'),'court-room');
 const games=matches.filter(match=>match.game==='arcade');
 assert.deepEqual(games.map(match=>match.gameName).sort(),['Basketball','Billiards']);
 assert.equal(games.find(match=>match.gameIndex===2).capacity,6);
 assert.equal(games.find(match=>match.gameIndex===4).capacity,2);
 for(const match of games){assert.equal(url(match.joinUrl).pathname,'/arcade.html');assert.equal(url(match.joinUrl).searchParams.get('attraction'),match.attractionId);}
});

test('hockey waiting lobbies show fresh human slots and host without changing authoritative state',()=>{
 const hockeyRooms=new HockeyRooms({now:()=>now});
 hockeyRooms.command('rink',hockey,alice,{action:'join',slot:'0-0'});
 hockeyRooms.command('rink',hockey,bob,{action:'join',slot:'1-0'});
 const room=hockeyRooms.rooms.get('rink');room.started=false;room.seen.set('account:bob',now-16000);
 const before=structuredClone(room),matches=listGameMatches({environments:[arcade,hockey],hockeyRooms,now});
 assert.equal(matches[0].id,'rink:hockey');
 const match=matches[0];assert.equal(match.status,'waiting');assert.equal(match.players,1);assert.equal(match.capacity,10);assert.equal(match.openSlots,9);assert.equal(match.hostName,'Alice');
 assert.equal(match.slots.find(slot=>slot.id==='0-0').name,'Alice');assert.equal(match.slots.find(slot=>slot.id==='1-0').occupied,false);
 assert.equal(match.slots.some(slot=>slot.name==='Bob'),false);assert.deepEqual(room,before);
 room.started=true;assert.equal(listGameMatches({environments:[hockey],hockeyRooms,now})[0].status,'playing');
 room.state.phase='finished';assert.equal(listGameMatches({environments:[hockey],hockeyRooms,now})[0].status,'finished');
});

test('arcade directory lists only its occupied attraction, counts humans and waits for the host',()=>{
 const arcadeRooms=new ArcadeRooms({now:()=>now});
 arcadeRooms.command('park',arcade,alice,{action:'join',game:2,slot:0});
 arcadeRooms.command('park',arcade,bob,{action:'join',game:2,slot:3});
 arcadeRooms.command('park',arcade,viewer,{action:'spectate',game:2});
 let matches=listGameMatches({environments:[arcade],arcadeRooms,now});
 assert.equal(matches.length,1);let match=matches[0];
 assert.equal(match.gameIndex,2);assert.equal(match.gameName,'Basketball');assert.equal(match.status,'waiting');assert.equal(match.players,2);assert.equal(match.openSlots,4);assert.equal(match.capacity,6);assert.equal(match.hostName,'Alice');
 assert.equal(match.slots[3].label,'Away · player 1');assert.equal(match.slots[3].name,'Bob');
 arcadeRooms.command('park',arcade,alice,{action:'start'});
 matches=listGameMatches({environments:[arcade],arcadeRooms,now});match=matches[0];assert.equal(match.status,'playing');assert.equal(match.canJoin,true);
 arcadeRooms.rooms.get('park').members.get('account:bob').at=now-15001;
 assert.equal(listGameMatches({environments:[arcade],arcadeRooms,now})[0].players,1);
 const ended=listGameMatches({environments:[arcade],arcadeRooms,now:now+16000});
 assert.equal(ended.length,2);assert.ok(ended.every(match=>match.status==='available'&&match.players===0));
});

test('native basketball respects reserved human slots and disallows regular late entry',()=>{
 const sharedRooms={'court-room':{simulation:{basketball:{state:'ready',settings:{teamSize:3,homeHumans:2,awayHumans:1}},players:{
  'account:alice':{username:'Alice',basketballTeam:'home',basketballRole:'player',health:100,lastSeen:now},
  'account:bob':{username:'Bob',basketballTeam:'away',basketballRole:'player',health:100,lastSeen:now-16000},
  'basketball-ai-home-0':{username:'Home AI',basketballTeam:'home',basketballAI:true,health:100,lastSeen:now},
  'account:viewer':{username:'Viewer',basketballRole:'spectator',health:100,lastSeen:now},
  'account:moved':{username:'Moved',basketballTeam:'home',health:100,lastSeen:now,replacedByRoom:'other'},
 }}}};
 const before=structuredClone(sharedRooms);
 let match=listGameMatches({environments:[basketball],sharedRooms,now})[0];
 assert.equal(match.status,'waiting');assert.equal(match.players,1);assert.equal(match.capacity,3);assert.equal(match.openSlots,2);assert.equal(match.hostName,'Alice');assert.equal(match.canJoin,true);assert.equal(match.canSpectate,true);
 assert.deepEqual(sharedRooms,before);
 sharedRooms['court-room'].simulation.basketball.state='live';
 match=listGameMatches({environments:[basketball],sharedRooms,now})[0];assert.equal(match.status,'playing');assert.equal(match.canJoin,false);assert.equal(match.canSpectate,true);
 match=listGameMatches({environments:[basketball],sharedRooms,now:now+16000})[0];assert.equal(match.players,0);assert.equal(match.status,'playing');assert.equal(match.canJoin,false,'a persisted live game still makes new arrivals watch');
 sharedRooms['court-room'].simulation.basketball.state='finished';
 match=listGameMatches({environments:[basketball],sharedRooms,now})[0];assert.equal(match.status,'finished');assert.equal(match.canJoin,true);
});

test('range directory lists available lanes, waiting shooters and host without advancing the course',()=>{
 const rangeRooms=new RangeRooms({now:()=>now});
 let match=listGameMatches({environments:[range],rangeRooms,now})[0];
 assert.equal(match.game,'firing-range');assert.equal(match.status,'available');assert.equal(match.players,0);assert.equal(match.capacity,5);
 assert.equal(url(match.joinUrl).pathname,'/model-explorer.html');assert.equal(url(match.joinUrl).searchParams.get('environment'),range.id);assert.equal(url(match.joinUrl).searchParams.get('matchmaking'),'1');
 rangeRooms.command(range.id,range,alice,{action:'join'});rangeRooms.command(range.id,range,bob,{action:'join'});
 const room=rangeRooms.rooms.get(range.id),before=structuredClone(room);
 match=listGameMatches({environments:[range],rangeRooms,now})[0];
 assert.equal(match.status,'waiting');assert.equal(match.players,2);assert.equal(match.openSlots,3);assert.equal(match.hostName,'Alice');assert.equal(match.canJoin,true);assert.deepEqual(room,before);
 rangeRooms.command(range.id,range,alice,{action:'start'});
 match=listGameMatches({environments:[range],rangeRooms,now})[0];assert.equal(match.status,'playing');assert.equal(match.canJoin,false);assert.equal(match.canSpectate,false);
 room.members.get('account:bob').at=now-16000;
 match=listGameMatches({environments:[range],rangeRooms,now})[0];assert.equal(match.players,1);assert.equal(match.slots.some(slot=>slot.name==='Bob'),false);
 match=listGameMatches({environments:[range],rangeRooms,now:now+16000})[0];assert.equal(match.status,'available');assert.equal(match.players,0);
});

test('full lobbies cannot be joined and waiting lobbies with room sort first',()=>{
 const arcadeRooms=new ArcadeRooms({now:()=>now}),small={...arcade,id:'small',arcade:{enabled:['billiards']}};
 arcadeRooms.command('small',small,alice,{action:'join',game:4,slot:0});arcadeRooms.command('small',small,bob,{action:'join',game:4,slot:1});
 const hockeyRooms=new HockeyRooms({now:()=>now});hockeyRooms.command('rink',hockey,alice,{action:'join'});hockeyRooms.rooms.get('rink').started=false;
 const matches=listGameMatches({environments:[small,basketball,hockey],hockeyRooms,arcadeRooms,now});
 assert.equal(matches[0].mapId,'rink');
 const full=matches.find(match=>match.mapId==='small');assert.equal(full.players,2);assert.equal(full.capacity,2);assert.equal(full.openSlots,0);assert.equal(full.canJoin,false);assert.equal(full.canSpectate,true);
});

test('spectator availability excludes full spectator lists and ignores expired members',()=>{
 const hockeyRooms=new HockeyRooms({now:()=>now});hockeyRooms.command('rink',hockey,alice,{action:'join'});
 for(let index=0;index<64;index++)hockeyRooms.command('rink',hockey,{accountId:'viewer-'+index,username:'Viewer'},{action:'spectate'});
 assert.equal(listGameMatches({environments:[hockey],hockeyRooms,now})[0].canSpectate,false);
 hockeyRooms.rooms.get('rink').seen.set('account:viewer-0',now-16000);
 assert.equal(listGameMatches({environments:[hockey],hockeyRooms,now})[0].canSpectate,true);
});

test('directory excludes private, unavailable and duplicate maps and never returns external launches',()=>{
 const environments=[
  {...hockey,visibility:'private'}, {...arcade,visibility:'unlisted'}, {...basketball,playable:false},
  {...hockey,id:'solo',multiplayer:false}, {...hockey,id:'bad\u0000id'}, null,
  {...hockey,id:'external',name:'Safe\u0000 name',playUrl:'https://attacker.invalid/hockey.html?environment=elsewhere'},
  {...hockey,id:'script',playUrl:'javascript:alert(1)'},
  {...hockey,id:'wrong-runtime',playUrl:'model-explorer.html?environment=elsewhere'},
  {...hockey,id:'external'},
 ];
 const matches=listGameMatches({environments,now});assert.equal(matches.length,3);
 assert.equal(matches.find(match=>match.mapId==='external').mapName,'Safe name');
 for(const match of matches){assert.equal(url(match.joinUrl).origin,'https://muzikaz.com');assert.equal(url(match.joinUrl).pathname,'/hockey.html');assert.equal(url(match.joinUrl).searchParams.get('environment'),match.mapId);}
 assert.deepEqual(listGameMatches(),[]);
});
