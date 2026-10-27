/** Replayable shift contracts. Call recordPrisonContractEvent only after the
 * prison rules have accepted an activity at its authoritative station. These
 * scores belong to the prison room; contracts never grant wallet currency or
 * security items. */
const goal=(event,label,count=1,distinct=false)=>Object.freeze({event,label,count,...(distinct?{distinct:true}:{})});
const contract=(id,name,role,rewardTokens,description,goals)=>Object.freeze({id,name,role,rewardTokens,description,goals:Object.freeze(goals)});
export const PRISON_CONTRACTS=Object.freeze([
 contract('settled-in','Settled in','prisoner',18,'Complete a healthy, productive prison routine.',[
  goal('meal','Collect a hot meal'),goal('work','Sort workshop supplies',3),goal('rest','Rest inside your assigned cell')
 ]),
 contract('recreation-circuit','Recreation circuit','prisoner',22,'Visit the common room and finish both skill games.',[
  goal('tv','Watch a television show'),goal('radio','Tune Ironwood FM'),goal('arcade','Finish an arcade round'),goal('boxing','Finish a boxing combination')
 ]),
 contract('service-route','Service-route specialist','prisoner',30,'Accept before collecting contraband, then complete the full escape route.',[
  goal('theft','Find the hidden supply stash'),goal('keycard','Solve the security-desk clue'),goal('vent','Open the maintenance passage'),goal('escape','Reach the escape finish')
 ]),
 contract('inspection-round','Inspection round','guard',18,'Check different cells and take a proper shift break.',[
  goal('cell-check','Inspect distinct cell locks',3,true),goal('radio','Tune the facility radio'),goal('meal','Collect a hot meal')
 ]),
 contract('keep-the-peace','Keep the peace','guard',24,'Train, inspect the blocks and settle a real disturbance.',[
  goal('boxing','Finish a boxing combination'),goal('cell-check','Inspect distinct cell locks',2,true),goal('deescalate','Settle an active disturbance')
 ]),
 contract('secure-shift','Secure shift','guard',22,'Inspect cells and exercise the shared security controls.',[
  goal('cell-check','Inspect distinct cell locks',2,true),goal('lockdown','Activate a security lockdown'),goal('all-unlock','Release the shared cell locks')
 ])
]);

const HISTORY_DAYS=7;
const ROLES=new Set(['prisoner','guard']);
const RANKS=['New arrival','Regular','Trusted','Veteran','Ironwood legend'];
const copy=value=>JSON.parse(JSON.stringify(value));
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const dayNumber=value=>Number.isFinite(Number(value))?Math.max(1,Math.floor(Number(value))):1;
const roleOf=player=>ROLES.has(player?.role)?player.role:'prisoner';
const timestamp=value=>Number.isFinite(value)?value:0;
const noProgress=()=>({advanced:false,completed:false,rewardTokens:0});

function rootState(player,day){
 if(!player||typeof player!=='object')return null;
 let root=player.contracts;
 if(!root||root.version!==1||typeof root.days!=='object'||Array.isArray(root.days)||!root.days){
  root=player.contracts={version:1,latestDay:day,days:{},lifetime:{completed:0,tokens:0}};
 }
 root.latestDay=Math.max(day,count(root.latestDay)||day);
 root.lifetime||={completed:0,tokens:0};
 root.lifetime.completed=count(root.lifetime.completed);root.lifetime.tokens=count(root.lifetime.tokens);
 for(const key of Object.keys(root.days))if(!/^\d+$/.test(key)||Number(key)<root.latestDay-HISTORY_DAYS+1)delete root.days[key];
 return root;
}

/** Initializes old room saves without losing existing shift progress. Returns
 * the current role's shift record, or null for a shift outside retained history. */
export function prisonContractState(player,{day=1}={}){
 day=dayNumber(day);const root=rootState(player,day);if(!root||day<root.latestDay-HISTORY_DAYS+1)return null;
 const role=roleOf(player);
 if(!root.days[day]||typeof root.days[day]!=='object'||Array.isArray(root.days[day]))root.days[day]={};
 const saved=root.days[day][role];
 if(!saved||typeof saved!=='object'||Array.isArray(saved))root.days[day][role]={active:null,completed:{}};
 const shift=root.days[day][role];
 if(!shift.completed||typeof shift.completed!=='object'||Array.isArray(shift.completed))shift.completed={};
 return shift;
}

