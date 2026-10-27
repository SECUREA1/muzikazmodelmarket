import {prisonContractsMarkup,prisonPacksMarkup} from './prison-expansion-ui.js';
import {PRISON_PROTOCOL,PRISON_PROTOCOL_VERSION,makePrisonActionPacket} from './prison-protocol.js';
import {acceptPrisonContract,abandonPrisonContract,recordPrisonContractEvent,prisonContractView} from './prison-contracts.js';
import {purchasePrisonPacket,usePrisonItem} from './prison-packets.js';
import {PRISON_ID, PRISON_SPAWN, PRISON_STATIONS, PRISON_CELLS, PRISON_NPCS, isPrisonEnvironment} from './prison-config.js';
import {findPrisonPath} from './prison-navigation.js';
import {fullscreenPanel} from './fullscreen-panels.js';
import {loadGameMenuStyles} from './game-menu-controls.js';

const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
const copy=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const point=item=>item?.position||{x:Number(item?.x)||0,y:Number(item?.y)||.02,z:Number(item?.z)||0};
const cellPoint=cell=>cell?.interiorPosition||cell?.position||point(cell);
const event=(state,message,now)=>{state.events.unshift({at:now,message});state.events=state.events.slice(0,8);};
const item=(player,id)=>player.inventory.includes(id);
const award=(player,id,tokens=5)=>{if(player.completed.includes(id))return false;player.completed.push(id);player.tokens+=tokens;return true;};
export const PRISON_DAY_SECONDS=480;
export const PRISON_ITEM_NAMES=Object.freeze({wire:'Bent wire',keycard:'Security keycard',map:'Service-route map',pass:'Maintenance pass',snack:'Canteen snack'});
export const PRISON_CHALLENGES=Object.freeze([
 {id:'meal',name:'Cafeteria regular',description:'Collect a hot meal in the cafeteria.'},
 {id:'tv',name:'Common-room critic',description:'Watch a show in the recreation room.'},
 {id:'radio',name:'On the air',description:'Tune the radio to 94.7 FM.'},
 {id:'arcade',name:'High score',description:'Complete the recreation-room memory game.'},
 {id:'boxing',name:'Clean combination',description:'Finish a controlled six-move boxing round.'},
 {id:'work',name:'An honest shift',description:'Complete three workshop supply-sorting jobs.'},
 {id:'theft',name:'Light fingers',description:'Find the hidden wire in the contraband stash.'},
 {id:'security',name:'Borrowed authority',description:'Obtain the security keycard.'},
 {id:'vent',name:'Below the surface',description:'Open the service hatch with the wire and card.'},
 {id:'escape',name:'Beyond the walls',description:'Reach the south gate during a patrol gap.'},
 {id:'patrol',name:'Keep the peace',description:'As a guard, calm a disturbance in the yard.'}
]);

