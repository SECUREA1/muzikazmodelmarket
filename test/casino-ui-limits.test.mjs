import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoStationLimits,casinoRoundMatchesStation,nearestCasinoStation} from '../public/js/casino-ui.js';
import {CASINO_STATIONS} from '../public/js/casino-config.js';

test('premium table limits are station-specific and do not inherit the old 100 MZK ceiling',()=>{
 const metadata={minBetMzk:1,maxBetMzk:100,betStepMzk:1};
 assert.deepEqual(casinoStationLimits(CASINO_STATIONS.find(item=>item.kind==='baccarat'),metadata),{tier:'high-limit',minBetMzk:100,maxBetMzk:2500,betStepMzk:1});
 assert.deepEqual(casinoStationLimits(CASINO_STATIONS.find(item=>item.kind==='threecard'),metadata),{tier:'premier',minBetMzk:10,maxBetMzk:500,betStepMzk:1});
 assert.equal(casinoStationLimits(CASINO_STATIONS.find(item=>item.kind==='blackjack'),metadata).maxBetMzk,100);
});

test('an unfinished hand uses its authoritative saved limits until it settles',()=>{
 const station={id:'table',tier:'regular',minBetMzk:1,maxBetMzk:100},round={phase:'playing',limits:{tier:'premier',minBetMzk:25,maxBetMzk:750,betStepMzk:5}};
 assert.deepEqual(casinoStationLimits(station,null,round),round.limits);
 assert.equal(casinoStationLimits(station,null,{...round,phase:'complete'}).maxBetMzk,100);
});

test('hands resume at their actual table while unspecified legacy hands stay usable',()=>{
 const first={id:'casino-blackjack-1'},second={id:'casino-blackjack-2'};
 assert.equal(casinoRoundMatchesStation({stationId:first.id},first),true);
 assert.equal(casinoRoundMatchesStation({stationId:first.id},second),false);
 assert.equal(casinoRoundMatchesStation({id:'legacy'},second),true);
 assert.equal(casinoRoundMatchesStation(undefined,second),false);
 for(const kind of ['baccarat','threecard']){const station=CASINO_STATIONS.find(item=>item.kind===kind);assert.equal(nearestCasinoStation('muzikaz-casino',station.position).id,station.id);}
});
