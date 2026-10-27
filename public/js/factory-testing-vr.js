import * as T from '../vendor/three/three.module.min.js';
import {testingStations,testingTargets,isProvingEnvironment,isCompoundEnvironment,testingDeepAccess} from './factory-test-config.js';
import {ownTestingItems,testingSessionPhase,testingFlightPoint} from './factory-testing-ui.js';

const PAGES=Object.freeze(['setup','launch','telemetry','compound']);
const names={setup:'SETUP & DEPLOY',launch:'LAUNCH CONTROL',telemetry:'FLIGHT TELEMETRY',compound:'COMPOUND ACCESS'};
const point=value=>Array.isArray(value)?{x:Number(value[0]),y:Number(value[1]),z:Number(value[2])}:{x:Number(value?.x),y:Number(value?.y),z:Number(value?.z)};
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const active=value=>value&&value.active!==false&&value.enabled!==false&&!value.disabled&&!value.deleted;
const clamp=value=>Math.max(-1,Math.min(1,Math.round(value*10)/10));
const text=(value,limit=120)=>String(value??'').replace(/[\r\n]+/g,' ').slice(0,limit);
const title=value=>String(value||'standby').replaceAll('-',' ').replace(/^./,char=>char.toUpperCase());
const live=session=>session&&!['complete','cancelled'].includes(session.status);
const animating=session=>['countdown','flight','impact'].includes(session?.status);

export function testingDashboardPage(station){
 const page=station?.dashboardKind||station?.testingDashboard||station?.dashboard;
 if(PAGES.includes(page))return page;
 return station?.kind==='control'?'launch':['hatch','containment','deep-hatch','return'].includes(station?.kind)?'compound':'setup';
}

/** A real scene dashboard: controller rays hit its plane, not a DOM overlay.
 * Anchoring reads the tracked camera once on open/recenter and never writes it.
 * All outcomes, ownership and clearances continue to come from room commands. */
