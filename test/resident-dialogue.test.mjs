import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stepWorldResidents,residentCommand} from '../server-world-residents.mjs';
import {residentDialogue,residentProgressView,awardResidentFavor} from '../server-resident-dialogue.mjs';
import {residentActivityRestricted} from '../server-resident-life.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const collision={groundAt:(_environment,point)=>({...point,y:0}),hasBodyClearance:()=>true,resolve:(_environment,_from,to)=>to};
function fixture(id='music-life',name='Community music world'){
 const world={id,name,spawn:{x:0,y:0,z:0},builderScene:{mapSize:120,objects:[],layoutMeta:{locations:[{id:'lounge',name:'Main floor music lounge',x:0,z:0},{id:'garden',name:'Community garden',x:20,z:0},{id:'workshop',name:'Creative workshop',x:0,z:20}]}}};
 const sim={actors:{},players:{},events:[]};let now=100000;
 stepWorldResidents(sim,world,now,.1,{collision});const npc=Object.values(sim.actors).find(actor=>actor.resident),player=sim.players.alice={actorId:'alice',username:'Alice',position:{...npc.position},lastSeen:now,health:100,grounded:true,movementRevision:0,score:0,tokens:{MZK:900}};
 return {sim,world,npc,player,get now(){return now;},advance(ms=1200){now+=ms;player.lastSeen=now;return now;},say(choice,text,contact=npc){now+=1200;player.lastSeen=now;return residentCommand(sim,player,world,{entityId:contact.id,choice,text},now,{collision});}};
}

test('ordinary residents answer typed preferences, memories, personalities, skills, directions and live work context',()=>{
 const f=fixture();f.say('question','I enjoy music');assert.match(f.player.npcConversation.conversation.at(-1).text,/remember.*music|enjoy music|point: music/i);
 assert.equal(f.player.residentPreferences.interest,'music');assert.equal(f.player.npcConversation.residentContext.relationship.rememberedInterest,'music');
 f.say('resident-personality','What do you remember about me?');assert.match(f.player.npcConversation.conversation.at(-1).text,/enjoy music/);
 f.say('resident-personality');const context=f.player.npcConversation.residentContext;assert.ok(context.personality);assert.ok(context.backstory);assert.ok(Object.keys(context.skills).length>2);
 f.say('resident-skills');assert.match(f.player.npcConversation.conversation.at(-1).text,/strongest skills|experience|practice/);
 f.say('question','Where is the community garden?');assert.match(f.player.npcConversation.conversation.at(-1).text,/Community garden.*metres/);
 f.npc.resident.memory.push({kind:'observation',text:'The local musicians just finished a rehearsal.',at:f.now});f.say('resident-activity');assert.match(f.player.npcConversation.conversation.at(-1).text,/rehearsal|Right now/);
 f.say('resident-staff');assert.match(f.player.npcConversation.conversation.at(-1).text,/near|resident/);
 f.say('question','How do I play basketball?');assert.match(f.player.npcConversation.conversation.at(-1).text,/shot, pass and steal/);
 f.say('question','I enjoy painting landscapes');f.say('resident-memory');assert.match(f.player.npcConversation.conversation.at(-1).text,/painting landscapes/);
 assert.equal(f.player.tokens.MZK,900);assert.equal(f.player.score,0);
});

test('new map contacts inherit shared interests while relationship memories remain scoped to map and player',()=>{
 const f=fixture(),other=fixture('second-saved-world','A saved creative world');f.say('question','I enjoy music');
 const answer=residentDialogue(other.sim,f.player,other.npc,other.world,'resident-memory','',f.advance());assert.match(answer.text,/hosts note.*enjoy music/);assert.equal(answer.metadata.relationship.rememberedInterest,'music');
 assert.ok(f.player.residentSocial[f.world.id+'|'+f.npc.id]);assert.ok(f.player.residentSocial[other.world.id+'|'+other.npc.id]);
 const stranger={actorId:'bob',username:'Bob'};const privateAnswer=residentDialogue(f.sim,stranger,f.npc,f.world,'resident-memory','',f.advance());assert.doesNotMatch(privateAnswer.text,/enjoy music/);assert.equal(privateAnswer.metadata.relationship.rememberedInterest,null);
 for(let index=0;index<40;index++)residentDialogue(f.sim,f.player,{...f.npc,id:'contact-'+index,resident:{...f.npc.resident,name:'Contact '+index}},f.world,'day','Hello',f.advance());assert.ok(Object.keys(f.player.residentSocial).length<=32);
 for(let index=0;index<12;index++)residentDialogue(f.sim,f.player,f.npc,f.world,'day','Hello',f.advance());assert.equal(f.player.residentSocial[f.world.id+'|'+f.npc.id].turns.length,6);
});