export function prisonInitialState(now=Date.now()){
 return {version:1,revision:0,startedAt:now,elapsed:90,day:1,phase:'free-time',alarmUntil:0,manualLockdownUntil:0,gateOpen:false,gateOpenUntil:0,lastEventAt:now,
  cells:Object.fromEntries(PRISON_CELLS.map(cell=>[cell.id,{locked:false,manual:false,releaseAt:0}])),
  npcs:Object.fromEntries(PRISON_NPCS.map(npc=>[npc.id,{id:npc.id,name:npc.name,role:npc.role,position:copy(point(npc)),rotationY:0,state:npc.role==='guard'?'Patrolling':'Free time',home:copy(point(npc))}])),players:{},events:[{at:now,message:'Welcome to Ironwood. Explore, earn tokens, or plan your way out.'}]};
}
function securePrisonResidents(state){
 for(const [index,npc]of Object.values(state.npcs).entries()){if(npc.role==='guard')continue;const cell=PRISON_CELLS[index%PRISON_CELLS.length];npc.position=copy(cellPoint(cell));npc.state='In cell';npc.navigation=null;npc.disturbedUntil=0;npc.combatTarget=null;}
}
function ensurePlayer(state,playerId,now){
 if(!playerId)return null;
 if(!state.players[playerId])state.players[playerId]={role:'prisoner',cellId:PRISON_CELLS[Object.keys(state.players).length%Math.max(1,PRISON_CELLS.length)]?.id||null,health:100,energy:85,morale:70,heat:0,tokens:0,inventory:[],completed:[],workCount:0,lastActions:{},round:null,escaped:false,caughtUntil:0,joinedAt:now,streak:0};
 return state.players[playerId];
}
function finish(state,player,message,now,fields={}){player.message=message;player.updatedAt=now;return {ok:true,message,...fields};}
function fail(message){return {ok:false,message};}
const patrols={
 'guard-ward':[{x:6,y:0,z:71},{x:6,y:0,z:95},{x:8,y:0,z:104},{x:-8,y:0,z:104},{x:-8,y:0,z:72}],
 'guard-rook':[{x:-15,y:0,z:27},{x:-15,y:0,z:42},{x:0,y:0,z:42},{x:0,y:0,z:27}],
 'guard-chen':[{x:9,y:0,z:-32},{x:9,y:0,z:-50},{x:9,y:0,z:-10}],
 'guard-bell':[{x:-12,y:0,z:-77},{x:-30,y:0,z:-77},{x:-30,y:0,z:-65},{x:-12,y:0,z:-65},{x:-12,y:0,z:-90}],
 'guard-tower':[{x:89,y:0,z:70},{x:89,y:0,z:60},{x:30,y:0,z:60},{x:30,y:0,z:60},{x:89,y:0,z:60}]
};
function walkPrisonNpc(npc,target,state,delta,now,resolveMovement,lockSignature){
 const prior=npc.navigation;
 if(!prior||distance(prior.target,target)>1.5||prior.locks!==lockSignature||(prior.stuck||0)>3||(!prior.path&&now-prior.at>5000)){
  npc.navigation={target:copy(target),path:findPrisonPath(npc.position,target,state),index:1,locks:lockSignature,at:now,stuck:0};
 }
 const navigation=npc.navigation;if(!navigation.path)return;
 let budget=(npc.state==='Pursuing'?4.4:npc.role==='guard'?2.2:1.6)*delta,iterations=0;
 while(budget>.001&&iterations++<15){
  const waypoint=navigation.path[navigation.index];if(!waypoint)break;
  const gap=distance(npc.position,waypoint);if(gap<.08){navigation.index++;continue;}
  const move=Math.min(gap,budget),from=copy(npc.position);npc.rotationY=Math.atan2(waypoint.x-from.x,waypoint.z-from.z);
  const next={x:from.x+(waypoint.x-from.x)/gap*move,y:from.y,z:from.z+(waypoint.z-from.z)/gap*move};
  npc.position=resolveMovement?.(from,next,npc)||next;const actual=distance(from,npc.position);budget-=move;
  if(actual<move*.65){navigation.stuck+=delta;break;}navigation.stuck=0;
  if(move>=gap-.01)navigation.index++;
 }
}
function nearestGuard(state,position){return Object.values(state.npcs).filter(npc=>npc.role==='guard').reduce((closest,npc)=>distance(position,npc.position)<distance(position,closest?.position)?npc:closest,null);}
function cooldown(player,operation,now,ms){return now-(player.lastActions[operation]??-Infinity)<ms;}
function startRound(player,kind,now){
 const inputs=kind==='boxing'?['jab','duck','cross','jab','cross','duck']:['up','left','right','down','left'];
 player.round={kind,inputs,index:0,startedAt:now,expiresAt:now+45000,score:0};
 return inputs[0];
}
/** All world changes are validated here; clients supply choices, never reward totals. */
function applyPrisonAction(state,action,payload={},context={}){
 const {playerId,position,now=Date.now()}=context;
 if(action!=='prison-action'||!state||!playerId||!position)return fail('Enter the prison before using its activities.');
 const station=PRISON_STATIONS.find(value=>value.id===payload.stationId);
 if(!station)return fail('Choose a prison activity.');
 if(payload.operation!=='supply-use'&&distance(position,point(station))>(station.interactionDistance||6))return fail('Walk closer to '+station.name+' to use it.');
 const op=String(payload.operation||''),kind=station.kind;
 const allowed={intake:['role-prisoner','role-guard','status','contract-accept','contract-abandon','packet-buy'],welcome:['role-prisoner','role-guard','status'],cell:['cell-lock','cell-unlock','rest'],meal:['meal','packet-buy'],cafeteria:['meal'],tv:['tv'],radio:['radio'],arcade:['arcade-start','arcade-input'],games:['arcade-start','arcade-input'],gym:['boxing-start','boxing-input','fight','deescalate'],yard:['boxing-start','boxing-input','fight','deescalate'],work:['work'],laundry:['work'],stash:['theft'],contraband:['theft'],security:['keycard','lockdown','all-unlock','patrol'],vent:['vent'],gate:['escape'],escape:['escape','return']};
 if(op!=='supply-use'&&!(allowed[kind]||[]).includes(op))return fail('That action is not available at this station.');
 const player=ensurePlayer(state,playerId,now);
 if(op==='return'){player.escaped=false;player.caughtUntil=0;player.heat=0;player.inventory=[];player.round=null;return finish(state,player,'Returned to intake. Your achievements and recreation tokens are saved. Choose a new shift or try again.',now,{relocate:copy(PRISON_SPAWN)});}
 if(player.caughtUntil>now&&!['rest','status'].includes(op))return fail('Your cell opens in '+Math.ceil((player.caughtUntil-now)/1000)+' seconds.');
 if(player.escaped&&!['role-prisoner','role-guard','status'].includes(op))return fail('Escape complete! Return to intake to start another shift.');
 if(cooldown(player,'any',now,250))return fail('One action at a time.');
 player.lastActions.any=now;
 if(op==='contract-accept'||op==='contract-abandon'){const result=op==='contract-accept'?acceptPrisonContract(player,payload.contractId,{day:state.day,now}):abandonPrisonContract(player,{day:state.day});return result.ok?finish(state,player,result.message,now):result;}
 if(op==='packet-buy'){const result=purchasePrisonPacket(player,payload.packetId,{now});return result.ok?finish(state,player,result.message,now):result;}
 if(op==='supply-use'){const result=usePrisonItem(player,payload.itemId,{now,phase:state.phase});return result.ok?finish(state,player,result.message,now):result;}
 if(op==='status')return finish(state,player,'Your progress is saved with this prison room. Follow the routine or build an escape plan.',now);
 if(op==='role-prisoner'||op==='role-guard'){
  player.role=op==='role-guard'?'guard':'prisoner';player.escaped=false;player.heat=0;player.caughtUntil=0;player.round=null;
  return finish(state,player,player.role==='guard'?'Guard shift started. Patrol, stop fights and manage cell security.':'Prisoner shift started. Follow the schedule, enjoy activities, or solve the escape route.',now);
 }
 if(op==='rest'){const assigned=PRISON_CELLS.find(value=>value.id===player.cellId);if(station.cellId!==player.cellId)return fail('Rest in your assigned cell.');if(assigned&&(position.z-assigned.doorPosition.z)*(assigned.position.z-assigned.doorPosition.z)<=0)return fail('Step inside your assigned cell before resting on the bunk.');if(cooldown(player,'rest',now,20000))return fail('You are already rested. Wait 20 seconds before resting again.');player.lastActions.rest=now;player.health=clamp(player.health+20);player.energy=clamp(player.energy+25);player.heat=clamp(player.heat-8);return finish(state,player,'You rest on your bunk. Health and energy restored.',now);}
 if(op==='cell-lock'||op==='cell-unlock'){
  const cell=PRISON_CELLS.find(value=>value.id===(station.cellId||payload.cellId))||PRISON_CELLS.find(value=>distance(point(value),position)<9)||PRISON_CELLS.find(value=>value.id===player.cellId);
  if(!cell||!state.cells[cell.id])return fail('No cell door within reach.');
  if(player.role!=='guard'&&cell.id!==player.cellId&&!item(player,'keycard'))return fail('Only a guard or security keycard can operate another prisoner’s cell.');
  if(op==='cell-unlock'&&state.phase==='lockdown'&&player.role!=='guard'&&!item(player,'keycard'))return fail('Cells are secured for lockdown. Wait for free time or find a keycard.');
  state.cells[cell.id].locked=op==='cell-lock';state.cells[cell.id].manual=true;
  return finish(state,player,(cell.name||cell.id)+(op==='cell-lock'?' locked. The bars now block entry.':' unlocked. The doorway is clear.'),now);
 }
 if(op==='meal'){
  if(cooldown(player,'meal',now,20000))return fail('The next hot tray is ready in '+Math.ceil((20000-(now-player.lastActions.meal))/1000)+' seconds.');
  player.lastActions.meal=now;player.energy=clamp(player.energy+30);player.health=clamp(player.health+15);player.morale=clamp(player.morale+8);award(player,'meal');
  return finish(state,player,'Hot tray collected: stew, bread and fruit. +30 energy, +15 health.',now);
 }
 if(op==='tv'){player.morale=clamp(player.morale+12);player.tvChannel=player.tvChannel==='Yard League'?'Prison Planet':'Yard League';award(player,'tv');return finish(state,player,'Now showing: '+player.tvChannel+'. A little common-room downtime lifts morale.',now);}
 if(op==='radio'){
  const frequency=Number(payload.input);if(!Number.isFinite(frequency)||Math.abs(frequency-94.7)>.051)return fail('Static… tune to the station on the poster: 94.7 FM.');
  player.morale=clamp(player.morale+15);award(player,'radio');return finish(state,player,'94.7 FM locked in. Ironwood Radio is on the air!',now);
 }
 if(op==='arcade-start'||op==='boxing-start'){
  if(player.energy<8)return fail('You need a meal or a rest before starting a round.');
  const game=op.startsWith('arcade')?'arcade':'boxing';const first=startRound(player,game,now);
  return finish(state,player,(game==='arcade'?'Follow the lit arrows.':'Read your sparring partner: jab, cross or duck.')+' First move: '+first.toUpperCase()+'.',now);
 }
 if(op==='arcade-input'||op==='boxing-input'){
  const game=op.startsWith('arcade')?'arcade':'boxing',round=player.round;
  if(!round||round.kind!==game||round.expiresAt<now){player.round=null;return fail('Start a new round at this station.');}
  if(payload.input!==round.inputs[round.index]){player.streak=0;player.round=null;player.energy=clamp(player.energy-3);return finish(state,player,'Wrong move. The round ends; try again and follow the cue.',now);}
  round.score+=100;round.index++;player.streak++;
  if(round.index===round.inputs.length){player.energy=clamp(player.energy-8);player.morale=clamp(player.morale+15);player.tokens+=3;award(player,game,8);player.round=null;return finish(state,player,(game==='arcade'?'High score!':'Clean combination!')+' Round complete. +3 recreation tokens.',now);}
  return finish(state,player,'Good move. Next: '+round.inputs[round.index].toUpperCase()+'.',now);
 }
 if(op==='work'){
  if(cooldown(player,'work',now,4000))return fail('The next supply basket is still being delivered.');
  const expected=['orange','white','blue'][player.workCount%3];if(payload.input!==expected)return fail('Sort this basket into '+expected.toUpperCase()+'.');
  player.lastActions.work=now;player.workCount++;player.tokens+=2;player.heat=clamp(player.heat-6);player.energy=clamp(player.energy-3);if(player.workCount>=3)award(player,'work',8);
  return finish(state,player,'Basket sorted. +2 tokens; good work lowers suspicion. Next basket: '+['orange','white','blue'][player.workCount%3]+'.',now);
 }
 if(op==='fight'){
  if(cooldown(player,'fight',now,10000))return fail('Everyone is backing off. Give the yard a moment to settle.');
  player.lastActions.fight=now;player.health=clamp(player.health-18);player.energy=clamp(player.energy-15);player.heat=clamp(player.heat+38);player.morale=clamp(player.morale-8);state.alarmUntil=Math.max(state.alarmUntil,now+18000);
  const prisoner=Object.values(state.npcs).filter(npc=>npc.role==='prisoner').sort((a,b)=>distance(position,a.position)-distance(position,b.position))[0];if(prisoner){prisoner.state='Disturbance';prisoner.disturbedUntil=now+20000;prisoner.combatTarget=copy(position);}
  event(state,'Yard disturbance reported. Guards are responding.',now);
  return finish(state,player,'The scuffle costs 18 health and raises suspicion. Guards are closing in. Try de-escalating next time.',now);
 }
 if(op==='deescalate'||op==='patrol'){
  if(op==='patrol'&&player.role!=='guard')return fail('Start a guard shift at intake to take patrol duty.');
  const disturbed=Object.values(state.npcs).some(npc=>npc.disturbedUntil>now);
  for(const npc of Object.values(state.npcs))if(npc.state==='Disturbance'){npc.disturbedUntil=0;npc.combatTarget=null;npc.state='Calm';}
  player.heat=clamp(player.heat-20);player.morale=clamp(player.morale+8);state.alarmUntil=0;if(player.role==='guard'&&disturbed)award(player,'patrol',10);
  return finish(state,player,'The disturbance is settled. Suspicion drops and the yard returns to normal.',now);
 }
 if(op==='theft'){
  if(item(player,'wire'))return fail('You already have the wire. Next, find the security keycard.');
  player.inventory.push('wire','map');player.heat=clamp(player.heat+24);award(player,'theft',6);
  return finish(state,player,'Inside the hidden stash: bent wire and a service-route map. Suspicion +24. Security is your next stop.',now);
 }
 if(op==='keycard'){
  if(item(player,'keycard'))return fail('You already have a security keycard.');
  if(player.role!=='guard'&&!item(player,'wire'))return fail('The security drawer is latched. Find something in the stash that can open it.');
  if(player.role!=='guard'&&distance(position,nearestGuard(state,position)?.position)<9)return fail('A guard is watching the desk. Wait for the patrol to pass.');
  if(String(payload.input)!=='314')return fail('The desk keypad needs a three-digit code. The duty-board clue reads: “three rounds, one count, four towers.”');
  player.inventory.push('keycard');if(player.role!=='guard')player.heat=clamp(player.heat+24);award(player,'security',6);
  return finish(state,player,'Security keycard acquired. The service hatch needs this and the bent wire.',now);
 }
 if(op==='lockdown'||op==='all-unlock'){
  if(player.role!=='guard')return fail('Only the guard shift can change facility-wide security.');
  state.manualLockdownUntil=op==='lockdown'?now+30000:0;state.phase=op==='lockdown'?'lockdown':routinePhase(state.elapsed);if(op==='lockdown')securePrisonResidents(state);
  for(const cell of Object.values(state.cells)){cell.locked=op==='lockdown';cell.manual=false;cell.releaseAt=0;}
  event(state,op==='lockdown'?'Guard control: 30-second security lockdown.':'Guard control: cells released for free movement.',now);
  return finish(state,player,op==='lockdown'?'All cell doors secured for 30 seconds.':'All cell doors unlocked.',now);
 }
 if(op==='vent'){
  if(!item(player,'wire')||!item(player,'keycard'))return fail('The service hatch needs a bent wire and security keycard. Search the stash and security desk.');
  if(!item(player,'pass'))player.inventory.push('pass');player.heat=clamp(player.heat+12);award(player,'vent',8);
  return finish(state,player,'Service hatch opened. You found a maintenance pass and a route to the south gate. Wait for a patrol gap.',now);
 }
 if(op==='escape'){
  if(!item(player,'pass'))return fail('The south gate requires a maintenance pass from the service hatch.');
  if(state.alarmUntil>now||player.heat>=70)return fail('Security is on alert. Let suspicion fall below 70 and wait for the alarm to clear.');
  if(distance(position,nearestGuard(state,position)?.position)<12)return fail('A guard is too close to the gate. Wait until the patrol moves away.');
  if(kind==='gate'){state.gateOpen=true;state.gateOpenUntil=now+15000;return finish(state,player,'Gate released for 15 seconds! Walk through the open gate to the marked escape finish.',now);}
  if(!(state.gateOpenUntil>now))return fail('Release the service gate first, then reach this finish pad within 15 seconds.');
  player.escaped=true;player.tokens+=20;award(player,'escape',20);player.heat=0;player.round=null;
  event(state,'An escape challenge has been completed at the south perimeter!',now);
  return finish(state,player,'ESCAPE COMPLETE! You reached the other side. +20 tokens. Return to intake for a new shift.',now,{relocate:{x:0,y:.02,z:116}});
 }
 return fail('That prison action could not be completed.');
}
/** Contracts observe successful outcomes only; rejected packets cannot advance goals. */
export function prisonAction(state,action,payload={},context={}){
 const playerBefore=state?.players?.[context.playerId],roundBefore=playerBefore?.round?copy(playerBefore.round):null;
 const disturbance=Object.values(state?.npcs||{}).some(npc=>npc.state==='Disturbance'&&npc.disturbedUntil>(context.now??Date.now()));
 const result=applyPrisonAction(state,action,payload,context);
 if(!result.ok)return result;
 const player=state.players[context.playerId],op=payload.operation;let contractEvent=null;
 if(['meal','tv','radio','work','rest','theft','keycard','vent','lockdown','all-unlock'].includes(op))contractEvent=op;
 if(op==='escape'&&player.escaped)contractEvent='escape';
 if(['deescalate','patrol'].includes(op)&&disturbance)contractEvent='deescalate';
 if(['cell-lock','cell-unlock'].includes(op)&&player.role==='guard')contractEvent={type:'cell-check',targetId:PRISON_STATIONS.find(s=>s.id===payload.stationId)?.cellId};
 if(['arcade-input','boxing-input'].includes(op)&&roundBefore&&roundBefore.index===roundBefore.inputs.length-1&&payload.input===roundBefore.inputs[roundBefore.index]&&!player.round)contractEvent=roundBefore.kind;
 if(contractEvent){const progress=recordPrisonContractEvent(player,contractEvent,{day:state.day,now:context.now});if(progress.completed){result.message+=' '+progress.message;player.message=result.message;}}
 return result;
}
export function routinePhase(elapsed){const t=((elapsed%PRISON_DAY_SECONDS)+PRISON_DAY_SECONDS)%PRISON_DAY_SECONDS;return t<55?'breakfast':t<175?'free-time':t<270?'yard':t<360?'work':t<425?'dinner':'lockdown';}
/** dt is seconds; decisions use the server clock and authoritative positions. */
export function stepPrisonSimulation(state,dt,{now=Date.now(),players={},resolveMovement,visible=()=>true}={}){
 const delta=clamp(Number(dt)||0,0,2),relocations=[];state.gateOpen=state.gateOpenUntil>now;state.elapsed+=delta;state.day=1+Math.floor(state.elapsed/PRISON_DAY_SECONDS);
 const nextPhase=state.manualLockdownUntil>now?'lockdown':routinePhase(state.elapsed),changed=nextPhase!==state.phase;
 if(changed){state.phase=nextPhase;if(nextPhase==='lockdown')securePrisonResidents(state);event(state,'Routine: '+nextPhase.replaceAll('-',' ')+'.',now);for(const door of Object.values(state.cells)){door.manual=door.releaseAt>now;door.locked=door.manual||nextPhase==='lockdown';}}
 const mealStation=PRISON_STATIONS.find(s=>['meal','cafeteria'].includes(s.kind)),yardStation=PRISON_STATIONS.find(s=>['gym','yard'].includes(s.kind)),workStation=PRISON_STATIONS.find(s=>['work','laundry'].includes(s.kind));
 for(const [id,body]of Object.entries(players)){const player=ensurePlayer(state,id,now);if(!body?.position)continue;player.energy=clamp(player.energy-delta*.018);player.heat=clamp(player.heat-delta*(player.role==='guard'?2:.65));if(player.caughtUntil&&player.caughtUntil<=now){const door=state.cells[player.cellId];if(door){door.releaseAt=0;door.manual=false;door.locked=state.phase==='lockdown';}player.caughtUntil=0;player.message='Your cell is released. Return to the routine or try a new challenge.';}if(player.round?.expiresAt<now)player.round=null;}
 const lockSignature=Object.values(state.cells).map(cell=>cell.locked?'1':'0').join('')+String(state.gateOpen);
 for(const [index,npc]of Object.values(state.npcs).entries()){
  const definition=PRISON_NPCS.find(value=>value.id===npc.id),home=npc.home||point(definition),patrol=definition?.patrol||definition?.route||patrols[npc.id];
  let target=home;
  if(npc.role==='guard'){
   const suspect=Object.entries(players).filter(([id,body])=>{const p=state.players[id];return body?.position&&p?.role!=='guard'&&!p?.escaped&&!p?.caughtUntil&&p?.heat>=50;}).sort((a,b)=>distance(a[1].position,npc.position)-distance(b[1].position,npc.position))[0];
   if(suspect){target=suspect[1].position;npc.state='Pursuing';const player=state.players[suspect[0]];if((distance(npc.position,target)<2.5||player.health<=0)&&visible(npc.position,target)){const cell=PRISON_CELLS.find(value=>value.id===player.cellId),position=copy(cellPoint(cell));player.heat=8;player.health=Math.max(40,player.health);player.tokens=Math.max(0,player.tokens-5);player.inventory=player.inventory.filter(value=>value==='snack');player.round=null;player.caughtUntil=now+15000;player.message='Caught by security. Contraband confiscated; 15-second cell timeout.';if(state.cells[player.cellId])Object.assign(state.cells[player.cellId],{locked:true,manual:true,releaseAt:player.caughtUntil});relocations.push({playerId:suspect[0],position,message:player.message});event(state,npc.name+' returned a prisoner to their cell.',now);}}
   else {npc.state=state.phase==='lockdown'?'Cell check':'Patrolling';if(patrol?.length&&distance(npc.position,point(patrol[npc.patrolIndex||0]))<1)npc.patrolIndex=((npc.patrolIndex||0)+1)%patrol.length;target=patrol?.length?point(patrol[npc.patrolIndex||0]):{x:home.x+Math.sin(state.elapsed*.08+index)*10,y:home.y,z:home.z+Math.cos(state.elapsed*.08+index)*10};}
  }else if(npc.disturbedUntil>now){target=npc.combatTarget||home;npc.state='Disturbance';}
  else if(state.phase==='breakfast'||state.phase==='dinner'){target=point(mealStation);npc.state='Meal queue';}
  else if(state.phase==='yard'){target={...point(yardStation),x:point(yardStation).x+(index%4)*2};npc.state='Yard time';}
  else if(state.phase==='work'){target={...point(workStation),x:point(workStation).x+(index%3)*2};npc.state='Work detail';}
  else if(state.phase==='lockdown'){target=cellPoint(PRISON_CELLS[index%PRISON_CELLS.length]);npc.state='In cell';}
  else {target={x:home.x+Math.sin(state.elapsed*.06+index)*3,y:home.y,z:home.z+Math.cos(state.elapsed*.06+index)*3};npc.state='Free time';}
  walkPrisonNpc(npc,target,state,delta,now,resolveMovement,lockSignature);
 }
 for(const door of Object.values(state.cells))if(door.releaseAt&&door.releaseAt<=now){door.releaseAt=0;door.manual=false;door.locked=state.phase==='lockdown';}
 return relocations;
}
export function prisonView(state,playerId){
 if(!state)return null;
 const players=Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,copy({...p,lastActions:undefined,contracts:prisonContractView(p,{day:state.day})})]));
 const view={version:1,protocol:PRISON_PROTOCOL,protocolVersion:PRISON_PROTOCOL_VERSION,revision:state.revision||0,day:state.day,elapsed:state.elapsed,phase:state.phase,alarmUntil:state.alarmUntil,gateOpen:state.gateOpen,gateOpenUntil:state.gateOpenUntil,cells:copy(state.cells),npcs:Object.fromEntries(Object.entries(state.npcs).map(([id,npc])=>[id,copy({id:npc.id,name:npc.name,role:npc.role,position:npc.position,rotationY:npc.rotationY,state:npc.state})])),players,events:copy(state.events)};
 if(playerId)view.self=players[playerId]||null;return view;
}

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titlePhase=value=>String(value||'free-time').replaceAll('-',' ').replace(/\b\w/g,char=>char.toUpperCase());
const stationIcon={intake:'◈',cell:'▥',meal:'☷',tv:'▣',radio:'◉',arcade:'✚',gym:'✦',work:'⚒',stash:'◇',security:'⬡',vent:'↳',gate:'⇥',escape:'⚑'};
/** The UI sends intentions to the room server; proximity, locks and rewards are authoritative. */
export function mountPrisonGame(stage,{command,announce=()=>{},getPosition=()=>null,onOpen=()=>{},onClose=()=>{}}={}){
 loadGameMenuStyles();
 if(!document.querySelector('#ironwood-prison-style')){const link=document.createElement('link');link.id='ironwood-prison-style';link.rel='stylesheet';link.href='/public/css/prison.css';document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='prison-toggle';trigger.hidden=true;trigger.setAttribute('aria-label','Open Ironwood prison activities');trigger.setAttribute('aria-controls','ironwood-prison-panel');trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 3h16v18H4zM8 3v18m4-18v18m4-18v18M4 8h16M4 16h16"/></svg><span>Prison</span>';stage.append(trigger);
 const panel=document.createElement('section');panel.id='ironwood-prison-panel';panel.className='prison-panel';panel.hidden=true;panel.setAttribute('aria-label','Ironwood Correctional Facility');
 panel.innerHTML='<header class="prison-hero"><div><span class="prison-kicker">MUZIKAZ WORLD / CORRECTIONS DIVISION</span><h2>IRONWOOD<span>Life inside. A way out.</span></h2></div><div class="prison-shift"><span data-phase>FREE TIME</span><b data-day>DAY 01</b><small>240 × 240 m facility</small></div></header><div class="prison-stats" data-stats></div><nav class="prison-tabs" aria-label="Prison views"><button type="button" data-tab="activities" aria-selected="true">Activities</button><button type="button" data-tab="map" aria-selected="false">Facility map</button><button type="button" data-tab="challenges" aria-selected="false">Challenge board</button><button type="button" data-tab="packs" aria-selected="false">Packs & Backpack</button></nav><div class="prison-body"><aside class="prison-stations" aria-label="Prison activity stations" data-stations></aside><main class="prison-main"><p class="prison-live-message" data-message role="status" aria-live="polite"></p><section data-view="activities"><div class="prison-station-label"><span data-station-kind></span><span data-distance></span></div><h3 data-station-title></h3><p class="prison-description" data-station-description></p><div data-activity></div><div class="prison-waypoint"><button type="button" data-waypoint>Mark on map ↗</button><span>Walk to the station in the world to take part.</span></div></section><section data-view="map" hidden><span class="prison-kicker">KNOW YOUR SURROUNDINGS</span><h3>The whole facility.</h3><p class="prison-description">Select a marker to view its activity. Green is you; blue dots are guards; orange dots are prisoners.</p><div class="prison-map" data-map></div><p class="prison-map-key">A / B Cell blocks · C Cafeteria · R Recreation · S Security · W Workshop</p></section><section data-view="challenges" hidden><span class="prison-kicker">MAKE YOUR TIME COUNT</span><h3>Small wins. A big escape.</h3><div data-contracts></div><div class="prison-challenges" data-challenges></div></section><section data-view="packs" hidden><div data-packs></div></section></main><aside class="prison-sidebar"><div class="prison-id-card"><span class="prison-kicker">YOUR SHIFT</span><strong data-role>PRISONER</strong><span data-cell></span><p>Recreation tokens stay in this prison. Your room server saves activity progress.</p></div><div class="prison-pocket"><span class="prison-kicker">POCKET INVENTORY</span><div data-inventory>Nothing yet.</div></div><div class="prison-log"><span class="prison-kicker">FACILITY RADIO</span><div data-log></div></div></aside></div><footer class="prison-footer"><span><i></i> SHARED FACILITY / LIVE SECURITY</span><button type="button" data-close>Back to the world →</button></footer>';
 stage.append(panel);const $=selector=>panel.querySelector(selector),activity=$('[data-activity]');
 let environment=null,selfId=null,view=null,self=null,selected=PRISON_STATIONS[0],nearby=null,busy=false,disposed=false,tab='activities',message='',revision=0,signature='',audioContext=null,oscillator=null,audioTimer=null,lastUpdateAt=0;
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();onOpen();},onClose:()=>{stopRadio();onClose();}});screen.dialog.classList.add('prison-dialog');
 const expansionMarkup={contracts:null,packs:null};
 function renderExpansion(key,markup){if(expansionMarkup[key]===markup)return;expansionMarkup[key]=markup;$('[data-'+key+']').innerHTML=markup;}
 const position=()=>getPosition()||null;
 const enabled=()=>!!self&&isPrisonEnvironment(environment);
 const gap=station=>distance(position(),point(station));
 const near=()=>{if(!enabled())return null;return PRISON_STATIONS.filter(station=>gap(station)<=(station.interactionDistance||4)).sort((a,b)=>gap(a)-gap(b))[0]||null;};
 const nearSelected=()=>gap(selected)<=(selected.interactionDistance||4);
 const unavailable=()=>!enabled()||!nearSelected()||busy;
 function stopRadio(){clearTimeout(audioTimer);audioTimer=null;try{oscillator?.stop();}catch{}oscillator=null;if(audioContext){void audioContext.close().catch(()=>{});audioContext=null;}}
 function playRadio(){
  stopRadio();const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;
  try{audioContext=new Audio();const gain=audioContext.createGain();gain.gain.value=.035;gain.connect(audioContext.destination);oscillator=audioContext.createOscillator();oscillator.type='sine';oscillator.connect(gain);oscillator.start();const notes=[261.63,329.63,392,329.63,293.66,349.23,440,392],start=audioContext.currentTime;for(let beat=0;beat<32;beat++)oscillator.frequency.setValueAtTime(notes[beat%notes.length],start+beat*.21);audioTimer=setTimeout(stopRadio,7000);void audioContext.resume();}catch{stopRadio();}
 }
 function setTab(next){tab=next;for(const section of panel.querySelectorAll('[data-view]'))section.hidden=section.dataset.view!==next;for(const button of panel.querySelectorAll('[data-tab]'))button.setAttribute('aria-selected',String(button.dataset.tab===next));render();}
 function choose(id){selected=PRISON_STATIONS.find(station=>station.id===id)||selected;signature='';message='';setTab('activities');}
 function open(stationId){if(disposed||!enabled())return false;selected=PRISON_STATIONS.find(station=>station.id===stationId)||nearby||selected;if(stationId)setTab('activities');signature='';message='';screen.open();render();return true;}
 function accept(result){if(result?.prison){view=result.prison;self=view.players?.[selfId]||view.self||null;}const note=result?.result?.message||result?.message;if(note){message=note;announce(note);}signature='';render();}
 async function send(operation,input,extra={}){
  if(!enabled()||busy||operation!=='supply-use'&&gap(PRISON_STATIONS.find(station=>station.id===(extra.stationId||selected.id)))>4)return;const currentRevision=revision,stationId=extra.stationId||selected.id;busy=true;message='Waiting for prison control…';render();
  try{const fields={operation,stationId,...(input===undefined?{}:{input}),...extra};const result=await command('prison-action',{packet:makePrisonActionPacket(fields)});if(disposed||revision!==currentRevision)return;if(!result)throw new Error('Prison control is disconnected. Reconnect before trying again.');accept(result);if(operation==='radio'&&result?.result?.ok!==false)playRadio();}
  catch(error){if(revision===currentRevision){message=error?.message||'Prison control could not confirm the action.';render();}}
  finally{if(!disposed&&revision===currentRevision){busy=false;render();}}
 }
 async function claimItem(itemId){if(!enabled()||busy||gap(PRISON_STATIONS[0])>4)return;const currentRevision=revision;busy=true;render();try{const result=await command('prison-claim-item',{itemId,stationId:'intake'});if(disposed||revision!==currentRevision)return;if(!result)throw Error('Prison control could not collect this item.');accept(result);}catch(error){if(revision===currentRevision)message=error.message;}finally{if(!disposed&&revision===currentRevision){busy=false;render();}}}
 const button=(label,operation,extra='')=>'<button type="button" data-operation="'+operation+'" '+extra+'>'+label+'</button>';
 function actionContent(){
  const kind=selected.kind,round=self?.round,cell=PRISON_CELLS.find(value=>value.id===selected.cellId),door=view?.cells?.[cell?.id];
  if(kind==='intake')return '<div class="prison-welcome-art"><span aria-hidden="true">▥</span><b>24 CELLS · 2 BLOCKS · 13 RESIDENTS</b><p>Choose your shift, follow the routine, and make your own story.</p></div><div class="prison-action-row">'+button('Prisoner shift','role-prisoner')+button('Guard shift','role-guard')+'</div><div class="prison-instructions"><b>How to play</b><p>Move with WASD or the touch controls. Press E near a station, or open Prison. Meals and rest restore energy. TV, radio and games improve morale. Fights and theft raise suspicion; guards chase at 50.</p><p><b>Escape route:</b> laundry stash → security desk → maintenance hatch → south service gate → finish pad. Code clue at security: three rounds, one count, four towers.</p></div>';
  if(kind==='cell')return '<div class="prison-cell-art '+(door?.locked?'is-locked':'')+'"><i></i><i></i><i></i><i></i><i></i><strong>'+(door?.locked?'CELL SECURED':'DOOR RELEASED')+'</strong></div><p class="prison-instructions">Your assigned cell: '+escapeHtml(PRISON_CELLS.find(value=>value.id===self?.cellId)?.name||'awaiting assignment')+'. You can latch your own door. Guards and keycard holders can operate other cells. Scheduled lockdown secures every cell.</p><div class="prison-action-row">'+button('Lock cell','cell-lock')+button('Unlock cell','cell-unlock')+button('Rest on bunk','rest')+'</div>';
  if(kind==='meal')return '<div class="prison-meal-art"><span>🍲</span><span>🍞</span><span>🍎</span><b>TODAY’S HOT TRAY</b><p>Stew · bread · fresh fruit</p></div><div class="prison-action-row">'+button('Collect meal · +30 energy','meal')+'</div><p class="prison-instructions">The kitchen serves a new tray every 20 seconds. Meals also restore 15 health.</p>';
  if(kind==='tv')return '<div class="prison-tv-art"><div class="prison-tv-screen"><span class="prison-tv-ball">●</span><span class="prison-tv-title">'+escapeHtml(self?.tvChannel||'IRONWOOD TV')+'</span><div class="prison-tv-horizon"></div><small>LIVE FROM THE YARD / CHANNEL 02</small></div><b>COMMON ROOM TELEVISION</b></div><div class="prison-action-row">'+button('Change channel / watch show','tv')+'</div><p class="prison-instructions">Catch the Yard League broadcast or Prison Planet. A show lifts your morale.</p>';
  if(kind==='radio')return '<div class="prison-radio-art"><div class="prison-radio-bars">'+Array.from({length:14},(_,i)=>'<i style="--beat:'+i+'"></i>').join('')+'</div><strong>IRONWOOD FM</strong><span>POSTER CLUE / 94.7 FM</span></div><label class="prison-frequency">Frequency <input type="number" min="88" max="108" step="0.1" value="94.7" data-frequency aria-label="Radio frequency"><span>FM</span></label><div class="prison-action-row">'+button('Tune & listen','radio')+'<button type="button" data-radio-stop>Stop audio</button></div><p class="prison-instructions">Tune to 94.7 to unlock the station and hear its short original chime. Audio stops when you close the panel.</p>';
  if(kind==='arcade'||kind==='gym'){
   const game=kind==='arcade'?'arcade':'boxing',active=round?.kind===game,cue=active?round.inputs[round.index]:null,inputs=game==='arcade'?['up','left','right','down']:['jab','cross','duck'];
   return '<div class="prison-game-art '+game+'"><span>'+(game==='arcade'?'HIGH SCORE CLUB':'YARD TRAINING RING')+'</span><strong>'+(cue?escapeHtml(cue.toUpperCase()):game==='arcade'?'↑ ← → ↓':'JAB · CROSS · DUCK')+'</strong><div class="prison-round-dots">'+Array.from({length:game==='arcade'?5:6},(_,index)=>'<i class="'+(active&&index<round.index?'done':'')+'"></i>').join('')+'</div><small>'+(active?round.score+' POINTS / FOLLOW THE CUE':'Skill and timing. Six clean moves. A little friendly competition.')+'</small></div><div class="prison-action-row">'+(active?inputs.map(input=>button(input.toUpperCase(),game+'-input','data-input="'+input+'"')).join(''):button(game==='arcade'?'Start arrow challenge':'Start controlled sparring',game+'-start'))+'</div>'+(game==='boxing'?'<div class="prison-action-row prison-risk">'+button('Start a scuffle · raises suspicion','fight')+button('De-escalate disturbance','deescalate')+'</div>':'')+'<p class="prison-instructions">'+(game==='arcade'?'Select the arrow shown above. Five correct moves complete a round.':'Choose the move shown above. Six correct moves complete a controlled round. A scuffle costs health and alerts guards.')+'</p>';
  }
  if(kind==='work'){const expected=['orange','white','blue'][(self?.workCount||0)%3];return '<div class="prison-work-art"><span>SUPPLY SORTING / WORKSHOP</span><strong style="color:'+({orange:'#f2a65a',white:'#e8f0eb',blue:'#77b6de'}[expected])+'">'+expected.toUpperCase()+'</strong><small>'+Number(self?.workCount||0)+' BASKETS SORTED</small></div><div class="prison-action-row">'+['orange','white','blue'].map(input=>button(input+' bin','work','data-input="'+input+'"')).join('')+'</div><p class="prison-instructions">Sort the next supply basket into its matching color bin. Each correct basket earns 2 tokens and lowers suspicion. Finish three to complete your shift.</p>';}
  if(kind==='stash')return '<div class="prison-contraband-art">◇<span>LAUNDRY SUPPLY STASH</span></div><p class="prison-instructions">Something is tucked behind the laundry supplies. Searching the stash gives you a wire and a service map, and raises suspicion by 24.</p><div class="prison-action-row">'+button('Search the hidden stash','theft')+'</div>';
  if(kind==='security')return '<div class="prison-cctv-art"><span>CAM 01 / CELL BLOCKS</span><span>CAM 02 / YARD</span><span>CAM 03 / CAFETERIA</span><span>CAM 04 / PERIMETER</span></div><p class="prison-instructions">Restricted desk. You need the bent wire to open the drawer, then its three-digit code. <b>Duty board: three rounds, one count, four towers.</b> Wait until the guard is more than 9 m away.</p><label class="prison-frequency">Code <input type="text" inputmode="numeric" maxlength="3" placeholder="•••" data-code aria-label="Security drawer code"></label><div class="prison-action-row">'+button('Open keycard drawer','keycard')+'</div>'+(self?.role==='guard'?'<h4>Guard control</h4><div class="prison-action-row">'+button('Secure all cells · 30 seconds','lockdown')+button('Release all cells','all-unlock')+button('Complete security patrol','patrol')+'</div>':'');
  if(kind==='vent')return '<div class="prison-route-art">◇ <span>→</span> ⬡ <span>→</span> ↳ <span>→</span> ⚑</div><p class="prison-instructions">The maintenance passage requires your bent wire and security keycard. Opening it supplies the maintenance pass for the south service gate.</p><div class="prison-action-row">'+button('Open the maintenance passage','vent')+'</div>';
  if(kind==='gate')return '<div class="prison-gate-art">'+(view?.gateOpen?'GATE RELEASED':'PERIMETER SECURED')+'</div><p class="prison-instructions">Use the maintenance pass while suspicion is below 70, the alarm is quiet, and guards are over 12 m away. The gate opens for 15 seconds. Close this panel and walk through to the finish marker.</p><div class="prison-action-row">'+button('Release the service gate','escape')+'</div>';
  return '<div class="prison-finish-art">⚑<strong>'+(self?.escaped?'YOU MADE IT.':'BEYOND THE WALLS.')+'</strong></div><p class="prison-instructions">Reach this finish pad after opening the service gate. Confirm your escape before its 15-second window closes, then return to intake for a new shift.</p><div class="prison-action-row">'+button('Complete escape challenge','escape')+button(self?.escaped?'Return to intake / new shift':'Return to intake / retry','return')+'</div>';
 }
 function renderMap(){
  const p=position(),markers=PRISON_STATIONS.filter(s=>s.kind!=='cell');
  $('[data-map]').innerHTML='<svg viewBox="-125 -125 250 250" role="img" aria-label="Ironwood facility map"><rect x="-109" y="-109" width="218" height="218" fill="#172d34" stroke="#8ca8ac" stroke-width="2"/><path d="M0 -104V103M-23 -30H-99M-23 27H-99M23 -31H99M23 31H99" stroke="#36505a" stroke-width="7"/><g fill="#29444d" stroke="#78929a" stroke-width=".6"><rect x="-101" y="4" width="78" height="46"/><rect x="-101" y="-53" width="78" height="46"/><rect x="23" y="5" width="78" height="52"/><rect x="23" y="-57" width="78" height="52"/><rect x="37" y="63" width="36" height="30"/><rect x="79" y="63" width="20" height="30"/><rect x="67" y="-101" width="34" height="28"/></g><g fill="#8da7aa" font-family="system-ui" font-size="11" text-anchor="middle"><text x="-62" y="31">A</text><text x="-62" y="-26">B</text><text x="63" y="34">C</text><text x="63" y="-28">R</text><text x="89" y="83">S</text><text x="84" y="-81">W</text><text x="-45" y="-75">EXERCISE YARD</text></g>'+markers.map(s=>'<g class="prison-map-marker" data-map-station="'+s.id+'" tabindex="0" role="button" aria-label="'+escapeHtml(s.name)+'" transform="translate('+point(s).x+' '+point(s).z+')"><circle r="5" fill="'+(s.id===selected.id?'#efb16c':'#d5e5dd')+'"/><text y="2" fill="#17282e" text-anchor="middle" font-family="system-ui" font-size="7">'+escapeHtml(stationIcon[s.kind]||'·')+'</text><title>'+escapeHtml(s.name)+'</title></g>').join('')+Object.values(view?.npcs||{}).map(npc=>'<circle cx="'+npc.position.x+'" cy="'+npc.position.z+'" r="1.8" fill="'+(npc.role==='guard'?'#7cb7e9':'#eb9c61')+'"/>').join('')+(p?'<circle cx="'+p.x+'" cy="'+p.z+'" r="3.5" fill="#8de2af" stroke="#142d2a" stroke-width="1"/>':'')+'</svg>';
 }
 function render(){
  if(disposed||panel.hidden||!view||!self)return;
  $('[data-phase]').textContent=titlePhase(view.phase)+(view.alarmUntil>Date.now()?' / ALERT':'');$('[data-day]').textContent='DAY '+String(view.day||1).padStart(2,'0');
  $('[data-role]').textContent=self.role.toUpperCase();$('[data-cell]').textContent=PRISON_CELLS.find(c=>c.id===self.cellId)?.name||'Intake assignment';
  $('[data-stats]').innerHTML=[['HEALTH',self.health],['ENERGY',self.energy],['MORALE',self.morale],['SUSPICION',self.heat],['TOKENS',self.tokens]].map(([name,value])=>'<div><small>'+name+'</small><strong>'+Math.round(value||0)+(name==='TOKENS'?'':'<span> / 100</span>')+'</strong>'+(name!=='TOKENS'?'<i style="--fill:'+clamp(value||0)+'%;--meter:'+(name==='SUSPICION'?'#ed9c73':'#9cceb8')+'"></i>':'')+'</div>').join('');
  $('[data-inventory]').textContent=self.inventory?.length?self.inventory.map(id=>PRISON_ITEM_NAMES[id]||id).join(' · '):'Nothing in your pockets.';
  $('[data-log]').replaceChildren(...(view.events||[]).slice(0,4).map(e=>{const p=document.createElement('p');p.textContent=e.message;return p;}));
  $('[data-challenges]').innerHTML=PRISON_CHALLENGES.map(goal=>'<article class="'+(self.completed?.includes(goal.id)?'complete':'')+'"><span>'+(self.completed?.includes(goal.id)?'✓':'○')+'</span><div><b>'+goal.name+'</b><p>'+goal.description+'</p></div></article>').join('');
  if(tab==='map')renderMap();
  if(tab==='challenges')renderExpansion('contracts',prisonContractsMarkup(self,{atIntake:gap(PRISON_STATIONS[0])<=4,busy}));
  if(tab==='packs')renderExpansion('packs',prisonPacksMarkup(self,{atShop:PRISON_STATIONS.some(station=>['intake','meal'].includes(station.kind)&&gap(station)<=4),atIntake:gap(PRISON_STATIONS[0])<=4,busy}));
  const nextSignature=[selected.id,self.round?.kind,self.round?.index,self.workCount,self.tvChannel,self.role,view.cells?.[selected.cellId]?.locked,view.gateOpen,self.escaped].join(':');
  if(nextSignature!==signature){signature=nextSignature;activity.innerHTML=actionContent();}
  $('[data-station-kind]').textContent=String(selected.kind).toUpperCase()+' / ACTIVITY';$('[data-station-title]').textContent=selected.name;$('[data-station-description]').textContent=selected.description;
  const d=gap(selected);$('[data-distance]').textContent=nearSelected()?'YOU’RE HERE':Number.isFinite(d)?Math.ceil(d)+' M AWAY':'LOCATION UNKNOWN';
  $('[data-message]').textContent=busy?'Waiting for prison control…':message||self.message||(nearSelected()?'Choose an activity to begin.':'Walk closer to this station to take part.');
  for(const node of activity.querySelectorAll('[data-operation]'))node.disabled=unavailable();
  for(const node of panel.querySelectorAll('[data-station]')){node.setAttribute('aria-pressed',String(node.dataset.station===selected.id));const station=PRISON_STATIONS.find(s=>s.id===node.dataset.station),small=node.querySelector('small');if(small)small.textContent=gap(station)<=station.interactionDistance?'NEARBY':Math.ceil(gap(station))+' m';}
 }
 const mainStations=PRISON_STATIONS.filter(s=>s.kind!=='cell');const myCell=()=>PRISON_STATIONS.find(s=>s.cellId===self?.cellId);
 $('[data-stations]').innerHTML=mainStations.map(station=>'<button type="button" data-station="'+station.id+'"><span aria-hidden="true">'+escapeHtml(stationIcon[station.kind])+'</span><b>'+escapeHtml(station.name)+'</b><small></small></button>').join('')+'<button type="button" data-my-cell><span>▥</span><b>Your assigned cell</b><small>LOCK / REST</small></button>';
 panel.addEventListener('click',e=>{const target=e.target.closest('button,[data-map-station]');if(!target||target.disabled)return;if(target.dataset.contractAccept){void send('contract-accept',undefined,{contractId:target.dataset.contractAccept,stationId:'intake'});return;}if(target.hasAttribute('data-contract-abandon')){void send('contract-abandon',undefined,{stationId:'intake'});return;}if(target.dataset.packetBuy){const shop=PRISON_STATIONS.find(station=>['intake','meal'].includes(station.kind)&&gap(station)<=4);if(shop)void send('packet-buy',undefined,{packetId:target.dataset.packetBuy,stationId:shop.id});return;}if(target.dataset.supplyUse){void send('supply-use',undefined,{itemId:target.dataset.supplyUse});return;}if(target.dataset.prisonClaim){void claimItem(target.dataset.prisonClaim);return;}if(target.dataset.station)choose(target.dataset.station);else if(target.dataset.mapStation)choose(target.dataset.mapStation);else if(target.dataset.tab)setTab(target.dataset.tab);else if(target.hasAttribute('data-my-cell'))choose(myCell()?.id);else if(target.hasAttribute('data-close'))screen.close();else if(target.hasAttribute('data-waypoint')){setTab('map');message='Your destination is highlighted on the map.';}else if(target.hasAttribute('data-radio-stop'))stopRadio();else if(target.dataset.operation){let input=target.dataset.input;if(target.dataset.operation==='radio')input=Number(activity.querySelector('[data-frequency]')?.value);if(target.dataset.operation==='keycard')input=activity.querySelector('[data-code]')?.value;void send(target.dataset.operation,input);}});
 panel.addEventListener('keydown',e=>{const target=e.target.closest('[data-map-station]');if(target&&['Enter',' '].includes(e.key)){e.preventDefault();choose(target.dataset.mapStation);}});
 trigger.onclick=()=>open();
 return {open,near,visible:()=>!panel.hidden,close:()=>screen.close(),getState:()=>view,tick(){if(!enabled())return;nearby=near();if(!panel.hidden&&performance.now()-lastUpdateAt>250){lastUpdateAt=performance.now();render();}},update(snapshot,nextSelfId,nextEnvironment){if(disposed)return;const changed=selfId!==nextSelfId||environment?.id!==nextEnvironment?.id;if(changed){revision++;busy=false;view=null;self=null;signature='';message='';screen.close();}environment=nextEnvironment;selfId=nextSelfId;const incoming=snapshot?.prison||null;if(changed||!view||!incoming||(incoming.revision||0)>=(view.revision||0))view=incoming;self=view?.players?.[selfId]||view?.self||null;trigger.hidden=!enabled();if(!enabled()){screen.close();return;}nearby=near();render();},dispose(){if(disposed)return;disposed=true;revision++;screen.close();screen.disconnect();stopRadio();trigger.remove();panel.remove();screen.dialog.remove();}};
}