export function acceptPrisonContract(player,contractId,{day=1,now=0}={}){
 const definition=PRISON_CONTRACTS.find(value=>value.id===contractId);
 if(!definition)return {ok:false,message:'Choose an available shift contract.'};
 if(definition.role!==roleOf(player))return {ok:false,message:'Start a '+definition.role+' shift to accept this contract.'};
 const shift=prisonContractState(player,{day});
 if(!shift)return {ok:false,message:'This shift has been archived. Choose a contract for the current prison day.'};
 if(shift.completed[definition.id])return {ok:false,message:'This contract is already completed for today’s '+definition.role+' shift.'};
 if(shift.active?.id===definition.id)return {ok:true,message:definition.name+' is already active. Your progress is saved.'};
 if(shift.active)return {ok:false,message:'Finish or abandon your current contract before accepting another.'};
 shift.active={id:definition.id,acceptedAt:timestamp(now),progress:definition.goals.map(()=>0),targets:definition.goals.map(()=>[]),seen:[]};
 return {ok:true,message:definition.name+' accepted. Complete its activities to earn '+definition.rewardTokens+' recreation tokens.'};
}

export function abandonPrisonContract(player,{day=1}={}){
 const shift=prisonContractState(player,{day});
 if(!shift?.active)return {ok:false,message:'There is no active shift contract to abandon.'};
 const name=PRISON_CONTRACTS.find(value=>value.id===shift.active.id)?.name||'Contract';
 shift.active=null;
 return {ok:true,message:name+' abandoned. Earned tokens and completed contracts are kept.'};
}

/** Event names describe completed authoritative outcomes, not raw button presses.
 * In particular, arcade/boxing mean a finished round, cell-check needs a
 * canonical targetId, and deescalate means an actual disturbance was settled. */
export function recordPrisonContractEvent(player,event,{day=1,now=0,eventId}={}){
 const type=typeof event==='string'?event:event?.type;
 const shift=prisonContractState(player,{day}),active=shift?.active;
 if(!active)return noProgress();
 const definition=PRISON_CONTRACTS.find(value=>value.id===active.id&&value.role===roleOf(player));
 if(!definition||shift.completed[definition.id])return noProgress();
 const goalIndex=definition.goals.findIndex(value=>value.event===type);
 if(goalIndex<0)return noProgress();
 const requirement=definition.goals[goalIndex];
 active.progress||=definition.goals.map(()=>0);active.targets||=definition.goals.map(()=>[]);active.seen||=[];
 if(count(active.progress[goalIndex])>=requirement.count)return noProgress();
 const receipt=typeof eventId==='string'&&eventId.length>0&&eventId.length<=128?eventId:null;
 if(receipt&&active.seen.includes(receipt))return noProgress();
 let target;
 if(requirement.distinct){
  target=typeof event?.targetId==='string'&&event.targetId.length>0&&event.targetId.length<=80?event.targetId:null;
  if(!target)return noProgress();
  active.targets[goalIndex]||=[];
  if(active.targets[goalIndex].includes(target))return noProgress();
 }
 if(target)active.targets[goalIndex].push(target);
 active.progress[goalIndex]=Math.min(requirement.count,count(active.progress[goalIndex])+1);
 if(receipt){active.seen.push(receipt);active.seen=active.seen.slice(-96);}
 const completed=definition.goals.every((value,index)=>count(active.progress[index])>=value.count);
 if(!completed)return {advanced:true,completed:false,rewardTokens:0};
 // Commit the completion receipt before exposing a reward. A serialized room
 // restart retains this ledger, so duplicate events cannot pay a second time.
 shift.completed[definition.id]={at:timestamp(now),rewardTokens:definition.rewardTokens};shift.active=null;
 player.tokens=count(player.tokens)+definition.rewardTokens;
 player.contracts.lifetime.completed++;player.contracts.lifetime.tokens+=definition.rewardTokens;
 return {advanced:true,completed:true,rewardTokens:definition.rewardTokens,message:'Contract complete: '+definition.name+'. +'+definition.rewardTokens+' recreation tokens.'};
}

/** Safe render model: callers may change it without changing the room save. */
export function prisonContractView(player,{day=1}={}){
 const shift=prisonContractState(player,{day}),root=player?.contracts,role=roleOf(player);
 const completed=Object.keys(shift?.completed||{}).filter(id=>PRISON_CONTRACTS.some(value=>value.id===id&&value.role===role));
 const definition=PRISON_CONTRACTS.find(value=>value.id===shift?.active?.id&&value.role===role);
 const total=count(root?.lifetime?.completed),level=Math.min(RANKS.length-1,Math.floor(total/3));
 const active=definition?{...definition,acceptedAt:shift.active.acceptedAt,goals:definition.goals.map((value,index)=>({...value,progress:Math.min(value.count,count(shift.active.progress?.[index]))}))}:null;
 return copy({day:dayNumber(day),role,active,offers:shift?PRISON_CONTRACTS.filter(value=>value.role===role).map(value=>({...value,completed:completed.includes(value.id),available:!completed.includes(value.id)&&(!active||active.id===value.id)})):[],completed,lifetime:{completed:total,tokens:count(root?.lifetime?.tokens)},rank:{name:RANKS[level],level:level+1,completed:total,nextAt:level<RANKS.length-1?(level+1)*3:null}});
}