test('residents explain personal plans, team duties and their own form without changing player rewards',()=>{
 const f=fixture(),info=f.npc.resident;delete info.sharedTask;
 info.objective={id:'garden-tour',worldId:f.world.id,title:'Discover the garden',kind:'explore',status:'active',index:1,checkpoints:[{name:'Read the activity board'},{name:'Garden overlook'},{name:'Return to the lounge'}]};info.objectivesCompleted=2;
 f.say('day');let answer=f.player.npcConversation.conversation.at(-1).text;
 assert.match(answer,/discover the garden.*Garden overlook.*1 of 3.*2 personal objectives/);
 f.say('question','What are your plans?');assert.match(f.player.npcConversation.conversation.at(-1).text,/Garden overlook/);
 const partner=Object.values(f.sim.actors).find(actor=>actor.resident&&actor!==f.npc);
 info.sharedTask={id:'equipment',partnerId:partner.id,title:'Check the equipment together',stage:'Work together',responsibility:'Review the equipment list',progress:.5};
 f.say('resident-activity');answer=f.player.npcConversation.conversation.at(-1).text;
 assert.ok(answer.includes(partner.resident.name));assert.match(answer,/review the equipment list.*50%/);
 info.identity={form:'automaton',ambition:'discover every public landmark',quirk:'keeps a notebook of small discoveries'};info.appearance.form='automaton';
 f.say('resident-personality');answer=f.player.npcConversation.conversation.at(-1).text;
 assert.match(answer,/an automaton/);assert.match(answer,/discover every public landmark/);assert.match(answer,/I keep a notebook/);
 assert.equal(f.player.score,0);assert.equal(f.player.tokens.MZK,900);
});

test('compatible daily favors grant score plus role practice and reputation once without creating MZK',()=>{
 const f=fixture();f.npc.resident.index=0;f.say('help');const offer=f.player.npcConversation.residentContext.taskOffer;assert.ok(offer.steps.length>=2);assert.equal(offer.reward.score,100);assert.ok(offer.reward.reputation>0);
 f.say('accept');const task=f.player.residentTask;assert.equal(task.status,'active');assert.ok(task.progressReward.skill);assert.equal(typeof task.reward,'number');
 assert.throws(()=>f.say('confirm'),/Reach/);
 f.player.position={...task.checkpoints[0]};f.say('confirm');assert.equal(task.index,1);
 f.player.position={...f.npc.position};f.say('confirm');assert.equal(task.status,'completed');assert.equal(f.player.score,task.reward);
 const progress=residentProgressView(f.player);assert.equal(progress.reputation,task.progressReward.reputation);assert.equal(progress.skills[task.progressReward.skill],task.progressReward.xp);assert.ok(progress.cosmetics.includes(task.progressReward.badge));assert.equal(progress.completedTasks,1);assert.deepEqual(progress.badges,progress.cosmetics);assert.equal(progress.completedFavors,1);
 assert.throws(()=>f.say('confirm'),/Accept/);assert.equal(awardResidentFavor(f.sim,f.player,f.npc,f.world,task,f.advance()),false);assert.deepEqual(residentProgressView(f.player),progress);assert.equal(f.player.tokens.MZK,900);
});

