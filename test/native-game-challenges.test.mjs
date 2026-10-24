import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeChallengeTracker,HOCKEY_CHALLENGES,arcadeChallenges} from '../public/js/native-game-challenges.js';
import {createHockey,joinHockey,stepHockey} from '../public/js/hockey-rules.js';
import {arcadeSettings,createArcadeSession,enterArcadeAttraction,stepArcadeRide} from '../public/js/arcade-rules.js';
import {createArcadeMatch} from '../public/js/arcade-match.js';

const snapshot=(metrics={},extra={})=>({sessionId:'map:1',playing:true,spectating:false,metrics,...extra});
test('hockey challenges only count new accepted progress, complete once and can be played again',()=>{
 const tracker=createNativeChallengeTracker(HOCKEY_CHALLENGES);
 assert.equal(tracker.start('team-goal'),false);
 tracker.update(snapshot({teamGoals:5}));tracker.start('team-goal');
 tracker.update(snapshot({teamGoals:5}));assert.equal(tracker.active.progress,0);
 tracker.update(snapshot({teamGoals:6}));assert.equal(tracker.active.status,'completed');
 const revision=tracker.revision;tracker.update(snapshot({teamGoals:10}));assert.equal(tracker.revision,revision);
 tracker.start('team-goal');tracker.update(snapshot({teamGoals:10}));assert.equal(tracker.active.progress,0);
 tracker.update(snapshot({teamGoals:11}));assert.equal(tracker.active.status,'completed');
});
test('spectators, leaving, team changes, restart and explicit cancellation cannot complete an old challenge',()=>{
 for(const change of [{spectating:true},{playing:false},{sessionId:'map:2'}]){
  const tracker=createNativeChallengeTracker(HOCKEY_CHALLENGES);tracker.update(snapshot({teamGoals:0}));tracker.start('team-goal');tracker.update(snapshot({teamGoals:99},change));assert.equal(tracker.active.status,'cancelled');
 }
 const tracker=createNativeChallengeTracker(HOCKEY_CHALLENGES);tracker.update(snapshot({}, {spectating:true}));assert.equal(tracker.start('ice-time'),false);tracker.update(snapshot({}, {canStart:false}));assert.equal(tracker.start('ice-time'),false);
 tracker.update(snapshot({matchSeconds:20}));tracker.start('ice-time');tracker.cancel();tracker.update(snapshot({matchSeconds:80}));assert.equal(tracker.active.status,'cancelled');
});
test('native hockey match simulation supplies actual new elapsed match time',()=>{
 const game=createHockey({aiFill:false}),me=joinHockey(game,'me'),tracker=createNativeChallengeTracker(HOCKEY_CHALLENGES);
 const sample=()=>snapshot({matchSeconds:game.elapsed,teamGoals:game.score[me.team]});
 for(let i=0;i<100;i++)stepHockey(game,.05);tracker.update(sample());tracker.start('ice-time');
 for(let i=0;i<590;i++)stepHockey(game,.05);tracker.update(sample());assert.equal(tracker.active.status,'active');assert.ok(tracker.active.progress>29);
 for(let i=0;i<12;i++)stepHockey(game,.05);tracker.update(sample());assert.equal(tracker.active.status,'completed');
});
test('arcade offers follow enabled actual attractions and ride completion requires a whole lap',()=>{
 assert.deepEqual(arcadeChallenges([]),[]);assert.deepEqual(arcadeChallenges(['train']).map(q=>q.id),['park-lap']);assert.deepEqual(arcadeChallenges(['shooting']).map(q=>q.id),['arcade-round']);
 const config=arcadeSettings({enabled:['train'],trainLapSeconds:20}),session=createArcadeSession(config),tracker=createNativeChallengeTracker(arcadeChallenges(config.enabled));let laps=0;
 tracker.update(snapshot({laps}));tracker.start('park-lap');assert.ok(enterArcadeAttraction(session,'train'));
 for(let i=0;i<100;i++)if(stepArcadeRide(session,.1))laps++;tracker.update(snapshot({laps}));assert.equal(tracker.active.status,'active');
 for(let i=0;i<1100;i++)if(stepArcadeRide(session,.1))laps++;tracker.update(snapshot({laps}));assert.equal(laps,1);assert.equal(tracker.active.status,'completed');
});
test('arcade round completion comes from the native match ending, not opening or leaving a game',()=>{
 const game=createArcadeMatch(1,arcadeSettings({roundSeconds:20})),tracker=createNativeChallengeTracker(arcadeChallenges(['shooting']));let rounds=0,wasEnded=false;
 tracker.update(snapshot({rounds}));tracker.start('arcade-round');tracker.update(snapshot({rounds}));assert.equal(tracker.active.progress,0);
 for(let i=0;i<1000;i++){game.step(.05);const value=game.snapshot();if(value.ended&&!wasEnded)rounds++;wasEnded=value.ended;}
 tracker.update(snapshot({rounds}));assert.equal(rounds,1);assert.equal(tracker.active.status,'completed');
});
