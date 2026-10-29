import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {freshWorldUrl} from '../public/js/world-navigation.js';
const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const loading=source.slice(source.indexOf('  async function loadById('),source.indexOf('\n\n  let cachedAvatars'));
test('map selection refreshes destination and reaches fresh teardown without navigating the document',async()=>{
 const events=[],sentinel=new Error('teardown reached');let destination={id:'selected',revision:1};
 const context={requireGameplayReady:()=>true,worldNavigationGeneration:0,worldLoadGeneration:1,multiplayerWorldLoading:false,setGameplayReadiness:()=>{},hideBasketballControls:()=>{},lockMenuInput:()=>{},mapQuestPrompts:{close(){}},soloMapQuests:{relocate(){}},soloQuestWorld:null,canonicalWorldId:id=>id,registry:{async refresh(){events.push('refresh');destination={id:'selected',revision:2};},find(){events.push('resolve');return destination;}},isArcadeMap:()=>false,isHockeyMap:()=>false,location:{href:'https://example.test/model-explorer.html?environment=old',assign(){assert.fail('document navigated');},reload(){assert.fail('document reloaded');}},freshWorldUrl,replaceGameLocation:url=>events.push(url.searchParams.get('environment')),startEnvironment:'old',authoritativeClient:{stop(){events.push('stop old room');throw sentinel;}}};
 vm.createContext(context);vm.runInContext(loading,context);
 await assert.rejects(context.loadById('selected'),error=>error===sentinel);
 assert.deepEqual(events,['refresh','resolve','selected','stop old room']);
 assert.equal(context.startEnvironment,'selected');assert.equal(context.worldLoadGeneration,2);assert.equal(context.multiplayerWorldLoading,false);
});
const recovery=source.slice(source.indexOf('  function showConnectionFailure('),source.indexOf('  async function startRoomGameplay'));
for(const stale of [false,true])test(`expired access offers in-page renewal and ${stale?'discards stale':'restarts current'} recovery`,async()=>{
 let resolveAccess,choices=0,restarts=0;
 const context={connectionBadge:{},revealRoomLogin(){},gameplayStarted:true,serverHostedRoom:true,resetRoomConnection(){},gameInitializationPromise:null,gameStartScreen:{classList:{remove(){}}},document:{dispatchEvent(){}},CustomEvent:class{},worldLoadGeneration:4,graphicsContextLost:false,sharedInventory:{},choosePlayAccess(){choices++;return new Promise(resolve=>resolveAccess=resolve);},startRadToxGame(){restarts++;},setStatus(){}};
 vm.createContext(context);vm.runInContext(recovery,context);context.showConnectionFailure({status:401,message:'expired'});
 assert.equal(choices,1);assert.equal(restarts,0);if(stale)context.worldLoadGeneration++;
 resolveAccess({account:{accountId:'same-account'}});await Promise.resolve();await Promise.resolve();assert.equal(restarts,stale?0:1);
});
