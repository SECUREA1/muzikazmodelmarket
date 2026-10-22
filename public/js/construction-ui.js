import {gameplayOverlayOpen} from './game-menu-controls.js';
import {sportIcon} from './sports-action-bar.js';
import {mountThumbstick} from './thumbstick-input.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
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

export function mountConstructionUI(stage,command,{onInput=()=>{}}={}){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/construction-ui.css',import.meta.url).href;document.head.append(stylesheet);
 const panel=document.createElement('section');panel.className='construction-controls';panel.hidden=true;panel.setAttribute('aria-label','Construction machine dashboard');
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
 const createDialog=(name,title,closeLabel)=>{const dialog=document.createElement('dialog');dialog.className=name+' construction-dialog';dialog.setAttribute('aria-label',title);const header=document.createElement('header'),h=document.createElement('h2'),close=document.createElement('button');h.textContent=title;close.type='button';close.textContent=closeLabel;close.onclick=()=>dialog.close();header.append(h,close);dialog.append(header);dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();dialog.close();}});document.body.append(dialog);return dialog;};
 const instrumentsDialog=createDialog('construction-instruments-dialog','Machine instruments','Close instruments');
 instrumentsDialog.append(systems,readout,instruments,cycle,warning,progress,axisFeedback,reference,help,status);
 const functionsDialog=createDialog('construction-functions-dialog','Machine functions','Close functions');functionsDialog.append(quick);
 manual.append(pads,travelPanel);panel.append(heading,compactState,manual);stage.append(panel);
 let current=null,kind=null,actorId=null,snapshot=null,selfId=null,disposed=false,controlsVisible=true,controlMode='work',inFlight=false,pending=false,actionBusy=false,workView=true,feedback=null,lastDialogOpener=null;
 let axes={},sticks=[],keyboardResets=[],travel={forward:0,side:0,held:false},instrumentNodes=new Map(),axisNodes=new Map();
 const canUse=()=>!disposed&&!!current&&controlsVisible&&!panel.hidden&&!document.hidden&&!gameplayOverlayOpen();
 function showFeedback(message,failed=false){message=String(message);feedback={message,failed,until:performance.now()+(failed?6500:2500)};setText(status,message);setText(compactState,message);setAttr(compactState,'title',message);setAttr(compactState,'data-feedback',failed?'error':'notice');}
 function report(error){showFeedback(error?.message||String(error),true);}
 async function flushAxes(){
  if(inFlight||!pending||!actorId||disposed)return;
  const entityId=actorId,sent={...axes};pending=false;inFlight=true;
  try{await command('construction-controls',{operation:'control',entityId,axes:sent});}catch(error){if(actorId===entityId&&!panel.hidden)report(error);}finally{inFlight=false;if(pending&&!disposed)void flushAxes();}
 }
 function sendAxes(){pending=true;void flushAxes();}
 function changeAxes(values){let changed=false;for(const [axis,value]of Object.entries(values)){let next=Math.max(-1,Math.min(1,Number(value)||0));if(kind==='truck'&&Math.abs(current?.driving?.speed||0)>.5)next=0;if((axes[axis]||0)!==next){axes[axis]=next;changed=true;}}if(changed){updateAxisFeedback();sendAxes();}}
 function setTravel(next){const changed=travel.forward!==next.forward||travel.side!==next.side||travel.held!==next.held;travel=next;if(changed)onInput();}
 function reset(){const active=Object.values(axes).some(value=>Math.abs(value)>.001);axes={};setTravel({forward:0,side:0,held:false});for(const resetKey of keyboardResets)resetKey();for(const stick of sticks)stick.reset();if(active)sendAxes();updateAxisFeedback();}
 function safeReset(){reset();}
 async function request(operation,fields={}){
  if(actionBusy||!actorId||disposed)return;
  reset();actionBusy=true;refreshAction();
  try{const result=await command(operation==='exit'?'interact':'construction-controls',operation==='exit'?{}:{operation,entityId:actorId,...fields});if(result?.result?.message)showFeedback(result.result.message);else if(!result)showFeedback('Request was not applied. Check the machine or site conditions and try again.',true);}catch(error){report(error);}finally{actionBusy=false;refreshAction();}
 }
 const utilities=document.createElement('div');utilities.className='sports-action-utilities construction-action-utilities';utilities.hidden=true;stage.append(utilities);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='sports-icon-button construction-controls-toggle';toggle.setAttribute('aria-label','Show or hide construction dashboard');toggle.setAttribute('aria-expanded','true');utilities.append(toggle);
 const bar=document.createElement('div');bar.className='sports-action-bar construction-action-bar';bar.setAttribute('aria-label','Construction machine actions');
 const row=document.createElement('div');row.className='sports-action-tools';bar.append(row);
 const primary=document.createElement('button');primary.type='button';primary.className='sports-primary-trigger';primary.onclick=()=>request(kind==='crane'?(current?.construction?.load?'release':'attach'):'work');
 const park=document.createElement('button');park.type='button';park.dataset.operation='park';park.textContent='Park';park.setAttribute('aria-label','Park construction machine');park.onclick=()=>request('park');
 const exit=document.createElement('button');exit.type='button';exit.dataset.operation='exit';exit.textContent='Exit';exit.setAttribute('aria-label','Exit parked construction machine');exit.onclick=()=>request('exit');
 const more=document.createElement('button');more.type='button';more.dataset.constructionMore='';more.textContent='More';more.setAttribute('aria-label','More machine functions');more.setAttribute('aria-haspopup','dialog');
 row.append(primary,park,exit,more);panel.append(bar);
 const actions={root:bar,row,primary,utilities,popup:functionsDialog,dispose(){utilities.remove();bar.remove();instrumentsDialog.remove();functionsDialog.remove();}};
 function closeDialogs(){for(const dialog of [instrumentsDialog,functionsDialog])if(dialog.open)dialog.close();}
 function syncVisibility(){
  const visible=!!current&&controlsVisible;setHidden(panel,!visible);setHidden(utilities,!current);setHidden(pads,controlMode!=='work');setHidden(travelPanel,kind==='crane'||controlMode!=='drive');
  setHidden(heading.querySelector('[data-construction-mode=drive]'),kind==='crane');for(const button of heading.querySelectorAll('[data-construction-mode]'))setAttr(button,'aria-pressed',button.dataset.constructionMode===controlMode);
  setAttr(toggle,'aria-expanded',controlsVisible);setAttr(toggle,'title',controlsVisible?'Hide machine controls':'Restore machine controls');const title=controlsVisible?'Hide machine':'Machine controls';if(toggle.dataset.label!==title){toggle.innerHTML=sportIcon(controlsVisible?'hide':'tools')+'<span>'+title+'</span>';toggle.dataset.label=title;}
  setAttr(panel,'data-control-mode',controlMode);if(!visible)closeDialogs();
 }
 function setMode(mode){if(mode===controlMode||mode==='drive'&&kind==='crane')return;reset();controlMode=mode;syncVisibility();refreshAction();updateInstruments();}
 for(const button of heading.querySelectorAll('[data-construction-mode]'))button.onclick=()=>setMode(button.dataset.constructionMode);
 toggle.onclick=()=>{reset();controlsVisible=!controlsVisible;syncVisibility();};
 function openDialog(dialog,opener){reset();closeDialogs();lastDialogOpener=opener;(document.fullscreenElement||document.body).append(dialog);if(!dialog.open)dialog.showModal();}
 for(const dialog of [instrumentsDialog,functionsDialog])dialog.addEventListener('close',()=>{const opener=lastDialogOpener;if(opener?.isConnected&&!panel.hidden&&!gameplayOverlayOpen()&&(document.activeElement===document.body||dialog.contains(document.activeElement)))opener.focus({preventScroll:true});});
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
  if(operation==='attach')return {enabled:kind==='crane'&&!state.load&&telemetry.canAttach!==false,reason:telemetry.attachReason||'Lower the hook within 3 m horizontally and 2 m vertically of an available steel beam.'};
  if(operation==='release')return {enabled:kind==='crane'&&!!state.load&&telemetry.canRelease!==false,reason:telemetry.releaseReason||'Release the attached beam onto the highlighted tower target or lower it to the ground.'};
  if(operation==='work')return {enabled:kind!=='crane'&&!state.workCycle&&!moving&&telemetry.canWork!==false,reason:telemetry.workReason||(moving?'Park before starting a hydraulic work cycle.':state.workCycle?'The hydraulic work cycle is already running.':'Start the site work cycle for this machine.')};
  if(operation==='aim-target')return {enabled:kind==='crane'&&!!snapshot?.construction?.tower?.target,reason:'Raise to clearance height, slew to the next tower target and lower automatically. Manual input takes over.'};
  if(operation==='aim-supply')return {enabled:kind==='crane'&&!state.load,reason:state.load?'Place or release the attached beam before returning to the steel store.':'Align the empty hook with an available steel beam. Manual input takes over.'};
  return {enabled:true,reason:''};
 }
 function applyAvailability(button,operation){const choice=availability(operation);setDisabled(button,!choice.enabled);setAttr(button,'title',choice.reason);return choice;}
 function refreshAction(){
  const state=current?.construction||{},cycling=!!state.workCycle,operation=kind==='crane'?(state.load?'release':'attach'):'work';
  const label=cycling?'Working…':kind==='crane'?(state.load?'Place steel':'Attach steel'):kind==='truck'?'Unload':kind==='bulldozer'?'Grade':state.load?'Load truck':'Dig';
  setText(primary,label);setAttr(primary,'data-operation',operation);setAttr(primary,'aria-label',kind==='crane'?state.load?'Place or release steel':'Attach nearby steel':kind==='truck'?'Unload material':kind==='bulldozer'?'Push and grade earth':state.load?'Transfer soil to truck':'Dig and fill bucket');
  applyAvailability(primary,operation);applyAvailability(park,'park');applyAvailability(exit,'exit');
  for(const button of quick.querySelectorAll('[data-operation]')){applyAvailability(button,button.dataset.operation);if(button.dataset.operation==='precision'){setAttr(button,'aria-pressed',!!state.precision);setText(button,state.precision?'Precision · 30% rate':'Precision · full rate');}}
  const telemetry=state.telemetry||{},notice=controlMode==='drive'&&telemetry.travelAllowed===false?telemetry.travelReason:telemetry.blockedReason||(!availability(operation).enabled?availability(operation).reason:'');setText(warning,notice);setHidden(warning,!notice);setAttr(panel,'data-interlocked',!!notice);
  const travelAllowed=kind!=='crane'&&telemetry.travelAllowed!==false&&!cycling&&!(kind==='truck'&&(state.bed||0)>.08);for(const node of pads.querySelectorAll('.construction-stick')){const blocked=kind==='truck'&&Math.abs(current?.driving?.speed||0)>.5;setAttr(node,'aria-disabled',blocked);if(blocked)setAttr(node,'title','Stop the truck before operating the body hoist.');}
  for(const node of travelPanel.querySelectorAll('.construction-travel-stick')){setAttr(node,'aria-disabled',!travelAllowed);setAttr(node,'title',travelAllowed?'Hold to travel. Release to coast; Park engages the brake.':telemetry.travelReason||'Finish or cancel the work cycle before travelling.');}if(!travelAllowed&&travel.held)setTravel({forward:0,side:0,held:false});
 }
 function addQuick(label,operation){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.operation=operation;button.onclick=()=>request(operation,operation==='precision'?{enabled:!current?.construction?.precision}:{});quick.append(button);return button;}
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
  surface.onkeydown=event=>{if(!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();if(!permitted())return;pressed.add(event.key);publishKeys();};
  surface.onkeyup=event=>{if(!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();pressed.delete(event.key);publishKeys();};surface.onblur=clearKeys;
 }
 function buildControls(){
  reset();for(const stick of sticks)stick.dispose();sticks=[];keyboardResets=[];pads.replaceChildren();quick.replaceChildren();travelPanel.replaceChildren();instruments.replaceChildren();axisFeedback.replaceChildren();reference.querySelector('div').replaceChildren();instrumentNodes.clear();axisNodes.clear();
  const scheme=constructionControlScheme(kind);
  for(const config of scheme){bindJoystick(config,pads);const item=document.createElement('p');item.textContent=config.label+': '+config.description;reference.querySelector('div').append(item);}
  for(const axis of [...new Set(scheme.flatMap(config=>[config.horizontal,config.vertical]).filter(Boolean))]){const root=document.createElement('div');root.className='construction-axis';root.dataset.axis=axis;const label=document.createElement('span');label.textContent=axisNames[axis];const demand=document.createElement('output');demand.className='construction-axis-demand';demand.setAttribute('aria-label',axisNames[axis]+' requested demand');const accepted=document.createElement('output');accepted.className='construction-axis-accepted';accepted.setAttribute('aria-label',axisNames[axis]+' server demand');const track=document.createElement('span');track.className='construction-axis-track';track.setAttribute('aria-hidden','true');const bar=document.createElement('i');track.append(bar);root.append(label,track,demand,accepted);axisFeedback.append(root);axisNodes.set(axis,{root,request:demand,accepted,bar});}
  for(const spec of constructionInstrumentSpecs(kind)){const root=document.createElement('label');root.className='construction-instrument';root.dataset.instrument=spec.id;const label=document.createElement('span');label.textContent=spec.label;const output=document.createElement('output');output.setAttribute('aria-label',spec.label);const meter=document.createElement('meter');meter.min=spec.min;meter.max=spec.max;meter.value=spec.min;meter.setAttribute('aria-label',spec.label+' range');root.append(label,output,meter);instruments.append(root);instrumentNodes.set(spec.id,{...spec,root,output,meter});}
  if(kind!=='crane'){bindJoystick({label:kind==='truck'?'Travel / steering':'Track travel / steering',up:'Forward W',down:'Reverse S',left:'Steer left A',right:'Steer right D',description:'Dashboard: hold this stick or focus it and hold arrow keys. W/S and A/D remain available in the game. Park stops the machine.'},travelPanel,{travelControl:true});const reading=document.createElement('output');reading.className='construction-travel-readout';reading.setAttribute('aria-label','Travel control readings');travelPanel.append(reading);}
  if(kind==='crane'){const view=document.createElement('button');view.type='button';view.textContent='Work camera / operator view';view.setAttribute('aria-label','Toggle crane work camera');view.setAttribute('aria-pressed',String(workView));view.onclick=()=>{workView=!workView;setAttr(view,'aria-pressed',workView);};quick.append(view);addQuick('Align to steel','aim-supply');addQuick('Align to tower','aim-target');help.textContent='Lower the hook beside a loose beam, attach it, lift clear of the site, then align with the highlighted tower target and place it. The alignment buttons automate positioning; moving a joystick returns to manual control.';}
  else if(kind==='excavator'){help.textContent='ISO work joysticks operate independently of track travel. Dig beside the marked pit; transfer a loaded bucket into a dumptruck within reach. The automatic cycle follows the same connected boom, stick and bucket joints.';}
  else if(kind==='bulldozer'){help.textContent='Lower the blade for grading beside the pit or spoil area. Raise the blade before travelling away. The work cycle grades a measured area and updates the shared site progress.';}
  else{help.textContent='Position beside the excavator to receive soil, then drive to the spoil area. Stop before using the body hoist. Travel is locked while the body is raised; lower it before returning for another load.';}
  help.textContent+=' Focus a joystick and hold arrow keys; release to return the valve to neutral. Manual work input cancels an automatic cycle. Precision reduces hydraulic speed to 30%.';
  addQuick('Precision · full rate','precision');setText(heading.querySelector('strong'),({crane:'Tower crane',truck:'Dumptruck',bulldozer:'Bulldozer',excavator:'Excavator'})[kind]);setAttr(heading.querySelector('strong'),'title',names[kind]||'Construction machine');updateAxisFeedback();
 }
 function updateInstruments(){
  const state=current?.construction||{},telemetry=state.telemetry||{},site=snapshot?.construction||{},speed=Number(current?.driving?.speed)||0;
  const values={...state,hookLoad:telemetry.hookLoadTonnes,loadMoment:telemetry.loadMomentPercent,speed:Math.abs(speed)*3.6,load:kind==='crane'?(state.load?1:0):Number(state.load)||0,graded:site.graded||0,slew:bearing(state.slew),loadYaw:bearing(state.loadYaw),swing:bearing(-state.swing),boom:degrees(state.boom),stick:degrees(state.stick),bucket:degrees(state.bucket),bed:degrees(state.bed)};
  for(const [id,node]of instrumentNodes){const optional=id==='hookLoad'||id==='loadMoment';if(optional){setHidden(node.root,!Number.isFinite(Number(values[id])));if(!Number.isFinite(Number(values[id])))continue;}const value=Number(values[id])||0,max=id==='hookLoad'?(telemetry.safeWorkingLoadTonnes||node.max):id==='load'&&kind!=='crane'?(telemetry.loadCapacity||node.max):node.max;setText(node.output,value.toFixed(node.digits)+' '+node.unit);if(node.meter.max!==max)node.meter.max=max;const bounded=Math.max(node.min,Math.min(max,value));if(node.meter.value!==bounded)node.meter.value=bounded;setAttr(node.meter,'aria-valuetext',node.output.textContent);setAttr(node.root,'data-over-limit',value>max);}
  const travelReading=travelPanel.querySelector('.construction-travel-readout');if(travelReading)setText(travelReading,'Throttle '+Math.round((current.driving?.throttle||0)*100)+'% · Steering '+Math.round((current.driving?.steering||0)*100)+'% · Parking brake '+(current.driving?.parked?'engaged':'released'));
  const gear=kind==='crane'?'FIXED BASE':current?.driving?.blocked?'BLOCKED':current?.driving?.parked?'P / brake':Math.abs(speed)<.1?'N':speed<0?'R':'D',mode=state.workCycle?'Automatic cycle':state.assist?'Alignment '+state.assist:'Manual',hydraulics=telemetry.hydraulicsActive??state.working;
  setText(systems,'Drive '+gear+' · '+mode+' · Hydraulics '+(hydraulics?'active':'neutral')+' · '+(state.precision?'Precision 30%':'Full rate'));
  const activeCycle=!!state.workCycle;setHidden(cycle,!activeCycle);if(activeCycle){const elapsed=Math.max(0,(Number(snapshot?.serverTime)||state.workCycle.start)-state.workCycle.start),fraction=Math.max(0,Math.min(1,Number(telemetry.cycleProgress??elapsed/state.workCycle.duration)||0));setText(cycle.querySelector('output'),(telemetry.cyclePhase||state.workCycle.mode)+' · '+Math.round(fraction*100)+'%');const bar=cycle.querySelector('progress');if(bar.value!==fraction)bar.value=fraction;}
  const issue=controlMode==='drive'&&telemetry.travelAllowed===false?telemetry.travelReason:telemetry.blockedReason;const summary=issue||state.workCycle?(issue||'Cycle '+(telemetry.cyclePhase||state.workCycle.mode)+' · '+Math.round((telemetry.cycleProgress||0)*100)+'% · Park to cancel'):kind==='crane'?'Hook '+Number(state.hoist||0).toFixed(1)+' m · '+(state.load?'Steel attached':'Hook empty'):Math.abs(speed*3.6).toFixed(1)+' km/h · '+(kind==='bulldozer'?'Blade '+Number(state.blade||0).toFixed(2)+' m':'Load '+Number(state.load||0).toFixed(1)+' m³');const message=feedback&&performance.now()<feedback.until?feedback.message:summary;setText(compactState,message);setAttr(compactState,'title',message);setAttr(compactState,'data-feedback',feedback&&performance.now()<feedback.until?(feedback.failed?'error':'notice'):'');
  if(kind==='crane'){const target=site.tower?.target,hook=state.hook||current?.position&&craneHookPosition(current),matingY=hook?hook.y-CONSTRUCTION_LOAD_OFFSET:0,yawError=target?degrees(Math.atan2(Math.sin((target.yaw||0)-(state.loadYaw||0)),Math.cos((target.yaw||0)-(state.loadYaw||0)))):0;setText(readout,target&&hook?'Beam placement offset '+Math.hypot(target.x-hook.x,target.z-hook.z).toFixed(1)+' m horizontal · '+(target.y-matingY).toFixed(1)+' m vertical · '+yawError.toFixed(0)+'° yaw · '+(state.load?'Steel attached':'Hook empty'):state.load?'Steel attached':'Hook empty');}
  else if(kind==='excavator')setText(readout,'Bucket '+Number(state.load||0).toFixed(1)+' / '+Number(telemetry.loadCapacity||2).toFixed(1)+' m³ · '+(telemetry.status||'Manual ISO hydraulics'));
  else if(kind==='truck')setText(readout,'Payload '+Number(state.load||0).toFixed(1)+' / '+Number(telemetry.loadCapacity||40).toFixed(1)+' m³ · '+(telemetry.travelAllowed===false?telemetry.travelReason||'Travel interlocked':'Body and drive ready'));
  else setText(readout,'Blade '+Number(state.blade||0).toFixed(2)+' m · '+(telemetry.blockedReason||telemetry.status||'Cutting edge position is live'));
  const tower=site.tower;setHidden(progress,!tower);if(tower)setText(progress,'Tower '+(tower.floors||0)+' / '+(tower.maxFloors||16)+' floors · '+(tower.placed||0)+' steel members · Pit '+Number(site.excavation?.depth||0).toFixed(1)+' m · Spoil '+Number(site.stockpile?.volume||0).toFixed(1)+' m³');
  updateAxisFeedback();
 }
 const timer=setInterval(()=>{if(!canUse()){if(Object.values(axes).some(Boolean)||travel.held)reset();return;}if(Object.values(axes).some(Boolean))sendAxes();},100);
 window.addEventListener('blur',safeReset);document.addEventListener('visibilitychange',safeReset);
 const dialogObserver=new MutationObserver(records=>{if(records.some(({target,attributeName})=>attributeName==='open'?target.localName==='dialog'&&target.open:target.id==='crib-chat-panel'&&!target.hidden)&&gameplayOverlayOpen())reset();});dialogObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
 return {get workView(){return kind==='crane'&&workView;},inputs(){return canUse()&&kind!=='crane'&&travel.held&&current?.construction?.telemetry?.travelAllowed!==false?{forward:travel.forward,side:travel.side,brake:false}:null;},update(nextSnapshot,id){
  snapshot=nextSnapshot;selfId=id;const self=snapshot.players?.[selfId],next=snapshot.actors?.[self?.vehicleId],nextKind=constructionMachineKind(next),active=!!nextKind&&next?.active!==false&&self?.health!==0;
  if(!active){reset();current=null;actorId=null;kind=null;delete stage.dataset.constructionMachine;syncVisibility();return;}
  if(actorId!==next.id||kind!==nextKind){reset();current=next;actorId=next.id;kind=nextKind;controlMode='work';feedback=null;buildControls();setText(status,'');}else current=next;
  setAttr(stage,'data-construction-machine',kind);syncVisibility();refreshAction();
  updateInstruments();
 },dispose(){reset();disposed=true;delete stage.dataset.constructionMachine;closeDialogs();clearInterval(timer);dialogObserver.disconnect();window.removeEventListener('blur',safeReset);document.removeEventListener('visibilitychange',safeReset);for(const stick of sticks)stick.dispose();actions.dispose();panel.remove();stylesheet.remove();}};
}
