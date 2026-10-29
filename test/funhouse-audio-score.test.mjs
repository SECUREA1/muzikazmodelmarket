import test from 'node:test';
import assert from 'node:assert/strict';
import {FUNHOUSE_MUSIC,midiFrequency,funhouseMusicBar,funhouseEffectScore} from '../public/js/funhouse-audio-score.js';

test('the original clown-car waltz loops cleanly in three with restrained calliope and bass parts',()=>{
 assert.equal(FUNHOUSE_MUSIC.beatsPerBar,3);assert.equal(FUNHOUSE_MUSIC.loopBeats,FUNHOUSE_MUSIC.bars*3);
 assert.ok(FUNHOUSE_MUSIC.tempo>=110&&FUNHOUSE_MUSIC.tempo<=150);
 const bars=Array.from({length:FUNHOUSE_MUSIC.bars},(_,i)=>funhouseMusicBar(i));
 assert.ok(bars.every(bar=>bar.length<=15&&bar.some(n=>n.midi<50)&&bar.some(n=>n.midi>80)));
 assert.equal(new Set(bars.map(bar=>JSON.stringify(bar))).size,8,'the loop has an arranged phrase rather than one repeated beep');
 for(const bar of bars)for(const n of bar){
  assert.ok(n.beat>=0&&n.beat+n.duration<=3);assert.ok(n.duration>0&&n.gain>0&&n.gain<=.025);
  assert.ok(midiFrequency(n.midi)>=40&&midiFrequency(n.midi)<=4000);
 }
 assert.ok(bars[0].some(n=>n.midi===65),'D-minor accompaniment includes its minor third');
 assert.ok(bars[3].some(n=>n.midi===61),'the dominant introduces a harmonic-minor leading tone');
 assert.deepEqual(funhouseMusicBar(8),bars[0]);assert.deepEqual(funhouseMusicBar(-1),bars[7]);
 const changed=funhouseMusicBar(0);changed[0].midi=0;assert.notEqual(funhouseMusicBar(0)[0].midi,0);
});

test('attraction cues have bounded envelopes, distinctive action shapes and real hit/miss responses',()=>{
 const kinds=['car','car-start','car-stop','honk','water-hit','water-miss','ball-hit','ball-miss','bell','spinner','balance','water','squirt','wind','catch','jackbox','ballpit','toss','ring','maze-finish','dressup','shoes','hat','adventure','laugh','haunt-start','haunt-seal','haunt-complete','haunt-timeout','haunt-heartbeat','haunt-whisper'];
 for(const kind of kinds){
  const notes=funhouseEffectScore(kind);assert.ok(notes.length>0,kind+' is audible');
  for(const n of notes){assert.ok(n.at>=0&&n.at<2);assert.ok(n.duration>0&&n.duration<=1);assert.ok(n.gain>0&&n.gain<=.12);assert.ok(n.frequency>=40&&n.frequency<=4000);if(n.endFrequency!==undefined)assert.ok(n.endFrequency>=40&&n.endFrequency<=4000);}
 }
 assert.deepEqual(funhouseEffectScore('car'),funhouseEffectScore('honk'));
 assert.deepEqual(funhouseEffectScore('water-hit',{hit:false}),funhouseEffectScore('squirt',{hit:true}));
 assert.deepEqual(funhouseEffectScore('water-miss',{hit:true}),funhouseEffectScore('squirt',{hit:false}));
 assert.notDeepEqual(funhouseEffectScore('ball-hit'),funhouseEffectScore('ball-miss'));
 assert.notDeepEqual(funhouseEffectScore('squirt',{hit:true}),funhouseEffectScore('squirt',{hit:false}));
 assert.notDeepEqual(funhouseEffectScore('balance',{hit:true}),funhouseEffectScore('balance',{hit:false}));
 assert.notDeepEqual(funhouseEffectScore('catch',{hit:true}),funhouseEffectScore('catch',{hit:false}));
 assert.notDeepEqual(funhouseEffectScore('wind'),funhouseEffectScore('laugh'));
 assert.deepEqual(funhouseEffectScore('unrecognized-command'),[]);
 const horn=funhouseEffectScore('honk');horn[0].frequency=0;assert.notEqual(funhouseEffectScore('honk')[0].frequency,0);
 assert.ok(Math.abs(midiFrequency(69)-440)<1e-8);
});
