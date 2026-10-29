import {normalizeFunhouseAudioSettings,funhouseAudioNotice,funhouseAudioAllowed} from './funhouse-audio-settings.js';
import {funhouseRideCue,funhouseRidePose} from './funhouse-experience-rules.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES,funhouseAdventureAvailable,funhouseAdventureNextClue,funhouseAdventureNear} from './funhouse-adventure-rules.js';
import {FUNHOUSE_HAUNT_START,FUNHOUSE_HAUNT_WARDS,funhouseHauntAvailable,funhouseHauntNextWard,funhouseHauntNear} from './funhouse-haunt-rules.js';
import * as T from '../vendor/three/three.module.min.js';
import {funhouseStations,isFunhouseEnvironment} from './clown-funhouse-config.js';
import {funhouseInteractionHit} from './funhouse-scene-actions.js';

const finite=value=>Number.isFinite(Number(value));
const point=value=>Array.isArray(value)?{x:Number(value[0]),y:Number(value[1]),z:Number(value[2])}:{x:Number(value?.x),y:Number(value?.y),z:Number(value?.z)};
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const text=value=>String(value??'').replace(/[\r\n]+/g,' ').slice(0,150);
const active=value=>value?.status==='active';
const ballNames=['Crimson','Gold','Cyan','Violet'];

/** The same attraction commands are available on a real scene panel and through
 * controller rays. This module never changes a tracked camera or grants items. */
