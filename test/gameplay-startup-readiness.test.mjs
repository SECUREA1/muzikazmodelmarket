import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const readiness=section('  function gameplayControlsReady()','  setGameplayReadiness(false);');
const loadWorld=section('  async function loadById(','\n\n  let cachedAvatars');
const resetRoom=section('  function resetRoomConnection()','  function showConnectionFailure');
const joinRoom=section('  async function startRoomGameplay(','  async function warmGameDisplay');
const initialize=section('  function startRadToxGame()','  canvas.addEventListener(\'webglcontextlost\'');
const hostCommand=section('  function serverCommand(','\n');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turns=async()=>{for(let index=0;index<6;index++)await Promise.resolve();};
function fixture(extra={}){
 const controls=new Map(['house-outside-button','house-world-button','house-environment-select','house-environment-list-toggle'].map(id=>[id,{disabled:false}])),events=[],readinessChanges=[],statuses=[];
 const reset=()=>{};
 const context=vm.createContext({
  console,URL,Promise,queueMicrotask,CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  document:{getElementById:id=>controls.get(id),dispatchEvent:event=>events.push(event)},window:{dispatchEvent:event=>events.push(event)},
  location:{href:'http://localhost/model-explorer.html?environment=muzikaz-airport&autoplay=1'},
  gameplayStarted:false,gameplayReadiness:null,multiplayerWorldLoading:false,worldLoadGeneration:1,worldNavigationGeneration:0,gameInitializationPromise:null,gameInitializationRevision:0,
  serverHostedRoom:true,guestSolo:false,residentWalkthrough:false,authoritativeClient:null,serverPlayerInitialized:false,activeEnvironment:{id:'muzikaz-airport'},
  districtMap:{setReady:value=>readinessChanges.push(value)},setStatus:message=>statuses.push(message),hideBasketballControls:reset,lockMenuInput:reset,
  scaleControl:{querySelectorAll:()=>[]},connectionBadge:{textContent:''},sharedInventory:{},ensurePlayAccess:async()=>({account:{}}),choosePlayAccess:async()=>null,
  serverInput:()=>({}),renderServerRoom:reset,radToxEnabled:false,showConnectionFailure:reset,publishGameStage:reset,updateLevelLoader:reset,
  serverMotion:{reset},localWalkingView:{reset},localWalkingActive:false,localVehicleView:{reset},localVehicleActor:null,serverViewSnapshot:null,stickSprinting:false,
  stage:{scrollIntoView:reset},gameStartButton:{disabled:false},gameStartScreen:{classList:{add:reset,remove:reset}},gameLoadStatus:{textContent:''},graphicsContextLost:false,
  activeWorldSpawn:{position:{x:1,y:.02,z:2},rotationY:0},resetPlayer:reset,hideLevelLoader:reset,scheduleGameResize:reset,
  toxicBubbleSystem:{begin:async()=>{},serverEncounter:null},revealRoomLogin:reset,isFiringRangeEnvironment:()=>false,
  refreshLibrary:async()=>{},refreshAvatarLibrary:async()=>{},renderPicker:reset,
  ...extra
 });
 vm.runInContext(readiness+resetRoom,context);
 return {context,controls,events,readinessChanges,statuses};
}
function commandFixture(reply,extra={}){
 const effects=[],client={ready:true,send:()=>reply.promise};
 const state=fixture({authoritativeClient:client,unlockQuestConversation(){},residentUI:{open:value=>effects.push(['resident',value]),report:message=>effects.push(['report',message])},transportActivity:{close:()=>effects.push(['transport'])},lockMenuInput:()=>effects.push(['lock']),landSaleUI:{open:id=>effects.push(['land',id])},airportOps:{acceptAutomaticRoute:()=>effects.push(['airport'])},harborOps:{acceptAutomaticRoute:()=>effects.push(['harbor'])},deviceUI:{open:id=>effects.push(['device',id])},registry:{find:()=>({}),refresh:async()=>{}},loadById:async id=>effects.push(['destination',id]),...extra});
 vm.runInContext(hostCommand,state.context);return {...state,effects,client};
}

