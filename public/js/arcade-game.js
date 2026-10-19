import {createGameActionQueue} from './game-action-queue.js';
import {createGameSnapshotMotion} from './game-snapshot-motion.js';
import {mountXRGameControls} from './xr-game-controls.js';
import {legacyArcadeDestination} from './sports-worlds.js';
import {mountRadToxController} from './rad-tox-controller.js';
import {createArcadeMatch} from './arcade-match.js';
import {SharedGameInventory} from './shared-game-inventory.js';
import {ensurePlayAccess} from './play-access.js';
import * as T from '../vendor/three/three.module.min.js';
import {readGameCameraMode,writeGameCameraMode,nextGameCameraMode,isGameCameraToggleKey,normalizeGameCameraMode} from './game-camera.js';
import {createArcadePark,animateArcadePark} from './arcade-park.js';
import {createArcadeWalker,lookArcadeWalker,stepArcadeWalker,nearestArcadeInteraction} from './arcade-navigation.js';
import {createArcadeGamePresentation} from './arcade-3d-games.js';
import {applySportsSurfaces} from './sports-surfaces.js';
import {createArcadeClock,advanceArcadeClock,arcadePhysicsSteps,arcadePointer,basketballPosition,basketballRelease,arcadeAnimationSpeed} from './arcade-runtime.js';
import {arcadeSettings,arcadeAttractions,createArcadeSession,enterArcadeAttraction,exitArcadeAttraction,stepArcadeRide,arcadeRidePose,localArcadePoints,isArcadeMap} from './arcade-rules.js';
const host=document.documentElement.dataset.arcadeHost||'site';
let startupError='',mapName='Neon Junction — Arcade Park',loaded={},builderScene=null;
const launchParams=new URLSearchParams(location.search),environmentId=launchParams.get('environment')||'neon-junction',requestedPart=launchParams.get('part');let autoAttraction=launchParams.get('attraction'),launchPartId=null;
const legacyDestination=legacyArcadeDestination(environmentId);if(legacyDestination){const target=new URL(legacyDestination,host==='muzikaz'?location.href:(document.documentElement.dataset.apiBase||'https://muzikazmodelmarket.onrender.com/'));if(launchParams.has('mode'))target.searchParams.set('mode',launchParams.get('mode'));location.replace(target.href);}
async function loadMap(){
 const controller=new AbortController();let timeout;
 try{
  const request=window.MUZIKAZ_API?.fetch?window.MUZIKAZ_API.fetch('/api/environments',{timeout:6000,retries:0,signal:controller.signal}):fetch('/api/environments',{signal:controller.signal});
  const response=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('Map service unavailable'));},8000);})]);
  if(!response.ok)throw Error('Map service unavailable');
  const payload=await response.json(),maps=Array.isArray(payload.data)?payload.data:payload;
  const map=Array.isArray(maps)?maps.find(m=>m.id===environmentId):null;
  if(!map)throw Error('This arcade map is unavailable. Choose another game map.');
  const part=requestedPart&&map.builderScene?.objects?.find(object=>String(object.id)===requestedPart&&/^arcade-part-(hockey|shooting|basketball|air-hockey|billiards|train|coaster)$/.test(object.modelId));
  if(requestedPart&&!part)throw Error('This placed arcade attraction is unavailable. Open its map again.');
  if(!isArcadeMap(map)&&!part)throw Error('This arcade map is unavailable. Choose another game map.');
  loaded=part?.arcadeSettings||map.builderScene?.gameplay?.arcade||map.arcade||{};
  builderScene=map.builderScene||null;if(part){builderScene={...builderScene,objects:[part]};launchPartId=String(part.id);autoAttraction=part.modelId.slice('arcade-part-'.length);}
  mapName=map.name||mapName;
 }catch(error){
  if(environmentId!=='neon-junction'||requestedPart){startupError=error.message;loaded={enabled:[]};}
  // The built-in park is bundled with the game and remains playable offline.
 }finally{clearTimeout(timeout);}
}
if(host==='muzikaz')await loadMap();
else{try{loaded=JSON.parse(localStorage.getItem('neon-junction.config')||'{}');}catch{}}
if(startupError)document.querySelector('.intro p').textContent=startupError;
const config=arcadeSettings(loaded),session=createArcadeSession(config);let builderObjects=null,savedObjectsMessage='';document.title=mapName;

const $=s=>document.querySelector(s),attractions=arcadeAttractions(config),items=attractions.map(a=>[a.name,a.subtitle,a.icon,a.color,a.x,a.z]);
let total=0,seen=new Set(),sound=false,audio;try{total=localArcadePoints(localStorage.njscore)}catch{}function update(){ $('#tickets').innerHTML=String(total).padStart(4,'0')+' <small>PTS</small>';const available=availableAttractionIds();$('#visited').textContent=[...seen].filter(i=>available.has(attractions[i]?.id)).length+' / '+available.size+' attractions explored';try{localStorage.njscore=total}catch{}}update();if(host==='muzikaz'){$('#back-maps').hidden=false;$('#builder-link').hidden=false;$('#builder-link').href='environment-builder.html?layout=arcade-park&environment='+encodeURIComponent(environmentId);}else $('#park-settings-button').hidden=false;
function beep(f=500){if(!sound)return;audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=f;g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.13);o.start();o.stop(audio.currentTime+.14)}$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'♫ Sound on':'♫ Sound off';$('#sound').setAttribute('aria-pressed',sound);beep()};
const scene=new T.Scene();scene.background=new T.Color('#101a1c');scene.fog=new T.Fog('#101a1c',65,145);const camera=new T.PerspectiveCamera(43,innerWidth/innerHeight,.1,250);const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$('#world').appendChild(renderer.domElement);scene.add(new T.HemisphereLight(0xc3f4e4,0x242343,2.4));const sun=new T.DirectionalLight(0xffdfc1,3);sun.position.set(-15,40,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40});scene.add(sun);
items.forEach((it,i)=>{const b=document.createElement('button');b.dataset.attraction=attractions[i].id;b.style.setProperty('--c',it[3]);b.innerHTML=`<span class="num">0${i+1} ↗</span><span class="icon">${it[2]}</span><b>${it[0]}</b><small>${attractions[i].enabled?(i>4?'RIDE':'PLAY')+' · FREE':'CLOSED'}</small>`;b.disabled=!attractions[i].enabled;b.onclick=()=>selectFromMenu(i);$('#attractions').appendChild(b);});
const park=createArcadePark(config);for(const vehicle of [...park.trains,park.cart])vehicle.traverse(node=>{node.castShadow=false;});scene.add(park.root);const {trainCurve,coaster,trains,cart}=park;
const clickMeshes=[...park.clickMeshes];
if(host==='muzikaz'&&builderScene?.objects?.length){try{const {loadArcadeBuilderObjects}=await import('./arcade-builder-runtime.js');builderObjects=await loadArcadeBuilderObjects(builderScene,config);scene.add(builderObjects.root);for(const part of builderObjects.rideParts)animateArcadePark(part,0);clickMeshes.push(...builderObjects.clickMeshes);renderer.shadowMap.needsUpdate=true;if(builderObjects.diagnostics?.length){console.info('[Neon Junction]',builderObjects.diagnostics);savedObjectsMessage=builderObjects.diagnostics.length+' custom props could not load; other attractions remain available.';}}catch(error){console.warn('[Neon Junction] Some saved park objects could not load.',error);savedObjectsMessage='Saved park objects could not load. The built-in attractions remain available.';}}