export function createFactoryTestingVR({THREE=T,scene,camera,getCamera=()=>camera,getEnvironment=()=>null,getPosition=()=>null,getActors=()=>({}),getPresenting=()=>true,getServerTime=null,send=async()=>null,onStatus=()=>{},onInputRelease=()=>{},getReducedMotion=()=>false,createCanvas=()=>typeof document==='undefined'?null:document.createElement('canvas')}={}){
 const root=new THREE.Group();root.name='ATLAS_FACTORY_TESTING_VR';root.visible=false;root.userData.collisionDisabled=true;root.userData.factoryTestingDashboard=true;scene.add(root);
 const W=1280,H=960,panelWidth=1.22,panelHeight=.915,canvas=createCanvas();if(canvas){canvas.width=W;canvas.height=H;}
 const ink=canvas?.getContext?.('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const geometry=new THREE.PlaneGeometry(panelWidth,panelHeight),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),face=new THREE.Mesh(geometry,material);
 face.name='FACTORY_TESTING_VR_DASHBOARD';face.renderOrder=990;face.userData.collisionDisabled=true;root.add(face);
 const inverse=new THREE.Matrix4(),localRay=new THREE.Ray(),localPoint=new THREE.Vector3(),head=new THREE.Vector3(),orientation=new THREE.Quaternion(),forward=new THREE.Vector3();
 const held=new Set();
 let disposed=false,shown=false,pending=false,generation=0,worldId=null,selfId=null,self=null,state={},view=null,actors={},sequence=-1,privateSequence=-1,eligibleItems=[],selectedItemId=null,selectedTargetId=null,selectedStationId=null,page='setup',watchId=null,aim={x:0,y:0},message='',hovered=null,buttons=[],drawCount=0,lastSignature='',offset=0,lastTick=-Infinity,lastStatusPoll=-Infinity;
 const now=()=>{const value=getServerTime?.();return Number.isFinite(value)?value:Date.now()+offset;};
 const stations=()=>{const list=Array.isArray(view?.stations)?view.stations:testingStations(getEnvironment(),{actors:Object.keys(actors).length?actors:getActors()});return list.filter(value=>active(value)&&value.position);};
 const kind=()=>view?.kind||(isCompoundEnvironment(getEnvironment())?'compound':isProvingEnvironment(getEnvironment())?'proving':null);
 const isActive=()=>!disposed&&(worldId===null||worldId===getEnvironment()?.id)&&!!kind()&&stations().length>0;
 const position=()=>getPosition()||self?.position;
 function role(name){const all=stations().filter(station=>station.kind===name);return all.find(station=>station.id===selectedStationId&&distance(position(),station.position)<=(station.interactionDistance||6))||all.sort((a,b)=>distance(position(),a.position)-distance(position(),b.position))[0]||null;}
 const at=name=>{const station=role(name);return !!self&&self.health!==0&&!self.vehicleId&&!self.seatedId&&!!station&&distance(position(),station.position)<=(station.interactionDistance||6);};
 const handsFree=()=>!self?.heldId;
 const item=()=>eligibleItems.find(value=>value.id===selectedItemId)||null;
 const targets=()=>{const profile=item()?.profileId||state.session?.profileId;return (Array.isArray(view?.targets)?view.targets:testingTargets(getEnvironment(),{actors:Object.keys(actors).length?actors:getActors()})).filter(value=>active(value)&&value.profileId===profile);};
 const target=()=>targets().find(value=>value.id===selectedTargetId)||targets()[0]||null;
 function alignSelection(){
  if(!eligibleItems.some(value=>value.id===selectedItemId))selectedItemId=eligibleItems.find(value=>value.id===state.session?.itemId)?.id||eligibleItems[0]?.id||null;
  if(!targets().some(value=>value.id===selectedTargetId))selectedTargetId=targets()[0]?.id||null;
 }
 function sessionForDisplay(){const all=view?.sessions||[];return watchId?all.find(value=>value.session?.id===watchId)?.session||state.session||all[0]?.session:state.session||all.find(value=>animating(value.session))?.session||all[0]?.session||null;}
 const entry=(id,label,run,enabled=true,local=false)=>({id,label,run,enabled:!!enabled,local});
 function run(action,fields={}){
  if(disposed||pending||!getPresenting()||!isActive())return Promise.resolve(false);
  const token=generation,environmentId=getEnvironment()?.id,owner=selfId;pending=true;message='';if(action==='proving-status')lastStatusPoll=now();redraw();
  return Promise.resolve().then(()=>send(action,fields)).then(snapshot=>{
   if(disposed||token!==generation||getEnvironment()?.id!==environmentId||selfId!==owner||!snapshot)return false;
   // Cross-map travel has already been handled by the shared client. Its old
   // room response must not paint a newly entered map or revive this board.
   if(snapshot.result?.destination&&snapshot.result.destination!==environmentId)return false;
   const accepted=receive(snapshot,snapshot.selfId||selfId);if(!accepted)return false;
   if(action!=='proving-status'){message=snapshot.result?.message||'Room controls synchronized.';onStatus(message);}return true;
  }).catch(error=>{if(!disposed&&token===generation&&getEnvironment()?.id===environmentId){message=error.message||'This station is unavailable.';onStatus(message);}return false;}).finally(()=>{if(!disposed&&token===generation){pending=false;redraw();}});
 }
 const stationFields=name=>({stationId:role(name)?.id});
 function changeItem(step){if(!eligibleItems.length)return;const index=eligibleItems.findIndex(value=>value.id===selectedItemId);selectedItemId=eligibleItems[(index+step+eligibleItems.length)%eligibleItems.length].id;selectedTargetId=null;alignSelection();redraw();}
 function changeTarget(step){const all=targets();if(!all.length)return;const index=all.findIndex(value=>value.id===selectedTargetId);selectedTargetId=all[(index+step+all.length)%all.length].id;redraw();}
 function changeAim(axis,delta){if(!at('control')||!handsFree()||!['configured','deployed','armed'].includes(state.session?.status))return;aim={...aim,[axis]:clamp(aim[axis]+delta)};redraw();}
 function watchNext(){const all=(view?.sessions||[]).filter(value=>value.session);if(!all.length)return;const index=all.findIndex(value=>value.session.id===(watchId||state.session?.id));watchId=all[(index+1+all.length)%all.length].session.id;redraw();}
 function actions(){
  const session=state.session,ready=!live(session),foot=handsFree(),configured=session?.status==='configured',deployed=session?.status==='deployed',armed=session?.status==='armed',canAim=foot&&at('control')&&['configured','deployed','armed'].includes(session?.status),clearance=state.clearance||{},containment=state.containment;
  if(page==='setup')return [
   entry('item-prev','Previous owned model',()=>changeItem(-1),ready&&eligibleItems.length>1,true),entry('item-next','Next owned model',()=>changeItem(1),ready&&eligibleItems.length>1,true),
   entry('target-prev','Previous practice target',()=>changeTarget(-1),ready&&targets().length>1,true),entry('target-next','Next practice target',()=>changeTarget(1),ready&&targets().length>1,true),
   entry('configure','Configure this test',()=>run('proving-setup',{itemId:item()?.id,profileId:item()?.profileId,targetId:target()?.id,...stationFields('setup')}),kind()==='proving'&&ready&&foot&&at('setup')&&item()&&target()),
   entry('recall','Recall own display copy',()=>run('proving-recall',{itemId:item()?.id,...stationFields(at('setup')?'setup':'pad')}),kind()==='proving'&&item()&&(at('setup')||at('pad'))&&(!live(session)||configured)),
   entry('deploy','Deploy at launch pad',()=>run('proving-deploy',{sessionId:session?.id,padId:role('pad')?.id}),kind()==='proving'&&configured&&foot&&at('pad')),
   entry('refresh','Refresh owned models',()=>run('proving-status'))
  ];
  if(page==='launch')return [
   entry('aim-x-minus','Horizontal −0.1',()=>changeAim('x',-.1),canAim&&aim.x> -1,true),entry('aim-x-plus','Horizontal +0.1',()=>changeAim('x',.1),canAim&&aim.x<1,true),
   entry('aim-y-minus','Vertical −0.1',()=>changeAim('y',-.1),canAim&&aim.y> -1,true),entry('aim-y-plus','Vertical +0.1',()=>changeAim('y',.1),canAim&&aim.y<1,true),
   entry('arm','ARM deployed model',()=>run('proving-arm',{sessionId:session?.id,...stationFields('control')}),kind()==='proving'&&deployed&&foot&&at('control')),
   entry('launch','START launch countdown',()=>run('proving-launch',{sessionId:session?.id,aim:{...aim},...stationFields('control')}),kind()==='proving'&&armed&&foot&&at('control')),
   entry('abort','Abort active test',()=>run('proving-cancel',{sessionId:session?.id}),kind()==='proving'&&live(session)&&foot&&['setup','pad','control'].some(at)),
   entry('refresh','Refresh launch status',()=>run('proving-status'))
  ];
  if(page==='telemetry')return [
   entry('refresh','Refresh flight report',()=>run('proving-status')),entry('watch-next','Watch next shared flight',watchNext,(view?.sessions||[]).filter(value=>value.session).length>1,true),
   entry('to-launch','Open launch dashboard',()=>setDashboard('launch'),kind()==='proving',true),entry('to-setup','Open setup dashboard',()=>setDashboard('setup'),kind()==='proving',true),
   entry('compound-enter','Enter mountain facility',()=>run('proving-enter',stationFields('hatch')),kind()==='proving'&&foot&&at('hatch')&&clearance.compound),
   entry('to-compound','View compound clearance',()=>setDashboard('compound'),true,true)
  ];
  const circuitReady=kind()==='compound'&&foot&&at('containment')&&containment?.status==='active';
  return [
   entry('core-start','Begin circuit stabilization',()=>run('proving-core-start',stationFields('containment')),kind()==='compound'&&foot&&at('containment')&&containment?.status!=='active'),
   entry('core-confirm','Confirm stable circuit',()=>run('proving-core-confirm',{puzzleId:containment?.id,...stationFields('containment')}),circuitReady&&now()-(containment?.startedAt||0)>=2000&&(containment?.moves||0)>=3&&['coolant','shield','power'].every(channel=>containment.channels?.[channel]?.value===containment.channels?.[channel]?.target)),
   ...[['coolant','Blue'],['shield','Violet'],['power','Gold']].flatMap(([channel,name])=>[-1,1].map(delta=>entry('channel-'+channel+(delta<0?'-minus':'-plus'),name+' circuit '+(delta<0?'−':'+'),()=>run('proving-core-adjust',{puzzleId:containment?.id,channel,delta,...stationFields('containment')}),circuitReady&&(!Number.isFinite(containment?.lastInputAt)||now()-containment.lastInputAt>=150)))),
   entry('deep-enter','Enter deep bunker',()=>run('proving-deep-enter',stationFields('deep-hatch')),kind()==='compound'&&foot&&at('deep-hatch')&&testingDeepAccess(getEnvironment(),state)),
   entry('surface-return',kind()==='compound'?'Return to surface':'Enter mountain compound',()=>kind()==='compound'?run('proving-return',stationFields('return')):run('proving-enter',stationFields('hatch')),foot&&(kind()==='compound'?at('return'):at('hatch')&&clearance.compound))
  ];
 }
 function layout(){
  const navigation=PAGES.map((value,index)=>({...entry('page-'+value,value.toUpperCase(),()=>setDashboard(value),true,true),x:28+index*310,y:112,w:294,h:60}));
  const cells=actions().map((action,index)=>{const column=index%2,row=Math.floor(index/2),rows=page==='compound'?5:4,top=page==='compound'?414:494,step=page==='compound'?82:88;return {...action,x:28+column*620,y:top+row*step,w:604,h:rows===5?66:72};});
  const footer=[{...entry('recenter','Recenter dashboard',recenter,true,true),x:28,y:900,w:300,h:44},{...entry('cycle','Next dashboard →',cycleDashboard,true,true),x:490,y:900,w:300,h:44},{...entry('close','Hide dashboard',()=>setVisible(false),true,true),x:952,y:900,w:300,h:44}];
  return [...navigation,...cells,...footer].map(button=>({...button,enabled:button.enabled&&(!pending||button.local),position:[((button.x+button.w/2)/W-.5)*panelWidth,(.5-(button.y+button.h/2)/H)*panelHeight,.002],width:button.w/W*panelWidth,height:button.h/H*panelHeight}));
 }
 function paintText(value,x,y,size=28,color='#e1f3ed',bold=false,max=1220){if(!ink)return;ink.font=(bold?'bold ':'')+size+'px system-ui';ink.fillStyle=color;ink.fillText(text(value),x,y,max);}
 function summary(){
  const session=state.session,itemName=item()?.name||'No receipt-verified models loaded',profile=item()?.profileId==='cargo'?'Cargo landing':'Training accuracy',selectedTarget=target();
  if(page==='setup')return [itemName,profile+' · '+(selectedTarget?.name||'No active matching target'),at('setup')?'At preparation station · configure your owned model':at('pad')?'At launch pad · deploy a configured test':'Walk to preparation to configure, then the pad to deploy'];
  if(page==='launch'){const phase=testingSessionPhase(session,now());return [session?.itemName||'No configured test',phase.countdown?'LAUNCH IN '+phase.countdown+' seconds':title(phase.phase)+' · alignment X '+aim.x.toFixed(1)+' / Y '+aim.y.toFixed(1),at('control')?'At launch control · arm first, then start the countdown':'Walk to an arm & launch control dashboard to operate'];}
  if(page==='telemetry'){const shownSession=sessionForDisplay(),phase=testingSessionPhase(shownSession,now());return [shownSession?.itemName||'No shared flights recorded',phase.countdown?'COUNTDOWN · '+phase.countdown+' seconds':title(phase.phase)+' · '+Math.round(phase.progress*100)+'% of course',shownSession?.result?'SERVER REPORT · '+shownSession.result.grade+' · '+shownSession.result.score+'/100':'Vector course, target effect and cargo landing follow server time'];}
  const clearance=state.clearance||{},puzzle=state.containment;
  return [testingDeepAccess(getEnvironment(),state)?'DEEP BUNKER CLEARANCE GRANTED':clearance.compound?'MOUNTAIN COMPOUND ACCESS GRANTED':'FACILITY LOCKED · complete both proving profiles',kind()==='compound'?'Blue '+(puzzle?.channels?.coolant?.value??'—')+' → '+(puzzle?.channels?.coolant?.target??'—')+'    Violet '+(puzzle?.channels?.shield?.value??'—')+' → '+(puzzle?.channels?.shield?.target??'—')+'    Gold '+(puzzle?.channels?.power?.value??'—')+' → '+(puzzle?.channels?.power?.target??'—'):'Qualified profiles: '+(state.progress?.canonicalProfiles||[]).join(' / '),kind()==='compound'?title(puzzle?.status||'stabilization not started')+' · '+(puzzle?.moves||0)+' adjustments':'Complete accuracy and cargo tests, then visit the mountain hatch'];
 }
 function drawArc(session){
  if(!ink)return;const clock=now(),phase=testingSessionPhase(session,clock),reduced=getReducedMotion(),sample=reduced&&phase.phase==='flight'?session.launchAt+(session.flightEndsAt-session.launchAt)/2:clock,flight=testingFlightPoint(session,sample);
  ink.save();ink.translate(28,322);ink.scale(1.53,.47);ink.fillStyle='#102d3b';ink.fillRect(0,0,800,300);ink.strokeStyle='#345766';ink.lineWidth=2;
  for(let x=0;x<=800;x+=50){ink.beginPath();ink.moveTo(x,0);ink.lineTo(x,300);ink.stroke();}
  ink.strokeStyle='#66b5b4';ink.setLineDash?.([8,10]);ink.beginPath();ink.moveTo(95,240);ink.quadraticCurveTo(390,-22,flight.cargo?665:690,flight.cargo?238:222);ink.stroke();ink.setLineDash?.([]);
  ink.strokeStyle='#f3c274';ink.lineWidth=4;ink.beginPath();ink.arc(flight.cargo?665:690,flight.cargo?238:222,25,0,Math.PI*2);ink.stroke();
  if(session&&!['cancelled','impact','complete'].includes(phase.phase)){ink.save();ink.translate(flight.x,flight.y);ink.rotate(flight.angle*Math.PI/180);ink.fillStyle='#def4ed';ink.beginPath();ink.moveTo(-20,-7);ink.lineTo(12,-7);ink.lineTo(28,0);ink.lineTo(12,7);ink.lineTo(-20,7);ink.closePath();ink.fill();ink.restore();}
  if(['impact','complete'].includes(phase.phase)){ink.strokeStyle=flight.cargo?'#8fe0be':'#f6c780';ink.beginPath();ink.arc(flight.cargo?665:690,flight.cargo?238:222,phase.phase==='impact'&&!reduced?30+Math.floor((clock-session.flightEndsAt)/120)%4*8:38,0,Math.PI*2);ink.stroke();}
  ink.restore();
 }
 function padSummary(){const pads=stations().filter(station=>station.kind==='pad'),rows=view?.sessions||[];if(!pads.length)return 'PAD STATUS · no active launch pads';return pads.map(pad=>{const operator=rows.find(row=>row.session?.padId===pad.id&&live(row.session));return (pad.name||'Pad')+': '+(operator?(operator.name||'Operator')+' / '+title(operator.session.status):'AVAILABLE');}).join('  ·  ');}
 function recordSummary(){const progress=state.progress||{},best=progress.bestScores||{},skills=progress.skills||{},badges=progress.badges||[];return 'RECORD '+(progress.completedTests||0)+' tests  ·  BEST '+(best.accuracy||0)+' / '+(best.cargo||0)+'  ·  SKILLS '+(skills.accuracy||0)+' / '+(skills.cargo||0)+'  ·  '+(badges.at(-1)||'No field badge yet');}
 function redraw(){
  if(disposed||!shown){lastSignature='';return;}
  alignSelection();buttons=layout();const info=summary(),display=sessionForDisplay(),phase=testingSessionPhase(display,now());
  const signature=JSON.stringify([page,info,pending,message,hovered,eligibleItems.map(value=>[value.id,value.name]),selectedTargetId,state.clearance,state.containment,state.progress,padSummary(),buttons.map(button=>[button.id,button.label,button.enabled]),page==='telemetry'&&animating(display)?Math.floor(now()/(getReducedMotion()?500:100)):phase.phase]);
  if(signature===lastSignature)return;lastSignature=signature;drawCount++;if(!ink)return;
  ink.clearRect(0,0,W,H);ink.fillStyle='rgba(9,28,39,.97)';ink.fillRect(0,0,W,H);ink.strokeStyle='#7fc7b9';ink.lineWidth=5;ink.strokeRect(3,3,W-6,H-6);ink.textAlign='left';ink.textBaseline='middle';
  paintText('ATLAS PROVING GROUNDS / IMMERSIVE OPERATIONS',28,34,24,'#8edcc9',true);
  paintText(names[page],28,77,38,'#f2d19a',true);paintText(info[0],28,211,31,'#e2f5ed',true);paintText(info[1],28,258,27,'#a6d6d3');paintText(info[2],28,302,25,'#c7b78f');
  if(page==='telemetry'){drawArc(display);ink.textAlign='left';paintText(padSummary(),28,477,21,'#b5cda9');}
  else if(page==='compound'){const clearance=state.clearance||{};paintText('COMPOUND '+(clearance.compound?'UNLOCKED':'LOCKED')+'       DEEP BUNKER '+(testingDeepAccess(getEnvironment(),state)?'UNLOCKED':'LOCKED'),28,369,28,'#94dcc6',true);}
  else if(page==='launch'){ink.strokeStyle='#91dacc';ink.lineWidth=3;ink.strokeRect(28,334,1224,120);const x=640+aim.x*450,y=394+aim.y*45;ink.beginPath();ink.moveTo(x-19,y);ink.lineTo(x+19,y);ink.moveTo(x,y-19);ink.lineTo(x,y+19);ink.stroke();paintText('GAME ALIGNMENT · X '+aim.x.toFixed(1)+' / Y '+aim.y.toFixed(1),52,430,23,'#91c5c3');}
  else{paintText('OWNED MODEL '+(eligibleItems.findIndex(value=>value.id===selectedItemId)+1)+' / '+eligibleItems.length+'       ACTIVE TARGETS '+targets().length,28,376,28,'#94dcc6',true);paintText('Models remain in Backpack. Every deployment and result is server verified.',28,425,24,'#92afb9');}
  for(const button of buttons){const tab=button.id==='page-'+page;ink.fillStyle=button.enabled?(hovered===button.id?'#315d68':tab?'#294d58':'#183947'):'#142a35';ink.fillRect(button.x,button.y,button.w,button.h);ink.strokeStyle=button.enabled?(hovered===button.id?'#c9fff1':tab?'#91dec9':'#507d85'):'#35505b';ink.lineWidth=hovered===button.id?5:2;ink.strokeRect(button.x+1,button.y+1,button.w-2,button.h-2);ink.textAlign='center';paintText(button.label,button.x+button.w/2,button.y+button.h/2,button.id.startsWith('page-')?25:27,button.enabled?'#e8f3e9':'#7f99a2',true,button.w-22);}
  ink.textAlign='left';paintText(recordSummary(),28,851,21,'#8eb3ae');paintText(pending?'Waiting for the shared server…':message||'Either trigger selects · release before selecting again · recenter keeps head tracking free',28,874,23,'#94c8c5');texture.needsUpdate=true;
 }
 function anchor(){
  const tracked=getCamera();if(!tracked?.getWorldPosition||!tracked?.getWorldQuaternion)return false;tracked.updateWorldMatrix?.(true,false);tracked.getWorldPosition(head);tracked.getWorldQuaternion(orientation);
  forward.set(0,0,-1).applyQuaternion(orientation);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,-1);forward.normalize();
  root.position.copy(head).addScaledVector(forward,1.4);root.position.y-=.18;root.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);root.updateMatrixWorld(true);return true;
 }
 function recenter(){if(disposed||!getPresenting()||!isActive())return false;if(!shown)setVisible(true);anchor();lastSignature='';redraw();return true;}
 function setDashboard(next){if(!PAGES.includes(next)||disposed)return false;page=next;lastSignature='';redraw();return true;}
 function cycleDashboard(){setDashboard(PAGES[(PAGES.indexOf(page)+1)%PAGES.length]);return page;}
 function setVisible(next,stationId=null){
  next=!!next&&!disposed&&getPresenting()&&isActive();
  if(next){if(!stationId&&!shown&&kind()==='compound'&&page==='setup')page='compound';if(stationId){selectedStationId=stationId;const station=stations().find(value=>value.id===stationId);page=testingDashboardPage(station);}if(!shown){anchor();onInputRelease('factory-testing-vr-board');}}
  shown=next;root.visible=next;if(!next){held.clear();hovered=null;lastSignature='';}redraw();if(next&&!pending)void run('proving-status');return next;
 }
 function receive(snapshot,id){
  if(disposed)return false;const environmentId=getEnvironment()?.id;if(!snapshot){reset();return false;}
  if(worldId!==null&&environmentId!==worldId||selfId!==null&&id&&id!==selfId)reset();worldId=environmentId;
  const nextSequence=snapshot.sequence;if(Number.isFinite(nextSequence)&&nextSequence<sequence)return false;
  const newer=!Number.isFinite(nextSequence)||nextSequence>sequence;
  const owner=id||snapshot.selfId||selfId;if(!owner)return false;
  if(newer){selfId=owner;self=snapshot.players?.[owner]||null;if(!self){state={};eligibleItems=[];setVisible(false);return false;}const previousSession=state.session?.id;state={...state,...self.testing};if(state.session?.id!==previousSession)aim={x:clamp(state.session?.aim?.x||0),y:clamp(state.session?.aim?.y||0)};view=snapshot.testing||null;actors=snapshot.actors||actors;if(Number.isFinite(nextSequence))sequence=nextSequence;if(Number.isFinite(snapshot.serverTime))offset=snapshot.serverTime-Date.now();}
  const privateState=snapshot.result?.testing;
  if(privateState&&owner===selfId&&(!Number.isFinite(nextSequence)||nextSequence>=privateSequence)){
   if(Array.isArray(privateState.eligibleItems))eligibleItems=ownTestingItems(privateState).map(value=>({...value}));
   if(newer)state={...state,...privateState};if(Number.isFinite(nextSequence))privateSequence=nextSequence;
  }
  alignSelection();if(!isActive()||!getPresenting())setVisible(false);redraw();return true;
 }
 function hitPanel(ray){
  if(disposed||!shown||!root.visible||!getPresenting())return null;const origin=point(ray?.origin),direction=point(ray?.direction);
  if(![...Object.values(origin),...Object.values(direction)].every(Number.isFinite))return null;
  const heading=new THREE.Vector3(direction.x,direction.y,direction.z);if(heading.lengthSq()<1e-8)return null;
  root.updateMatrixWorld(true);inverse.copy(root.matrixWorld).invert();localRay.set(new THREE.Vector3(origin.x,origin.y,origin.z),heading.normalize()).applyMatrix4(inverse);
  if(localRay.direction.z>=-1e-6)return null;const travel=-localRay.origin.z/localRay.direction.z;if(travel<0||travel>5)return null;localRay.at(travel,localPoint);
  const x=(localPoint.x/panelWidth+.5)*W,y=(.5-localPoint.y/panelHeight)*H;if(x<0||x>W||y<0||y>H)return null;
  return {button:buttons.find(button=>x>=button.x&&x<=button.x+button.w&&y>=button.y&&y<=button.y+button.h)||null,x,y};
 }
 function pointerMove(ray){redraw();const hit=hitPanel(ray),next=hit?.button?.enabled?hit.button.id:null;if(next!==hovered){hovered=next;redraw();}return !!hit;}
 function pointerDown(ray,controller='primary'){
  if(held.has(controller))return true;redraw();const hit=hitPanel(ray);if(!hit)return false;held.add(controller);
  if(hit.button?.enabled){const epoch=generation,result=hit.button.run();if(!disposed&&epoch===generation)held.add(controller);Promise.resolve(result).catch(error=>onStatus(error.message));}return true;
 }
 function pointerUp(controller=null){if(controller===null)held.clear();else held.delete(controller);}
 function tick(){
  if(disposed)return;if(worldId!==null&&getEnvironment()?.id!==worldId){reset();return;}if(shown&&(!getPresenting()||!isActive())){setVisible(false);return;}if(!shown)return;
  const time=now();if(time-lastTick>=(getReducedMotion()?300:80)){lastTick=time;redraw();}
  if(!pending&&animating(state.session)&&time-lastStatusPoll>=1100)void run('proving-status');
 }
 function menuItems(){return [{label:shown?'Hide testing dashboards':'Show testing dashboards',run:()=>setVisible(!shown)},...PAGES.map(value=>({label:names[value],run:()=>{setDashboard(value);setVisible(true);}})),{label:'Recenter testing dashboard',run:recenter}];}
 function reset(){generation++;shown=pending=false;root.visible=false;selfId=null;self=null;state={};view=null;actors={};worldId=null;sequence=privateSequence=-1;eligibleItems=[];selectedItemId=selectedTargetId=selectedStationId=null;page='setup';watchId=null;aim={x:0,y:0};message=hovered='';buttons=[];lastSignature='';lastTick=lastStatusPoll=-Infinity;held.clear();}
 return {root,receive,update:receive,tick,isActive,visible:()=>shown,setVisible,setDashboard,cycleDashboard,recenter,pointerMove,pointerDown,pointerUp,release(){pointerUp();hovered=null;redraw();},menuItems,reset,snapshot:()=>({visible:shown,active:isActive(),disposed,pending,generation,worldId,page,stationId:selectedStationId,selectedItemId,selectedTargetId,eligibleItems:eligibleItems.map(value=>({...value})),aim:{...aim},session:state.session?structuredClone(state.session):null,clearance:{...state.clearance},containment:state.containment?structuredClone(state.containment):null,message,hovered,drawCount,padStatus:padSummary(),record:recordSummary(),position:root.position.toArray(),quaternion:root.quaternion.toArray(),buttons:buttons.map(({id,label,enabled,position,width,height})=>({id,label,enabled,position:[...position],width,height}))}),dispose(){if(disposed)return;reset();disposed=true;root.removeFromParent();geometry.dispose();material.dispose();texture.dispose();}};
}