test('delayed action replies cannot change overlays or destinations in a replacement world or connection',async()=>{
 for(const replacement of ['world','client'])for(const [action,result] of [
  ['npc-social',{message:'Old conversation',residentId:'old-resident'}],
  ['map-access',{message:'Old arrival'}],
  ['interact',{landLotId:'old-plot'}],
  ['interact',{deviceId:'old-device',deviceKind:'radio'}],
  ['interact',{destination:'old-destination'}],
  ['vehicle-navigate',{message:'Old route'}]
 ]){
  const reply=deferred(),{context,effects,statuses}=commandFixture(reply);
  const pending=context.serverCommand(action);
  if(replacement==='world')context.worldLoadGeneration++;else context.authoritativeClient={ready:true};
  reply.resolve({result});assert.equal(await pending,false,replacement+' '+action);
  assert.deepEqual(effects,[]);assert.deepEqual(statuses,[]);
 }
});

test('a failed obsolete action cannot replace the current status or resident panel',async()=>{
 for(const replacement of ['world','client']){
  const reply=deferred(),{context,effects,statuses}=commandFixture(reply);
  const pending=context.serverCommand('npc-social');
  if(replacement==='world')context.worldLoadGeneration++;else context.authoritativeClient={ready:true};
  reply.reject(Error('Old request failed'));assert.equal(await pending,false);assert.deepEqual(effects,[]);assert.deepEqual(statuses,[]);
 }
});

test('a destination reply rechecks its issuing world after asynchronous directory refresh',async()=>{
 const reply=deferred(),refresh=deferred(),refreshEntered=deferred(),{context,effects}=commandFixture(reply,{registry:{find:()=>null,refresh:()=>{refreshEntered.resolve();return refresh.promise;}}});
 const pending=context.serverCommand('interact');reply.resolve({result:{destination:'old-destination'}});await refreshEntered.promise;
 context.worldLoadGeneration++;refresh.resolve();assert.equal(await pending,false);assert.deepEqual(effects,[]);
});

test('a ready room may complete its startup action before visible gameplay is active',async()=>{
 const reply=deferred(),{context,statuses}=commandFixture(reply);assert.equal(context.gameplayStarted,false);
 const pending=context.serverCommand('start-rad-tox'),state={result:{message:'Encounter ready'}};reply.resolve(state);
 assert.equal(await pending,state);assert.deepEqual(statuses,['Encounter ready']);
});

test('world navigation stays disabled through joining and restores only for a confirmed playable world',()=>{
 const {context,controls,readinessChanges}=fixture();
 context.setGameplayReadiness();assert.equal(readinessChanges.at(-1),false);assert.ok([...controls.values()].every(control=>control.disabled));
 context.authoritativeClient={ready:true};context.serverPlayerInitialized=true;
 assert.equal(context.gameplayControlsReady(),false,'a room reply alone does not complete gameplay startup');
 context.gameplayStarted=true;context.setGameplayReadiness();assert.equal(readinessChanges.at(-1),true);assert.ok([...controls.values()].every(control=>!control.disabled));
 context.multiplayerWorldLoading=true;context.setGameplayReadiness();assert.equal(readinessChanges.at(-1),false);
 context.multiplayerWorldLoading=false;context.authoritativeClient.ready=false;assert.equal(context.gameplayControlsReady(),true,'a joined player keeps controls during transport recovery');
 context.authoritativeClient=null;assert.equal(context.gameplayControlsReady(),false,'a disposed room does not accept gameplay input');
 context.serverHostedRoom=false;assert.equal(context.gameplayControlsReady(),true,'solo startup needs no room connection');
});

test('transient connection recovery never locks navigation or changes map visibility',async()=>{
 const {context,controls,readinessChanges}=fixture({gameplayStarted:true,serverPlayerInitialized:true,authoritativeClient:{ready:true}});
 context.setGameplayReadiness();context.authoritativeClient.ready=false;context.setGameplayReadiness();
 assert.equal(controls.get('house-world-button').disabled,false);
 assert.deepEqual(readinessChanges,[true],'transport status does not close the maps');
 // The gameplay renderer runs before connectAuthoritativeRoom confirms ready.
 // Exercise its real entry hook without constructing unrelated scene meshes.
 const renderEntry=section('  function renderServerRoom(snapshot,selfId,timing={}){','skiResortControls.update');
 vm.runInContext(renderEntry+'}',context);
 context.renderServerRoom({},'self');context.authoritativeClient.ready=true;
 await turns();
 assert.equal(controls.get('house-world-button').disabled,false);assert.equal(readinessChanges.at(-1),true);
 const changes=readinessChanges.length;context.setGameplayReadiness();assert.equal(readinessChanges.length,changes,'unchanged heartbeats do not rebuild map readiness');
});