export function createFunhouseVR({THREE=T,scene,camera,getCamera=()=>camera,getEnvironment=()=>null,getPosition=()=>null,getActors=()=>({}),getRoots=()=>[],getPresenting=()=>true,getServerTime=null,getState=()=>null,send=async()=>null,onStatus=()=>{},onInputRelease=()=>{},onStartRide=()=>{},onExitRide=()=>{},getAudioSettings=()=>null,getAudioPreferences=()=>({}),getAudioCaption=()=>null,onAudioSettings=()=>{},onReplayClown=()=>{},onPreviewMusic=()=>{},getReducedMotion=()=>false,createCanvas=()=>typeof document==='undefined'?null:document.createElement('canvas')}={}){
 const root=new THREE.Group();root.name='MIDNIGHT_LAUGHS_IMMERSIVE_CONTROLS';root.visible=false;root.userData.collisionDisabled=true;scene.add(root);
 const width=1024,height=768,panelWidth=1.02,panelHeight=.765,canvas=createCanvas();
 if(canvas){canvas.width=width;canvas.height=height;}
 const ink=canvas?.getContext?.('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),geometry=new THREE.PlaneGeometry(panelWidth,panelHeight),face=new THREE.Mesh(geometry,material);
 face.name='FUNHOUSE_VR_ACTION_BOARD';face.renderOrder=990;face.userData.collisionDisabled=true;root.add(face);
 const inverse=new THREE.Matrix4(),localRay=new THREE.Ray(),localPoint=new THREE.Vector3(),head=new THREE.Vector3(),orientation=new THREE.Quaternion(),forward=new THREE.Vector3(),right=new THREE.Vector3();
 const held=new Set();
 let state={},latestActors=null,selfId=null,sequence=-1,offset=0,pending=false,disposed=false,visible=false,available=false,generation=0,selectedId=null,message='',lastSignature='',buttons=[],hovered=null,drawCount=0,worldId=null,lastTickAt=-Infinity,boardMode='attraction',actionPage=0,observedRideId=null,pendingRideAnchor=null,boardRideFollow=null;
 let localAudioSettings=normalizeFunhouseAudioSettings();
 const audioSettings=()=>normalizeFunhouseAudioSettings({...localAudioSettings,...(getAudioSettings()||{})});
 const audioCaption=()=>{const caption=getAudioCaption();return caption?.text&&(!Number.isFinite(caption.expiresAt)||caption.expiresAt>Date.now())?caption:null;};
 const now=()=>getServerTime?getServerTime():Date.now()+offset;
 const allStations=()=>[...funhouseStations(getEnvironment(),{actors:latestActors||getActors()}),...(funhouseHauntAvailable(getEnvironment())?[{...FUNHOUSE_HAUNT_START,kind:'haunt'}]:[])];
 function nearest(){let result=null,limit=6.5;for(const station of allStations()){const gap=distance(getPosition(),station.position);if(gap<Math.min(limit,station.interactionDistance||6.5)){limit=gap;result=station;}}return result;}
 function currentStation(){
  const stations=allStations(),running=active(state.ride)?state.ride:active(state.round)?state.round:active(state.challenge)?state.challenge:null;
  const close=nearest(),selected=stations.find(station=>station.id===selectedId),maze=active(state.challenge)&&state.challenge.kind==='mirrors';
  if(maze&&close?.kind==='maze-finish')return close;
  return stations.find(station=>station.id===running?.stationId)||(selected&&distance(getPosition(),selected.position)<=(selected.interactionDistance||6.5)?selected:close);
 }
 const canonicalId=station=>station?.canonicalStationId||station?.id;
 const isAvailable=()=>isFunhouseEnvironment(getEnvironment())||available&&Boolean(currentStation());
 function run(action,fields={},station=null){
  if(disposed||pending)return Promise.resolve(false);
  const token=generation,environmentId=getEnvironment()?.id,beganPresenting=getPresenting();
  pending=true;message='';redraw();
  return Promise.resolve().then(()=>send(action,fields)).then(async snapshot=>{
   if(disposed||token!==generation||getEnvironment()?.id!==environmentId||!snapshot)return false;
   const accepted=receive(snapshot,snapshot.selfId||selfId);
   if(action==='funhouse-haunt'&&fields.operation==='start'&&active(state.haunt)){boardMode='haunt';actionPage=0;}
   if(action==='funhouse-adventure'&&fields.operation==='start'&&active(state.adventure)){boardMode='adventure';actionPage=0;}
   if(action==='funhouse-ride'&&beganPresenting&&!getPresenting()&&active(state.ride)){const ended=await send('funhouse-ride-exit',{rideId:state.ride.id});if(!disposed&&token===generation&&ended)receive(ended,ended.selfId||selfId);return false;}
   if(!accepted)return false;message=snapshot.result?.message||state.message||'Attraction ready.';
   if(action==='funhouse-ride')onStartRide(state.ride,station);if(action==='funhouse-ride-exit')onExitRide(state.ride,station);
   onStatus(message);return true;
  }).catch(error=>{if(!disposed&&token===generation){message=error.message||'The attraction is unavailable. Try again.';onStatus(message);}return false;}).finally(()=>{if(!disposed&&token===generation){pending=false;redraw();}});
 }
 function command(station,action,fields={}){if(!station){onStatus('Move close to a funhouse attraction.');return Promise.resolve(false);}selectedId=station.id;return run(action,{stationId:station.id,...fields},station);}
 function actionFor(station,operation,fields={}){return command(station,'funhouse-action',{operation,...fields});}
 const entry=(id,label,run,enabled=true)=>({id,label,run,enabled});
 function attractionActions(station=currentStation()){
  if(!station)return [];
  if(station.kind==='haunt')return hauntActions();
  const ride=active(state.ride)&&state.ride.stationId===station.id?{...state.ride,...funhouseRideCue(state.ride,now())}:null,challenge=active(state.challenge)&&state.challenge.stationId===station.id?state.challenge:null,round=active(state.round)&&state.round.stationId===station.id?state.round:null,kind=station.kind;
  if(ride){
   const ready=!finite(ride.lastActionAt)||now()>=Number(ride.lastActionAt)+(kind==='car'?400:300);
   const options=kind==='car'?[entry('honk','Squeeze the horn',()=>actionFor(station,'honk'),ready)]:[
    entry('balance-0',(ride.targetId===0?'● ':'')+'Balance left',()=>actionFor(station,'balance',{targetId:0}),ready&&ride.lastCueHit!==ride.cueIndex),
    entry('balance-1',(ride.targetId===1?'● ':'')+'Balance right',()=>actionFor(station,'balance',{targetId:1}),ready&&ride.lastCueHit!==ride.cueIndex)
   ];
   return [...options,entry('gentle',getReducedMotion()?'Comfort motion enabled':ride.gentle===false?'Use gentle motion':'Use lively motion',()=>actionFor(station,'gentle',{enabled:getReducedMotion()||ride.gentle===false}),!getReducedMotion()),entry('ride-exit','Stop ride and step off',()=>run('funhouse-ride-exit',{rideId:ride.id},station))];
  }
  if(kind==='water'){
   if(!round)return [entry('water-start','Start water-gun round',()=>command(station,'funhouse-start'))];
   const ready=!finite(round.lastShotAt)||now()>=Number(round.lastShotAt)+300;
   return [...Array.from({length:6},(_,targetId)=>entry('water-'+targetId,(round.targetId===targetId?'● ':'')+'Splash clown '+(targetId+1),()=>run('funhouse-squirt',{roundId:round.id,targetId},station),ready)),entry('water-stop','End this water round',()=>run('funhouse-stop',{roundId:round.id},station))];
  }
  if(kind==='car'||kind==='spinner')return [entry('ride-start',kind==='car'?'Board the clown car':'Sit on the dizzy spinner',()=>command(station,'funhouse-ride')),entry('show',kind==='car'?'Honk and release the clowns':'Start the spinner show',()=>command(station,'funhouse-use'))];
  if(kind==='dressup')return [entry('hat',(state.costume?.hat?'Remove':'Wear')+' propeller hat',()=>command(station,'funhouse-dress',{hat:!state.costume?.hat,shoes:!!state.costume?.shoes})),entry('shoes',(state.costume?.shoes?'Remove':'Wear')+' giant clown shoes',()=>command(station,'funhouse-dress',{hat:!!state.costume?.hat,shoes:!state.costume?.shoes}))];
  if(kind==='jackbox'){
   if(!challenge)return [entry('jack-start','Start the fright-box challenge',()=>command(station,'funhouse-challenge')),entry('show','Show the fright-box surprise',()=>command(station,'funhouse-use'))];
   const ready=challenge.readyAt&&now()>=challenge.readyAt&&now()<=challenge.catchUntil;
   return [entry('wind','Wind the handle · '+(challenge.windCount||0)+' / 3',()=>actionFor(station,'wind'),(challenge.windCount||0)<3),entry('catch',ready?'Catch the clown now!':'Wait for the clown…',()=>actionFor(station,'catch'),!!ready),entry('challenge-stop','Stop this challenge',()=>actionFor(station,'stop'))];
  }
  if(kind==='ballpit')return challenge?[...Array.from({length:4},(_,targetId)=>entry('toss-'+targetId,(challenge.targetId===targetId?'● ':'')+'Toss at '+ballNames[targetId],()=>actionFor(station,'toss',{targetId}),!finite(challenge.lastActionAt)||now()>=Number(challenge.lastActionAt)+350)),entry('challenge-stop','Stop this challenge',()=>actionFor(station,'stop'))]:[entry('ball-start','Start the monster toss game',()=>command(station,'funhouse-challenge')),entry('show','Bounce the monster balls',()=>command(station,'funhouse-use'))];
  if(kind==='mirrors')return challenge?[entry('maze-check','Check this maze checkpoint',()=>actionFor(station,'check-in')),entry('challenge-stop','Stop this challenge',()=>actionFor(station,'stop'))]:[entry('maze-start','Start the mirror maze',()=>command(station,'funhouse-challenge'))];
  if(kind==='maze-finish')return [entry('maze-bell','Ring the maze exit bell',()=>command(station,'funhouse-use'))];
  return [entry('welcome','Hear the attraction guide',()=>command(station,'funhouse-use'))];
 }
 function adventureActions(){
  if(!funhouseAdventureAvailable(getEnvironment()))return [];
  const adventure=state.adventure,clue=funhouseAdventureNextClue(adventure),riding=active(state.ride);
  if(active(adventure))return [entry('adventure-inspect','Inspect '+(clue?.name||'the next clue'),()=>run('funhouse-adventure',{operation:'inspect',adventureId:adventure.id,clueId:clue?.id}),!riding&&funhouseAdventureNear(getPosition(),clue)),entry('adventure-stop','Stop the adventure trail',()=>run('funhouse-adventure',{operation:'stop',adventureId:adventure.id}))];
  return [entry('adventure-start',adventure?'Start the trail again':'Start the adventure trail',()=>run('funhouse-adventure',{operation:'start'}),!riding&&funhouseAdventureNear(getPosition(),FUNHOUSE_ADVENTURE_START))];
 }
 function hauntActions(){
  if(!funhouseHauntAvailable(getEnvironment()))return [];
  const haunt=state.haunt,ward=funhouseHauntNextWard(haunt),riding=active(state.ride);
  if(active(haunt))return [entry('haunt-seal','Seal '+(ward?.name||'the next lantern'),()=>run('funhouse-haunt',{operation:'seal',hauntId:haunt.id,wardId:ward?.id}),!riding&&funhouseHauntNear(getPosition(),ward)),entry('haunt-stop','Stop the Night Watch',()=>run('funhouse-haunt',{operation:'stop',hauntId:haunt.id}))];
  return [entry('haunt-start',haunt?'Take the Night Watch again':'Begin the Night Watch',()=>run('funhouse-haunt',{operation:'start'}),!riding&&funhouseHauntNear(getPosition(),FUNHOUSE_HAUNT_START))];
 }
 function showHaunt(){setVisible(true);boardMode='haunt';actionPage=0;redraw();}
 function changeAudio(patch){localAudioSettings=normalizeFunhouseAudioSettings({...audioSettings(),...patch});onAudioSettings(patch);redraw();}
 function showAudio(){setVisible(true);boardMode='audio';actionPage=0;redraw();}
 function audioActions(){
  const settings=audioSettings(),preferences=getAudioPreferences()||{},labels={music:'Car music',voice:'Clown voices',effects:'Attraction effects'},items=[];
  for(const channel of ['music','voice','effects']){
   items.push(entry('audio-'+channel+'-mute',labels[channel]+' · '+(settings[channel+'Muted']?'muted':'on'),()=>changeAudio({[channel+'Muted']:!audioSettings()[channel+'Muted']})));
   for(const direction of [-1,1])items.push(entry('audio-'+channel+'-'+(direction<0?'down':'up'),(direction<0?'Lower ':'Raise ')+labels[channel].toLowerCase()+' · '+settings[channel+'Volume']+'%',()=>changeAudio({[channel+'Volume']:Math.max(0,Math.min(100,audioSettings()[channel+'Volume']+direction*10))}),direction<0?settings[channel+'Volume']>0:settings[channel+'Volume']<100));
  }
  items.push(entry('audio-replay','Replay last clown line',()=>onReplayClown(),funhouseAudioAllowed('voice',settings,preferences)),entry('audio-preview','Preview scary car music',()=>onPreviewMusic(),funhouseAudioAllowed('music',settings,preferences)),entry('audio-back','Back to attraction controls',()=>{boardMode='attraction';actionPage=0;redraw();}));
  return items;
 }
 function summary(station){
  if(boardMode==='audio')return {title:'Midnight sound booth',headline:'Funny voices · eerie carnival music',detail:funhouseAudioNotice(getAudioPreferences()||{}),cue:'VOLUME '+audioSettings().musicVolume+'% MUSIC · '+audioSettings().voiceVolume+'% VOICES'};
  if(boardMode==='haunt'){
   const haunt=state.haunt,ward=funhouseHauntNextWard(haunt);
   if(active(haunt))return {title:'Night Watch',headline:(haunt.sealed?.length||0)+' / '+FUNHOUSE_HAUNT_WARDS.length+' lanterns · '+Math.max(0,Math.ceil((haunt.endsAt-now())/1000))+'s',detail:ward?.hint||haunt.hint||'Explore the haunted house.',cue:ward?.name||'Find the glowing lantern'};
   if(haunt)return {title:'Night Watch',headline:(haunt.status==='complete'?'Watch complete':'Watch stopped')+' · '+Number(haunt.score||0)+' points',detail:haunt.message||'Return to the house lobby to take another shift.',cue:'BEST WATCH '+Number(state.bestScores?.haunt||0)};
   return {title:'Night Watch',headline:'Four haunted lanterns · three minutes',detail:'Begin at the house lobby lantern. Follow the glowing ward and seal four haunted lanterns in order.',cue:'STOP THE WATCH WHENEVER YOU LIKE'};
  }
  if(boardMode==='adventure'){
   const adventure=state.adventure,clue=funhouseAdventureNextClue(adventure);
   if(active(adventure))return {title:'The Lost Laugh Trail',headline:(adventure.found?.length||0)+' / '+FUNHOUSE_ADVENTURE_CLUES.length+' clues · '+Math.max(0,Math.ceil((adventure.endsAt-now())/1000))+'s',detail:clue?.hint||adventure.hint||'Explore the midway.',cue:clue?.name||'Find the next discovery'};
   if(adventure)return {title:'The Lost Laugh Trail',headline:(adventure.status==='complete'?'Trail complete':'Trail stopped')+' · '+Number(adventure.score||0)+' points',detail:adventure.message||'Return to the welcome board for another adventure.',cue:'BEST TRAIL '+Number(state.bestScores?.adventure||0)};
   return {title:'The Lost Laugh Trail',headline:'Six lost laughs · ten minutes',detail:'Start at the welcome board. Explore the midway and haunted house to inspect six mysterious clues.',cue:'ENJOY THE RIDES ALONG THE WAY'};
  }
  const ride=active(state.ride)?{...state.ride,...funhouseRideCue(state.ride,now())}:null,round=active(state.round)?state.round:null,challenge=active(state.challenge)?state.challenge:null;
  if(ride){const remaining=Math.max(0,Math.ceil((ride.endsAt-now())/1000));return {headline:remaining+'s · '+Number(ride.score||0)+' ride points',detail:ride.kind==='car'?'Squeeze the horn when the cue lights up.':'Balance toward the lit side. Stop at any time.',cue:ride.kind==='car'?(now()>=ride.nextCueAt&&now()<=ride.nextCueAt+1500?'HONK NOW!':'Next horn cue in '+Math.max(0,Math.ceil((ride.nextCueAt-now())/1000))+'s'):(ride.targetId===0?'BALANCE LEFT':'BALANCE RIGHT')};}
  if(round){return {headline:Number(round.score||0)+' points · '+Math.max(0,Math.ceil((round.endsAt-now())/1000))+'s',detail:'Aim at the glowing clown and squeeze either trigger.',cue:'GLOWING CLOWN '+(Number(round.targetId)+1)};}
  if(challenge){return {headline:Number(challenge.score||0)+' points · '+Math.max(0,Math.ceil((challenge.endsAt-now())/1000))+'s',detail:challenge.kind==='jackbox'?'Wind three times, then catch the clown as it appears.':challenge.kind==='mirrors'?'Follow the passages and the ordered checkpoint markers.':'Aim at the glowing monster target and toss a ball.',cue:challenge.kind==='jackbox'?(challenge.windCount<3?'WIND '+(challenge.windCount||0)+' / 3':now()<challenge.readyAt?'WAIT…':now()<=challenge.catchUntil?'CATCH NOW!':'Try the challenge again'):challenge.kind==='mirrors'?'CHECKPOINT '+(Number(challenge.checkpointIndex||0)+1):ballNames[challenge.targetId]?.toUpperCase()||'FIND THE GLOWING TARGET'};}
  const completed=[state.ride,state.round,state.challenge].find(value=>value&&value.status!=='active'&&value.stationId===station?.id);
  return {headline:completed?(completed.status==='complete'?'Complete':'Stopped')+' · '+Number(completed.score||0)+' points':station?.name||'Midnight Laughs Funhouse',detail:completed?completed.message||'Choose another round or keep exploring.':station?'Point at a control and squeeze a trigger.':'Walk close to an attraction to see its controls.',cue:'PASSPORT '+(state.stamps?.length||0)+' / 6 · BEST SPLASH '+(state.bestScore||0)};
 }
 function redraw(){
  if(disposed||!visible){lastSignature='';return;}
  const station=currentStation(),info=summary(station),actions=boardMode==='audio'?audioActions():boardMode==='haunt'?[...hauntActions(),entry('attraction-board','Ride and attraction controls',()=>{boardMode='attraction';actionPage=0;redraw();},!!station)]:boardMode==='adventure'?[...adventureActions(),entry('attraction-board','Ride and attraction controls',()=>{boardMode='attraction';actionPage=0;redraw();},!!station)]:attractionActions(station);
  if(boardMode!=='audio')actions.push(entry('audio-board','Clown voices, sounds & music',showAudio));
  if(boardMode!=='audio'&&boardMode!=='adventure'&&funhouseAdventureAvailable(getEnvironment()))actions.push(entry('adventure-board',active(state.adventure)?'Adventure trail · '+(state.adventure.found?.length||0)+' / 6':'Explore the adventure trail',()=>{boardMode='adventure';actionPage=0;redraw();}));
  if(boardMode!=='audio'&&boardMode!=='haunt'&&funhouseHauntAvailable(getEnvironment()))actions.push(entry('haunt-board',active(state.haunt)?'Night Watch · '+(state.haunt.sealed?.length||0)+' / 4':'Explore the Night Watch',showHaunt));
  const pages=Math.max(1,Math.ceil(actions.length/5));actionPage=Math.min(actionPage,pages-1);
  const pageActions=actions.slice(actionPage*5,actionPage*5+5);
  if(actionPage>0)pageActions.push(entry('previous-actions','Previous actions',()=>{actionPage--;redraw();}));
  if(actionPage+1<pages)pageActions.push(entry('next-actions','Next actions',()=>{actionPage++;redraw();}));
  pageActions.push(entry('close','Hide this board',()=>setVisible(false)));
  buttons=pageActions.map((item,index)=>{const column=index%2,row=Math.floor(index/2),x=28+column*494,y=310+row*92;return {...item,enabled:item.enabled&&(!pending||['close','next-actions','previous-actions','adventure-board','haunt-board','attraction-board','audio-board','audio-back'].includes(item.id)),x,y,w:474,h:74,position:[((x+237)/width-.5)*panelWidth,(.5-(y+37)/height)*panelHeight,.002],width:474/width*panelWidth,height:74/height*panelHeight};});
  const caption=audioCaption(),signature=JSON.stringify([station?.id,info,pending,message,caption,hovered,buttons.map(button=>[button.id,button.label,button.enabled])]);
  if(signature===lastSignature)return;lastSignature=signature;drawCount++;
  if(!ink)return;
  ink.clearRect(0,0,width,height);ink.fillStyle='rgba(25,13,40,.96)';ink.fillRect(0,0,width,height);ink.strokeStyle='#edb666';ink.lineWidth=6;ink.strokeRect(3,3,width-6,height-6);
  ink.textAlign='left';ink.textBaseline='middle';ink.fillStyle='#f4c77d';ink.font='bold 27px system-ui';ink.fillText('MIDNIGHT LAUGHS · IMMERSIVE CONTROLS',28,38,968);
  ink.font='bold 38px system-ui';ink.fillStyle='#ffedc8';ink.fillText(text(info.title||station?.name||'Welcome to the midway'),28,91,968);
  ink.fillStyle='#8df5e8';ink.font='bold 35px system-ui';ink.fillText(text(info.headline),28,150,968);
  ink.fillStyle='#e9c6dc';ink.font='25px system-ui';const detailLines=[];let detailLine='';for(const word of text(info.detail).split(' ')){const next=detailLine?detailLine+' '+word:word;if(ink.measureText(next).width>968&&detailLine){detailLines.push(detailLine);detailLine=word;}else detailLine=next;}if(detailLine)detailLines.push(detailLine);detailLines.slice(0,2).forEach((line,index)=>ink.fillText(line,28,192+index*31,968));
  ink.fillStyle='#ffd487';ink.font='bold 31px system-ui';ink.fillText(text(info.cue),28,267,968);
  for(const button of buttons){ink.fillStyle=button.enabled?(hovered===button.id?'#684164':'#32203f'):'#261b30';ink.fillRect(button.x,button.y,button.w,button.h);ink.strokeStyle=button.enabled?(hovered===button.id?'#91fff0':'#bc8d64'):'#514454';ink.lineWidth=hovered===button.id?6:3;ink.strokeRect(button.x+2,button.y+2,button.w-4,button.h-4);ink.fillStyle=button.enabled?'#fff1d0':'#8c7c96';ink.textAlign='center';ink.font='bold 27px system-ui';ink.fillText(text(button.label),button.x+button.w/2,button.y+button.h/2,button.w-24);}
  ink.textAlign='left';ink.font='23px system-ui';ink.fillStyle='#9be6df';
  if(caption&&!pending){
   ink.font='bold 22px system-ui';ink.fillText(text(caption.speaker||'Midnight clown'),28,686,968);ink.font='23px system-ui';
   const lines=[];let line='';for(const word of String(caption.text).slice(0,350).split(/\s+/)){const next=line?line+' '+word:word;if(ink.measureText(next).width>968&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);lines.slice(0,2).forEach((value,index)=>ink.fillText(value,28,714+index*27,968));
  }else ink.fillText(text(pending?'Attraction is responding…':message||state.message||'Either trigger selects · X/B opens the game menu'),28,719,968);
  texture.needsUpdate=true;
 }
 function anchor(){
  const tracked=getCamera();tracked?.updateWorldMatrix?.(true,false);tracked?.getWorldPosition?.(head);tracked?.getWorldQuaternion?.(orientation);
  forward.set(0,0,-1).applyQuaternion(orientation);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,-1);forward.normalize();right.set(1,0,0).applyQuaternion(orientation);right.y=0;right.normalize();
  root.position.copy(head).addScaledVector(forward,1.45).addScaledVector(right,.68);root.position.y-=.29;root.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);root.updateMatrixWorld(true);
  const pose=liveRidePosition();boardRideFollow=pose?{id:state.ride.id,position:{...pose}}:null;
 }
 function liveRidePosition(){const ride=state.ride;if(!active(ride))return null;const station=allStations().find(station=>station.id===ride.stationId);return station&&Number.isFinite(ride.startedAt)&&Number.isFinite(ride.durationMs)?funhouseRidePose(ride,station,now()).position:ride.pose?.position||null;}
 function setVisible(next){
  next=!!next&&!disposed&&getPresenting();if(next&&!visible){const station=currentStation();selectedId=station?.id||nearest()?.id||null;if(active(state.haunt))boardMode='haunt';else if(active(state.adventure)&&!station)boardMode='adventure';actionPage=0;anchor();onInputRelease('funhouse-vr-board');lastSignature='';}
  visible=next;root.visible=next;if(!next){held.clear();hovered=null;}redraw();return next;
 }
 function receive(snapshot,id){
  if(disposed)return false;const environmentId=getEnvironment()?.id;
  if(worldId!==null&&environmentId!==worldId)reset();worldId=environmentId;
  if(Number.isFinite(snapshot?.sequence)){if(snapshot.sequence<=sequence)return false;sequence=snapshot.sequence;}
  selfId=id||selfId;if(Number.isFinite(snapshot?.serverTime))offset=snapshot.serverTime-Date.now();
  if(snapshot?.actors&&typeof snapshot.actors==='object')latestActors=snapshot.actors;
  const next=snapshot?.players?.[selfId]?.funhouse||getState();if(next){if(next.message!==state.message)message='';state=next;}
  if(state.ride?.id){const key=state.ride.id+':'+state.ride.status;if(key!==observedRideId){observedRideId=key;pendingRideAnchor={key,position:active(state.ride)?state.ride.pose?.position:state.ride.pose?.exitPosition||allStations().find(station=>station.id===state.ride.stationId)?.position};if(active(state.ride)){boardMode='attraction';actionPage=0;}}}
  available=isFunhouseEnvironment(getEnvironment())||allStations().length>0;
  if(visible){const station=currentStation(),trail=boardMode==='haunt'&&funhouseHauntAvailable(getEnvironment())||boardMode==='adventure'&&funhouseAdventureAvailable(getEnvironment())||boardMode==='audio'&&isAvailable(),running=active(state.ride)||active(state.round)||active(state.challenge);if(!trail&&(!station||!running&&distance(snapshot?.players?.[selfId]?.position||getPosition(),station.position)>7))setVisible(false);}
  if(!getPresenting()&&visible)setVisible(false);redraw();return true;
 }
 function hitPanel(ray){
  if(disposed||!visible||!root.visible||!getPresenting())return null;
  const from=point(ray?.origin),toward=point(ray?.direction);if(!Object.values(from).every(Number.isFinite)||!Object.values(toward).every(Number.isFinite))return null;
  const direction=new THREE.Vector3(toward.x,toward.y,toward.z);if(direction.lengthSq()<1e-8)return null;
  root.updateMatrixWorld(true);inverse.copy(root.matrixWorld).invert();localRay.set(new THREE.Vector3(from.x,from.y,from.z),direction.normalize()).applyMatrix4(inverse);
  if(localRay.direction.z>=-1e-6)return null;const at=-localRay.origin.z/localRay.direction.z;if(at<0||at>5)return null;localRay.at(at,localPoint);
  const x=(localPoint.x/panelWidth+.5)*width,y=(.5-localPoint.y/panelHeight)*height;if(x<0||x>width||y<0||y>height)return null;
  return {button:buttons.find(button=>x>=button.x&&x<=button.x+button.w&&y>=button.y&&y<=button.y+button.h)||null};
 }
 function pointerMove(ray){const hit=hitPanel(ray),value=hit?.button?.enabled?hit.button.id:null;if(hovered!==value){hovered=value;redraw();}return !!hit;}
 function pointerDown(ray,controller='primary'){
  const hit=hitPanel(ray);if(!hit)return false;if(held.has(controller))return true;held.add(controller);
  if(hit.button?.enabled){Promise.resolve(hit.button.run()).catch(error=>onStatus(error.message));}return true;
 }
 function pointerUp(controller=null){if(controller===null)held.clear();else held.delete(controller);}
 function aimFields(ray){const origin=point(ray?.origin),direction=point(ray?.direction);return Object.values(origin).every(Number.isFinite)&&Object.values(direction).every(Number.isFinite)?{origin,direction:[direction.x,direction.y,direction.z]}:{};}
 function worldTrigger(ray,controller='primary'){
  if(disposed||pending)return !!pending;
  if(funhouseHauntAvailable(getEnvironment())){
   const target=funhouseInteractionHit(ray,getRoots(),{kind:'haunt',maxDistance:20});
   if(target){
    if(target.operation==='start'||target.operation==='haunt-start'){if(!active(state.ride)&&funhouseHauntNear(getPosition(),FUNHOUSE_HAUNT_START))void run('funhouse-haunt',{operation:'start'});else onStatus('Walk to the house lobby lantern and step off your ride to begin the Night Watch.');return true;}
    if(target.operation==='seal'){const ward=funhouseHauntNextWard(state.haunt);if(!ward)onStatus('Begin the Night Watch at the house lobby lantern.');else if(active(state.ride))onStatus('Step off your ride before sealing a haunted lantern.');else if(ward.id!==target.wardId)onStatus(ward.hint);else if(funhouseHauntNear(getPosition(),ward))void run('funhouse-haunt',{operation:'seal',hauntId:state.haunt.id,wardId:ward.id});else onStatus('Walk closer to '+ward.name+'.');return true;}
   }
  }
  if(funhouseAdventureAvailable(getEnvironment())){
   const discovery=funhouseInteractionHit(ray,getRoots(),{kind:'adventure',maxDistance:20});
   if(discovery){
    if(discovery.operation==='adventure-start'){if(!active(state.ride)&&funhouseAdventureNear(getPosition(),FUNHOUSE_ADVENTURE_START))void run('funhouse-adventure',{operation:'start'});else onStatus('Walk to the welcome board and step off your ride to begin the trail.');return true;}
    if(discovery.operation==='inspect'){
     const clue=funhouseAdventureNextClue(state.adventure);
     if(!clue)onStatus('Begin the Lost Laugh Trail at the welcome board.');
     else if(active(state.ride))onStatus('Step off your ride before inspecting a clue.');
     else if(clue.id!==discovery.clueId)onStatus(clue.hint);
     else if(funhouseAdventureNear(getPosition(),clue))void run('funhouse-adventure',{operation:'inspect',adventureId:state.adventure.id,clueId:clue.id});
     else onStatus('Walk closer to '+clue.name+'.');
     return true;
    }
   }
  }
  const station=currentStation();if(!station)return false;
  const round=active(state.round)?state.round:null,challenge=active(state.challenge)?state.challenge:null,ride=active(state.ride)?state.ride:null;
  const aimingGame=round||challenge?.kind==='ballpit';
  const hit=funhouseInteractionHit(ray,getRoots(),{...(aimingGame||ride?{stationId:canonicalId(station),objectId:station.objectId||undefined}:{}),...(round?{operation:'squirt'}:challenge?.kind==='ballpit'?{operation:'toss'}:{}),maxDistance:20}),fields=aimFields(ray);
  if(round&&round.stationId===station.id){const targetId=hit?.kind==='water'&&Number.isInteger(hit.targetId)?hit.targetId:-1;void run('funhouse-squirt',{roundId:round.id,targetId,...fields},station);return true;}
  if(challenge?.kind==='ballpit'&&challenge.stationId===station.id){const targetId=hit?.kind==='ballpit'&&Number.isInteger(hit.targetId)?hit.targetId:-1;void actionFor(station,'toss',{targetId,...fields});return true;}
  if(!hit){if(challenge||ride){onStatus('Aim at the attraction control, or open its immersive board.');return true;}return false;}
  const targetStation=allStations().find(value=>value.id===hit.stationId||value.objectId&&value.objectId===hit.objectId&&value.kind===hit.kind)||station;
  if(distance(getPosition(),targetStation.position)>(targetStation.interactionDistance||6.5)&&!ride)return false;
  const operation=hit.operation;
  if(operation==='ride')void command(targetStation,'funhouse-ride');
  else if(operation==='challenge')void command(targetStation,'funhouse-challenge');
  else if(operation==='start'&&targetStation.kind==='water')void command(targetStation,'funhouse-start');
  else if(operation==='start'&&['jackbox','ballpit','mirrors'].includes(targetStation.kind))void command(targetStation,'funhouse-challenge');
  else if(operation==='hat'||operation==='shoes'||operation==='dress-hat'||operation==='dress-shoes'){const slot=operation.includes('shoes')?'shoes':'hat';void command(targetStation,'funhouse-dress',{hat:slot==='hat'?!state.costume?.hat:!!state.costume?.hat,shoes:slot==='shoes'?!state.costume?.shoes:!!state.costume?.shoes});}
  else if(['honk','balance','wind','catch','toss','check-in','gentle'].includes(operation))void actionFor(targetStation,operation,{...(Number.isInteger(hit.targetId)?{targetId:hit.targetId}:{}),...fields});
  else void command(targetStation,'funhouse-use');
  return true;
 }
 function trigger(ray,controller='primary'){if(pointerDown(ray,controller))return true;if(held.has(controller))return true;const handled=worldTrigger(ray,controller);if(handled)held.add(controller);return handled;}
 function menuItems(){
  const station=currentStation(),items=[...attractionActions(station),...adventureActions(),...(station?.kind==='haunt'?[]:hauntActions())].map(action=>({id:'funhouse:'+action.id,label:action.label,disabled:!action.enabled,run:()=>action.enabled?action.run():onStatus(action.id.startsWith('haunt')?'Follow the Night Watch hint and move close to the glowing lantern.':action.id.startsWith('adventure')?'Follow the trail hint and move close to the correct discovery.':'Wait for the next attraction cue.')}));
  if(isAvailable())items.push({id:'funhouse:audio-board',label:'Clown voices, sounds & music',run:showAudio},{label:visible?'Hide attraction controls':'Show attraction controls',run:()=>setVisible(!visible)},{label:'Recenter attraction board',run:()=>{setVisible(true);anchor();}});
  return items;
 }
 function release(){held.clear();hovered=null;redraw();}
 function tick(){if(disposed||!visible)return;if(!getPresenting())setVisible(false);if(pendingRideAnchor){const tracked=getCamera(),pose=pendingRideAnchor.position;tracked?.updateWorldMatrix?.(true,false);tracked?.getWorldPosition?.(head);if(pose&&Math.hypot(head.x-pose.x,head.z-pose.z)<2.5){anchor();pendingRideAnchor=null;}}const ridePosition=liveRidePosition();if(ridePosition&&boardRideFollow?.id===state.ride.id&&!pendingRideAnchor){root.position.x+=ridePosition.x-boardRideFollow.position.x;root.position.y+=ridePosition.y-boardRideFollow.position.y;root.position.z+=ridePosition.z-boardRideFollow.position.z;boardRideFollow.position={...ridePosition};}if(!ridePosition)boardRideFollow=null;if(now()-lastTickAt<80)return;lastTickAt=now();redraw();}
 function reset(){generation++;pending=false;state={};latestActors=null;sequence=-1;selfId=null;selectedId=null;message='';lastSignature='';worldId=null;lastTickAt=-Infinity;boardMode='attraction';actionPage=0;observedRideId=pendingRideAnchor=boardRideFollow=null;held.clear();visible=available=false;root.visible=false;buttons=[];}
 return {root,update:receive,receive,tick,showAudio,showHaunt,setVisible,isActive:isAvailable,pointerDown,pointerMove,pointerUp,trigger,worldTrigger,menuItems,release,reset,snapshot:()=>({visible,disposed,pending,mode:boardMode,page:actionPage,stationId:currentStation()?.id||null,kind:currentStation()?.kind||null,audioSettings:audioSettings(),audioCaption:audioCaption(),message:message||state.message||'',drawCount,position:root.position.toArray(),quaternion:root.quaternion.toArray(),buttons:buttons.map(({id,label,enabled,position,width,height})=>({id,label,enabled,position:[...position],width,height})),round:state.round?{...state.round}:null,ride:state.ride?{...state.ride}:null,challenge:state.challenge?{...state.challenge}:null,adventure:state.adventure?{...state.adventure}:null,haunt:state.haunt?{...state.haunt}:null}),dispose(){if(disposed)return;reset();disposed=true;root.removeFromParent();geometry.dispose();material.dispose();texture.dispose();}};
}
