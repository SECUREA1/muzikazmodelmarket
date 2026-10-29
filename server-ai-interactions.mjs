import {constructionCrewInteraction} from './server-construction-crew.mjs';
import {factoryCrewCommand,factoryCrewStatus} from './server-factory-crew-work.mjs';
import {describeAIWorldActions,requestAIWorldAction} from './server-ai-world-actions.mjs';

const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const active=actor=>actor?.active!==false&&actor?.position;
const factoryWorker=(sim,player,npc)=>npc?.resident?.factory?npc:Object.values(sim.actors||{}).filter(actor=>active(actor)&&actor.resident?.factory).sort((a,b)=>gap(a.position,player.position)-gap(b.position,player.position))[0];
const workKind=(sim,environment,npc)=>npc?.resident?.factory||environment?.game==='missile-factory'||sim.factoryEnabled&&sim.factoryCrew?.length?'factory':sim.construction?.crew?'construction':null;

export function aiConversationActions(sim,player,npc,environment,now){
 const kind=workKind(sim,environment,npc),actions=[{id:'ai-capabilities',label:'What can you help with?'}];
 if(kind){
  actions.push({id:'work-status',label:'What is the crew working on?',description:'Read the current server job and machine state.'},
   {id:'work-demonstrate',label:kind==='factory'?'Show a production cycle':'Show me a machine job',description:'Ask an available AI operator to do a real job. Player controls keep priority.'},
   {id:'work-stop',label:'Stop my demonstration',description:'Release the work you requested and leave the machine controls clear.'});
 }
 if(npc&&!npc.crewWorker)actions.push(...describeAIWorldActions(sim,environment,npc,{player,now}).slice(0,8));
 if(npc?.aiTask)actions.push({id:'ai-status',label:'Your current task'},{id:'ai-stop',label:'Stop my requested task'});
 return actions;
}

export function aiWorkReading(sim,context,actorId){
 if(!context)return null;
 if(context.kind==='factory'){
  const job=sim.factoryCrewWork?.job;
  return {...factoryCrewStatus(sim,{entityId:context.workerId}),id:job?.id||null,requested:!!actorId&&job?.requestedBy===actorId};
 }
 if(context.kind==='construction'){
  const worker=sim.construction?.crew?.workers?.find(worker=>worker.id===context.workerId);if(!worker)return {status:'unavailable',message:'This crew member is no longer on the site.'};
  const job=sim.construction.crew.jobs.find(job=>job.id===worker.jobId),machine=sim.actors[worker.machineId];
  return {id:worker.demonstration?worker.id+':'+worker.demonstration.startedAt:null,requested:!!actorId&&worker.demonstration?.requestedBy===actorId,workerId:worker.id,workerName:worker.name,status:worker.demonstration?.status||worker.state,phase:worker.state,message:worker.message||job?.message||'Ready for a site job.',machineName:machine?.name||machine?.definition?.name||machine?.modelId||'',progress:worker.demonstration?.status==='completed'?1:job?.progress||0};
 }
 const actor=sim.actors[context.workerId],task=actor?.aiTask;
 return task?{...task,requested:!!actorId&&task.ownerId===actorId&&!task.autonomous,workerId:actor.id,workerName:actor.resident?.name||actor.name,phase:task.stage,message:task.message||task.targetName}:null;
}

export function attachAIConversation(sim,player,npc,environment,conversation,now){
 if(!conversation)return;
 conversation.aiActions=aiConversationActions(sim,player,npc,environment,now);
 if(!conversation.aiWorkContext){
  if(npc?.aiTask)conversation.aiWorkContext={kind:'world',workerId:npc.id};
  else if(npc?.resident?.factory)conversation.aiWorkContext={kind:'factory',workerId:npc.id};
  else if(npc?.crewWorker)conversation.aiWorkContext={kind:'construction',workerId:npc.id};
 }
 conversation.aiWork=aiWorkReading(sim,conversation.aiWorkContext,player.actorId);
}

// Match explicit requests to do something. Questions about how the player can
// help still use the resident's ordinary favor and quest guidance.
export function aiConversationIntent(choice,text,actions=[]){
 if(choice==='ai-capabilities'||choice==='ai-status'||choice==='ai-stop'||choice?.startsWith('work-')||choice?.startsWith('world:'))return choice;
 if(choice!=='question'||!text)return null;
 const message=String(text).toLowerCase().slice(0,180),machine=/\b(machine|crew|crane|excavat|dig|load|truck|bulldoz|grad|haul|dump|production|fabricat|assembly|calibrat|factory|demonstration)\w*\b/.test(message);
 if(/^(?:please\s+)?(?:stop|pause)[.!?\s]*$/.test(message))return actions.some(action=>action.id==='ai-stop')?'ai-stop':actions.some(action=>action.id==='work-stop')?'work-stop':null;
 if(/\bwhat can you (?:do|help)|\byour (?:abilities|functions|capabilities)\b/.test(message))return 'ai-capabilities';
 if(machine&&/\b(stop|pause|cancel)\b/.test(message))return 'work-stop';
 if(machine&&/\b(show|demonstrate|operate|run|start|resume)\b/.test(message)&&!/^how (?:do|can|should) i\b/.test(message))return 'work-demonstrate';
 if(machine&&/\b(status|progress|doing|working|busy|update)\b/.test(message))return 'work-status';
 if(/\b(stop|cancel|pause)\b.*\b(your|requested|this|my)\b.*\b(task|work|demonstration)\b/.test(message))return 'ai-stop';
 const requested=/\b(open|close|toggle|switch|turn|read|inspect|check|restore|heal|use)\b/.test(message)&&!/^how (?:do|can|should) i\b/.test(message);
 if(requested){
  const candidates=actions.filter(action=>action.id.startsWith('world:'));
  const kind=/\bdoor\b/.test(message)?'door':/\bswitch|beacon|lamp|light\b/.test(message)?'switch':/\bread|sign|guide\b/.test(message)?'talk':/\bheal|restore\b/.test(message)?'heal':/\binspect|check\b/.test(message)?'inspect':null;
  const matching=candidates.filter(action=>!kind||action.kind===kind);
  const words=message.split(/\W+/).filter(word=>word.length>3),score=action=>words.reduce((sum,word)=>sum+Number((action.targetName||action.label).toLowerCase().includes(word)),0);
  matching.sort((a,b)=>score(b)-score(a));if(matching[0])return matching[0].id;
 }
 return null;
}