test('same-world map travel does not release held game controls',async()=>{
 const reply=deferred(),{context,effects}=commandFixture(reply);
 const pending=context.serverCommand('map-access',{locationId:'court'});
 reply.resolve({result:{message:'Arrived'}});await pending;
 assert.deepEqual(effects,[['resident',false],['transport']]);
});

test('a joined room still rejects commands during a real network interruption',async()=>{
 const reply=deferred(),{context,effects,statuses,client}=commandFixture(reply);
 client.ready=false;
 assert.equal(await context.serverCommand('map-access',{locationId:'court'}),false);
 assert.deepEqual(effects,[]);assert.match(statuses[0],/Waiting for the shared server/);
});

test('early navigation cannot stop the pending room join or start a second world load',async()=>{
 let resolves=0,stops=0;
 const client={ready:false,stop(){stops++;}}, {context}=fixture({authoritativeClient:client,registry:{find:()=>null,resolve:async()=>{resolves++;}},canonicalWorldId:id=>id});
 vm.runInContext(loadWorld,context);
 assert.equal(await context.loadById('public-commons'),false);
 assert.equal(resolves,0);assert.equal(stops,0);assert.equal(context.authoritativeClient,client);assert.equal(context.worldLoadGeneration,1);assert.equal(context.multiplayerWorldLoading,false);
});

