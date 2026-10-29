import {QUARRY_MATERIALS} from './quarry-config.js';
import {constructionStructure,constructionMachineChoices,constructionWorkAreas} from './construction-workplans.js';
import {constructionOperations} from './construction-operations.js';
import {gameplayOverlayOpen} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
import {sportIcon} from './sports-action-bar.js';
import {mountThumbstick} from './thumbstick-input.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
import {CONSTRUCTION_CREW_PALETTES,CONSTRUCTION_CREW_COLORS,CONSTRUCTION_CREW_JOBS} from './construction-crew.js';
import {constructionMachineKind,craneHookPosition,CONSTRUCTION_LOAD_OFFSET} from './construction-state.js';
export {constructionMachineKind} from './construction-state.js';

const names={crane:'Tower crane · lifting station',truck:'Articulated dumptruck',bulldozer:'Crawler bulldozer',excavator:'Hydraulic excavator · ISO controls'};
const setText=(node,value)=>{value=String(value);if(node.textContent!==value)node.textContent=value;};
const setHidden=(node,value)=>{value=!!value;if(node.hidden!==value)node.hidden=value;};
const setDisabled=(node,value)=>{value=!!value;if(node.disabled!==value)node.disabled=value;};
const setAttr=(node,name,value)=>{value=String(value);if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
export function constructionControlScheme(kind){
 if(kind==='crane')return [
  {label:'Slew / trolley',horizontal:'slew',vertical:'trolley',verticalSign:1,left:'Slew left −',right:'Slew right +',up:'Trolley out +',down:'Trolley in −',description:'Push forward to send the trolley away from the mast; pull back to bring it in. Move left or right to slew the jib.'},
  {label:'Hoist / spreader',horizontal:'loadYaw',vertical:'hoist',verticalSign:-1,left:'Steel yaw −',right:'Steel yaw +',up:'Lower hook −',down:'Raise hook +',description:'Push forward to lower the hook. Pull back to raise it. Left and right rotate the powered spreader and suspended steel. Release the lever to hold height and yaw.'}
 ];
 if(kind==='excavator')return [
  {label:'Left ISO joystick',horizontal:'slew',vertical:'stick',verticalSign:1,left:'Swing left −',right:'Swing right +',up:'Stick out +',down:'Stick in −',description:'ISO left control: push forward to extend the dipper stick; pull back to retract it. Left and right swing the upper carriage.'},
  {label:'Right ISO joystick',horizontal:'bucket',vertical:'boom',verticalSign:-1,left:'Bucket curl −',right:'Uncurl bucket +',up:'Lower boom −',down:'Raise boom +',description:'ISO right control: push forward to lower the boom, pull back to raise it. Left curls the bucket inward; right uncurls it.'}
 ];
 if(kind==='bulldozer')return [{label:'Blade lift lever',horizontal:null,vertical:'blade',verticalSign:-1,up:'Lower blade −',down:'Raise blade +',description:'Push the lift lever forward to lower the blade cutting edge. Pull back to raise the blade for travel.'}];
 if(kind==='truck')return [{label:'Body hoist lever',horizontal:null,vertical:'bed',verticalSign:-1,up:'Lower body −',down:'Raise body +',description:'Push forward to lower the dump body; pull back to tip it. The body hoist is interlocked while the truck is moving.'}];
 return [];
}
const instrumentSpec=(id,label,min,max,unit,digits=1)=>({id,label,min,max,unit,digits});
export function constructionInstrumentSpecs(kind){
 const config=Object.entries(ROAD_VEHICLES).find(([id])=>constructionMachineKind({modelId:id})===kind)?.[1];
 const speed=instrumentSpec('speed','Ground speed',0,(config?.speed||1)*3.6,'km/h');
 if(kind==='crane')return [instrumentSpec('slew','Jib bearing',0,360,'°',0),instrumentSpec('trolley','Trolley reach',4,42,'m'),instrumentSpec('hoist','Hook height',.8,74,'m'),instrumentSpec('loadYaw','Steel yaw (world)',0,360,'°',0),instrumentSpec('load','Steel attachment',0,1,'beam',0),instrumentSpec('hookLoad','Suspended load',0,6,'t'),instrumentSpec('loadMoment','Load moment',0,100,'%',0)];
 if(kind==='excavator')return [speed,instrumentSpec('swing','Swing clockwise',0,360,'°',0),instrumentSpec('boom','Boom angle',.3*180/Math.PI,1.3*180/Math.PI,'°'),instrumentSpec('stick','Dipper angle',-1.5*180/Math.PI,-.2*180/Math.PI,'°'),instrumentSpec('bucket','Bucket curl',-1.2*180/Math.PI,1.2*180/Math.PI,'°'),instrumentSpec('load','Bucket fill',0,2,'m³')];
 if(kind==='bulldozer')return [speed,instrumentSpec('blade','Cutting edge height',0,1.2,'m',2),instrumentSpec('graded','Site grading',0,100,'%',0)];
 return [speed,instrumentSpec('bed','Dump body angle',0,.95*180/Math.PI,'°'),instrumentSpec('load','Body payload',0,40,'m³')];
}
const axisNames={slew:'Slew / swing',trolley:'Trolley',loadYaw:'Spreader yaw',hoist:'Hoist',boom:'Boom',stick:'Dipper stick',bucket:'Bucket',blade:'Blade lift',bed:'Body hoist'};
const degrees=value=>Number(value||0)*180/Math.PI;
const bearing=value=>(degrees(value)%360+360)%360;
export function constructionSteelStep(state={},site={}){
 if(state.assist)return {operation:state.load?'aim-target':'aim-supply',step:state.load?3:1,label:'Aligning…',busy:true};
 if(state.load){
  const target=constructionStructure(site,{construction:state})?.target,hook=state.hook,aligned=!!target&&!!hook&&Math.hypot(hook.x-target.x,hook.z-target.z)<=.6&&Math.abs(hook.y-CONSTRUCTION_LOAD_OFFSET-target.y)<=.3&&Math.abs(Math.atan2(Math.sin((state.loadYaw||0)-(target.yaw||0)),Math.cos((state.loadYaw||0)-(target.yaw||0))))<=.12;
  // A safe release may mean returning steel to the rack or setting it on the
  // ground. Only a structural mating position advances the guided tower step.
  const towerReady=state.telemetry?.canPlaceTower??(aligned&&state.telemetry?.canRelease!==false);
  return towerReady?{operation:'release',step:4,label:'4 Place beam'}:{operation:'aim-target',step:3,label:target?(state.structureId==='facility'?'3 Align facility':'3 Align tower'):'Frame complete'};
 }
 return state.telemetry?.canAttach===false?{operation:'aim-supply',step:1,label:'1 Align pickup'}:{operation:'attach',step:2,label:'2 Attach beam'};
}


export function mountConstructionUI(stage,command,{onInput=()=>{}}={}){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/construction-ui.css',import.meta.url).href;document.head.append(stylesheet);
 const panel=document.createElement('section');panel.className='construction-controls';panel.hidden=true;panel.dataset.gameplayBlocking='false';panel.setAttribute('aria-label','Construction machine dashboard');
 const manual=document.createElement('div');manual.className='construction-manual';
 const heading=document.createElement('header');heading.className='construction-header';heading.innerHTML='<strong></strong><nav class="construction-mode-switch" aria-label="Machine control mode"><button type="button" data-construction-mode="work" aria-pressed="true">Work</button><button type="button" data-construction-mode="drive" aria-pressed="false">Drive</button></nav><button type="button" data-construction-view="instruments" aria-haspopup="dialog">Instruments</button>';
 const compactState=document.createElement('output');compactState.className='construction-compact-state';compactState.setAttribute('aria-label','Machine summary');
 const readout=document.createElement('output');readout.className='construction-readout';readout.setAttribute('aria-label','Construction machine instruments');
 const progress=document.createElement('output');progress.className='construction-progress';progress.setAttribute('aria-label','Skyscraper construction progress');
 const systems=document.createElement('output');systems.className='construction-system-status';systems.setAttribute('aria-label','Machine operating state');
 const instruments=document.createElement('div');instruments.className='construction-instruments';instruments.setAttribute('aria-label','Live mechanical instruments');
 const cycle=document.createElement('div');cycle.className='construction-cycle';cycle.innerHTML='<label>Hydraulic work cycle <output></output><progress max="1" value="0" aria-label="Hydraulic work cycle progress"></progress></label>';
 const warning=document.createElement('output');warning.className='construction-interlock';warning.setAttribute('aria-label','Machine interlock status');
 const pads=document.createElement('div');pads.className='construction-work-sticks';
 const travelPanel=document.createElement('div');travelPanel.className='construction-travel-panel';
 const reference=document.createElement('details');reference.className='construction-control-reference';reference.innerHTML='<summary>Control functions and ISO pattern</summary><div></div>';
 const axisFeedback=document.createElement('div');axisFeedback.className='construction-axis-feedback';axisFeedback.setAttribute('aria-label','Hydraulic demand feedback');
 const quick=document.createElement('div');quick.className='construction-quick-actions';
 const help=document.createElement('p');help.className='construction-help';
 const status=document.createElement('p');status.className='construction-status';status.setAttribute('role','status');
 const createDialog=(name,title,closeLabel)=>{const dialog=document.createElement('dialog');dialog.className=name+' construction-dialog';dialog.dataset.gameplayBlocking='false';dialog.setAttribute('aria-label',title);const header=document.createElement('header'),h=document.createElement('h2'),close=document.createElement('button');h.textContent=title;close.type='button';close.textContent=closeLabel;close.onclick=()=>dialog.close();header.append(h,close);dialog.append(header);dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();dialog.close();}});document.body.append(dialog);return dialog;};
 const instrumentsDialog=createDialog('construction-instruments-dialog','Machine instruments','Close instruments');
 instrumentsDialog.append(systems,readout,instruments,cycle,warning,progress,axisFeedback,reference,help,status);
 const functionsDialog=createDialog('construction-functions-dialog','Machine functions','Close functions');functionsDialog.append(quick);
 const materials=document.createElement('output');materials.className='construction-materials';materials.setAttribute('aria-label','Site materials and completed work');instrumentsDialog.insertBefore(materials,progress);
 const jobReadings=document.createElement('output');jobReadings.className='construction-job-readings';jobReadings.setAttribute('aria-label','Assigned construction job');instrumentsDialog.insertBefore(jobReadings,progress);
 const crewDialog=createDialog('construction-crew-dialog','Construction crew and jobs','Close crew');
 const crewStatus=document.createElement('p');crewStatus.className='construction-crew-status';crewStatus.setAttribute('role','status');
 const crewActions=document.createElement('div');crewActions.className='construction-crew-actions';
 for(const [operation,label]of [['start','Start crew'],['pause','Pause crew']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.crewOperation=operation;button.onclick=()=>requestCrew(operation);crewActions.append(button);}
 const crewWorkers=document.createElement('div');crewWorkers.className='construction-crew-workers';const crewJobs=document.createElement('section');crewJobs.className='construction-crew-jobs';crewJobs.setAttribute('aria-label','Construction job progress');crewDialog.append(crewStatus,crewActions,crewWorkers,crewJobs);
 const operations=document.createElement('section');operations.className='construction-crew-jobs construction-site-operations';operations.setAttribute('aria-label','Site operations plan');const operationsTitle=document.createElement('h3');operationsTitle.textContent='Site operations · live ground progress';operations.append(operationsTitle);crewDialog.insertBefore(operations,crewWorkers);const operationNodes=new Map();let operationsEarth=null,operationsRevision=-1,operationsSteel=-1;
 const machineRoster=document.createElement('details');machineRoster.className='construction-machine-roster';const machineTitle=document.createElement('summary');machineTitle.textContent='Machines · select at the cab';const machineCards=document.createElement('section');machineCards.className='construction-crew-jobs';machineCards.setAttribute('aria-label','Live site machines');machineRoster.append(machineTitle,machineCards);crewDialog.insertBefore(machineRoster,operations);const machineNodes=new Map();
 const workSettings=document.createElement('div');workSettings.className='construction-work-settings';const structureSelect=document.createElement('select'),gradeSelect=document.createElement('select');structureSelect.setAttribute('aria-label','Crane steel destination');gradeSelect.setAttribute('aria-label','Bulldozer finished grade');structureSelect.onchange=async()=>{await request('structure-target',{structureId:structureSelect.value});structureSelect.value=current?.construction?.structureId||'tower';};gradeSelect.onchange=async()=>{await request('grade-target',{height:gradeSelect.value===''?null:Number(gradeSelect.value)});gradeSelect.value=Number.isFinite(current?.construction?.gradeTarget)?String(current.construction.gradeTarget):'';};for(const [value,label]of [['','Free blade'],['0','Level at 0 m'],['0.2','Road base · 20 cm'],['0.3','Earth platform · 30 cm']]){const option=document.createElement('option');option.value=value;option.textContent=label;gradeSelect.append(option);}workSettings.append(structureSelect,gradeSelect);functionsDialog.insertBefore(workSettings,quick);
 const workerNodes=new Map(),jobNodes=new Map();let crewBusy=false,crewRevision=0;

 manual.append(pads,travelPanel);panel.append(heading,compactState,manual);stage.append(panel);
 let current=null,kind=null,actorId=null,snapshot=null,selfId=null,disposed=false,controlsVisible=true,controlMode='work',inFlight=0,neutralInFlight=false,pending=false,actionBusy=false,workView=true,feedback=null,lastDialogOpener=null,machineRevision=0;
 let axes={},sticks=[],keyboardResets=[],travel={forward:0,side:0,held:false},instrumentNodes=new Map(),axisNodes=new Map();
 const canUse=()=>!disposed&&!!current&&controlsVisible&&!panel.hidden&&!document.hidden&&!gameplayOverlayOpen();
 function showFeedback(message,failed=false){message=String(message);feedback={message,failed,until:performance.now()+(failed?6500:2500)};setText(status,message);setText(compactState,message);setAttr(compactState,'title',message);setAttr(compactState,'data-feedback',failed?'error':'notice');}
 function report(error){showFeedback(error?.message||String(error),true);}
 async function flushAxes(){
  const neutral=!Object.values(axes).some(value=>Math.abs(value)>.001);
  if((neutral?neutralInFlight:inFlight>=2)||!pending||!actorId||disposed)return;
  const entityId=actorId,sent={...axes},revision=machineRevision;pending=false;inFlight++;if(neutral)neutralInFlight=true;
  try{await command('construction-controls',{operation:'control',entityId,axes:sent});}catch(error){if(!disposed&&revision===machineRevision&&!panel.hidden)report(error);}finally{if(!disposed&&revision===machineRevision){inFlight--;if(neutral)neutralInFlight=false;if(pending)void flushAxes();}}
 }
 function sendAxes(){pending=true;void flushAxes();}
 function changeAxes(values){let changed=false;for(const [axis,value]of Object.entries(values)){let next=Math.max(-1,Math.min(1,Number(value)||0));if(kind==='truck'&&Math.abs(current?.driving?.speed||0)>.5)next=0;if((axes[axis]||0)!==next){axes[axis]=next;changed=true;}}if(changed){feedback=null;updateAxisFeedback();updateInstruments();sendAxes();}}
 function setTravel(next,{notify=true}={}){const changed=travel.forward!==next.forward||travel.side!==next.side||travel.held!==next.held;travel=next;if(changed&&next.held){feedback=null;updateInstruments();}if(changed&&notify)onInput();}
 function reset({notify=true}={}){const active=Object.values(axes).some(value=>Math.abs(value)>.001);axes={};setTravel({forward:0,side:0,held:false},{notify});for(const resetKey of keyboardResets)resetKey();for(const stick of sticks)stick.reset();if(active)sendAxes();updateAxisFeedback();}
 function safeReset(){reset();if(current?.construction?.repeatWork)void request('repeat-work',{enabled:false});}
 // A replacement cab owns fresh request slots; old replies cannot change it.
 function replaceMachineRequests(){machineRevision++;actionBusy=false;inFlight=0;neutralInFlight=false;pending=false;feedback=null;}
 async function request(operation,fields={}){
  if(actionBusy||!actorId||disposed)return;
  const revision=machineRevision;requestGameInputRelease('machine-action');actionBusy=true;refreshAction();
  try{const result=await command(operation==='exit'?'interact':'construction-controls',operation==='exit'?{}:{operation,entityId:actorId,...fields});if(disposed||revision!==machineRevision)return;if(result?.result?.message)showFeedback(result.result.message);else if(!result)showFeedback('Request was not applied. Check the machine or site conditions and try again.',true);}catch(error){if(!disposed&&revision===machineRevision)report(error);}finally{if(!disposed&&revision===machineRevision){actionBusy=false;refreshAction();}}
 }
 const utilities=document.createElement('div');utilities.className='sports-action-utilities construction-action-utilities';utilities.hidden=true;utilities.dataset.gameplayBlocking='false';stage.append(utilities);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='sports-icon-button construction-controls-toggle';toggle.setAttribute('aria-label','Show or hide construction dashboard');toggle.setAttribute('aria-expanded','true');utilities.append(toggle);
 const crewToggle=document.createElement('button');crewToggle.type='button';crewToggle.className='sports-icon-button construction-crew-toggle';crewToggle.setAttribute('aria-label','Construction crew and jobs');crewToggle.setAttribute('aria-haspopup','dialog');crewToggle.innerHTML=sportIcon('tools')+'<span>Crew / jobs</span>';crewToggle.onclick=event=>openDialog(crewDialog,event.currentTarget);utilities.append(crewToggle);
 const bar=document.createElement('div');bar.className='sports-action-bar construction-action-bar';bar.setAttribute('aria-label','Construction machine actions');
 const row=document.createElement('div');row.className='sports-action-tools';bar.append(row);
 const primary=document.createElement('button');primary.type='button';primary.className='sports-primary-trigger';primary.onclick=()=>request(kind==='crane'?constructionSteelStep(current?.construction,snapshot?.construction).operation:'work');
 const park=document.createElement('button');park.type='button';park.dataset.operation='park';park.textContent='Park';park.setAttribute('aria-label','Park construction machine');park.onclick=()=>request('park');
 const exit=document.createElement('button');exit.type='button';exit.dataset.operation='exit';exit.textContent='Exit';exit.setAttribute('aria-label','Exit parked construction machine');exit.onclick=()=>request('exit');
 const more=document.createElement('button');more.type='button';more.dataset.constructionMore='';more.textContent='More';more.setAttribute('aria-label','More machine functions');more.setAttribute('aria-haspopup','dialog');
 row.append(primary,park,exit,more);panel.append(bar);
 const actions={root:bar,row,primary,utilities,popup:functionsDialog,dispose(){utilities.remove();bar.remove();instrumentsDialog.remove();functionsDialog.remove();crewDialog.remove();}};
 function closeDialogs(){for(const dialog of [instrumentsDialog,functionsDialog,crewDialog])if(dialog.open)dialog.close();}
 function syncVisibility(){
  const visible=!!current&&controlsVisible;setHidden(panel,!visible);setHidden(utilities,!current&&!snapshot?.construction);setHidden(toggle,!current);setHidden(crewToggle,!snapshot?.construction);if(!snapshot?.construction&&crewDialog.open)crewDialog.close();setHidden(pads,controlMode!=='work');setHidden(travelPanel,kind==='crane'||controlMode!=='drive');
  setHidden(heading.querySelector('[data-construction-mode=drive]'),kind==='crane');for(const button of heading.querySelectorAll('[data-construction-mode]'))setAttr(button,'aria-pressed',button.dataset.constructionMode===controlMode);
  setAttr(toggle,'aria-expanded',controlsVisible);setAttr(toggle,'title',controlsVisible?'Hide machine controls':'Restore machine controls');const title=controlsVisible?'Hide machine':'Machine controls';if(toggle.dataset.label!==title){toggle.innerHTML=sportIcon(controlsVisible?'hide':'tools')+'<span>'+title+'</span>';toggle.dataset.label=title;}
  setAttr(panel,'data-control-mode',controlMode);if(!visible){for(const dialog of [instrumentsDialog,functionsDialog])if(dialog.open)dialog.close();}
 }
 function setMode(mode){if(mode===controlMode||mode==='drive'&&kind==='crane')return;if(mode==='drive'&&current?.construction?.repeatWork){if(actionBusy)return;void request('repeat-work',{enabled:false});}requestGameInputRelease('machine-mode');controlMode=mode;syncVisibility();refreshAction();updateInstruments();}
 for(const button of heading.querySelectorAll('[data-construction-mode]'))button.onclick=()=>setMode(button.dataset.constructionMode);
 toggle.onclick=()=>{requestGameInputRelease('machine-controls');controlsVisible=!controlsVisible;syncVisibility();};
 function openDialog(dialog,opener){requestGameInputRelease('machine-panel');closeDialogs();lastDialogOpener=opener;(document.fullscreenElement||document.body).append(dialog);if(!dialog.open)dialog.show();}
 for(const dialog of [instrumentsDialog,functionsDialog,crewDialog])dialog.addEventListener('close',()=>{const opener=lastDialogOpener;if(opener?.isConnected&&!opener.hidden&&!gameplayOverlayOpen()&&(document.activeElement===document.body||dialog.contains(document.activeElement)))opener.focus({preventScroll:true});});
 heading.querySelector('[data-construction-view=instruments]').onclick=event=>openDialog(instrumentsDialog,event.currentTarget);more.onclick=event=>openDialog(functionsDialog,event.currentTarget);
 function availability(operation){
  if(!current)return {enabled:false,reason:'Enter an available machine first.'};
  const state=current.construction||{},telemetry=state.telemetry||{},moving=Math.abs(current.driving?.speed||0)>.5;
  if(actionBusy)return {enabled:false,reason:'Waiting for the server to confirm the previous operation.'};
  if(operation==='park')return {enabled:true,reason:'Stop travel, cancel the automatic cycle and return all hydraulic valves to neutral.'};
  if(operation==='precision')return {enabled:true,reason:'Toggle reduced hydraulic rates for fine positioning. Joystick directions stay the same.'};
  if(operation==='exit'){
   const blocked=Math.abs(current.driving?.speed||0)>1.5||!!state.workCycle||!!state.assist||kind==='crane'&&!!state.load||kind==='truck'&&(state.bed||0)>.08;
   return {enabled:!blocked,reason:blocked?'Park, finish or cancel the cycle, lower the dump body and secure suspended loads before exiting.':'Leave the parked operator station.'};
  }
  if(operation==='attach')return {enabled:kind==='crane'&&!state.load&&!state.assist&&telemetry.canAttach!==false,reason:telemetry.attachReason||'Lower the hook within 3 m horizontally and 2 m vertically of an available steel beam.'};
  if(operation==='release')return {enabled:kind==='crane'&&!!state.load&&!state.assist&&telemetry.canRelease!==false,reason:telemetry.releaseReason||'Release the attached beam onto the highlighted structural target or lower it to the ground.'};
  if(operation==='work')return {enabled:kind!=='crane'&&!state.workCycle&&!moving&&telemetry.canWork!==false,reason:telemetry.workReason||(moving?'Park before starting a hydraulic work cycle.':state.workCycle?'The hydraulic work cycle is already running.':'Start the site work cycle for this machine.')};
  if(operation==='repeat-work')return {enabled:kind==='excavator'&&(state.repeatWork||!state.workCycle&&!moving&&telemetry.canWork!==false&&telemetry.canRepeatWork!==false),reason:state.repeatWork?'Stop automatic loading and hold the current attachment safely.':telemetry.canRepeatWork===false?telemetry.repeatReason||'Park a receiving truck within reach.':'Repeat real dig and load cycles into a parked nearby truck. Stops when the truck fills, reachable material ends, or manual controls take over.'};
  if(operation==='empty')return {enabled:kind==='excavator'&&Number(state.load)>0&&!state.workCycle&&!moving,reason:'Open the bucket and discharge into a reachable truck or onto the actual terrain below.'};
  if(operation==='aim-target')return {enabled:kind==='crane'&&!state.assist&&!!constructionStructure(snapshot?.construction,current)?.target,reason:'Raise to clearance height, slew to the selected frame target and lower automatically. Manual input takes over.'};
  if(operation==='aim-supply')return {enabled:kind==='crane'&&!state.load&&!state.assist,reason:state.load?'Place or release the attached beam before returning to the steel store.':'Align the empty hook with an available steel beam. Manual input takes over.'};
  return {enabled:true,reason:''};
 }
 function applyAvailability(button,operation){const choice=availability(operation);setDisabled(button,!choice.enabled);setAttr(button,'title',choice.reason);return choice;}
 function refreshAction(){
  const state=current?.construction||{},cycling=!!state.workCycle,steel=constructionSteelStep(state,snapshot?.construction),operation=kind==='crane'?steel.operation:'work';
  const label=cycling?'Working…':kind==='crane'?steel.label:kind==='truck'?'Unload':kind==='bulldozer'?'Grade':state.load?'Load truck':'Dig';
  setText(primary,label);setAttr(primary,'data-operation',operation);setAttr(primary,'aria-label',kind==='crane'?steel.label:kind==='truck'?'Unload material':kind==='bulldozer'?'Push and grade earth':state.load?'Transfer soil to truck':'Dig and fill bucket');
  applyAvailability(primary,operation);if(kind==='crane'&&steel.busy)setDisabled(primary,true);applyAvailability(park,'park');applyAvailability(exit,'exit');
  for(const button of quick.querySelectorAll('[data-operation]')){applyAvailability(button,button.dataset.operation);if(button.dataset.operation==='repeat-work'){setAttr(button,'aria-pressed',!!state.repeatWork);setText(button,state.repeatWork?'Stop auto scoop & load':'Auto scoop & load');}if(button.dataset.operation==='precision'){setAttr(button,'aria-pressed',!!state.precision);setText(button,state.precision?'Precision · 30% rate':'Precision · full rate');}}
  const telemetry=state.telemetry||{},notice=controlMode==='drive'&&telemetry.travelAllowed===false?telemetry.travelReason:telemetry.blockedReason||(!availability(operation).enabled?availability(operation).reason:'');setText(warning,notice);setHidden(warning,!notice);setAttr(panel,'data-interlocked',!!notice);
  const travelAllowed=kind!=='crane'&&telemetry.travelAllowed!==false&&!cycling&&!(kind==='truck'&&(state.bed||0)>.08);for(const node of pads.querySelectorAll('.construction-stick')){const blocked=kind==='truck'&&Math.abs(current?.driving?.speed||0)>.5;setAttr(node,'aria-disabled',blocked);if(blocked)setAttr(node,'title','Stop the truck before operating the body hoist.');}
  for(const node of travelPanel.querySelectorAll('.construction-travel-stick')){setAttr(node,'aria-disabled',!travelAllowed);setAttr(node,'title',travelAllowed?'Hold to travel. Release to coast; Park engages the brake.':telemetry.travelReason||'Finish or cancel the work cycle before travelling.');}if(!travelAllowed&&travel.held)setTravel({forward:0,side:0,held:false});
 }
 function addQuick(label,operation){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.operation=operation;button.onclick=()=>request(operation,operation==='precision'?{enabled:!current?.construction?.precision}:operation==='repeat-work'?{enabled:!current?.construction?.repeatWork}:{});quick.append(button);return button;}
 async function requestCrew(operation,fields={}){
  if(crewBusy||disposed||!snapshot?.construction)return;
  const revision=crewRevision;requestGameInputRelease('crew-action');crewBusy=true;updateCrew();
  try{const result=await command('construction-crew',{operation,...fields});if(disposed||revision!==crewRevision)return;const message=result?.result?.message||(!result?'Crew request was not applied. Check that you are near the construction site.':'Crew request confirmed.');setText(crewStatus,message);crewStatus.dataset.feedbackUntil=String(performance.now()+6500);}
  catch(error){if(!disposed&&revision===crewRevision){setText(crewStatus,error?.message||String(error));crewStatus.dataset.feedbackUntil=String(performance.now()+6500);}}
  finally{if(!disposed&&revision===crewRevision){crewBusy=false;updateCrew();}}
 }
 function options(select,entries,preferred){
  const signature=JSON.stringify(entries);if(select.dataset.options===signature)return;
  const previous=select.value;select.replaceChildren();for(const [value,label]of entries){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.dataset.options=signature;
  select.value=entries.some(([id])=>id===previous)?previous:preferred||entries[0]?.[0]||'';
 }
 function workerCard(worker){
  const root=document.createElement('article');root.className='construction-worker';root.dataset.workerId=worker.id;
  const header=document.createElement('header'),avatar=document.createElement('span'),name=document.createElement('strong'),summary=document.createElement('output');avatar.className='construction-worker-avatar';avatar.setAttribute('aria-hidden','true');header.append(avatar,name);summary.className='construction-worker-state';
  const jobs=document.createElement('select'),machines=document.createElement('select'),area=document.createElement('select'),assignment=document.createElement('div');assignment.className='construction-worker-assignment';const assign=document.createElement('button');assign.type='button';assign.textContent='Assign job';assign.onclick=()=>requestCrew('assign',{workerId:worker.id,jobId:jobs.value,workArea:area.value||null,...machines.value?{machineId:machines.value}:{}});assignment.append(jobs,machines,area,assign);area.setAttribute('aria-label','Work area for '+worker.name);area.onchange=()=>{area.dataset.dirty='true';};
  const run=document.createElement('div');run.className='construction-worker-actions';for(const [operation,label]of [['demonstrate','Show me your work'],['status','Ask for an update'],['stop','Stop demonstration'],['start','Start worker'],['pause','Pause worker']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.crewOperation=operation;button.onclick=()=>requestCrew(operation,{workerId:worker.id});run.append(button);}
  const appearance=document.createElement('details'),appearanceTitle=document.createElement('summary'),form=document.createElement('form');appearanceTitle.textContent='Name and appearance';appearance.append(appearanceTitle,form);form.className='construction-worker-customize';
  const nameLabel=document.createElement('label'),input=document.createElement('input');nameLabel.textContent='Name';input.name='name';input.maxLength=32;input.required=true;input.autocomplete='off';nameLabel.append(input);form.append(nameLabel);
  for(const [key,values]of Object.entries(CONSTRUCTION_CREW_PALETTES)){const label=document.createElement('label');label.textContent=({hardHat:'Hard hat',vest:'Safety vest',skin:'Skin tone',shirt:'Shirt'})[key];const select=document.createElement('select');select.name=key;options(select,values.map(value=>[value,value]));label.append(select);form.append(label);}
  const save=document.createElement('button');save.type='submit';save.textContent='Save appearance';form.append(save);form.oninput=()=>{form.dataset.dirty='true';};form.onsubmit=event=>{event.preventDefault();const appearance={};for(const key of Object.keys(CONSTRUCTION_CREW_PALETTES))appearance[key]=form.elements[key].value;void requestCrew('customize',{workerId:worker.id,name:input.value.trim(),appearance});delete form.dataset.dirty;};
  jobs.onchange=()=>{jobs.dataset.dirty='true';area.dataset.dirty='';syncMachines();};machines.onchange=()=>{machines.dataset.dirty='true';};
  function syncMachines(){const job=snapshot?.construction?.crew?.jobs?.find(job=>job.id===jobs.value),machineKind=CONSTRUCTION_CREW_JOBS[job?.type||jobs.value]?.machine;options(area,[['','Original site work area'],...constructionWorkAreas(snapshot?.construction,job?.type||jobs.value)],job?.workArea);setHidden(area,!(constructionWorkAreas(snapshot?.construction,job?.type||jobs.value).length));if(!area.dataset.dirty)area.value=job?.workArea||'';const choices=Object.values(snapshot?.actors||{}).filter(actor=>actor.active!==false&&constructionMachineKind(actor)===machineKind);options(machines,[['','Choose available machine'],...choices.map(actor=>[actor.id,(actor.name||ROAD_VEHICLES[actor.modelId]?.label||names[machineKind]||actor.id)+(actor.holderId?' · occupied':actor.construction?.crewOperator&&actor.construction.crewOperator.workerId!==worker.id?' · crew busy':'')])],worker.machineId);}
  root.append(header,summary,assignment,run,appearance);crewWorkers.append(root);
  return {root,name,summary,avatar,jobs,machines,area,form,input,assign,save,appearanceTitle,syncMachines};
 }
 function updateOperations(){
  const site=snapshot?.construction||{},earth=site.earthworks,steel=(site.tower?.placed||0)+':'+(site.facility?.placed||0);
  if(operationsEarth===earth&&operationsRevision===earth?.revision&&operationsSteel===steel)return;
  operationsEarth=earth;operationsRevision=earth?.revision;operationsSteel=steel;
  const tasks=constructionOperations(site);setHidden(operations,!tasks.length);
  for(const [id,node]of operationNodes)if(!tasks.some(task=>task.id===id)){node.root.remove();operationNodes.delete(id);}
  for(const task of tasks){
   let node=operationNodes.get(task.id);
   if(!node){const root=document.createElement('article'),label=document.createElement('strong'),output=document.createElement('output'),guide=document.createElement('p'),meter=document.createElement('progress');root.dataset.operationId=task.id;meter.max=1;root.append(label,output,meter,guide);operations.append(root);node={root,label,output,guide,meter};operationNodes.set(task.id,node);}
   setText(node.label,task.label);setText(node.output,task.detail+' · Site X '+task.x+' / Z '+task.z);setText(node.guide,task.guide);node.meter.value=task.progress;setAttr(node.meter,'aria-label',task.label+' progress');
  }
 }
 async function enterMachine(id){
  if(crewBusy||disposed)return;const revision=crewRevision;requestGameInputRelease('machine-selection');crewBusy=true;updateCrew();
  try{const result=await command('interact',{entityId:id});if(disposed||revision!==crewRevision)return;if(result)crewDialog.close();else setText(crewStatus,'Machine selection was not applied. Move to its cab and try again.');}catch(error){if(!disposed&&revision===crewRevision){setText(crewStatus,error.message||String(error));crewStatus.dataset.feedbackUntil=String(performance.now()+6500);}}finally{if(!disposed&&revision===crewRevision){crewBusy=false;updateCrew();}}
 }
 function updateMachines(){
  const choices=constructionMachineChoices(snapshot,selfId);
  for(const [id,node]of machineNodes)if(!choices.some(choice=>choice.id===id)){node.root.remove();machineNodes.delete(id);}
  for(const choice of choices){let node=machineNodes.get(choice.id);if(!node){const root=document.createElement('article'),title=document.createElement('strong'),output=document.createElement('output'),button=document.createElement('button');root.dataset.machineId=choice.id;button.type='button';button.onclick=()=>enterMachine(choice.id);root.append(title,output,button);machineCards.append(root);node={root,title,output,button};machineNodes.set(choice.id,node);}setText(node.title,choice.name);setText(node.output,(Number.isFinite(choice.distance)?choice.distance.toFixed(1)+' m · ':'')+(choice.reason||(choice.operator?'AI operator: '+choice.operator:'Ready for a player')));setText(node.button,choice.selected?'Operating':choice.operator?'Take over from '+choice.operator:'Operate '+choice.kind);setDisabled(node.button,crewBusy||!choice.available);setAttr(node.button,'title',choice.reason||'Enter at the actual cab; player control takes priority.');}
 }
 function updateCrew(){
  updateOperations();updateMachines();
  const crew=snapshot?.construction?.crew,workers=crew?.workers||[],jobs=crew?.jobs||[];
  if(performance.now()>Number(crewStatus.dataset.feedbackUntil||0))setText(crewStatus,crew?.message||(crew?'Assign a real site job, start the crew, or pause to take over a machine.':'Crew is waiting for the construction site server.'));
  for(const [id,node]of workerNodes)if(!workers.some(worker=>worker.id===id)){node.root.remove();workerNodes.delete(id);}
  for(const worker of workers){let node=workerNodes.get(worker.id);if(!node){node=workerCard(worker);workerNodes.set(worker.id,node);}setText(node.name,worker.name||worker.id);setText(node.summary,[worker.role,worker.state,worker.phase,worker.message].filter(Boolean).join(' · '));
   const palette=worker.appearance||{},colors={};for(const [key,map]of Object.entries(CONSTRUCTION_CREW_COLORS))colors[key]=map[palette[key]]||Object.values(map)[0];const appearanceKey=JSON.stringify(colors);if(node.avatar.dataset.appearance!==appearanceKey){node.avatar.innerHTML='<svg viewBox="0 0 64 70" width="44" height="48" xmlns="http://www.w3.org/2000/svg"><path fill="'+colors.shirt+'" d="M8 70V51Q8 40 23 39h18q15 1 15 12v19Z"/><path fill="'+colors.vest+'" d="m18 41 10-3 4 15 4-15 10 3 4 29H14Z"/><path stroke="#eef5b1" stroke-width="4" d="m21 44-3 26m25-26 3 26M14 58h36"/><rect x="28" y="31" width="8" height="14" rx="3" fill="'+colors.skin+'"/><ellipse cx="32" cy="24" rx="15" ry="17" fill="'+colors.skin+'"/><path fill="'+colors.hardHat+'" d="M15 21Q15 3 32 3t17 18h5v5H10v-5Z"/><path fill="#fff6" d="M29 3h6v18h-6Z"/></svg>';node.avatar.dataset.appearance=appearanceKey;}
   const jobEntries=(jobs.length?jobs.map(job=>[job.id,job.label||CONSTRUCTION_CREW_JOBS[job.type]?.label||job.id]):Object.entries(CONSTRUCTION_CREW_JOBS).map(([id,job])=>[id,job.label]));const assigned=jobs.find(job=>job.id===worker.jobId)||jobs.find(job=>job.workerId===worker.id&&job.status!=='completed'),jobId=worker.jobId||assigned?.id;options(node.jobs,jobEntries,jobId);if(!node.jobs.dataset.dirty&&jobId)node.jobs.value=jobId;node.syncMachines();if(!node.machines.dataset.dirty)node.machines.value=worker.machineId||assigned?.machineId||'';
   setAttr(node.area,'aria-label','Work area for '+(worker.name||worker.id));setAttr(node.jobs,'aria-label','Job for '+(worker.name||worker.id));setAttr(node.machines,'aria-label','Machine for '+(worker.name||worker.id));setAttr(node.assign,'aria-label','Assign '+(worker.name||worker.id));setAttr(node.appearanceTitle,'aria-label','Edit '+(worker.name||worker.id)+' appearance');setAttr(node.input,'aria-label','Name for '+(worker.name||worker.id));setAttr(node.save,'aria-label','Save '+(worker.name||worker.id)+' appearance');
   for(const key of Object.keys(CONSTRUCTION_CREW_PALETTES))setAttr(node.form.elements[key],'aria-label',key+' for '+(worker.name||worker.id));
   if(!node.form.dataset.dirty&&!node.form.contains(document.activeElement)){node.input.value=worker.name||'';for(const key of Object.keys(CONSTRUCTION_CREW_PALETTES))node.form.elements[key].value=worker.appearance?.[key]||CONSTRUCTION_CREW_PALETTES[key][0];}
  }
  for(const [id,node]of jobNodes)if(!jobs.some(job=>job.id===id)){node.root.remove();jobNodes.delete(id);}
  for(const job of jobs){let node=jobNodes.get(job.id);if(!node){const root=document.createElement('article'),label=document.createElement('strong'),output=document.createElement('output'),meter=document.createElement('progress');root.dataset.jobId=job.id;meter.max=1;root.append(label,output,meter);crewJobs.append(root);node={root,label,output,meter};jobNodes.set(job.id,node);}setText(node.label,job.label||CONSTRUCTION_CREW_JOBS[job.type]?.label||job.id);const fraction=Math.max(0,Math.min(1,Number(job.progress)||0));setText(node.output,Math.round(fraction*100)+'% · '+Number(job.completed||0).toFixed(1)+' / '+Number(job.goal||0).toFixed(1)+' '+(job.unit||'')+' · '+(job.message||job.status||'Queued'));node.meter.value=fraction;setAttr(node.meter,'aria-label',(job.label||job.id)+' progress');}
  for(const button of crewDialog.querySelectorAll('button:not(header button)'))if(!button.closest('.construction-machine-roster'))setDisabled(button,crewBusy||!crew);for(const select of crewDialog.querySelectorAll('select,input'))setDisabled(select,crewBusy||!crew);
 }
 function updateAxisFeedback(){
  for(const [axis,node]of axisNodes){const demand=axes[axis]||0,accepted=current?.construction?.telemetry?.axes?.[axis]??current?.construction?.axes?.[axis]??0;setText(node.request,(demand>0?'+':'')+Math.round(demand*100)+'%');setText(node.accepted,'Server '+(accepted>0?'+':'')+Math.round(accepted*100)+'%');setAttr(node.root,'data-active',Math.abs(demand)>.01);const width=Math.abs(demand)*50+'%',left=(demand<0?50+demand*50:50)+'%';if(node.bar.style.width!==width)node.bar.style.width=width;if(node.bar.style.left!==left)node.bar.style.left=left;}
 }
 function bindJoystick(config,parent,{travelControl=false}={}){
  const group=document.createElement('div');group.className='construction-stick-group';
  const label=document.createElement('strong');label.textContent=config.label;
  const surface=document.createElement('div');surface.className='construction-stick'+(travelControl?' construction-travel-stick':'');surface.tabIndex=0;surface.dataset.controlKind=travelControl?'travel':'hydraulic';surface.setAttribute('role','group');surface.setAttribute('aria-label',config.label+'; arrow keys to operate, release to stop');surface.title=config.description||'';
  const knob=document.createElement('span');knob.className='construction-stick-knob';knob.setAttribute('aria-hidden','true');
  for(const [position,name]of [['up',config.up],['down',config.down],['left',config.left],['right',config.right]])if(name){const hint=document.createElement('span');hint.className='construction-stick-'+position;hint.textContent=name;surface.append(hint);}
  surface.append(knob);group.append(label,surface);parent.append(group);
  const permitted=()=>canUse()&&(travelControl?controlMode==='drive':controlMode==='work')&&!(kind==='truck'&&!travelControl&&Math.abs(current?.driving?.speed||0)>.5)&&(!travelControl||current?.construction?.telemetry?.travelAllowed!==false&&!current?.construction?.workCycle&&!(kind==='truck'&&(current?.construction?.bed||0)>.08));
  const publish=(x,y,held)=>{if(travelControl)setTravel({side:x,forward:-y,held});else changeAxes({...config.horizontal?{[config.horizontal]:x}:{},...config.vertical?{[config.vertical]:-y*(config.verticalSign??1)}:{}});};
  sticks.push(mountThumbstick({stick:surface,knob,canUse:permitted,onChange:({x,y},released)=>publish(x,y,!released)}));
  const pressed=new Set(),publishKeys=()=>publish((pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0),(pressed.has('ArrowDown')?1:0)-(pressed.has('ArrowUp')?1:0),pressed.size>0);
  const clearKeys=()=>{if(pressed.size){pressed.clear();publishKeys();}};keyboardResets.push(clearKeys);
  surface.onkeydown=event=>{if(!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();if(!permitted()||event.repeat&&!pressed.has(event.key))return;pressed.add(event.key);publishKeys();};
  surface.onkeyup=event=>{if(!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();pressed.delete(event.key);publishKeys();};surface.onblur=clearKeys;
 }
 function buildControls(){
  reset();for(const stick of sticks)stick.dispose();sticks=[];keyboardResets=[];pads.replaceChildren();quick.replaceChildren();travelPanel.replaceChildren();instruments.replaceChildren();axisFeedback.replaceChildren();reference.querySelector('div').replaceChildren();instrumentNodes.clear();axisNodes.clear();
  const scheme=constructionControlScheme(kind);
  for(const config of scheme){bindJoystick(config,pads);const item=document.createElement('p');item.textContent=config.label+': '+config.description;reference.querySelector('div').append(item);}
  for(const axis of [...new Set(scheme.flatMap(config=>[config.horizontal,config.vertical]).filter(Boolean))]){const root=document.createElement('div');root.className='construction-axis';root.dataset.axis=axis;const label=document.createElement('span');label.textContent=axisNames[axis];const demand=document.createElement('output');demand.className='construction-axis-demand';demand.setAttribute('aria-label',axisNames[axis]+' requested demand');const accepted=document.createElement('output');accepted.className='construction-axis-accepted';accepted.setAttribute('aria-label',axisNames[axis]+' server demand');const track=document.createElement('span');track.className='construction-axis-track';track.setAttribute('aria-hidden','true');const bar=document.createElement('i');track.append(bar);root.append(label,track,demand,accepted);axisFeedback.append(root);axisNodes.set(axis,{root,request:demand,accepted,bar});}
  for(const spec of constructionInstrumentSpecs(kind)){const root=document.createElement('label');root.className='construction-instrument';root.dataset.instrument=spec.id;const label=document.createElement('span');label.textContent=spec.label;const output=document.createElement('output');output.setAttribute('aria-label',spec.label);const meter=document.createElement('meter');meter.min=spec.min;meter.max=spec.max;meter.value=spec.min;meter.setAttribute('aria-label',spec.label+' range');root.append(label,output,meter);instruments.append(root);instrumentNodes.set(spec.id,{...spec,root,output,meter});}
  if(kind!=='crane'){bindJoystick({label:kind==='truck'?'Travel / steering':'Track travel / steering',up:'Forward W',down:'Reverse S',left:'Steer left A',right:'Steer right D',description:'Dashboard: hold this stick or focus it and hold arrow keys. W/S and A/D remain available in the game. Park stops the machine.'},travelPanel,{travelControl:true});const reading=document.createElement('output');reading.className='construction-travel-readout';reading.setAttribute('aria-label','Travel control readings');travelPanel.append(reading);}
  const cameraChoices=document.createElement('div');cameraChoices.className='construction-camera-choices';cameraChoices.setAttribute('role','group');cameraChoices.setAttribute('aria-label','Machine camera view');
  for(const [value,label]of [['work','Work camera'],['operator','Operator view']]){const button=document.createElement('button');button.type='button';button.dataset.cameraView=value;button.textContent=label;setAttr(button,'aria-pressed',(value==='work')===workView);button.onclick=()=>{requestGameInputRelease('machine-camera');workView=value==='work';for(const choice of cameraChoices.children)setAttr(choice,'aria-pressed',(choice.dataset.cameraView==='work')===workView);};cameraChoices.append(button);}quick.append(cameraChoices);
  if(kind==='crane'){const steps=document.createElement('ol');steps.className='construction-steel-steps';steps.setAttribute('aria-label','Steel placement sequence');for(const text of ['Align pickup — bring the empty hook to a loose beam.','Attach beam — confirm the nearby steel is secured.','Align frame — lift clear, rotate and lower to the target.','Place beam — confirm the server accepts the mating position.']){const item=document.createElement('li');item.textContent=text;steps.append(item);}quick.append(steps);addQuick('1 Align pickup','aim-supply');addQuick('2 Attach beam','attach');addQuick('3 Align frame','aim-target');addQuick('Release / safe set-down','release');help.textContent='The primary action follows the four placement steps. Alignment moves the hook but never attaches or places steel without your confirmation. Moving a joystick returns to manual control. Placement still requires a clear path and the correct position and yaw.';}
  else if(kind==='excavator'){addQuick('Auto scoop & load','repeat-work');addQuick('Empty bucket here','empty');help.textContent='ISO work joysticks operate independently of track travel. Dig beside the marked pit; transfer a loaded bucket into a dumptruck within reach. Auto scoop & load repeats those real joint cycles into a nearby parked truck until full or the reachable face is exhausted. Manual hydraulic or travel controls and Park stop it.';}
  else if(kind==='bulldozer'){help.textContent='Lower the blade for grading beside the pit or spoil area. Raise the blade before travelling away. The work cycle grades a measured area and updates the shared site progress.';}
  else{help.textContent='Position beside the excavator to receive soil, then drive to the spoil area. Stop before using the body hoist. Travel is locked while the body is raised; lower it before returning for another load.';}
  help.textContent+=' Focus a joystick and hold arrow keys; release to return the valve to neutral. Manual work input cancels an automatic cycle. Precision reduces hydraulic speed to 30%.';
  addQuick('Precision · full rate','precision');setText(heading.querySelector('strong'),({crane:'Tower crane',truck:'Dumptruck',bulldozer:'Bulldozer',excavator:'Excavator'})[kind]);setAttr(heading.querySelector('strong'),'title',names[kind]||'Construction machine');updateAxisFeedback();
 }
 function updateInstruments(){
  const state=current?.construction||{},telemetry=state.telemetry||{},site=snapshot?.construction||{},speed=Number(current?.driving?.speed)||0;
  setHidden(workSettings,kind!=='crane'&&kind!=='bulldozer');setHidden(structureSelect,kind!=='crane');setHidden(gradeSelect,kind!=='bulldozer');options(structureSelect,constructionWorkAreas(site,'steel'),state.structureId||'tower');if(document.activeElement!==structureSelect)structureSelect.value=state.structureId||'tower';if(document.activeElement!==gradeSelect)gradeSelect.value=Number.isFinite(state.gradeTarget)?String(state.gradeTarget):'';
  const values={...state,hookLoad:telemetry.hookLoadTonnes,loadMoment:telemetry.loadMomentPercent,speed:Math.abs(speed)*3.6,load:kind==='crane'?(state.load?1:0):Number(state.load)||0,graded:site.graded||0,slew:bearing(state.slew),loadYaw:bearing(state.loadYaw),swing:bearing(-state.swing),boom:degrees(state.boom),stick:degrees(state.stick),bucket:degrees(state.bucket),bed:degrees(state.bed)};
  for(const [id,node]of instrumentNodes){const optional=id==='hookLoad'||id==='loadMoment';if(optional){setHidden(node.root,!Number.isFinite(Number(values[id])));if(!Number.isFinite(Number(values[id])))continue;}const value=Number(values[id])||0,max=id==='hookLoad'?(telemetry.safeWorkingLoadTonnes||node.max):id==='load'&&kind!=='crane'?(telemetry.loadCapacity||node.max):node.max;setText(node.output,value.toFixed(node.digits)+' '+node.unit);if(node.meter.max!==max)node.meter.max=max;const bounded=Math.max(node.min,Math.min(max,value));if(node.meter.value!==bounded)node.meter.value=bounded;setAttr(node.meter,'aria-valuetext',node.output.textContent);setAttr(node.root,'data-over-limit',value>max);}
  const travelReading=travelPanel.querySelector('.construction-travel-readout');if(travelReading)setText(travelReading,'Throttle '+Math.round((current.driving?.throttle||0)*100)+'% · Steering '+Math.round((current.driving?.steering||0)*100)+'% · Parking brake '+(current.driving?.parked?'engaged':'released'));
  const gear=kind==='crane'?'FIXED BASE':current?.driving?.blocked?'BLOCKED':current?.driving?.parked?'P / brake':Math.abs(speed)<.1?'N':speed<0?'R':'D',mode=state.repeatWork?'Auto scoop & load':state.workCycle?'Automatic cycle':state.assist?'Alignment '+state.assist:'Manual',hydraulics=telemetry.hydraulicsActive??state.working;
  setText(systems,'Drive '+gear+' · '+mode+' · Hydraulics '+(hydraulics?'active':'neutral')+' · '+(state.precision?'Precision 30%':'Full rate'));
  const activeCycle=!!state.workCycle;setHidden(cycle,!activeCycle);if(activeCycle){const elapsed=Math.max(0,(Number(snapshot?.serverTime)||state.workCycle.start)-state.workCycle.start),fraction=Math.max(0,Math.min(1,Number(telemetry.cycleProgress??elapsed/state.workCycle.duration)||0));setText(cycle.querySelector('output'),(telemetry.cyclePhase||state.workCycle.mode)+' · '+Math.round(fraction*100)+'%');const bar=cycle.querySelector('progress');if(bar.value!==fraction)bar.value=fraction;}
  const issue=controlMode==='drive'&&telemetry.travelAllowed===false?telemetry.travelReason:telemetry.blockedReason;const summary=issue||state.workCycle?(issue||'Cycle '+(telemetry.cyclePhase||state.workCycle.mode)+' · '+Math.round((telemetry.cycleProgress||0)*100)+'% · Park to cancel'):Object.values(axes).some(value=>Math.abs(value)>.001)?'Hydraulics engaged · '+Object.entries(axes).filter(([,value])=>Math.abs(value)>.001).map(([axis,value])=>(axisNames[axis]||axis)+' '+(value>0?'+':'')+Math.round(value*100)+'%').join(' · '):travel.held?'Drive engaged · '+(travel.forward>0?'Forward':travel.forward<0?'Reverse':'Steering')+' · '+Math.abs(speed*3.6).toFixed(1)+' km/h':state.assist?'Aligning '+(state.assist==='supply'?'pickup':state.structureId==='facility'?'facility':'tower')+' · joystick for manual takeover':kind==='crane'?'Hook '+Number(state.hoist||0).toFixed(1)+' m · '+(state.load?'Steel attached':'Hook empty'):Math.abs(speed*3.6).toFixed(1)+' km/h · '+(kind==='bulldozer'?'Blade '+Number(state.blade||0).toFixed(2)+' m'+(Number.isFinite(state.gradeTarget)?' · Grade '+state.gradeTarget.toFixed(2)+' m':''):'Load '+Number(state.load||0).toFixed(1)+' m³');const message=feedback&&performance.now()<feedback.until?feedback.message:summary;setText(compactState,message);setAttr(compactState,'title',message);setAttr(compactState,'data-feedback',feedback&&performance.now()<feedback.until?(feedback.failed?'error':'notice'):'');
  if(kind==='crane'){const target=constructionStructure(site,{construction:state})?.target,hook=state.hook||current?.position&&craneHookPosition(current),matingY=hook?hook.y-CONSTRUCTION_LOAD_OFFSET:0,yawError=target?degrees(Math.atan2(Math.sin((target.yaw||0)-(state.loadYaw||0)),Math.cos((target.yaw||0)-(state.loadYaw||0)))):0;setText(readout,target&&hook?'Beam placement offset '+Math.hypot(target.x-hook.x,target.z-hook.z).toFixed(1)+' m horizontal · '+(target.y-matingY).toFixed(1)+' m vertical · '+yawError.toFixed(0)+'° yaw · '+(state.load?'Steel attached':'Hook empty'):state.load?'Steel attached':'Hook empty');}
  else if(kind==='excavator')setText(readout,'Bucket '+Number(state.load||0).toFixed(1)+' / '+Number(telemetry.loadCapacity||2).toFixed(1)+' m³ · '+(state.repeatStatus||telemetry.status||'Manual ISO hydraulics'));
  else if(kind==='truck')setText(readout,'Payload '+Number(state.load||0).toFixed(1)+' / '+Number(telemetry.loadCapacity||40).toFixed(1)+' m³ · '+(telemetry.travelAllowed===false?telemetry.travelReason||'Travel interlocked':'Body and drive ready'));
  else setText(readout,'Blade '+Number(state.blade||0).toFixed(2)+' m · '+(telemetry.blockedReason||telemetry.status||'Cutting edge position is live'));
  const earth=site.earthworks,cargo=state.cargo||telemetry.cargo;setHidden(materials,!earth&&!cargo);setText(materials,[cargo?'Onboard · '+Object.entries(cargo).filter(([,amount])=>amount>0).map(([key,amount])=>(QUARRY_MATERIALS[key]?.name||key)+' '+Number(amount).toFixed(1)+' m³').join(' · '):'',earth?'Site moved · excavated '+Number(earth.excavated||0).toFixed(1)+' m³ · deposited '+Number(earth.deposited||0).toFixed(1)+' m³ · pushed '+Number(earth.pushed||0).toFixed(1)+' m³':'',earth?.totals?'In ground · soil '+Number(earth.totals.soil||0).toFixed(1)+' m³ · gravel '+Number(earth.totals.gravel||0).toFixed(1)+' m³ · carried '+Number((earth.totals.carriedSoil||0)+(earth.totals.carriedGravel||0)).toFixed(1)+' m³':'',Number.isFinite(telemetry.earthMoved)?'This machine moved '+telemetry.earthMoved.toFixed(1)+' m³':''].filter(Boolean).join('\n'));
  const job=site.crew?.jobs?.find(job=>job.machineId===current?.id);setHidden(jobReadings,!job);if(job)setText(jobReadings,(job.label||CONSTRUCTION_CREW_JOBS[job.type]?.label||job.id)+' · '+Math.round(Math.max(0,Math.min(1,Number(job.progress)||0))*100)+'% · '+Number(job.completed||0).toFixed(1)+' / '+Number(job.goal||0).toFixed(1)+' '+(job.unit||'')+' · '+(job.message||job.status||''));
  const tower=site.tower;setHidden(progress,!tower);if(tower)setText(progress,'Tower '+(tower.floors||0)+' / '+(tower.maxFloors||16)+' floors · '+(tower.placed||0)+' steel members · Pit '+Number(site.excavation?.depth||0).toFixed(1)+' m · Spoil '+Number(site.stockpile?.volume||0).toFixed(1)+' m³');
  updateAxisFeedback();
 }
 const timer=setInterval(()=>{if(!canUse()){if(Object.values(axes).some(Boolean)||travel.held)reset();return;}if(Object.values(axes).some(Boolean))sendAxes();},100);
 const closeCompanionOnEscape=event=>{if(event.key!=='Escape'||gameplayOverlayOpen())return;const dialog=[instrumentsDialog,functionsDialog,crewDialog].find(node=>node.open);if(dialog){event.preventDefault();event.stopImmediatePropagation();dialog.close();}};window.addEventListener('keydown',closeCompanionOnEscape,true);
 const releaseEvent=()=>reset({notify:false});window.addEventListener('blur',safeReset);document.addEventListener('visibilitychange',safeReset);document.addEventListener('muzikaz:release-game-input',releaseEvent);
 const dialogObserver=new MutationObserver(records=>{if(records.some(({target,attributeName})=>attributeName==='open'?target.localName==='dialog'&&target.open:target.id==='crib-chat-panel'&&!target.hidden)&&gameplayOverlayOpen())reset();});dialogObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
 return {releaseInputs:reset,get workView(){return !!kind&&workView;},inputs(){return canUse()&&kind!=='crane'&&travel.held&&current?.construction?.telemetry?.travelAllowed!==false?{forward:travel.forward,side:travel.side,brake:false}:null;},update(nextSnapshot,id){
  const replacement=selfId!==id||!!snapshot?.construction!==!!nextSnapshot?.construction;
  if(replacement){crewRevision++;crewBusy=false;crewStatus.dataset.feedbackUntil='0';}
  snapshot=nextSnapshot;selfId=id;updateCrew();const self=snapshot.players?.[selfId],next=snapshot.actors?.[self?.vehicleId],nextKind=constructionMachineKind(next),active=!!nextKind&&next?.active!==false&&self?.health!==0;
  if(!active){reset();if(actorId||replacement)replaceMachineRequests();current=null;actorId=null;kind=null;delete stage.dataset.constructionMachine;syncVisibility();return;}
  if(replacement||actorId!==next.id||kind!==nextKind){reset();replaceMachineRequests();current=next;actorId=next.id;kind=nextKind;controlMode='work';buildControls();setText(status,'');}else current=next;
  setAttr(stage,'data-construction-machine',kind);syncVisibility();refreshAction();
  updateInstruments();
 },dispose(){reset();disposed=true;replaceMachineRequests();crewRevision++;delete stage.dataset.constructionMachine;closeDialogs();clearInterval(timer);dialogObserver.disconnect();window.removeEventListener('keydown',closeCompanionOnEscape,true);window.removeEventListener('blur',safeReset);document.removeEventListener('visibilitychange',safeReset);document.removeEventListener('muzikaz:release-game-input',releaseEvent);for(const stick of sticks)stick.dispose();actions.dispose();panel.remove();stylesheet.remove();}};
}