function instanceRideSpeed(runtime){return arcadeAnimationSpeed(runtime?.animationEnabled,runtime?.animationSpeed);}
function availableAttractionIds(){const ids=new Set(config.enabled);for(const interaction of builderObjects?.interactions.values()||[])if(interaction.index<5||instanceRideSpeed(interaction.rideRuntime)>0)ids.add(attractions[interaction.index]?.id);ids.delete(undefined);return ids;}
function selectFromMenu(index){const interaction=!config.enabled.includes(attractions[index]?.id)?[...(builderObjects?.interactions.values()||[])].find(item=>item.index===index&&(index<5||instanceRideSpeed(item.rideRuntime)>0)):null;return select(index,interaction);}
function refreshAttractionButtons(){const available=availableAttractionIds();for(const [index,button] of [...document.querySelectorAll('#attractions button')].entries()){button.disabled=session.mode==='ride'||!available.has(button.dataset.attraction);button.querySelector('small').textContent=available.has(button.dataset.attraction)?(index>4?'RIDE':'PLAY')+' · FREE':'CLOSED';}}
for(const button of document.querySelectorAll('#attractions button'))button.disabled=true;
$('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=$('#camera-toggle').disabled=true;update();
await applySportsSurfaces(park.root,{theme:'arcade',renderer});
if(builderObjects)await applySportsSurfaces(builderObjects.root,{theme:'arcade',renderer});
const presentation=createArcadeGamePresentation({scene,park,config});
const walker=createArcadeWalker();
let cameraMode=readGameCameraMode('first-person'),explorationMode=cameraMode==='top-down'?'overview':'walk',nearby=null,activeInteraction=null;
let yaw=.62,pitch=.78,distance=61,drag=false,lastX,lastY,moved=0,ride=null,rideRuntime=null,rideConfig=null,ridePhase=null,trainT=0,coasterT=0,parkTime=0,lastParkRender=-Infinity;
const center=new T.Vector3(0,0,0),desired=new T.Vector3(),frameClock=createArcadeClock(performance.now());
const walkKeys=new Set(),touchKeys=new Set(),collisionBoxes=[],walkInteractions=[],walkSurfaces=[];
const bounds={minX:-26,maxX:26,minZ:-18,maxZ:18};
const uniqueInteractions=[...new Set(builderObjects?.interactions.values()||[])];
function visibleObject(object){while(object){if(!object.visible)return false;object=object.parent;}return true;}
function registerWalkInteraction(index,anchor,interaction=null){
 const local=index===5?new T.Vector3(12,0,8):index===6?new T.Vector3(20*(interaction?.config.coasterWidth||config.coasterWidth)/39,0,0):new T.Vector3(0,0,3.8);
 anchor.updateWorldMatrix(true,false);const point=anchor.localToWorld(local);
 walkInteractions.push({index,anchor,interaction,x:point.x,z:point.z,id:attractions[index].id,enabled:visibleObject(anchor)&&(index<5||!interaction?.rideRuntime||instanceRideSpeed(interaction.rideRuntime)>0)});
}
for(let i=0;i<attractions.length;i++)if(config.enabled.includes(attractions[i].id))registerWalkInteraction(i,park.parts[attractions[i].id]);
for(const interaction of uniqueInteractions)registerWalkInteraction(interaction.index,interaction.instance,interaction);
function collectFurniture(root){
 root.updateMatrixWorld(true);
 root.traverse(node=>{
  if(!node.isMesh||!visibleObject(node))return;
  let parent=node,part='',vehicle=false;while(parent){part||=parent.userData.arcadePart||'';vehicle||=/^ARCADE_(TRAIN_|COASTER_CAR)/.test(parent.name);parent=parent.parent;}
  if(vehicle||['ground','paths','train','rail-segment'].includes(part))return;
  const box=new T.Box3().setFromObject(node),size=box.getSize(new T.Vector3());
  if(node.geometry?.type==='BoxGeometry'&&size.y<.5&&size.x>2&&size.z>2&&box.max.y>=-.1&&box.max.y<=.9){
   node.geometry.computeBoundingBox();walkSurfaces.push({inverse:node.matrixWorld.clone().invert(),bounds:node.geometry.boundingBox.clone(),height:box.max.y});
  }
  if(box.min.y>1.2||box.max.y<.65||size.y<.45||size.x>8.5||size.z>8.5||size.x<.05||size.z<.05)return;
  collisionBoxes.push({minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z});
 });
}
collectFurniture(park.root);if(builderObjects)collectFurniture(builderObjects.root);
const ground=park.parts.ground;if(ground?.visible){const box=new T.Box3().setFromObject(ground);bounds.minX=box.min.x+.4;bounds.maxX=box.max.x-.4;bounds.minZ=box.min.z+.4;bounds.maxZ=box.max.z-.4;}
const visitorMarker=new T.Mesh(new T.RingGeometry(.27,.37,24),new T.MeshBasicMaterial({color:'#dcfa70',side:T.DoubleSide}));visitorMarker.name='ARCADE_VISITOR_MARKER';visitorMarker.rotation.x=-Math.PI/2;visitorMarker.visible=false;scene.add(visitorMarker);
const groundProbe=new T.Vector3();
function updateWalkerGround(){
 let height=.08;
 for(const surface of walkSurfaces){groundProbe.set(walker.x,surface.height,walker.z).applyMatrix4(surface.inverse);if(groundProbe.x>=surface.bounds.min.x&&groundProbe.x<=surface.bounds.max.x&&groundProbe.z>=surface.bounds.min.z&&groundProbe.z<=surface.bounds.max.z)height=Math.max(height,surface.height+.02);}
 walker.ground=height;
}
function syncCameraControls(){
 const label=cameraMode==='top-down'?'Top down':'First person',next=cameraMode==='top-down'?'First person':'Top down',button=$('#camera-toggle');
 button.textContent='View: '+label;button.title='Switch to '+next+' (V)';button.setAttribute('aria-label',button.title);button.dataset.gameCameraMode=cameraMode;
 button.disabled=ride!==null;if(ride!==null){button.title='Camera locked during ride';button.setAttribute('aria-label',button.title);}
 $('#explore').setAttribute('aria-pressed',String(cameraMode==='first-person'));$('#overview').setAttribute('aria-pressed',String(cameraMode==='top-down'));
 $('#walk-help').textContent=cameraMode==='top-down'?'WASD / arrows to move · Scroll to zoom · V to change view':'WASD / arrows · Drag to look · Shift to run · V to change view';
}
function setExploration(mode){
 explorationMode=mode;drag=false;walkKeys.clear();touchKeys.clear();
 document.body.classList.toggle('walking',mode==='walk');document.body.classList.toggle('top-down',mode==='overview');
 $('#walkhud').hidden=ride!==null||game!==null;syncCameraControls();lastParkRender=-Infinity;
}
function setCameraMode(mode){
 if(ride!==null)return false;
 cameraMode=normalizeGameCameraMode(mode);writeGameCameraMode(cameraMode);
 setExploration(cameraMode==='top-down'?'overview':'walk');
 if(game!==null)presentation.setCamera(camera,cameraMode);
 return true;
}
function reset(reason='exit'){
 exitArcadeAttraction(session,reason);ride=null;rideRuntime=null;rideConfig=null;ridePhase=null;drag=false;
 refreshAttractionButtons();
 $('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=$('#camera-toggle').disabled=false;
 document.body.classList.remove('riding');$('#ridehud').hidden=true;
 camera.up.set(0,1,0);setExploration(cameraMode==='top-down'?'overview':'walk');
}
$('#camera-toggle').onclick=()=>setCameraMode(nextGameCameraMode(cameraMode));
$('#overview').onclick=()=>setCameraMode('top-down');
$('#explore').onclick=()=>{if(setCameraMode('first-person'))toast('WASD or arrows to walk. Drag to look. Press E near an attraction.');};
let toastTimer;function toast(s){clearTimeout(toastTimer);$('#toast').textContent=s;$('#toast').style.opacity=1;toastTimer=setTimeout(()=>$('#toast').style.opacity=0,3500)}
if(savedObjectsMessage)toast(savedObjectsMessage);if(startupError)toast(startupError);
function select(i,interaction=null){
 if(!attractions[i]||game!==null)return false;
 const instanceRuntime=interaction?.rideRuntime,instanceConfig=interaction?.config;
 if(i>=5&&instanceRuntime&&instanceRideSpeed(instanceRuntime)===0){toast('This ride is paused in the builder. Choose another attraction.');return false;}
 const attractionId=attractions[i].id,attractionConfig=instanceConfig?arcadeSettings({...instanceConfig,enabled:[...new Set([...arcadeSettings(instanceConfig).enabled,attractionId])],parts:{...instanceConfig.parts,[attractionId]:{...instanceConfig.parts?.[attractionId],enabled:true}}}):config,previousConfig=session.config;
 session.config=attractionConfig;const entered=enterArcadeAttraction(session,attractions[i].id);session.config=previousConfig;
 if(!entered)return false;gameConfig=attractionConfig;activeInteraction=interaction;
 seen.add(i);update();beep();walkKeys.clear();touchKeys.clear();
 if(i<5){startGame(i);return true;}
 ride=i;rideRuntime=instanceRuntime;rideConfig=attractionConfig;drag=false;pressed.clear();
 for(const b of document.querySelectorAll('#attractions button'))b.disabled=true;
 $('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=$('#camera-toggle').disabled=true;
 document.body.classList.add('riding');$('#ridehud').hidden=false;$('#walkhud').hidden=true;$('#ridename').textContent=items[i][0];
 $('#rideinfo').textContent=i===5?'A full lap around the arcade park.':'Restraints locked. Get ready for the climb.';
 $('#ridetype').textContent=i===5?'SCENIC TOUR • ON BOARD':'THRILL RIDE • CAMERA LOCKED';syncCameraControls();
 frameClock.previous=performance.now();return true;
}
function interactNearby(){if(ride===null&&game===null&&nearby)select(nearby.index,nearby.interaction);}
$('#interact').onclick=interactNearby;
$('#exitride').onclick=()=>reset();
addEventListener('keydown',e=>{
 if(e.target.matches('input,select,textarea')||$('#park-settings').open)return;
 if(isGameCameraToggleKey(e)){e.preventDefault();setCameraMode(nextGameCameraMode(cameraMode));return;}
 if(e.key==='Escape'&&ride!==null){e.preventDefault();reset();return;}
 if(e.key==='Escape'&&game!==null){e.preventDefault();closeGame();return;}
 if(game!==null||ride!==null)return;
 if(e.code==='KeyE'||e.code==='Enter'&&!e.target.matches('button,a')){e.preventDefault();if(!e.repeat)interactNearby();return;}
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();walkKeys.add(e.code);}
});
addEventListener('keyup',e=>walkKeys.delete(e.code));
for(const button of document.querySelectorAll('[data-walk]')){
 button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touchKeys.add(button.dataset.walk);};
 button.onpointerup=button.onpointercancel=()=>touchKeys.delete(button.dataset.walk);
}
renderer.domElement.onpointerdown=e=>{if(ride!==null||game!==null)return;drag=true;moved=0;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};
renderer.domElement.onpointermove=e=>{if(!drag)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;moved+=Math.abs(dx)+Math.abs(dy);if(explorationMode==='walk')lookArcadeWalker(walker,dx,dy);else{yaw-=dx*.006;pitch=Math.max(.25,Math.min(1.3,pitch+dy*.004));}lastX=e.clientX;lastY=e.clientY;};
renderer.domElement.onpointerup=e=>{
 drag=false;if(moved>=6||ride!==null||game!==null)return;
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);
 for(const hit of ray.intersectObjects(clickMeshes,true)){
  if(!visibleObject(hit.object))continue;
  if(explorationMode==='walk'&&hit.distance>7)continue;
  let object=hit.object,interaction;while(object){interaction=builderObjects?.interactions.get(object);if(interaction||Number.isInteger(object.userData.index))break;object=object.parent;}
  const index=interaction?.index??object?.userData.index;if(Number.isInteger(index)&&select(index,interaction))break;
 }
};
renderer.domElement.onpointercancel=()=>{drag=false;};
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(ride===null&&game===null&&explorationMode==='overview')distance=Math.max(28,Math.min(85,distance+e.deltaY*.04))},{passive:false});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);lastParkRender=-Infinity;});
let slowDraws=0,quality='high';
function animate(now){

 const dt=advanceArcadeClock(frameClock,now,{paused:(document.hidden&&!renderer.xr.isPresenting)||$('#park-settings').open});
 if((document.hidden&&!renderer.xr.isPresenting)||$('#park-settings').open)return;
 xrControls.update(dt);vrRig.position.set(0,0,0);vrRig.rotation.set(0,0,0);
 parkTime+=dt;
 if(game!==null)updateGame(dt);
 if(ride===null&&game===null){
  const down=(...keys)=>keys.some(key=>walkKeys.has(key)||touchKeys.has(key)||controllerWalkKeys.has(key));
  const walkingYaw=walker.yaw;if(cameraMode==='top-down')walker.yaw=0;
  stepArcadeWalker(walker,dt,{forward:Number(down('KeyW','ArrowUp','forward'))-Number(down('KeyS','ArrowDown','back')),right:Number(down('KeyD','ArrowRight','right'))-Number(down('KeyA','ArrowLeft','left')),sprint:down('ShiftLeft','ShiftRight'),bounds,colliders:collisionBoxes});walker.yaw=walkingYaw;
  updateWalkerGround();nearby=nearestArcadeInteraction(walker,walkInteractions);
  $('#interact').hidden=!nearby;$('#nearby').textContent=nearby?'Enter / E · '+attractions[nearby.index].name:'Walk to an attraction';
 }
 if(ride!==null){let elapsed=dt*instanceRideSpeed(rideRuntime);while(elapsed>0&&session.ride){const step=Math.min(elapsed,.1);elapsed-=step;if(stepArcadeRide(session,step)){reset('complete');toast('Ride complete. Welcome back to the park!');break;}}}
 if(!renderer.xr.isPresenting&&now-lastParkRender<1000/30)return;lastParkRender=now;
 visitorMarker.visible=game===null&&ride===null&&cameraMode==='top-down';visitorMarker.position.set(walker.x,walker.ground+.04,walker.z);
 const phases=animateArcadePark(park.root,parkTime,config);trainT=phases.trainT;coasterT=phases.coasterT;
 for(const part of builderObjects?.rideParts||[]){const speed=arcadeAnimationSpeed(part.userData.arcadeAnimationEnabled,part.userData.arcadeAnimationSpeed);if(speed>0)animateArcadePark(part,parkTime*speed);}
 if(game!==null){
  const visual=liveGame?arcadeMotion.sample(now):null;presentation.update({game,gameElapsed,pointer,shot,puck,balls,targets,ended,attempts,opponent,basketball:basketballState,...(visual?{pointer:roomSnapshot?.role==='player'?liveInput:visual.pointer,shot:visual.shot,puck:visual.puck,balls:visual.balls,targets:visual.targets,opponent:visual.opponent,basketball:visual.basketball?{...visual.basketball,selfSlot:basketballState?.selfSlot}:null}:{}),cameraMode,difficulty:gameConfig.difficulty});presentation.setCamera(camera,cameraMode);
 }else if(ride!==null){
  const isTrain=ride===5,curve=(isTrain?rideRuntime?.trainCurve:rideRuntime?.coaster)||(isTrain?trainCurve:coaster);
  ridePhase=(parkTime*instanceRideSpeed(rideRuntime)/(isTrain?rideConfig.trainLapSeconds:rideConfig.coasterLapSeconds))%1;const pose=arcadeRidePose(isTrain?'train':'coaster',ridePhase),t=pose.phase;
  const rideScale=rideRuntime?.rideScale||config.parts?.[isTrain?'train':'coaster']?.scale||1,rideUp=rideRuntime?.rideUp||new T.Vector3(0,1,0);
  camera.up.copy(rideUp);desired.copy(curve.getPointAt(t)).addScaledVector(rideUp,pose.eyeHeight*rideScale);camera.position.copy(desired);
  if(isTrain){const scenic=curve.getPointAt(t).add(curve.getPointAt((t+.5)%1)).multiplyScalar(.5).addScaledVector(rideUp,(pose.eyeHeight+.8)*rideScale);camera.lookAt(scenic);}else camera.lookAt(curve.getPointAt((t+pose.lookAhead)%1).addScaledVector(rideUp,.9*rideScale));
  $('#rideprogress').value=session.ride?.progress||0;
 }else if(explorationMode==='walk'){
  if(camera.fov!==65){camera.fov=65;camera.updateProjectionMatrix();}
  camera.up.set(0,1,0);camera.position.set(walker.x,walker.ground+walker.eyeHeight,walker.z);
  desired.set(walker.x+Math.sin(walker.yaw)*Math.cos(walker.pitch),camera.position.y+Math.sin(walker.pitch),walker.z-Math.cos(walker.yaw)*Math.cos(walker.pitch));camera.lookAt(desired);
 }else{
  if(camera.fov!==52){camera.fov=52;camera.updateProjectionMatrix();}
  const height=Math.max(13,distance*.42,10/Math.max(.35,camera.aspect));
  // North stays at the top of the local map while the camera follows the same visitor.
  camera.up.set(0,0,-1);camera.position.set(walker.x,walker.ground+height,walker.z);desired.set(walker.x,walker.ground,walker.z);camera.lookAt(desired);
 }

 if(renderer.xr.isPresenting){const yaw=new T.Euler().setFromQuaternion(camera.quaternion,'YXZ').y;vrRig.position.copy(camera.position);vrRig.position.y-=1.6;vrRig.rotation.set(0,yaw,0);camera.position.set(0,0,0);camera.rotation.set(0,0,0);}
 const renderStart=performance.now();renderer.render(scene,camera);
 // Reduce fill cost once on a slow GPU, while simulation and timers retain real time.
 if(performance.now()-renderStart>70||dt>.12)slowDraws++;else slowDraws=Math.max(0,slowDraws-1);
 if(slowDraws>=4&&quality==='high'){quality='balanced';renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.shadowMap.enabled=false;renderer.setSize(innerWidth,innerHeight);}
}
camera.position.set(walker.x,walker.ground+walker.eyeHeight,walker.z);
const canvas=$('#play');let gameConfig=config,game=null,score=0,remaining=45,gameElapsed=0,ended=false,pointer={x:400,y:370},puck,balls=[],shot=null,targets=[],attempts=0;const pressed=new Set();const instructions=[`Move to aim. Click or tap to shoot past the moving goalie. Score in ${config.roundSeconds} seconds.`,`Click or tap moving targets. Smaller targets earn more points. ${config.roundSeconds} seconds.`,`Click or tap when the ball lines up with the hoop. ${config.roundSeconds} seconds.`,`Move your mallet with mouse, arrows or touch. Score in the top goal; defend the bottom.`,`Aim the white ball with mouse, arrows or touch. Click or Space shoots. Sink all six colored balls.`];
function startGame(i){if(!Number.isInteger(i)||i<0||i>4)return;game=i;score=0;remaining=gameConfig.roundSeconds;gameElapsed=0;ended=false;attempts=0;shot=null;pointer={x:400,y:370};pressed.clear();frameClock.previous=performance.now();puck={x:400,y:230,vx:130,vy:180};balls=Array.from({length:6},(_,j)=>({x:480+(j%3)*27,y:200+Math.floor(j/3)*27,vx:0,vy:0,c:['#eabd5f','#b09ae0','#e78d99','#79c8cf','#d2e881','#eea06e'][j],sunk:false}));balls.unshift({x:220,y:240,vx:0,vy:0,c:'#e8eee0',sunk:false});targets=Array.from({length:5},(_,j)=>({x:100+j*145,y:150+(j%2)*90,r:20+j*4,phase:j}));$('#gametitle').textContent=items[i][0];$('#instructions').textContent=(i===2&&gameConfig.basketballMode==='full'?'Full court: WASD / left stick moves · Space shoots · E passes · Q steals · X switches teammate · V changes view.':instructions[i]).replace(/\d+ seconds/g,gameConfig.roundSeconds+' seconds');$('#feedback').textContent='Ready. Make it count.';presentation.activate(i,{anchor:activeInteraction?.instance||park.parts[attractions[i].id],config:gameConfig});renderer.shadowMap.needsUpdate=true;applySportsSurfaces(presentation.root,{theme:'arcade',renderer});document.body.classList.add('playing');$('#walkhud').hidden=true;if(!$('#game').open)$('#game').show();updateGame(0);presentation.update({game,gameElapsed,pointer,shot,puck,balls,targets,ended,attempts,opponent,basketball:basketballState,cameraMode,difficulty:gameConfig.difficulty});presentation.setCamera(camera,cameraMode);lastParkRender=-Infinity;canvas.focus();openGameLobby(i);}
function award(n,msg){score+=n;total=localArcadePoints(total+n);session.points+=n;update();beep(650+n*4);$('#feedback').textContent=msg}function finish(){ended=true;$('#feedback').textContent='Round complete! '+score+' points earned. Play again?';beep(300)}function closeGame(){leaveSharedGame();const previous=game;game=null;shot=null;pressed.clear();presentation.deactivate();renderer.shadowMap.needsUpdate=true;document.body.classList.remove('playing');camera.up.set(0,1,0);setExploration(explorationMode);if($('#game').open)$('#game').close();exitArcadeAttraction(session);frameClock.previous=performance.now();lastParkRender=-Infinity;if(previous!==null)$('#attractions button[data-attraction="'+attractions[previous].id+'"]').focus();}
$('#closegame').onclick=closeGame;
$('#game').addEventListener('cancel',e=>{e.preventDefault();closeGame();});
$('#game').addEventListener('close',()=>{if(game!==null&&!$('#game').open)closeGame();});
$('#restart').onclick=()=>{if(game!==null)void startRound(true);};
function pos(e){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const hit=presentation.pointer((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2,camera);if(hit){pointer=arcadePointer(hit.x,hit.y);if(liveGame)liveInput={...pointer};}}
canvas.onpointermove=pos;
canvas.onpointerdown=e=>{if(e.button!==0&&e.pointerType!=='touch')return;e.preventDefault();pos(e);canvas.focus();try{canvas.setPointerCapture(e.pointerId);}catch{}action();};
canvas.onkeydown=e=>{const aliases={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};const key=aliases[e.key.toLowerCase()]||e.key;if(basketballState&&['e','q','x'].includes(e.key.toLowerCase())){e.preventDefault();if(!e.repeat)action(e.key.toLowerCase()==='e'?'pass':e.key.toLowerCase()==='x'?'switch':'steal');return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(key)){e.preventDefault();if(key===' '||key==='Enter'){if(!e.repeat)action();}else pressed.add(key);}};
canvas.onkeyup=e=>pressed.delete(({w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'})[e.key.toLowerCase()]||e.key);
canvas.onblur=()=>pressed.clear();
addEventListener('blur',()=>{pressed.clear();walkKeys.clear();touchKeys.clear();drag=false;});
document.addEventListener('visibilitychange',()=>{frameClock.previous=performance.now();pressed.clear();walkKeys.clear();touchKeys.clear();drag=false;});
$('#park-settings-button').onclick=()=>{if(ride!==null)return;const form=$('#park-settings');for(const input of form.querySelectorAll('[name]'))input.value=config[input.name]??'';form.showModal();};
$('#park-config-form').onsubmit=e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const next={...config};for(const input of $('#park-settings').querySelectorAll('[name]'))next[input.name]=input.value;try{localStorage.setItem('neon-junction.config',JSON.stringify(arcadeSettings(next)));location.reload();}catch{$('#settings-status').textContent='This browser cannot save local park settings.';}};
// Shared lobby and simulation: entering an attraction never starts its clock.
const arcadeMotion=createGameSnapshotMotion({duration:100,snapDistance:180});
const pendingActions=createGameActionQueue();
function drainAction(){const next=pendingActions.shift();if(next)action(next);}
const roomApi=new SharedGameInventory();let roomSession=null,roomSnapshot=null,localMatch=null,gameStarted=false,roomBusy=false,roomPoll=0,gameGeneration=0,basketballState=null,localSlot=0,controllerMove={x:0,y:0},liveGame=false,localSpectator=false,liveInput={x:400,y:370},opponent=null;
const lobby=document.createElement('details');lobby.id='game-lobby';lobby.innerHTML='<summary>Start game · server &amp; player setup</summary><label>Play mode <select id="game-mode"><option value="multiplayer">Live multiplayer</option><option value="solo">Solo with AI</option><option value="solo-ai">AI vs AI · watch</option><option value="spectator">Spectate live game</option></select></label> <label>Player spot <select id="game-slot"><option value="">Any available AI spot</option><option value="0">Player 1</option><option value="1">Player 2</option></select></label><fieldset id="game-setup"><legend>New game setup · first player / solo</legend><label>Basketball <select id="basketball-mode"><option value="full">Full court · team game</option><option value="shooting">Shooting challenge</option></select></label><label>Players per basketball team <select id="team-size"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label><label>AI difficulty <select id="game-difficulty"><option value="easy">Relaxed</option><option value="normal">Normal</option></select></label><label>Round / quarter seconds <input id="game-seconds" type="number" min="15" max="180" value="60"></label><label><input id="ai-fill" type="checkbox" checked> AI fills unclaimed team positions</label></fieldset> <button id="join-game">Join server / prepare solo</button> <button id="start-round" hidden>Start game</button> <button id="spectate-game">Spectate</button><p id="room-status" role="status">Choose Solo for local play or Live multiplayer to connect. Join first, then Start game.</p><p id="room-roster"></p><p>WASD / arrows move aim · Pointer / touch aim · Space / Enter / click act · V changes view · Escape leaves. Players take turns; air hockey moves both mallets live.</p>';
$('#game').insertBefore(lobby,$('.scorebar'));
const status=message=>$('#room-status').textContent=message;
function openGameLobby(i){arcadeMotion.reset();lobby.open=true;basketballState=null;localSlot=0;$('#basketball-mode').value=gameConfig.basketballMode;$('#team-size').value=String(gameConfig.teamSize);$('#game-difficulty').value=gameConfig.difficulty;$('#game-seconds').value=i===2?gameConfig.periodSeconds:gameConfig.roundSeconds;$('#ai-fill').checked=gameConfig.aiFill;$('#game-setup').disabled=false;refreshPlayerSlots();gameGeneration++;localMatch=createArcadeMatch(i,gameConfig);gameStarted=false;roomSnapshot=null;liveGame=false;liveInput={x:400,y:370};localSpectator=false;$('#start-round').hidden=true;$('#game-mode').value=launchParams.get('mode')||'multiplayer';if(!['solo','solo-ai','multiplayer','spectator'].includes($('#game-mode').value))$('#game-mode').value='multiplayer';status('Choose Join or Spectate. Start game begins the round.');$('#room-roster').textContent='Unclaimed spots are filled by AI.';remaining=gameConfig.roundSeconds;$('#timer').textContent='Waiting to start';}
async function roomCommand(action,fields={}){roomSession ||= await roomApi.roomSession();const body=JSON.stringify({action,game,...fields}),request=()=>roomApi.api('/api/rooms/'+encodeURIComponent(environmentId)+'/arcade',{method:'POST',headers:{'X-CSRF-Token':roomSession.csrfToken},body});try{return await request();}catch(error){if(error.code!=='CSRF_INVALID')throw error;roomSession=await roomApi.roomSession();return request();}}
function applyMatch(value){basketballState=value.basketball?{...value.basketball,selfSlot:liveGame?roomSnapshot?.slots.findIndex(s=>s.actor===roomSnapshot.selfId):localSpectator?-1:localSlot}:null;if(!liveGame&&!localSpectator&&gameStarted){const earned=Math.max(0,value.score-score);if(earned){total=localArcadePoints(total+earned);session.points+=earned;update();}}({score,remaining,gameElapsed,ended,attempts,shot,puck,balls,targets,opponent}=value);if(liveGame)pointer={...value.pointer};$('#feedback').textContent=value.feedback;$('#gamescore').textContent=basketballState?'HOME '+basketballState.teamScore[0]+' — '+basketballState.teamScore[1]+' VISITORS':'SCORE '+score;$('#timer').textContent=gameStarted?(basketballState?(basketballState.period>4?'OT'+(basketballState.period-4):'Q'+basketballState.period)+' · ':'')+Math.ceil(remaining)+'s'+(basketballState?' · Shot '+Math.ceil(basketballState.shotClock):''):'Waiting to start';$('#game').classList.toggle('round-ended',ended);}
function acceptRoom(value){arcadeMotion.push(value.state,performance.now());const wasStarted=gameStarted;roomSnapshot=value;if(value.config)gameConfig=value.config;$('#game-setup').disabled=true;refreshPlayerSlots(value.slots);gameStarted=value.started;if(gameStarted&&!wasStarted)lobby.open=false;applyMatch(value.state);$('#start-round').hidden=value.role!=='player'||value.host!==value.selfId||value.started;$('#room-roster').textContent=value.slots.map((s,i)=>'Player '+(i+1)+': '+s.name+(s.actor===value.selfId?' (you)':'')).join(' · ');status(value.role==='spectator'?'Spectating live game. Join an available spot to play.':!value.started?'Joined. Waiting for the host to press Start game.':value.state.ended?'Round complete. Host can restart.':value.state.basketball?'Live team game · AI fills unclaimed spots.':'Playing · Player '+(value.turn+1)+' turn');$('#restart').disabled=value.role!=='player'||value.host!==value.selfId||!value.state.ended;}
async function joinSharedGame(spectate=false){const requestedGeneration=gameGeneration;while(roomBusy){await new Promise(resolve=>setTimeout(resolve,20));if(requestedGeneration!==gameGeneration)return;}roomBusy=true;const generation=gameGeneration;try{const mode=spectate?'spectator':$('#game-mode').value;if(mode==='solo'||mode==='solo-ai'){if(liveGame)await roomCommand('leave');liveGame=false;roomSnapshot=null;localSpectator=mode==='solo-ai';gameStarted=false;readGameSetup();localMatch=createArcadeMatch(game,gameConfig);localMatch.setRoster?.(localSpectator?[]:[{actor:'local',name:'You'}]);$('#start-round').hidden=false;$('#restart').disabled=false;status('Solo ready. Press Start game.');return;}status('Checking access to the live server…');const access=await ensurePlayAccess(roomApi);if(!access||generation!==gameGeneration)return;status('Connecting to the selected game…');roomSession=null;readGameSetup();const slot=$('#game-slot').value,value=await roomCommand(mode==='spectator'?'spectate':'join',{...(slot===''?{}:{slot:Number(slot)}),settings:gameConfig});if(generation!==gameGeneration)return;liveGame=true;acceptRoom(value);}catch(error){status(error.message);}finally{roomBusy=false;}}
async function startRound(restart=false){const generation=gameGeneration;while(roomBusy){await new Promise(resolve=>setTimeout(resolve,20));if(generation!==gameGeneration)return;}roomBusy=true;try{if(liveGame){const value=await roomCommand(restart?'restart':'start');if(generation!==gameGeneration)return;acceptRoom(value);}else {if(!localMatch)return;readGameSetup();localMatch=createArcadeMatch(game,gameConfig);localMatch.setRoster?.(localSpectator?[]:[{actor:'local',name:'You'}]);gameStarted=true;lobby.open=false;$('#start-round').hidden=true;status('Solo round in progress.');$('#restart').disabled=false;}canvas.focus();}catch(error){status(error.message);}finally{roomBusy=false;}}
function leaveSharedGame(){pendingActions.clear();const leavingGame=game,wasLive=liveGame;gameGeneration++;liveGame=false;gameStarted=false;localMatch=null;roomSnapshot=null;if(wasLive)void roomCommand('leave',{game:leavingGame}).catch(()=>{});}
function action(kind='shoot'){if(localSpectator)return;if(kind==='switch'&&basketballState){if(liveGame){if(roomBusy){pendingActions.push('switch');return;}if(!roomBusy){const generation=gameGeneration;roomBusy=true;void roomCommand('switch').then(value=>{if(generation===gameGeneration)acceptRoom(value);}).catch(error=>status(error.message)).finally(()=>{roomBusy=false;drainAction();});}}else{const team=basketballState.players[localSlot].team;localSlot=basketballState.players.find(p=>p.team===team&&!p.human)?.id??localSlot;localMatch.setRoster(basketballState.players.map(p=>p.id===localSlot?{actor:'local',name:'You'}:{}));applyMatch(localMatch.snapshot());}return;}if(game===null||!gameStarted||ended||document.hidden)return;if(liveGame){if(roomSnapshot?.role!=='player')return;if(roomBusy){pendingActions.push(kind);return;}const generation=gameGeneration;roomBusy=true;void roomCommand('action',{input:gameInput(),kind}).then(value=>{if(generation===gameGeneration)acceptRoom(value);}).catch(error=>status(error.message)).finally(()=>{roomBusy=false;drainAction();});}else {localMatch.input(gameInput(),localSlot);localMatch.action(localSlot,kind);applyMatch(localMatch.snapshot());}}
function updateGame(dt){if(game===null||!localMatch)return;const base=liveGame?liveInput:pointer;const desired=arcadePointer(base.x+((pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0))*360*dt,base.y+((pressed.has('ArrowDown')?1:0)-(pressed.has('ArrowUp')?1:0))*360*dt);if(liveGame)liveInput=desired;else pointer=desired;
 if(liveGame){const now=performance.now();if(!roomBusy&&now-roomPoll>100){roomPoll=now;roomBusy=true;const generation=gameGeneration;void roomCommand(roomSnapshot?.role==='spectator'?'watch':'input',{input:document.hidden?{x:400,y:370,moveX:0,moveY:0}:gameInput()}).then(value=>{if(generation===gameGeneration)acceptRoom(value);}).catch(error=>status('Connection interrupted: '+error.message)).finally(()=>{roomBusy=false;drainAction();});}return;}
 if(gameStarted){localMatch.input(gameInput(),localSlot);if(localSpectator&&!basketballState&&Math.floor(gameElapsed/1.2)!==Math.floor((gameElapsed+dt)/1.2))localMatch.action();localMatch.step(dt);applyMatch(localMatch.snapshot());}else $('#timer').textContent='Waiting to start';}
setInterval(()=>{if(document.hidden&&liveGame&&game!==null)updateGame(0);},1000);
let lobbyTask=false;async function lobbyOperation(run){if(lobbyTask)return;lobbyTask=true;lobby.setAttribute('aria-busy','true');const buttons=['join-game','spectate-game','start-round'].map(id=>$('#'+id));buttons.forEach(button=>button.disabled=true);try{await run();}finally{lobbyTask=false;lobby.setAttribute('aria-busy','false');buttons.forEach(button=>button.disabled=false);}}
$('#join-game').onclick=()=>lobbyOperation(()=>joinSharedGame());$('#spectate-game').onclick=()=>lobbyOperation(()=>joinSharedGame(true));$('#start-round').onclick=()=>lobbyOperation(()=>startRound());
for(const button of document.querySelectorAll('[data-game-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);pressed.add(button.dataset.gameKey);};button.onpointerup=button.onpointercancel=()=>pressed.delete(button.dataset.gameKey);}

refreshAttractionButtons();$('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=$('#camera-toggle').disabled=false;
window.NeonJunction=Object.freeze({snapshot:()=>({mode:session.mode,attraction:session.attraction,ride:session.ride?{...session.ride}:null,game,score,remaining,gameElapsed,ended,attempts,pointer:{...pointer},shot:shot?{...shot}:null,basketball:basketballState,points:total,visited:[...seen],camera:camera.position.toArray(),cameraUp:camera.up.toArray(),cameraQuaternion:camera.quaternion.toArray(),cameraFov:camera.fov,cameraAspect:camera.aspect,trainT,coasterT,ridePhase,viewMode:game!==null?'game':ride!==null?'ride':explorationMode,cameraMode,cameraLocked:ride!==null,playerPosition:[walker.x,walker.ground+walker.eyeHeight,walker.z],walking:{...walker,nearby:nearby?.id||null,colliders:collisionBoxes.length},presentation:presentation.snapshot(),graphics:{park:park.root.userData.sportsSurfaceStatus||null,builder:builderObjects?.root.userData.sportsSurfaceStatus||null,game:presentation.root?.userData.sportsSurfaceStatus||null},render:{fps:30,pixelRatio:renderer.getPixelRatio(),quality,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},puck:puck?{...puck}:null,balls:balls.map(b=>({...b})),targets:targets.map(t=>({...t}))}),ready:true});
setExploration(cameraMode==='top-down'?'overview':'walk');
const autoIndex=attractions.findIndex(attraction=>attraction.id===autoAttraction);
if(autoIndex>=0&&!startupError){const interaction=launchPartId?[...(builderObjects?.interactions.values()||[])].find(item=>item.objectId===launchPartId):null;if(interaction)select(autoIndex,interaction);else selectFromMenu(autoIndex);}
const vrRig=new T.Group();scene.add(vrRig);vrRig.add(camera);
async function arcadeVRStart(mode){if(game===null)throw Error('Select a park game first.');$('#game-mode').value=mode;if(mode==='multiplayer'||mode==='spectator'){try{await roomApi.session();}catch(error){if(error.status!==401)throw error;await roomApi.api('/api/access/guest',{method:'POST',body:'{}'});}}await joinSharedGame(mode==='spectator');if((mode==='multiplayer'||mode==='spectator')&&!liveGame)throw Error($('#room-status').textContent||'Live room could not be joined.');if(mode!=='spectator'&&(!liveGame||roomSnapshot?.host===roomSnapshot?.selfId)){await startRound();if(!gameStarted)throw Error($('#room-status').textContent||'The round could not start.');}}
const xrControls=mountXRGameControls({renderer,scene,camera,rig:vrRig,parent:document.body,status:message=>toast(message),onEnter:()=>setCameraMode('first-person'),onExit:()=>{controllerMove={x:0,y:0};controllerWalkKeys.clear();},onMove:(axis,dt)=>{controllerMove=axis;controllerWalkKeys.clear();if(game!==null&&!basketballState){const base=liveGame?liveInput:pointer,next=arcadePointer(base.x+axis.x*360*dt,base.y+axis.y*360*dt);if(liveGame)liveInput=next;else pointer=next;}if(game===null){if(axis.y<-.15)controllerWalkKeys.add('forward');if(axis.y>.15)controllerWalkKeys.add('back');if(axis.x<-.15)controllerWalkKeys.add('left');if(axis.x>.15)controllerWalkKeys.add('right');}},onLook:(axis,dt)=>{if(game!==null){const base=liveGame?liveInput:pointer,next=arcadePointer(base.x+axis.x*440*dt,base.y+axis.y*440*dt);if(liveGame)liveInput=next;else pointer=next;}},snapTurn:()=>game===null,onTurn:angle=>{if(game===null)walker.yaw+=angle;},onTrigger:(hand,ray)=>{if(game===null){interactNearby();return;}if(!gameStarted){xrControls.openMenu();return;}const aim=presentation.rayPointer(ray.origin,ray.direction);if(aim){if(liveGame)liveInput={...liveInput,...aim};else pointer={...pointer,...aim};}action(hand==='left'&&basketballState?'pass':'shoot');},onGrip:hand=>action(hand==='left'?'steal':'switch'),onAction:name=>game===null?interactNearby():action(name==='switch'?'switch':'pass'),menuItems:()=>game===null?[
 ...attractions.map((attraction,index)=>({label:(index>4?'Board ':'Play ')+attraction.name,run:()=>{if(ride!==null)reset();selectFromMenu(index);}})),
 {label:'Sound '+(sound?'on':'off'),run:()=>$('#sound').click()},{label:'Exit ride',run:()=>reset()},{label:'Exit VR',run:()=>xrControls.endSession()}
]:[
 {label:'Score '+score+' · '+Math.ceil(Math.max(0,remaining))+' seconds',run:()=>{}},
 {label:'Start solo vs AI',run:()=>arcadeVRStart('solo')},{label:'Join live · guest / current account',run:()=>arcadeVRStart('multiplayer')},
 {label:'Team size: '+$('#team-size').value,run:()=>{$('#team-size').selectedIndex=($('#team-size').selectedIndex+1)%$('#team-size').options.length;refreshPlayerSlots();}},{label:'AI fills open spots: '+($('#ai-fill').checked?'on':'off'),run:()=>{$('#ai-fill').checked=!$('#ai-fill').checked;}},{label:'Difficulty: '+$('#game-difficulty').value,run:()=>{$('#game-difficulty').selectedIndex=($('#game-difficulty').selectedIndex+1)%$('#game-difficulty').options.length;}},{label:'Player spot: '+$('#game-slot').selectedOptions[0].textContent,run:()=>{$('#game-slot').selectedIndex=($('#game-slot').selectedIndex+1)%$('#game-slot').options.length;}},
 {label:ended?'Restart completed round · host':'Start shared round · host',run:async()=>{await startRound(ended);if(!gameStarted)throw Error($('#room-status').textContent||'Wait for the host to start.');}},{label:'Spectate this game',run:()=>arcadeVRStart('spectator')},
 {label:'Shoot / play',run:()=>action()},{label:'Pass',run:()=>action('pass')},{label:'Steal',run:()=>action('steal')},{label:'Switch player',run:()=>action('switch')},
 {label:'Return to park',run:closeGame},{label:'Exit VR',run:()=>xrControls.endSession()}
]});
renderer.setAnimationLoop(animate);

const controllerWalkKeys=new Set();
mountRadToxController({screenActions:true,visible:()=>!renderer.xr.isPresenting&&ride===null,onMatch:()=>{if(game!==null){lobby.open=true;$('#game-mode').focus();}else interactNearby();},onExit:()=>{if(game!==null)closeGame();},enabled:()=>!renderer.xr.isPresenting&&ride===null&&(game===null||gameStarted&&!localSpectator&&(!liveGame||roomSnapshot?.role==='player')),onMove:(axis,dt)=>{controllerMove=axis;controllerWalkKeys.clear();if(game===null){if(axis.y<-.15)controllerWalkKeys.add('forward');if(axis.y>.15)controllerWalkKeys.add('back');if(axis.x<-.15)controllerWalkKeys.add('left');if(axis.x>.15)controllerWalkKeys.add('right');}else if(dt>0&&!basketballState){const base=liveGame?liveInput:pointer;const next=arcadePointer(base.x+axis.x*360*dt,base.y+axis.y*360*dt);if(liveGame)liveInput=next;else pointer=next;}},onLook:(axis,dt)=>{if(game===null){if(explorationMode==='walk')lookArcadeWalker(walker,axis.x*350*dt,axis.y*250*dt);else{yaw-=axis.x*2*dt;pitch=Math.max(.25,Math.min(1.3,pitch+axis.y*dt));}}else{const base=liveGame?liveInput:pointer;const next=arcadePointer(base.x+axis.x*440*dt,base.y+axis.y*440*dt);if(liveGame)liveInput=next;else pointer=next;}},onShoot:()=>game===null?interactNearby():action(),onView:()=>setCameraMode(nextGameCameraMode(cameraMode)),buttons:[{primary:true,label:'Pass · E',when:()=>!!basketballState,tap:()=>action('pass')},{primary:true,label:'Steal · Q',when:()=>!!basketballState,tap:()=>action('steal')},{primary:true,label:'Switch · X',when:()=>!!basketballState,tap:()=>action('switch')},{primary:true,label:'Join / interact · E',when:()=>game===null,tap:interactNearby},{label:'Leave · Esc',when:()=>game!==null,tap:()=>{if(game!==null)closeGame();}}]});

function readGameSetup(){gameConfig=arcadeSettings({...gameConfig,basketballMode:$('#basketball-mode').value,teamSize:Number($('#team-size').value),periodSeconds:Number($('#game-seconds').value),roundSeconds:Number($('#game-seconds').value),aiFill:$('#game-mode').value==='solo-ai'||$('#ai-fill').checked,difficulty:$('#game-difficulty').value});}
function refreshPlayerSlots(slots=null){const signature=slots?JSON.stringify(slots.map(slot=>[slot.actor,slot.name]))+game:'';if(slots&&refreshPlayerSlots.signature===signature)return;refreshPlayerSlots.signature=signature;const select=$('#game-slot'),value=select.value,count=slots?.length||(game===2&&$('#basketball-mode').value==='full'?Number($('#team-size').value)*2:2);select.replaceChildren(new Option('Any available AI spot',''));for(let i=0;i<count;i++){const team=i<(slots?count/2:Number($('#team-size').value))?'Home':'Visitors';select.add(new Option((game===2?team+' ':'')+'Player '+(i+1)+(slots?' · '+slots[i].name:''),String(i)));}if([...select.options].some(o=>o.value===value))select.value=value;}
function gameInput(){if(!basketballState)return liveGame?liveInput:pointer;const sign=basketballState.players[basketballState.selfSlot]?.team===1?-1:1;return {...(liveGame?liveInput:pointer),moveX:((pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0)+controllerMove.x)*sign,moveY:((pressed.has('ArrowDown')?1:0)-(pressed.has('ArrowUp')?1:0)+controllerMove.y)*sign};}
$('#team-size').onchange=()=>refreshPlayerSlots();$('#basketball-mode').onchange=()=>refreshPlayerSlots();
