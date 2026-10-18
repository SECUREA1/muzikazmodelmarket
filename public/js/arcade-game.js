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
 if(e.code==='KeyE'){e.preventDefault();if(!e.repeat)interactNearby();return;}
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
 requestAnimationFrame(animate);
 const dt=advanceArcadeClock(frameClock,now,{paused:document.hidden||$('#park-settings').open});
 if(document.hidden||$('#park-settings').open)return;
 parkTime+=dt;
 if(game!==null)updateGame(dt);
 if(ride===null&&game===null){
  const down=(...keys)=>keys.some(key=>walkKeys.has(key)||touchKeys.has(key));
  const walkingYaw=walker.yaw;if(cameraMode==='top-down')walker.yaw=0;
  stepArcadeWalker(walker,dt,{forward:Number(down('KeyW','ArrowUp','forward'))-Number(down('KeyS','ArrowDown','back')),right:Number(down('KeyD','ArrowRight','right'))-Number(down('KeyA','ArrowLeft','left')),sprint:down('ShiftLeft','ShiftRight'),bounds,colliders:collisionBoxes});walker.yaw=walkingYaw;
  updateWalkerGround();nearby=nearestArcadeInteraction(walker,walkInteractions);
  $('#interact').hidden=!nearby;$('#nearby').textContent=nearby?'E · '+attractions[nearby.index].name:'Walk to an attraction';
 }
 if(ride!==null){let elapsed=dt*instanceRideSpeed(rideRuntime);while(elapsed>0&&session.ride){const step=Math.min(elapsed,.1);elapsed-=step;if(stepArcadeRide(session,step)){reset('complete');toast('Ride complete. Welcome back to the park!');break;}}}
 if(now-lastParkRender<1000/30)return;lastParkRender=now;
 visitorMarker.visible=game===null&&ride===null&&cameraMode==='top-down';visitorMarker.position.set(walker.x,walker.ground+.04,walker.z);
 const phases=animateArcadePark(park.root,parkTime,config);trainT=phases.trainT;coasterT=phases.coasterT;
 for(const part of builderObjects?.rideParts||[]){const speed=arcadeAnimationSpeed(part.userData.arcadeAnimationEnabled,part.userData.arcadeAnimationSpeed);if(speed>0)animateArcadePark(part,parkTime*speed);}
 if(game!==null){
  presentation.update({game,gameElapsed,pointer,shot,puck,balls,targets,ended,attempts,difficulty:gameConfig.difficulty});presentation.setCamera(camera,cameraMode);
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

 const renderStart=performance.now();renderer.render(scene,camera);
 // Reduce fill cost once on a slow GPU, while simulation and timers retain real time.
 if(performance.now()-renderStart>70||dt>.12)slowDraws++;else slowDraws=Math.max(0,slowDraws-1);
 if(slowDraws>=4&&quality==='high'){quality='balanced';renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.shadowMap.enabled=false;renderer.setSize(innerWidth,innerHeight);}
}
camera.position.set(walker.x,walker.ground+walker.eyeHeight,walker.z);
const canvas=$('#play');let gameConfig=config,game=null,score=0,remaining=45,gameElapsed=0,ended=false,pointer={x:400,y:370},puck,balls=[],shot=null,targets=[],attempts=0;const pressed=new Set();const instructions=[`Move to aim. Click or tap to shoot past the moving goalie. Score in ${config.roundSeconds} seconds.`,`Click or tap moving targets. Smaller targets earn more points. ${config.roundSeconds} seconds.`,`Click or tap when the ball lines up with the hoop. ${config.roundSeconds} seconds.`,`Move your mallet with mouse, arrows or touch. Score in the top goal; defend the bottom.`,`Aim the white ball with mouse, arrows or touch. Click or Space shoots. Sink all six colored balls.`];
function startGame(i){if(!Number.isInteger(i)||i<0||i>4)return;game=i;score=0;remaining=gameConfig.roundSeconds;gameElapsed=0;ended=false;attempts=0;shot=null;pointer={x:400,y:370};pressed.clear();frameClock.previous=performance.now();puck={x:400,y:230,vx:130,vy:180};balls=Array.from({length:6},(_,j)=>({x:480+(j%3)*27,y:200+Math.floor(j/3)*27,vx:0,vy:0,c:['#eabd5f','#b09ae0','#e78d99','#79c8cf','#d2e881','#eea06e'][j],sunk:false}));balls.unshift({x:220,y:240,vx:0,vy:0,c:'#e8eee0',sunk:false});targets=Array.from({length:5},(_,j)=>({x:100+j*145,y:150+(j%2)*90,r:20+j*4,phase:j}));$('#gametitle').textContent=items[i][0];$('#instructions').textContent=instructions[i].replace(/\d+ seconds/g,gameConfig.roundSeconds+' seconds');$('#feedback').textContent='Ready. Make it count.';presentation.activate(i,{anchor:activeInteraction?.instance||park.parts[attractions[i].id],config:gameConfig});renderer.shadowMap.needsUpdate=true;applySportsSurfaces(presentation.root,{theme:'arcade',renderer});document.body.classList.add('playing');$('#walkhud').hidden=true;if(!$('#game').open)$('#game').show();updateGame(0);presentation.update({game,gameElapsed,pointer,shot,puck,balls,targets,ended,attempts,difficulty:gameConfig.difficulty});presentation.setCamera(camera,cameraMode);lastParkRender=-Infinity;canvas.focus()}
function award(n,msg){score+=n;total=localArcadePoints(total+n);session.points+=n;update();beep(650+n*4);$('#feedback').textContent=msg}function finish(){ended=true;$('#feedback').textContent='Round complete! '+score+' points earned. Play again?';beep(300)}function closeGame(){const previous=game;game=null;shot=null;pressed.clear();presentation.deactivate();renderer.shadowMap.needsUpdate=true;document.body.classList.remove('playing');camera.up.set(0,1,0);setExploration(explorationMode);if($('#game').open)$('#game').close();exitArcadeAttraction(session);frameClock.previous=performance.now();lastParkRender=-Infinity;if(previous!==null)$('#attractions button[data-attraction="'+attractions[previous].id+'"]').focus();}
$('#closegame').onclick=closeGame;
$('#game').addEventListener('cancel',e=>{e.preventDefault();closeGame();});
$('#game').addEventListener('close',()=>{if(game!==null&&!$('#game').open)closeGame();});
$('#restart').onclick=()=>{if(game!==null)startGame(game);};
function pos(e){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const hit=presentation.pointer((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2,camera);if(hit)pointer=arcadePointer(hit.x,hit.y);}
canvas.onpointermove=pos;
canvas.onpointerdown=e=>{if(e.button!==0&&e.pointerType!=='touch')return;e.preventDefault();pos(e);canvas.focus();try{canvas.setPointerCapture(e.pointerId);}catch{}action();};
canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(e.key)){e.preventDefault();if(e.key===' '||e.key==='Enter'){if(!e.repeat)action();}else pressed.add(e.key);}};
canvas.onkeyup=e=>pressed.delete(e.key);
canvas.onblur=()=>pressed.clear();
addEventListener('blur',()=>{pressed.clear();walkKeys.clear();touchKeys.clear();drag=false;});
document.addEventListener('visibilitychange',()=>{frameClock.previous=performance.now();pressed.clear();walkKeys.clear();touchKeys.clear();drag=false;});
function action(){if(game===null||ended||document.hidden)return;if(game===0&&!shot){shot={x:400,y:400,tx:Math.max(100,Math.min(700,pointer.x)),p:0};attempts++;beep(220)}if(game===1){attempts++;let hit=false;for(const t of targets){if(Math.hypot(pointer.x-t.dx,pointer.y-t.dy)<t.r){award(Math.round(100-t.r),'Bullseye!');t.phase+=2.4;hit=true;break}}if(!hit)$('#feedback').textContent='Miss — keep tracking the targets.'}if(game===2&&!shot){const x=basketballPosition(gameElapsed);shot={x,y:385,tx:x,p:0,...basketballRelease(x,gameConfig.difficulty)};attempts++;beep(250)}if(game===4&&balls.every(b=>Math.hypot(b.vx,b.vy)<8)){const b=balls[0];b.sunk=false;const dx=pointer.x-b.x,dy=pointer.y-b.y,l=Math.hypot(dx,dy)||1;b.vx=dx/l*560;b.vy=dy/l*560;attempts++;beep(180)}}
function updateGame(dt){
 if(game===null)return;
 let active=0;
 if(!ended){active=Math.min(dt,remaining);gameElapsed+=active;remaining=Math.max(0,remaining-dt);pointer=arcadePointer(pointer.x+((pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0))*360*active,pointer.y+((pressed.has('ArrowDown')?1:0)-(pressed.has('ArrowUp')?1:0))*360*active);}
 const now=gameElapsed*1000;
 if(game===0&&shot&&!ended){
  shot.p+=active*2.1;
  if(shot.p>=1){const goalie=400+Math.sin(now/600)*145;if(shot.tx>220&&shot.tx<580&&Math.abs(shot.tx-goalie)>52)award(100,'GOAL! Top shelf.');else{$('#feedback').textContent='Saved! Aim away from the goalie.';beep(120);}shot=null;}
 }
 if(game===1)for(const t of targets){t.dx=t.x+Math.sin(now/1000+t.phase)*45;t.dy=t.y+Math.cos(now/1300+t.phase)*48;}
 if(game===2&&shot&&!ended){
  shot.p+=active*1.6;
  if(shot.p>=1){if(shot.scored)award(150,'SWISH! Nothing but net.');else{$('#feedback').textContent='Off the rim. Release under the hoop.';beep(120);}shot=null;}
 }
 if(game===3&&!ended){
  const mx=Math.max(115,Math.min(685,pointer.x)),my=Math.max(250,Math.min(400,pointer.y)),aiX=400+Math.sin(now/(gameConfig.difficulty==='normal'?650:1000))*190;
  for(const step of arcadePhysicsSteps(active)){
   puck.x+=puck.vx*step;puck.y+=puck.vy*step;
   if(puck.x<105||puck.x>695){puck.x=Math.max(105,Math.min(695,puck.x));puck.vx*=-1;}
   for(const m of [{x:mx,y:my},{x:aiX,y:95}]){
    const dx=puck.x-m.x,dy=puck.y-m.y,l=Math.hypot(dx,dy);
    if(l<42){const speed=Math.hypot(puck.vx,puck.vy),nx=l>1e-6?dx/l:speed?puck.vx/speed:0,ny=l>1e-6?dy/l:speed?puck.vy/speed:-1;puck.x=m.x+nx*43;puck.y=m.y+ny*43;puck.vx=nx*390;puck.vy=ny*390;beep(230);}
   }
   if(puck.y<42||puck.y>418){
    if(puck.x>300&&puck.x<500){if(puck.y<42)award(100,'GOAL! Great angle.');else $('#feedback').textContent='Opponent scores. Defend your goal!';puck={x:400,y:230,vx:100,vy:puck.y<42?180:-180};}
    else{puck.y=Math.max(42,Math.min(418,puck.y));puck.vy*=-1;}
   }
  }
 }
 if(game===4&&!ended){
  const pockets=[[80,70],[400,65],[720,70],[80,390],[400,395],[720,390]];
  for(const step of arcadePhysicsSteps(active)){
   for(const b of balls){
    if(b.sunk)continue;b.x+=b.vx*step;b.y+=b.vy*step;b.vx*=Math.pow(.31,step);b.vy*=Math.pow(.31,step);
    if(pockets.some(p=>Math.hypot(b.x-p[0],b.y-p[1])<23)){b.sunk=true;b.vx=b.vy=0;if(b===balls[0]){$('#feedback').textContent='Scratch! Cue ball reset.';b.x=220;b.y=240;b.sunk=false;}else award(100,'Pocketed! Nice shot.');continue;}
    if(b.x<90||b.x>710){b.x=Math.max(90,Math.min(710,b.x));b.vx*=-.9;}
    if(b.y<80||b.y>380){b.y=Math.max(80,Math.min(380,b.y));b.vy*=-.9;}
   }
   for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
    const a=balls[i],b=balls[j];if(a.sunk||b.sunk)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<24&&d>0){const nx=dx/d,ny=dy/d,v=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(v>0){a.vx-=v*nx;a.vy-=v*ny;b.vx+=v*nx;b.vy+=v*ny;}a.x-=nx*(24-d)/2;a.y-=ny*(24-d)/2;b.x+=nx*(24-d)/2;b.y+=ny*(24-d)/2;}
   }
  }
  if(balls.slice(1).every(b=>b.sunk)){award(300,'Table cleared! +300 bonus');finish();}
 }
 if(remaining<=0&&!ended)finish();
 $('#gamescore').textContent='SCORE '+score;$('#timer').textContent=Math.ceil(remaining)+'s';
 $('#game').classList.toggle('round-ended',ended);
}
$('#park-settings-button').onclick=()=>{if(ride!==null)return;const form=$('#park-settings');for(const input of form.querySelectorAll('[name]'))input.value=config[input.name]??'';form.showModal();};
$('#park-config-form').onsubmit=e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const next={...config};for(const input of $('#park-settings').querySelectorAll('[name]'))next[input.name]=input.value;try{localStorage.setItem('neon-junction.config',JSON.stringify(arcadeSettings(next)));location.reload();}catch{$('#settings-status').textContent='This browser cannot save local park settings.';}};
refreshAttractionButtons();$('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=$('#camera-toggle').disabled=false;
window.NeonJunction=Object.freeze({snapshot:()=>({mode:session.mode,attraction:session.attraction,ride:session.ride?{...session.ride}:null,game,score,remaining,gameElapsed,ended,attempts,pointer:{...pointer},shot:shot?{...shot}:null,points:total,visited:[...seen],camera:camera.position.toArray(),cameraUp:camera.up.toArray(),cameraQuaternion:camera.quaternion.toArray(),cameraFov:camera.fov,cameraAspect:camera.aspect,trainT,coasterT,ridePhase,viewMode:game!==null?'game':ride!==null?'ride':explorationMode,cameraMode,cameraLocked:ride!==null,playerPosition:[walker.x,walker.ground+walker.eyeHeight,walker.z],walking:{...walker,nearby:nearby?.id||null,colliders:collisionBoxes.length},presentation:presentation.snapshot(),graphics:{park:park.root.userData.sportsSurfaceStatus||null,builder:builderObjects?.root.userData.sportsSurfaceStatus||null,game:presentation.root?.userData.sportsSurfaceStatus||null},render:{fps:30,pixelRatio:renderer.getPixelRatio(),quality,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},puck:puck?{...puck}:null,balls:balls.map(b=>({...b})),targets:targets.map(t=>({...t}))}),ready:true});
setExploration(cameraMode==='top-down'?'overview':'walk');
const autoIndex=attractions.findIndex(attraction=>attraction.id===autoAttraction);
if(autoIndex>=0&&!startupError){const interaction=launchPartId?[...(builderObjects?.interactions.values()||[])].find(item=>item.objectId===launchPartId):null;if(interaction)select(autoIndex,interaction);else selectFromMenu(autoIndex);}
requestAnimationFrame(animate);