test('jump and shoot ignore early touches and begin dispatching after gameplay readiness',async()=>{
 const calls=[],{context}=fixture({authoritativeClient:{ready:true,requestInput:()=>calls.push('refresh')},serverPlayerInitialized:true,serverActors:{},serverVehicleId:null,isAircraft:()=>true,fireAircraft:()=>calls.push('fire'),serverCommand:async action=>calls.push(action)});
 for(const name of ['jump','shootAtReticle']){
  const start=source.indexOf('  function '+name+'()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 }
 assert.equal(context.jump(),false);assert.equal(context.shootAtReticle(),false);assert.deepEqual(calls,[]);
 context.gameplayStarted=true;context.shootAtReticle();await context.jump();assert.deepEqual(calls,['fire','input','refresh']);
});

test('failed destination discovery restores current-world readiness without replacing its room',async()=>{
 const discovery=deferred();let stops=0;
 const client={ready:true,stop(){stops++;}}, {context,controls}=fixture({gameplayStarted:true,serverPlayerInitialized:true,authoritativeClient:client,registry:{find:()=>null,resolve:()=>discovery.promise},canonicalWorldId:id=>id});
 vm.runInContext(loadWorld,context);
 const loading=context.loadById('missing-destination');
 assert.equal(context.multiplayerWorldLoading,true);assert.equal(controls.get('house-outside-button').disabled,true);
 assert.equal(await context.loadById('another-destination'),false,'a second navigation cannot overtake discovery');
 discovery.reject(Error('Destination unavailable'));
 await assert.rejects(loading,/Destination unavailable/);
 assert.equal(context.multiplayerWorldLoading,false);assert.equal(context.gameplayControlsReady(),true);assert.equal(controls.get('house-outside-button').disabled,false);
 assert.equal(context.worldLoadGeneration,1);assert.equal(context.authoritativeClient,client);assert.equal(stops,0);
});

test('choosing multiplayer from a ready solo map validates the current room before changing transport mode',async()=>{
 let selected=null;
 const {context}=fixture({gameplayStarted:true,guestSolo:true,serverHostedRoom:false,authoritativeClient:null,pickerPanel:{dialog:{close(){}}},library:{classList:{add(){}}},worldButton:{setAttribute(){}},replaceGameLocation(){},loadById:async id=>{assert.equal(context.requireGameplayReady(),true);assert.equal(context.serverHostedRoom,false,'the previous solo room remains current until the load begins');selected=id;}});
 const onJoin=section('onJoin:async env=>{','}});\n  }').slice('onJoin:'.length)+'}';
 vm.runInContext('globalThis.chooseDestination=('+onJoin+');',context);
 await context.chooseDestination({id:'public-commons',name:'Public Commons',multiplayer:true});
 assert.equal(selected,'public-commons');assert.equal(context.guestSolo,false);
});

test('a late room join success or failure cannot complete or reset a newer world',async()=>{
 for(const failure of [false,true]){
  const ready=deferred();let oldStops=0,newStops=0;
  const oldClient={ready:false,whenReady:()=>ready.promise,stop(){oldStops++;}},replacement={ready:true,stop(){newStops++;}};
  const {context,events}=fixture({connectAuthoritativeRoom:()=>oldClient});vm.runInContext(joinRoom,context);
  const joining=context.startRoomGameplay();await turns();assert.equal(context.authoritativeClient,oldClient);
  context.worldLoadGeneration++;context.activeEnvironment={id:'public-commons'};context.authoritativeClient=replacement;
  if(failure)ready.reject(Error('Old connection interrupted'));else ready.resolve(oldClient);
  assert.equal(await joining,false);assert.equal(context.authoritativeClient,replacement);assert.equal(newStops,0);assert.equal(oldStops,0);
  assert.equal(events.filter(event=>event.type==='muzikaz:multiplayer-room-ready').length,0);
 }
});

test('changing the world while access is pending cannot join the replacement world from an obsolete startup',async()=>{
 const access=deferred();let connections=0;
 const {context}=fixture({ensurePlayAccess:()=>access.promise,connectAuthoritativeRoom:()=>{connections++;}});vm.runInContext(joinRoom,context);
 const joining=context.startRoomGameplay();context.worldLoadGeneration++;access.resolve({account:{}});
 assert.equal(await joining,false);assert.equal(connections,0);
});

test('an obsolete initializer failure cannot tear down a newer initialization or clear its promise',async()=>{
 const firstGraphics=deferred(),nextGraphics=deferred();let graphicsCalls=0,roomCalls=0;
 const {context}=fixture({openHouseMap:async()=>{},warmGameDisplay:()=>++graphicsCalls===1?firstGraphics.promise:nextGraphics.promise,startRoomGameplay:async()=>{roomCalls++;context.authoritativeClient={ready:true,stop(){}};context.serverPlayerInitialized=true;return true;}});
 vm.runInContext(initialize,context);
 const first=context.startRadToxGame();await turns();context.resetRoomConnection();
 const next=context.startRadToxGame();await turns();assert.equal(context.gameInitializationPromise,next);
 firstGraphics.reject(Error('Obsolete shader preparation failed'));await first;
 assert.equal(context.gameInitializationPromise,next);assert.equal(context.gameplayStarted,false);assert.equal(roomCalls,0);
 nextGraphics.resolve();await next;assert.equal(context.gameplayStarted,true);assert.equal(context.gameplayControlsReady(),true);assert.equal(roomCalls,1);
});

test('a late initializer error after a world change leaves the new live room and controls intact',async()=>{
 const begin=deferred(),beginEntered=deferred();let replacementStops=0;
 const replacement={ready:true,stop(){replacementStops++;}};
 const {context}=fixture({openHouseMap:async()=>{},warmGameDisplay:async()=>{},startRoomGameplay:async()=>true,toxicBubbleSystem:{begin:()=>{beginEntered.resolve();return begin.promise;},serverEncounter:null}});
 vm.runInContext(initialize,context);
 const starting=context.startRadToxGame();await beginEntered.promise;
 context.worldLoadGeneration++;context.authoritativeClient=replacement;context.serverPlayerInitialized=true;context.gameplayStarted=true;
 begin.reject(Error('Old encounter did not start'));await starting;
 assert.equal(context.authoritativeClient,replacement);assert.equal(replacementStops,0);assert.equal(context.gameplayControlsReady(),true);
});

test('successful startup publishes readiness only after room confirmation and gameplay initialization',async()=>{
 const joined=deferred(),begin=deferred();
 const {context,readinessChanges}=fixture({openHouseMap:async()=>{},warmGameDisplay:async()=>{},startRoomGameplay:()=>joined.promise,toxicBubbleSystem:{begin:()=>begin.promise,serverEncounter:null}});
 vm.runInContext(initialize,context);
 const starting=context.startRadToxGame();await turns();assert.equal(context.gameplayStarted,false);assert.equal(readinessChanges.at(-1),false);
 context.authoritativeClient={ready:true};context.serverPlayerInitialized=true;joined.resolve(true);await turns();
 assert.equal(context.gameplayStarted,false);assert.equal(readinessChanges.at(-1),false);
 begin.resolve();await starting;assert.equal(context.gameplayStarted,true);assert.equal(readinessChanges.at(-1),true);
});
