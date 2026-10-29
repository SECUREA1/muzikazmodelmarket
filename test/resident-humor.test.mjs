import test from 'node:test';
import assert from 'node:assert/strict';
import {RESIDENT_RIDDLES,MAP_JOKES,FORM_JOKES,CHARACTER_JOKES,residentRiddlePool,residentJokePool,humorMap} from '../server-resident-humor.mjs';
import {residentPlay,residentPlayIntent,residentPlayJoke} from '../server-resident-play.mjs';

test('every riddle has a usable hint and accepts natural typed answers even when they resemble other intents',()=>{
 assert.ok(RESIDENT_RIDDLES.length>=35);
 for(const [index,riddle]of RESIDENT_RIDDLES.entries()){
  assert.ok(riddle.hint&&riddle.tags.length&&riddle.aliases.includes(riddle.answer));
  const memory={play:{kind:'riddle',index,attempts:0,expiresAt:2000}},message="It's a "+riddle.answer+'!';
  assert.equal(residentPlayIntent('question',message,'skills',memory,1000),'play-answer',riddle.answer);
  const result=residentPlay({name:'Tala'},memory,'play-answer',message,1000);
  assert.match(result.text,/You got it/);assert.equal(memory.play,undefined);
 }
});

test('each map and built character has distinct themed content and finite nonrepeating rotation',()=>{
 assert.equal(Object.keys(MAP_JOKES).length,20);
 for(const kind of Object.keys(MAP_JOKES)){
  const info={name:'Tala',personalityId:'test-'+kind,context:{kind}},memory={visits:0};
  const pool=residentRiddlePool(info),seen=new Set();
  for(let i=0;i<pool.length;i++){
   residentPlay(info,memory,'riddle','',1000);seen.add(memory.play.index);memory.visits+=7;
  }
  assert.equal(seen.size,pool.length,kind);
  const jokes=residentJokePool(info);assert.equal(new Set(jokes.map((_,i)=>residentPlayJoke(info,i))).size,jokes.length);
  assert.ok(MAP_JOKES[kind].every(line=>jokes.includes(line)));
 }
 for(const [model,lines]of Object.entries(CHARACTER_JOKES))assert.ok(lines.every(line=>residentJokePool({appearance:{characterModel:model}}).includes(line)));
 for(const [form,lines]of Object.entries(FORM_JOKES))assert.ok(lines.every(line=>residentJokePool({appearance:{form}}).includes(line)));
});

test('special worlds use their theme even when the resident has a general community job',()=>{
 for(const [name,kind]of [['Creepy funhouse','funhouse'],['Quarry stockyard','quarry'],['Tropical island','island'],['Forestry camp','forestry'],['Prison courtyard','prison']])assert.equal(humorMap({context:{kind:'community',worldName:name}}),kind);
});