export function constructionJobForRequest(text=''){
 const message=String(text).toLowerCase();
 if(/\b(crane|steel|beam)\w*\b/.test(message))return 'steel';
 if(/\b(grade|grading|bulldoz|dozer|push)\w*\b/.test(message))return 'grade';
 if(/\b(tip|dump|unload)\w*\b/.test(message)&&!/\bdump truck\b/.test(message))return 'dump';
 if(/\b(haul|truck|deliver)\w*\b/.test(message))return 'haul';
 if(/\b(load|loading)\w*\b/.test(message))return 'load';
 if(/\b(excavat|dig|soil)\w*\b/.test(message))return 'dig';
 return undefined;
}

export function performAIConversation(sim,player,npc,environment,conversation,{choice,text},now,context={}){
 const actions=aiConversationActions(sim,player,npc,environment,now),intent=aiConversationIntent(choice,text,actions);
 if(!intent)return null;
 let message;
 if(intent==='ai-capabilities'){
  message=actions.length>1?'I can '+actions.filter(action=>!['ai-capabilities','work-status','work-stop','ai-status','ai-stop'].includes(action.id)).map(action=>action.label.toLowerCase()).join(', ')+'. Ask for a demonstration or choose an action. You keep control of your game.':'I can explain this quest, give directions, and report your progress. There is no available machine or usable object close to me right now.';
 }else if(intent.startsWith('work-')){
  let kind=workKind(sim,environment,npc);const operation=intent.slice(5),requestedJob=operation==='demonstrate'?constructionJobForRequest(text):undefined;
  if(operation!=='demonstrate'&&['factory','construction'].includes(conversation.aiWorkContext?.kind))kind=conversation.aiWorkContext.kind;
  if(requestedJob&&kind!=='construction'){
   if(!sim.construction?.crew)throw Error('This crew has no available construction operator for that machine. Ask for a production cycle or choose a listed local action.');
   kind='construction';
  }
  if(!kind)throw Error('There is no machine crew on this map. Ask me about a nearby object or this quest.');
  if(kind==='construction'){
   const previous=conversation.aiWorkContext?.kind==='construction'?conversation.aiWorkContext.workerId:null;
   const result=constructionCrewInteraction(sim,player,{operation:operation==='demonstrate'?'demonstrate':operation==='stop'?'stop':'status',workerId:npc?.crewWorker?.id||(operation==='demonstrate'?undefined:previous)||undefined,...(operation==='demonstrate'?{jobId:requestedJob}:{})},now,context);
   const worker=result.workers?.find(worker=>worker.demonstration?.requestedBy===player.actorId&&worker.demonstration.status==='active')||result.workers?.[0];
   if(worker)conversation.aiWorkContext={kind,workerId:worker.workerId};message=result.message;
  }else{
   const worker=conversation.aiWorkContext?.kind==='factory'?sim.actors[conversation.aiWorkContext.workerId]:factoryWorker(sim,player,npc);
   if(!worker)throw Error('No factory crew member is available.');
   if(operation==='status')message=factoryCrewStatus(sim,{entityId:worker.id})?.message||'The factory crew is ready for a demonstration.';
   else message=factoryCrewCommand(sim,player,environment,{operation,entityId:worker.id},now,context);
   conversation.aiWorkContext={kind,workerId:worker.id};
  }
 }else{
  if(!npc)throw Error('This contact is only on the radio. Meet a local resident to request an object demonstration.');
  const result=requestAIWorldAction(sim,player,npc,{id:intent,operation:intent==='ai-stop'?'stop':intent==='ai-status'?'status':'start',text},now,{...context,environment});
  conversation.aiWorkContext={kind:'world',workerId:npc.id};message=result.message;
 }
 attachAIConversation(sim,player,npc,environment,conversation,now);
 return message;
}

export function refreshAIConversationWork(sim){
 for(const player of Object.values(sim.players||{}))for(const conversation of [player.vehicleMission,player.npcConversation]){
  if(conversation?.aiWorkContext)conversation.aiWork=aiWorkReading(sim,conversation.aiWorkContext,player.actorId);
 }
}