test('generic objectives retain social check-ins and reject travel, unsafe vehicles, expiry and repeat awards',()=>{
 const f=fixture();f.npc.resident.index=3;f.say('accept');const task=f.player.residentTask,target=f.sim.actors[task.socialTargetId];assert.equal(task.kind,'social');
 f.player.position={...target.position};assert.throws(()=>f.say('confirm'),/Speak/);f.say('question','How is your day?',target);f.say('confirm');assert.equal(task.index,1);
 f.player.position={...f.npc.position};f.player.vehicleId='car';f.sim.actors.car={driving:{speed:3}};assert.throws(()=>f.say('confirm'),/stop safely/);f.player.vehicleId=null;
 f.player.movementRevision++;assert.throws(()=>f.say('confirm'),/Travel reset/);stepWorldResidents(f.sim,f.world,f.advance(),.2,{collision});assert.equal(task.status,'cancelled');assert.equal(residentProgressView(f.player).reputation,0);assert.equal(f.player.score,0);
 f.player.position={...f.npc.position};f.say('accept');f.player.residentTask.deadline=f.now-1;assert.throws(()=>f.say('confirm'),/expired/);assert.equal(f.player.tokens.MZK,900);
});

test('existing saved residents migrate without replacing identity and retain learned state across distance culling',()=>{
 const f=fixture();f.npc.resident.skills.social=83;f.npc.resident.memory.push({kind:'lesson',text:'I learned how to welcome a quiet visitor.',at:f.now});
 const identity=f.npc.id,saved=structuredClone(f.sim);stepWorldResidents(saved,f.world,f.advance(),.2,{collision});assert.equal(saved.actors[identity].id,identity);assert.ok(saved.actors[identity].resident.skills.social>=83);assert.ok(saved.actors[identity].resident.memory.some(item=>/quiet visitor/.test(item.text)));
 const places=Array.from({length:10},(_,index)=>({id:'place-'+index,name:'Public garden '+index,x:index*100,z:0})),world={id:'distance-memory',name:'Garden district',builderScene:{mapSize:2000,objects:[],layoutMeta:{locations:places}}},sim={actors:{},players:{},events:[]};stepWorldResidents(sim,world,100000,.1,{collision});
 const distant=Object.values(sim.actors).find(actor=>actor.resident.locationIndex===6);assert.ok(distant);distant.resident.skills.social=88;distant.resident.memory.push({kind:'lesson',text:'I remember the evening gardening group.',at:100000});
 sim.players.alice={actorId:'alice',username:'Alice',position:{x:0,y:0,z:0},lastSeen:110000,health:100};stepWorldResidents(sim,world,110000,.2,{collision});assert.equal(sim.actors[distant.id],undefined);
 sim.players.alice.position={x:600,y:0,z:0};sim.players.alice.lastSeen=112000;stepWorldResidents(sim,world,112000,.2,{collision});const restored=sim.actors[distant.id];assert.ok(restored);assert.ok(restored.resident.skills.social>=88);assert.ok(restored.resident.memory.some(item=>/gardening group/.test(item.text)));
});

test('population grows only on spacious clear locations and never forces a crowd onto blocked floors',()=>{
 const places=Array.from({length:10},(_,index)=>({id:'public-'+index,name:'Community square '+index,x:index*15,z:0,width:40,depth:40})),world={id:'spacious-crowd',name:'Community district',builderScene:{mapSize:400,objects:[],layoutMeta:{locations:places}}},sim={actors:{},players:{},events:[]};
 stepWorldResidents(sim,world,100000,.2,{collision});const count=Object.values(sim.actors).filter(actor=>actor.resident).length;assert.ok(count>14&&count<=22);
 const blocked={actors:{},players:{},events:[]};stepWorldResidents(blocked,{...world,id:'blocked-floor',builderScene:{...world.builderScene,mapSize:8}},100000,.2,{collision:{...collision,hasBodyClearance:()=>false}});assert.equal(Object.values(blocked.actors).filter(actor=>actor.resident).length,0);
});

