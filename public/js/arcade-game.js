import * as T from '../vendor/three/three.module.min.js';
import {createArcadePark,animateArcadePark} from './arcade-park.js';
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
function selectFromMenu(index){const interaction=!config.enabled.includes(attractions[index]?.id)?[...(builderObjects?.interactions.values()||[])].find(item=>item.index===index&&(index<5||instanceRideSpeed(item.rideRuntime)>0)):null;return select(index,interaction?.rideRuntime||null,interaction?.config||null);}
function refreshAttractionButtons(){const available=availableAttractionIds();for(const [index,button] of [...document.querySelectorAll('#attractions button')].entries()){button.disabled=session.mode==='ride'||!available.has(button.dataset.attraction);button.querySelector('small').textContent=available.has(button.dataset.attraction)?(index>4?'RIDE':'PLAY')+' · FREE':'CLOSED';}}
refreshAttractionButtons();update();
let yaw=.62,pitch=.78,distance=61,drag=false,lastX,lastY,moved=0,ride=null,rideRuntime=null,rideConfig=null,ridePhase=null,trainT=0,coasterT=0,parkTime=0,lastParkRender=-Infinity;
const center=new T.Vector3(0,0,0),desired=new T.Vector3(),frameClock=createArcadeClock(performance.now());
function reset(reason='exit'){
 exitArcadeAttraction(session,reason);ride=null;rideRuntime=null;rideConfig=null;ridePhase=null;drag=false;
 refreshAttractionButtons();
 $('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=false;
 document.body.classList.remove('riding');$('#ridehud').hidden=true;
 yaw=.62;pitch=.78;distance=61;center.set(0,0,0);camera.up.set(0,1,0);
}
$('#overview').onclick=()=>{if(ride===null)reset();};
$('#explore').onclick=()=>{distance=44;center.set(0,0,0);toast('Choose an attraction below to play or ride')};
let toastTimer;function toast(s){clearTimeout(toastTimer);$('#toast').textContent=s;$('#toast').style.opacity=1;toastTimer=setTimeout(()=>$('#toast').style.opacity=0,3500)}
if(savedObjectsMessage)toast(savedObjectsMessage);
function select(i,instanceRuntime=null,instanceConfig=null){
 if(!attractions[i])return false;
 if(i>=5&&instanceRuntime&&instanceRideSpeed(instanceRuntime)===0){toast('This ride is paused in the builder. Choose another attraction.');return false;}
 const attractionId=attractions[i].id,attractionConfig=instanceConfig?arcadeSettings({...instanceConfig,enabled:[...new Set([...arcadeSettings(instanceConfig).enabled,attractionId])],parts:{...instanceConfig.parts,[attractionId]:{...instanceConfig.parts?.[attractionId],enabled:true}}}):config,previousConfig=session.config;
 session.config=attractionConfig;const entered=enterArcadeAttraction(session,attractions[i].id);session.config=previousConfig;
 if(!entered)return false;gameConfig=attractionConfig;
 seen.add(i);update();beep();if(i<5){startGame(i);return true;}
 ride=i;rideRuntime=instanceRuntime;rideConfig=attractionConfig;drag=false;pressed.clear();
 for(const b of document.querySelectorAll('#attractions button'))b.disabled=true;
 $('#overview').disabled=$('#explore').disabled=$('#park-settings-button').disabled=true;
 document.body.classList.add('riding');$('#ridehud').hidden=false;$('#ridename').textContent=items[i][0];
 $('#rideinfo').textContent=i===5?'A full lap around the arcade park.':'Restraints locked. Get ready for the climb.';
 $('#ridetype').textContent=i===5?'SCENIC TOUR • ON BOARD':'THRILL RIDE • CAMERA LOCKED';
 frameClock.previous=performance.now();return true;
}
$('#exitride').onclick=()=>reset();
addEventListener('keydown',e=>{if(e.key==='Escape'&&ride!==null){e.preventDefault();reset();}});
renderer.domElement.onpointerdown=e=>{if(ride!==null)return;drag=true;moved=0;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};
renderer.domElement.onpointermove=e=>{if(!drag)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;moved+=Math.abs(dx)+Math.abs(dy);yaw-=dx*.006;pitch=Math.max(.25,Math.min(1.3,pitch+dy*.004));lastX=e.clientX;lastY=e.clientY};
renderer.domElement.onpointerup=e=>{
 drag=false;if(moved>=6||ride!==null)return;
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);
 for(const hit of ray.intersectObjects(clickMeshes,true)){
  let ancestor=hit.object,visible=true;while(ancestor){if(!ancestor.visible){visible=false;break;}ancestor=ancestor.parent;}if(!visible)continue;
  let object=hit.object,interaction;while(object){interaction=builderObjects?.interactions.get(object);if(interaction||Number.isInteger(object.userData.index))break;object=object.parent;}
  const index=interaction?.index??object?.userData.index;if(Number.isInteger(index)&&select(index,interaction?.rideRuntime||null,interaction?.config||null))break;
 }
};
renderer.domElement.onpointercancel=()=>{drag=false;};
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(ride===null)distance=Math.max(28,Math.min(85,distance+e.deltaY*.04))},{passive:false});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);lastParkRender=-Infinity;});
function animate(now){
 requestAnimationFrame(animate);
 const dt=advanceArcadeClock(frameClock,now,{paused:document.hidden||$('#park-settings').open});
 if(document.hidden)return;
 // Minigames draw directly to a small 2D canvas. The covered 3D park does not
 // compete for GPU time or make shots/timers crawl on phones and integrated GPUs.
 if(game!==null){updateGame(dt);return;}
 parkTime+=dt;
 if(ride!==null){let elapsed=dt*instanceRideSpeed(rideRuntime);while(elapsed>0&&session.ride){const step=Math.min(elapsed,.1);elapsed-=step;if(stepArcadeRide(session,step)){reset('complete');toast('Ride complete. Welcome back to the park!');break;}}}
 if(now-lastParkRender<1000/30)return;lastParkRender=now;
 const phases=animateArcadePark(park.root,parkTime,config);trainT=phases.trainT;coasterT=phases.coasterT;
 for(const part of builderObjects?.rideParts||[]){const speed=arcadeAnimationSpeed(part.userData.arcadeAnimationEnabled,part.userData.arcadeAnimationSpeed);if(speed>0)animateArcadePark(part,parkTime*speed);}
 if(ride!==null){
  const isTrain=ride===5,curve=(isTrain?rideRuntime?.trainCurve:rideRuntime?.coaster)||(isTrain?trainCurve:coaster);
  ridePhase=(parkTime*instanceRideSpeed(rideRuntime)/(isTrain?rideConfig.trainLapSeconds:rideConfig.coasterLapSeconds))%1;const pose=arcadeRidePose(isTrain?'train':'coaster',ridePhase),t=pose.phase;
  const rideScale=rideRuntime?.rideScale||config.parts?.[isTrain?'train':'coaster']?.scale||1,rideUp=rideRuntime?.rideUp||new T.Vector3(0,1,0);
  camera.up.copy(rideUp);desired.copy(curve.getPointAt(t)).addScaledVector(rideUp,pose.eyeHeight*rideScale);camera.position.copy(desired);
  if(isTrain){const scenic=curve.getPointAt(t).add(curve.getPointAt((t+.5)%1)).multiplyScalar(.5).addScaledVector(rideUp,(pose.eyeHeight+.8)*rideScale);camera.lookAt(scenic);}else camera.lookAt(curve.getPointAt((t+pose.lookAhead)%1).addScaledVector(rideUp,.9*rideScale));
  $('#rideprogress').value=session.ride?.progress||0;
 }else{
  desired.set(center.x+Math.sin(yaw)*distance*Math.cos(pitch),Math.sin(pitch)*distance,center.z+Math.cos(yaw)*distance*Math.cos(pitch));
  camera.position.lerp(desired,.15);camera.lookAt(center);
 }
 renderer.render(scene,camera);
}
camera.position.set(32,43,43);
const canvas=$('#play'),ctx=canvas.getContext('2d');let gameConfig=config,game=null,score=0,remaining=45,gameElapsed=0,ended=false,pointer={x:400,y:370},puck,balls=[],shot=null,targets=[],attempts=0;const pressed=new Set();const instructions=[`Move to aim. Click or tap to shoot past the moving goalie. Score in ${config.roundSeconds} seconds.`,`Click or tap moving targets. Smaller targets earn more points. ${config.roundSeconds} seconds.`,`Click or tap when the ball lines up with the hoop. ${config.roundSeconds} seconds.`,`Move your mallet with mouse, arrows or touch. Score in the top goal; defend the bottom.`,`Aim the white ball with mouse, arrows or touch. Click or Space shoots. Sink all six colored balls.`];
function startGame(i){if(!Number.isInteger(i)||i<0||i>4)return;game=i;score=0;remaining=gameConfig.roundSeconds;gameElapsed=0;ended=false;attempts=0;shot=null;pointer={x:400,y:370};pressed.clear();frameClock.previous=performance.now();puck={x:400,y:230,vx:130,vy:180};balls=Array.from({length:6},(_,j)=>({x:480+(j%3)*27,y:200+Math.floor(j/3)*27,vx:0,vy:0,c:['#eabd5f','#b09ae0','#e78d99','#79c8cf','#d2e881','#eea06e'][j],sunk:false}));balls.unshift({x:220,y:240,vx:0,vy:0,c:'#e8eee0',sunk:false});targets=Array.from({length:5},(_,j)=>({x:100+j*145,y:150+(j%2)*90,r:20+j*4,phase:j}));$('#gametitle').textContent=items[i][0];$('#instructions').textContent=instructions[i].replace(/\d+ seconds/g,gameConfig.roundSeconds+' seconds');$('#feedback').textContent='Ready. Make it count.';if(!$('#game').open)$('#game').showModal();updateGame(0);canvas.focus()}
function award(n,msg){score+=n;total=localArcadePoints(total+n);session.points+=n;update();beep(650+n*4);$('#feedback').textContent=msg}function finish(){ended=true;$('#feedback').textContent='Round complete! '+score+' points earned. Play again?';beep(300)}function closeGame(){const previous=game;game=null;shot=null;pressed.clear();if($('#game').open)$('#game').close();exitArcadeAttraction(session);frameClock.previous=performance.now();lastParkRender=-Infinity;if(previous!==null)$('#attractions button[data-attraction="'+attractions[previous].id+'"]').focus();}
$('#closegame').onclick=closeGame;
$('#game').addEventListener('cancel',e=>{e.preventDefault();closeGame();});
$('#game').addEventListener('close',()=>{if(game!==null&&!$('#game').open)closeGame();});
$('#restart').onclick=()=>{if(game!==null)startGame(game);};
function pos(e){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;pointer=arcadePointer((e.clientX-r.left)/r.width*800,(e.clientY-r.top)/r.height*460);}
canvas.onpointermove=pos;
canvas.onpointerdown=e=>{if(e.button!==0&&e.pointerType!=='touch')return;e.preventDefault();pos(e);canvas.focus();try{canvas.setPointerCapture(e.pointerId);}catch{}action();};
canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(e.key)){e.preventDefault();if(e.key===' '||e.key==='Enter'){if(!e.repeat)action();}else pressed.add(e.key);}};
canvas.onkeyup=e=>pressed.delete(e.key);
canvas.onblur=()=>pressed.clear();
addEventListener('blur',()=>{pressed.clear();drag=false;});
document.addEventListener('visibilitychange',()=>{frameClock.previous=performance.now();pressed.clear();drag=false;});
function action(){if(game===null||ended||document.hidden)return;if(game===0&&!shot){shot={x:400,y:400,tx:Math.max(100,Math.min(700,pointer.x)),p:0};attempts++;beep(220)}if(game===1){let hit=false;for(const t of targets){if(Math.hypot(pointer.x-t.dx,pointer.y-t.dy)<t.r){award(Math.round(100-t.r),'Bullseye!');t.phase+=2.4;hit=true;break}}if(!hit)$('#feedback').textContent='Miss — keep tracking the targets.'}if(game===2&&!shot){const x=basketballPosition(gameElapsed);shot={x,y:385,tx:x,p:0,...basketballRelease(x,gameConfig.difficulty)};attempts++;beep(250)}if(game===4&&balls.every(b=>Math.hypot(b.vx,b.vy)<8)){const b=balls[0];b.sunk=false;const dx=pointer.x-b.x,dy=pointer.y-b.y,l=Math.hypot(dx,dy)||1;b.vx=dx/l*560;b.vy=dy/l*560;attempts++;beep(180)}}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h)}function circle(x,y,r,c,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}}function text(s,x,y,size=20,c='#d7e7df'){ctx.fillStyle=c;ctx.font=`bold ${size}px Arial`;ctx.textAlign='center';ctx.fillText(s,x,y)}function stroke(x1,y1,x2,y2,c='#ffffff55',width=2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=c;ctx.lineWidth=width;ctx.stroke()}
function updateGame(dt){if(game===null)return;if(!ended){const active=Math.min(dt,remaining);gameElapsed+=active;remaining=Math.max(0,remaining-dt);pointer=arcadePointer(pointer.x+((pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0))*360*active,pointer.y+((pressed.has('ArrowDown')?1:0)-(pressed.has('ArrowUp')?1:0))*360*active);if(remaining<=0)finish();}const now=gameElapsed*1000;$('#gamescore').textContent='SCORE '+score;$('#timer').textContent=Math.ceil(remaining)+'s';ctx.clearRect(0,0,800,460);rect(0,0,800,460,'#10272c');for(let i=0;i<800;i+=40)stroke(i,0,i,460,'#ffffff05');for(let i=0;i<460;i+=40)stroke(0,i,800,i,'#ffffff05');if(game===0){rect(45,40,710,380,'#b4d9da');stroke(50,240,750,240,'#d27587',3);circle(400,240,55,'#b4d9da','#608f9c');rect(215,35,370,70,'#354c53');for(let x=220;x<590;x+=20)stroke(x,40,x,100,'#d9e6dc44');for(let y=40;y<105;y+=15)stroke(215,y,585,y,'#d9e6dc44');const goalie=400+Math.sin(now/600)*145;rect(goalie-38,75,76,35,'#d37b94');circle(goalie,68,18,'#ede3c9');stroke(400,400,pointer.x,100,'#34575c55');circle(400,400,12,'#23383e');if(shot&&!ended){shot.p+=dt*2.1;const p=Math.min(1,shot.p);circle(400+(shot.tx-400)*p,400-315*p,10,'#182b32');if(p>=1){if(shot.tx>220&&shot.tx<580&&Math.abs(shot.tx-goalie)>52)award(100,'GOAL! Top shelf.');else{$('#feedback').textContent='Saved! Aim away from the goalie.';beep(120)}shot=null}}text('CLICK TO SHOOT',400,445,12,'#8cb0b3')}
if(game===1){text('TARGET PRACTICE',400,50,15,'#7a9b9f');targets.forEach(t=>{t.dx=t.x+Math.sin(now/1000+t.phase)*45;t.dy=t.y+Math.cos(now/1300+t.phase)*48;circle(t.dx,t.dy,t.r+6,'#56717a');circle(t.dx,t.dy,t.r,'#dc91a9');circle(t.dx,t.dy,t.r*.65,'#203740');circle(t.dx,t.dy,t.r*.28,'#dcfa70')});stroke(pointer.x-15,pointer.y,pointer.x+15,pointer.y,'#dcfa70');stroke(pointer.x,pointer.y-15,pointer.x,pointer.y+15,'#dcfa70');text('TRACK · AIM · FIRE',400,420,12,'#8cb0b3')}
if(game===2){rect(100,130,600,300,'#946542');stroke(400,130,400,430,'#e6c9a255');circle(400,335,60,'#946542','#e6c9a277');rect(315,38,170,95,'#b8d0c8');rect(360,85,80,48,'#b8d0c8');ctx.strokeStyle='#fff';ctx.strokeRect(360,85,80,48);ctx.beginPath();ctx.ellipse(400,135,45,10,0,0,Math.PI*2);ctx.strokeStyle='#f79255';ctx.lineWidth=6;ctx.stroke();for(let i=-2;i<=2;i++)stroke(400+i*17,142,400+i*11,184,'#e1ead7',2);const bx=basketballPosition(gameElapsed);const aligned=basketballRelease(bx,gameConfig.difficulty).scored;stroke(400,205,400,415,aligned?'#dcfa7088':'#ffffff20',2);if(!shot){circle(bx,385,19,'#e8a25e');if(aligned)circle(bx,385,23,'#e8a25e','#dcfa70');}if(shot&&!ended){shot.p+=dt*1.6;const p=Math.min(1,shot.p),x=shot.x+(shot.endX-shot.x)*p,y=385-240*p-Math.sin(p*Math.PI)*180;circle(x,y,19-8*p,'#e8a25e');if(p>=1){if(shot.scored)award(150,'SWISH! Nothing but net.');else{$('#feedback').textContent='Off the rim. Release under the hoop.';beep(120)}shot=null}}text('RELEASE WHEN THE BALL IS CENTERED',400,450,12,'#c7a985')}
if(game===3){rect(80,25,640,410,'#8cbcc7');rect(90,35,620,390,'#183c49');stroke(90,230,710,230,'#82b2c2');circle(400,230,52,'#183c49','#82b2c2');rect(300,22,200,12,'#df8c9f');rect(300,426,200,12,'#9bcbd5');const mx=Math.max(115,Math.min(685,pointer.x)),my=Math.max(250,Math.min(400,pointer.y)),aiX=400+Math.sin(now/(gameConfig.difficulty==='normal'?650:1000))*190;circle(aiX,95,28,'#de849e');circle(mx,my,28,'#c7efea');if(!ended)for(const step of arcadePhysicsSteps(dt)){puck.x+=puck.vx*step;puck.y+=puck.vy*step;if(puck.x<105||puck.x>695){puck.x=Math.max(105,Math.min(695,puck.x));puck.vx*=-1}for(const m of [{x:mx,y:my},{x:aiX,y:95}]){const dx=puck.x-m.x,dy=puck.y-m.y,l=Math.hypot(dx,dy);if(l<42){const speed=Math.hypot(puck.vx,puck.vy),nx=l>1e-6?dx/l:speed?puck.vx/speed:0,ny=l>1e-6?dy/l:speed?puck.vy/speed:-1;puck.x=m.x+nx*43;puck.y=m.y+ny*43;puck.vx=nx*390;puck.vy=ny*390;beep(230)}}if(puck.y<42||puck.y>418){if(puck.x>300&&puck.x<500){if(puck.y<42)award(100,'GOAL! Great angle.');else $('#feedback').textContent='Opponent scores. Defend your goal!';puck={x:400,y:230,vx:100,vy:puck.y<42?180:-180}}else{puck.y=Math.max(42,Math.min(418,puck.y));puck.vy*=-1}}}circle(puck.x,puck.y,12,'#ddeb92')}
if(game===4){rect(55,45,690,370,'#705b49');rect(75,65,650,330,'#2b705d');const pockets=[[80,70],[400,65],[720,70],[80,390],[400,395],[720,390]];pockets.forEach(p=>circle(...p,20,'#0a2023'));if(!ended){for(const step of arcadePhysicsSteps(dt)){for(const b of balls){if(b.sunk)continue;b.x+=b.vx*step;b.y+=b.vy*step;b.vx*=Math.pow(.31,step);b.vy*=Math.pow(.31,step);if(pockets.some(p=>Math.hypot(b.x-p[0],b.y-p[1])<23)){b.sunk=true;b.vx=b.vy=0;if(b===balls[0]){$('#feedback').textContent='Scratch! Cue ball reset.';b.x=220;b.y=240;b.sunk=false}else award(100,'Pocketed! Nice shot.');continue}if(b.x<90||b.x>710){b.x=Math.max(90,Math.min(710,b.x));b.vx*=-.9}if(b.y<80||b.y>380){b.y=Math.max(80,Math.min(380,b.y));b.vy*=-.9}}for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){const a=balls[i],b=balls[j];if(a.sunk||b.sunk)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<24&&d>0){const nx=dx/d,ny=dy/d,v=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(v>0){a.vx-=v*nx;a.vy-=v*ny;b.vx+=v*nx;b.vy+=v*ny}a.x-=nx*(24-d)/2;a.y-=ny*(24-d)/2;b.x+=nx*(24-d)/2;b.y+=ny*(24-d)/2}}}if(balls.slice(1).every(b=>b.sunk)){award(300,'Table cleared! +300 bonus');finish()}}if(balls.every(b=>Math.hypot(b.vx,b.vy)<8)){const b=balls[0];stroke(b.x,b.y,pointer.x,pointer.y,'#d7e6c555',1)}balls.forEach(b=>{if(!b.sunk){circle(b.x,b.y,12,b.c);circle(b.x-3,b.y-4,3,'#ffffff66')}});text('AIM FROM THE WHITE BALL · CLICK TO SHOOT',400,445,12,'#8cb0b3')}
if(ended){rect(0,0,800,460,'#07181ac9');text('ROUND COMPLETE',400,200,34,'#dcfa70');text(score+' POINTS',400,250,24);text('Hit Restart to play again',400,292,15)}}
$('#park-settings-button').onclick=()=>{if(ride!==null)return;const form=$('#park-settings');for(const input of form.querySelectorAll('[name]'))input.value=config[input.name]??'';form.showModal();};
$('#park-config-form').onsubmit=e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const next={...config};for(const input of $('#park-settings').querySelectorAll('[name]'))next[input.name]=input.value;try{localStorage.setItem('neon-junction.config',JSON.stringify(arcadeSettings(next)));location.reload();}catch{$('#settings-status').textContent='This browser cannot save local park settings.';}};
window.NeonJunction=Object.freeze({snapshot:()=>({mode:session.mode,attraction:session.attraction,ride:session.ride?{...session.ride}:null,game,score,remaining,gameElapsed,ended,attempts,pointer:{...pointer},shot:shot?{...shot}:null,points:total,visited:[...seen],camera:camera.position.toArray(),cameraUp:camera.up.toArray(),trainT,coasterT,ridePhase}),ready:true});
const autoIndex=attractions.findIndex(attraction=>attraction.id===autoAttraction);
if(autoIndex>=0&&!startupError){const interaction=launchPartId?[...(builderObjects?.interactions.values()||[])].find(item=>item.objectId===launchPartId):null;if(interaction)select(autoIndex,interaction.rideRuntime||null,interaction.config||null);else selectFromMenu(autoIndex);}
requestAnimationFrame(animate);
