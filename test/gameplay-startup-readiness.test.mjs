import {isPrisonEnvironment} from '../public/js/prison-config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isFishingTool,FISHING_TOOL_IDS} from '../public/js/game-tool-rules.js';
import {isTropicalIslandMap,tropicalIslandPlayUrl} from '../public/js/tropical-island-destination.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const readiness=section('  function gameplayControlsReady()','  setGameplayReadiness(false);');
const loadWorld=section('  async function loadById(','\n\n  let cachedAvatars');
const resetRoom=section('  function resetRoomConnection()','  function showConnectionFailure');
const joinRoom=section('  async function startRoomGameplay(','  async function warmGameDisplay');
const initialize=section('  function startRadToxGame()','  canvas.addEventListener(\'webglcontextlost\'');
const hostCommand=section('  async function serverCommand(','\n  let stickSprinting');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turns=async()=>{for(let index=0;index<6;index++)await Promise.resolve();};
function fixture(extra={}){
 const controls=new Map(['house-outside-button','house-world-button','house-environment-select','house-environment-list-toggle'].map(id=>[id,{disabled:false}])),events=[],readinessChanges=[],statuses=[];
 const reset=()=>{};
 const context=vm.createContext({
  console,URL,Promise,queueMicrotask,isPrisonEnvironment,prisonUI:{update(){},visible:()=>false},performance:{now:()=>1000},isFishingTool,isTropicalIslandMap,tropicalIslandPlayUrl,gameplayOverlayOpen:()=>false,shippingUI:{visible:()=>false,menuOpen:()=>false,update:reset,reset},shippingScene:{update:reset,reset},shippingPortScene:{update:reset,reset},shippingActivityAnnouncements:{update:reset,reset},fishingUI:{visible:()=>false,playing:()=>false,active:()=>false,open:()=>false,update:reset,reset},fishingScene:{update:reset,reset},fishingVRScreen:{setVisible:reset},releaseXRFishingInputs:reset,xrFishingSeatKey:null,xrFishingDesktopLook:null,fishingViewEnabled:false,gameActionLoading:()=>({begin:()=>({finish(){},fail(){}})}),gameplayAnnouncements:{say(){},update(){},reset},gameplayVoice:{reset},transportActivity:{update:reset},guideAudio:{enter:reset,leave:reset},fitnessUI:{visible:()=>false,update(){}},factoryUI:{visible:()=>false,update(){}},worldSupplyUI:{visible:()=>false,update(){},reset},factoryTestingUI:{visible:()=>false,update(){}},factoryLogisticsUI:{visible:()=>false,update(){},close(){}},factoryLogisticsXRMenu:false,xrGameControls:null,CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  document:{getElementById:id=>controls.get(id),dispatchEvent:event=>events.push(event)},window:{dispatchEvent:event=>events.push(event)},
  location:{href:'http://localhost/model-explorer.html?environment=muzikaz-airport&autoplay=1'},
  gameplayStarted:false,pendingFactoryTestingXRFrames:0,gameplayReadiness:null,multiplayerWorldLoading:false,worldLoadGeneration:1,worldNavigationGeneration:0,gameInitializationPromise:null,gameInitializationRevision:0,
  serverHostedRoom:true,guestSolo:false,residentWalkthrough:false,authoritativeClient:null,serverPlayerInitialized:false,activeEnvironment:{id:'muzikaz-airport'},
  factoryTestingVR:{reset,receive:reset,visible:()=>false,isActive:()=>false},funhouseVR:{reset,update:reset},resetFunhouseRideView:reset,funhouseRide:()=>null,funhouseAimRay:()=>({}),useFunhouseWorld:()=>false,funhouseWorldStation:null,funhouseRideView:null,funhouseServerAt:0,funhouseReceivedAt:0,currentFunhouseEquipment:()=>null,fireCarriedWater:()=>false,syncLocalClownAvatar:reset,funhouseWaterEffects:{receive:reset,reset},districtMap:{setReady:value=>readinessChanges.push(value)},mapQuestPrompts:{update:reset,close:reset},soloMapQuests:{relocate:reset},envLoader:{world:null},builderDecor:{},applyFactoryMachineActivity:reset,constructionUI:{update:reset},skiResortControls:{update:reset},deviceUI:{reset},landSaleUI:{reset},casinoUI:{reset},funhouseUI:{reset,receive:reset,visible:()=>false},clearFunhouseCostume:reset,playerIndicator:{},yachtGames:{reset},setStatus:message=>statuses.push(message),hideBasketballControls:reset,lockMenuInput:reset,
  scaleControl:{querySelectorAll:()=>[]},connectionBadge:{textContent:''},sharedInventory:{},ensurePlayAccess:async()=>({account:{}}),settingsUI:{restore:async()=>{}},choosePlayAccess:async()=>null,
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

test('private proving replies reach the native dashboard only while their issuing room remains current',async()=>{
 for(const stale of [false,true]){
  const reply=deferred(),received=[],{context}=commandFixture(reply,{factoryTestingVR:{receive:(...args)=>received.push(args)}});
  const pending=context.serverCommand('proving-status');if(stale)context.worldLoadGeneration++;
  const state={selfId:'testing-owner',result:{testing:{eligibleItems:[{id:'private-model',profileId:'accuracy'}]}}};reply.resolve(state);
  assert.equal(await pending,stale?false:state);assert.equal(received.length,stale?0:1);
  if(!stale){assert.equal(received[0][0],state);assert.equal(received[0][1],'testing-owner');assert.equal(received[0][2].id,'muzikaz-airport');}
 }
});

test('private freight replies hydrate only the current account room and stale failures stay silent',async()=>{
 for(const replacement of [null,'world','client']){
  const reply=deferred(),received=[],{context}=commandFixture(reply,{factoryLogisticsUI:{update:(...args)=>received.push(args)}});
  const pending=context.serverCommand('logistics-status');
  if(replacement==='world')context.worldLoadGeneration++;if(replacement==='client')context.authoritativeClient={ready:true};
  const state={selfId:'freight-owner',result:{logistics:{eligibleItems:[{id:'sealed-model'}],manifest:{id:'private-freight'}}}};reply.resolve(state);
  assert.equal(await pending,replacement?false:state);assert.equal(received.length,replacement?0:1);
  if(!replacement){assert.equal(received[0][0],state);assert.equal(received[0][1],'freight-owner');}
 }
 const reply=deferred(),{context}=commandFixture(reply);const pending=context.serverCommand('logistics-book');reply.reject(Error('Certification required.'));await assert.rejects(pending,/Certification required/);
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

test('resetting a room clears facility gates and machine controls before a retry',()=>{
 const panels=new Set(['prison','factory','supply','testing','logistics','fitness','ski','device','land','casino','funhouse','yacht','fishing','fishing-scene']);let machineHeld=true,stops=0,costumeClears=0;
 const facility=name=>({visible:()=>panels.has(name),update(snapshot){if(!snapshot)panels.delete(name);}});
 const {context}=fixture({gameplayStarted:true,serverPlayerInitialized:true,authoritativeClient:{ready:true,stop(){stops++;}},
  fishingUI:{reset:()=>panels.delete('fishing')},fishingScene:{reset:()=>panels.delete('fishing-scene')},prisonUI:facility('prison'),factoryUI:facility('factory'),worldSupplyUI:{reset:()=>panels.delete('supply')},factoryTestingUI:facility('testing'),factoryLogisticsUI:facility('logistics'),fitnessUI:facility('fitness'),constructionUI:{update(snapshot){if(!Object.keys(snapshot.players).length)machineHeld=false;}},
  skiResortControls:{update:()=>panels.delete('ski')},deviceUI:{reset:()=>panels.delete('device')},landSaleUI:{reset:()=>panels.delete('land')},casinoUI:{reset:()=>panels.delete('casino')},funhouseUI:{reset:()=>panels.delete('funhouse')},clearFunhouseCostume:()=>{costumeClears++;},yachtGames:{reset:()=>panels.delete('yacht')}
 });
 context.resetRoomConnection();
 assert.equal(panels.size,0,'old facility panels must not cover retry or suspend the replacement player');
 assert.equal(costumeClears,1,'a room reset removes the previous room costume');
 assert.equal(machineHeld,false);assert.equal(stops,1);assert.equal(context.authoritativeClient,null);assert.equal(context.gameplayControlsReady(),false);
 context.authoritativeClient={ready:true};context.serverPlayerInitialized=true;context.gameplayStarted=true;
 assert.equal(context.gameplayControlsReady(),true,'a confirmed replacement player can regain control');
});

test('transient connection recovery never locks navigation or changes map visibility',async()=>{
 const {context,controls,readinessChanges}=fixture({gameplayStarted:true,serverPlayerInitialized:true,authoritativeClient:{ready:true},fitnessUI:{visible:()=>true,update(){}}});
 context.setGameplayReadiness();context.authoritativeClient.ready=false;context.setGameplayReadiness();
 assert.equal(controls.get('house-world-button').disabled,false);
 assert.deepEqual(readinessChanges,[true],'transport status does not close the maps');
 // The gameplay renderer runs before connectAuthoritativeRoom confirms ready.
 // Exercise its real entry hook and the open training panel's early return
 // without constructing unrelated scene meshes.
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

test('map and automatic-route failures preserve their server reason for the map panel and allow a retry',async()=>{
 for(const action of ['map-access','vehicle-navigate']){
  const reply=deferred(),{context,statuses,client}=commandFixture(reply);
  const failed=context.serverCommand(action,{locationId:'tower'});
  reply.reject(Error('This location has no clear landing. Choose another location.'));
  await assert.rejects(failed,/no clear landing/);
  assert.match(statuses.at(-1),/no clear landing/);
  client.send=async()=>({result:{message:'Arrived at Tower.'}});
  assert.equal((await context.serverCommand(action)).result.message,'Arrived at Tower.');
 }
});

test('a joined room retains a selection until the connection recovers',async()=>{
 const reply=deferred(),connection=deferred(),{context,effects,statuses,client}=commandFixture(reply);const sent=[];
 client.ready=false;client.whenReady=()=>connection.promise;client.send=(action,fields)=>{sent.push({action,fields});return reply.promise;};
 const pending=context.serverCommand('map-access',{locationId:'court'});await turns();
 assert.equal(sent.length,0);assert.deepEqual(effects,[]);assert.match(statuses[0],/Reconnecting/);
 client.ready=true;connection.resolve(client);reply.resolve({result:{message:'Arrived'}});await pending;
 assert.deepEqual(sent,[{action:'map-access',fields:{locationId:'court'}}]);assert.deepEqual(effects,[['resident',false],['transport']]);
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

test('a boarded funhouse ride suppresses walking, jumping, sprinting and firing inputs',()=>{
 const calls=[],{context}=fixture({funhouseRide:()=>({status:'active'}),player:{yaw:1.25},serverCommand:()=>calls.push('command'),localWalkingActive:true,localWalkingView:{jump:()=>calls.push('jump')}});
 for(const name of ['serverInput','jump']){
  const start=source.indexOf('  '+(name==='jump'?'function jump()':'function serverInput()'));
  vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(context.serverInput())),{side:0,forward:0,lift:0,rudder:0,yaw:1.25,jump:false,sprint:false,firing:false});
 assert.equal(context.jump(),false);assert.deepEqual(calls,[]);
});

test('reticle attraction actions consume the primary action before vehicle or weapon firing',()=>{
 const calls=[],ray={controller:false};
 const {context}=fixture({funhouseAimRay:()=>ray,useFunhouseWorld:actual=>{assert.equal(actual,ray);calls.push('attraction');return true;},fireAircraft:()=>calls.push('fire')});
 const start=source.indexOf('  function shootAtReticle()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 assert.equal(context.shootAtReticle(),true);assert.deepEqual(calls,['attraction']);
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

test('native game redirects retain a selected atlas meeting point and play mode',async()=>{
 for(const game of ['hockey','arcade']){
  let destination;
  const {context}=fixture({gameplayStarted:true,serverHostedRoom:false,registry:{find:id=>({id})},canonicalWorldId:id=>id,isArcadeMap:()=>game==='arcade',isHockeyMap:()=>game==='hockey',location:{href:'http://localhost/model-explorer.html?mode=solo',assign:url=>{destination=new URL(url);}}});
  vm.runInContext(loadWorld,context);
  await context.loadById('selected-game',{meetingId:'meet-4-2'});
  assert.equal(destination.pathname,'/'+game+'.html');
  assert.equal(destination.searchParams.get('environment'),'selected-game');
  assert.equal(destination.searchParams.get('mode'),'solo');
  assert.equal(destination.searchParams.get('meet'),'meet-4-2');
 }
});

test('the island explorer entry opens the native solo resort before loading a shared room',async()=>{
 let destination;
 const {context}=fixture({gameplayStarted:true,serverHostedRoom:false,registry:{find:id=>({id,game:'tropical-island'})},canonicalWorldId:id=>id,location:{href:'http://localhost/model-explorer.html?mode=multiplayer',assign:url=>{destination=new URL(url);}}});
 vm.runInContext(loadWorld,context);
 await context.loadById('tropical-island');
 assert.equal(destination.pathname,'/tropical-island.html');
 assert.equal(destination.searchParams.get('environment'),'tropical-island');
 assert.equal(destination.searchParams.get('mode'),'solo');
 assert.equal(context.multiplayerWorldLoading,false);
});

test('choosing multiplayer from a ready solo map validates the current room before changing transport mode',async()=>{
 let selected=null;
 const {context}=fixture({gameplayStarted:true,guestSolo:true,serverHostedRoom:false,authoritativeClient:null,pickerPanel:{dialog:{close(){}}},library:{classList:{add(){}}},worldButton:{setAttribute(){}},replaceGameLocation(){},loadById:async id=>{assert.equal(context.requireGameplayReady(),true);assert.equal(context.serverHostedRoom,false,'the previous solo room remains current until the load begins');selected=id;}});
 const onJoin=section('onJoin:async env=>{','}});\n  }').slice('onJoin:'.length)+'}';
 vm.runInContext('globalThis.chooseDestination=('+onJoin+');',context);
 await context.chooseDestination({id:'public-commons',name:'Public Commons',multiplayer:true});
 assert.equal(selected,'public-commons');assert.equal(context.guestSolo,false);
});

test('a failed world selection reopens the picker so its error remains visible',async()=>{
 let reopened=0,collapsed=true;
 const {context}=fixture({gameplayStarted:true,serverHostedRoom:false,pickerPanel:{dialog:{close(){}},open(){reopened++;}},library:{classList:{add(){},remove(){collapsed=false;}}},worldButton:{setAttribute(){}},replaceGameLocation(){},loadById:async()=>{throw Error('Destination unavailable');}});
 const onJoin=section('onJoin:async env=>{','}});\n  }').slice('onJoin:'.length)+'}';
 vm.runInContext('globalThis.chooseDestination=('+onJoin+');',context);
 await assert.rejects(context.chooseDestination({id:'missing',name:'Missing'}),/Destination unavailable/);
 assert.equal(reopened,1);assert.equal(collapsed,false);
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

test('a confirmed player receives immediate local jump feedback while its server connection recovers',async()=>{
 const acknowledgement=deferred(),calls=[];
 const {context}=fixture({gameplayStarted:true,serverPlayerInitialized:true,authoritativeClient:{ready:false,requestInput:()=>calls.push('refresh')},localWalkingActive:true,localWalkingView:{jump:()=>calls.push('local-jump')},toxicBubbleSystem:{tool:'laser'},serverInput:()=>({forward:1}),serverCommand:(_action,fields)=>{assert.equal(fields.input.jump,true);calls.push('server-jump');return acknowledgement.promise;}});
 const start=source.indexOf('  function jump()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 const jumping=context.jump();assert.deepEqual(calls,['local-jump','server-jump']);
 acknowledgement.resolve();await jumping;assert.deepEqual(calls,['local-jump','server-jump','refresh']);
});


test('fishing sessions and modal panels suppress primary actions, and every tackle tool opens fishing without firing',()=>{
 const calls=[];let active=false,overlay=false;
 const {context}=fixture({gameplayStarted:true,authoritativeClient:{ready:true},serverPlayerInitialized:true,serverActors:{},serverVehicleId:null,isAircraft:()=>true,fireAircraft:()=>calls.push('fire'),toxicBubbleSystem:{tool:'laser'},gameplayOverlayOpen:()=>overlay,fishingUI:{active:()=>active,visible:()=>active,open:()=>{calls.push('fishing');return true;}}});
 const start=source.indexOf('  function shootAtReticle()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 active=true;assert.equal(context.shootAtReticle(),false);assert.deepEqual(calls,[]);
 active=false;overlay=true;assert.equal(context.shootAtReticle(),false);assert.deepEqual(calls,[]);
 overlay=false;for(const tool of FISHING_TOOL_IDS){context.toxicBubbleSystem.tool=tool;assert.equal(context.shootAtReticle(),false);}
 assert.deepEqual(calls,Array(FISHING_TOOL_IDS.length).fill('fishing'));
 context.toxicBubbleSystem.tool='laser';context.shootAtReticle();assert.equal(calls.at(-1),'fire','ordinary vehicle firing resumes after leaving fishing');
});


test('prison firing cannot open an activity or block movement',()=>{
 const calls=[];let overlay=false;
 const {context}=fixture({activeEnvironment:{id:'ironwood-prison',game:'prison'},gameplayOverlayOpen:()=>overlay,prisonUI:{near:()=>({id:'intake'}),open:id=>{calls.push(id);return true;}}});
 const start=source.indexOf('  function shootAtReticle()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
 assert.equal(context.shootAtReticle(),false);assert.deepEqual(calls,[]);
 context.gameplayStarted=true;context.serverPlayerInitialized=true;context.authoritativeClient={ready:true};
 assert.equal(context.shootAtReticle(),false);assert.deepEqual(calls,[]);
 overlay=true;assert.equal(context.shootAtReticle(),false);assert.deepEqual(calls,[]);
});


test('login restores saved audio preferences before joining and ignores a superseded map',async()=>{
 for(const replaced of [false,true]){
  const preferences=deferred();let connections=0;
  const client={ready:true,whenReady:async()=>{}};
  const {context}=fixture({settingsUI:{restore:()=>preferences.promise},connectAuthoritativeRoom:()=>{connections++;return client;}});
  vm.runInContext(joinRoom,context);
  const joining=context.startRoomGameplay();await turns();assert.equal(connections,0,'no guide-bearing snapshot before saved settings');
  if(replaced)context.worldLoadGeneration++;
  preferences.resolve();assert.equal(await joining,!replaced);assert.equal(connections,replaced?0:1);
 }
});