test('the actual basketball sideline supports a nearby resident pair that completes an alternating conversation',async()=>{
 const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8')),world=maps.find(map=>map.id==='basketball-arena'),collision=new ServerBuilderCollision(),sim={actors:{},players:{},events:[]};
 stepWorldResidents(sim,world,100000,.25,{collision});
 const cast=Object.values(sim.actors).filter(actor=>actor.resident);assert.equal(cast.length,2);
 assert.ok(Math.hypot(cast[0].position.x-cast[1].position.x,cast[0].position.z-cast[1].position.z)<=4.1,'hosts share a public sideline within conversational reach');
 for(let tick=1;tick<=160;tick++){
  stepWorldResidents(sim,world,100000+tick*250,.25,{collision});
  for(const npc of cast){assert.equal(residentActivityRestricted(world,npc.position,sim),false,'the court stays clear');assert.ok(collision.hasBodyClearance(world,npc.position,.42,{actors:sim.actors,objects:{}}),'residents remain clear of actual stadium geometry');}
 }
 const completed=sim.residentLife.conversations.filter(conversation=>conversation.status==='complete');assert.ok(sim.residentLife.stats.conversations>=1);assert.ok(completed.length>=1);
 for(const conversation of completed){assert.equal(conversation.lines.length,3);assert.equal(new Set(conversation.lines.map(line=>line.speakerId)).size,2);for(let index=1;index<conversation.lines.length;index++){assert.notEqual(conversation.lines[index-1].speakerId,conversation.lines[index].speakerId);assert.ok(conversation.lines[index].at-conversation.lines[index-1].at>=3100);}}
});

test('players can finish riddles with guesses, hints and reveal buttons without rewards',()=>{
 const f=fixture();f.say('resident-riddle');let context=f.player.npcConversation.residentContext;
 assert.equal(context.play.kind,'riddle');assert.ok(context.playChoices.some(c=>c.id==='resident-reveal'));
 f.say('question','a banana');assert.match(f.player.npcConversation.conversation.at(-1).text,/hint:/);
 f.say('resident-reveal');assert.match(f.player.npcConversation.conversation.at(-1).text,/The answer is/);assert.equal(f.player.npcConversation.residentContext.play,null);
 f.say('resident-riddle');f.say('resident-play-stop');assert.equal(f.player.npcConversation.residentContext.play,null);
 assert.equal(f.player.tokens.MZK,900);assert.equal(f.player.score,0);assert.equal(residentProgressView(f.player).completedTasks,0);
});

test('would-you-rather and coauthored stories have bounded follow-ups and animated celebrations',()=>{
 const f=fixture();f.say('resident-rather');assert.equal(f.player.npcConversation.residentContext.play.kind,'rather');assert.match(f.player.npcConversation.conversation.at(-1).text,/concert for clouds/);
 f.say('resident-answer-a');assert.equal(f.player.npcConversation.residentContext.play,null);
 f.say('resident-story');f.say('question','a dancing teapot arrived');assert.match(f.player.npcConversation.conversation.at(-1).text,/dancing teapot/);
 f.say('question','The Great Teapot Adventure');assert.match(f.player.npcConversation.conversation.at(-1).text,/The end!/);assert.equal(f.player.npcConversation.residentContext.play,null);assert.equal(f.npc.resident.gesture,'cheer');
 f.npc.resident.appearance.form='mossling';f.say('resident-dance');assert.match(f.player.npcConversation.conversation.at(-1).text,/leaf shuffle/);assert.equal(f.npc.resident.gesture,'dance');
 f.say('resident-highfive');assert.equal(f.npc.resident.gesture,'cheer');
});

test('mini-games stay private to a contact and player, expire and preserve navigation and task commands',()=>{
 const f=fixture();f.say('resident-story');const bob={actorId:'bob',username:'Bob'};
 const answer=residentDialogue(f.sim,bob,f.npc,f.world,'resident-answer-a','',f.advance());assert.match(answer.text,/last mini-game has ended/);
 f.say('question','Where is the community garden?');assert.match(f.player.npcConversation.conversation.at(-1).text,/metres/);assert.equal(f.player.npcConversation.residentContext.play.kind,'story');
 f.say('resident-riddle');f.advance(300001);f.say('resident-reveal');assert.match(f.player.npcConversation.conversation.at(-1).text,/last mini-game has ended/);
 f.say('resident-story');f.say('bye');assert.equal(f.player.npcConversation.residentContext.play,null);
 f.player.position.x+=50;assert.throws(()=>f.say('resident-highfive'),/Move closer/);
});
