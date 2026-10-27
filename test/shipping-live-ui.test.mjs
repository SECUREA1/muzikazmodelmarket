import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingRivalPresentation,shippingLeaguePresentation,shippingPortPresentation} from '../public/js/shipping-live-ui.js';

test('live company cards use confirmed ship poses, manifests and ETA without inventing activity',()=>{
 const record={id:'gulf-link',companyId:'gulf-link',companyName:'Gulf Link',captainName:'Captain Mina',shipId:'company-ship',color:'#83dbb4',phase:'sailing',etaSeconds:84,job:{originId:'jebel-ali',destinationId:'qeshm',cargoId:'island-provisions',units:4,loaded:[{side:'port'},{side:'starboard'}],quality:97,checkpointIndex:1,waypoints:[{x:10,z:20},{x:40,z:80}]},stats:{deliveries:2}};
 const view=shippingRivalPresentation(record,{'company-ship':{position:{x:20,y:0,z:30},rotation:{y:1.4}}});
 assert.equal(view.company,'Gulf Link');assert.equal(view.captain,'Captain Mina');assert.equal(view.phaseLabel,'Underway');assert.deepEqual(view.position,{x:20,y:0,z:30});assert.equal(view.yaw,1.4);assert.equal(view.loaded,2);assert.equal(view.units,4);assert.equal(view.etaMs,84000);assert.equal(view.deliveries,2);assert.equal(view.checkpointIndex,1);assert.deepEqual(view.waypoints,record.job.waypoints);
 assert.equal(shippingRivalPresentation({id:'waiting',phase:'waiting',etaSeconds:null}).etaMs,null);
 assert.equal(shippingRivalPresentation({id:'missing'}).position,null);
});

test('port units stay distinct from manifest counts and only berth waits add to its queue',()=>{
 const port={portId:'qeshm',imports:1,exports:2,arrivals:1,departures:2,receivedUnits:12,dispatchedUnits:20,unloaded:8,loaded:16};
 const berth=shippingRivalPresentation({id:'berth',phase:'sailing',waitingFor:'commercial berth',job:{destinationId:'qeshm'}}),givingWay=shippingRivalPresentation({id:'way',phase:'sailing',waitingFor:'player passage',job:{destinationId:'qeshm'}}),channel=shippingRivalPresentation({id:'channel',phase:'sailing',waitingFor:'clear channel',job:{destinationId:'qeshm'}});
 assert.equal(berth.phase,'sailing');assert.equal(berth.phaseLabel,'Waiting for berth');assert.equal(givingWay.phaseLabel,'Giving way to a player');assert.equal(channel.phaseLabel,'Holding for clear channel');
 assert.deepEqual(shippingPortPresentation(port,[berth,givingWay,channel]),{queueCount:1,receivedUnits:12,dispatchedUnits:20,arrivals:1,departures:2});
 assert.equal(shippingPortPresentation(port,[givingWay,channel]).queueCount,0);
 assert.equal(shippingPortPresentation({portId:'qeshm',imports:9,exports:7,unloaded:24,loaded:32}).receivedUnits,24);
 assert.equal(shippingPortPresentation({portId:'qeshm',imports:9,exports:7}).receivedUnits,0,'shipment counts cannot stand in for crate units');
});

test('league clocks use server time and preserve the exact eligible previous prize target',()=>{
 const competition={id:'current-round',name:'Strait Freight League',status:'open',startsAt:16000,endsAt:616000,leaderboard:[{actorId:'ai:gulf-link',name:'Gulf Link',ai:true,score:44,rank:1}]};
 let view=shippingLeaguePresentation(competition,{canJoin:true,canClaim:true,competitionId:'previous-round',prizeMzk:55},1000);
 assert.equal(view.status,'Starts in 0:15');assert.equal(view.joinId,'current-round');assert.equal(view.claimId,'previous-round');assert.equal(view.canJoin,true);assert.equal(view.canClaim,true);assert.equal(view.prizeMzk,55);assert.deepEqual(view.board,competition.leaderboard);
 competition.status='active';view=shippingLeaguePresentation(competition,{joined:true,rank:2,score:25},16000);assert.equal(view.status,'Ends in 10:00');assert.match(view.summary,/#2.*25 pts/);
 competition.status='finished';assert.equal(shippingLeaguePresentation(competition,{},700000).status,'Round complete');
 assert.equal(shippingLeaguePresentation().available,false);assert.equal(shippingLeaguePresentation(competition,{canJoin:'yes'}).canJoin,false);
});
