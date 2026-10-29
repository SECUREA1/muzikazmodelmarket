import {RESIDENT_CHARACTER_MODELS} from './resident-personalities.js';
const words=value=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,180):'';
const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
const formNames={human:'Human',foxfolk:'Foxfolk',mossling:'Mossling',automaton:'Automaton'};

/** Shared presentation for live resident cards and local conversation replies. */
export function residentActivitySummary(info={},actors={}){
 const form=words(info.appearance?.form||info.identity?.form),ambition=words(info.identity?.ambition||info.preferences?.ambition),quirk=words(info.identity?.quirk||info.preferences?.quirk);
 const model=info.appearance?.characterModel,design=RESIDENT_CHARACTER_MODELS.includes(model)?model.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' '):'';
 const identity=[formNames[form]||form,design,ambition,quirk].filter(Boolean).join(' · ');
 const task=info.objective;let objective=null;
 if(task&&['active','completed','failed'].includes(task.status)){
  const total=Array.isArray(task.checkpoints)?task.checkpoints.length:0,index=Math.min(count(task.index),total),current=words(task.checkpoints?.[index]?.name),title=words(task.title)||'Local objective';
  objective={id:words(task.id),title,status:task.status,index,total,current,progress:task.status==='completed'?1:total?index/total:0};
  objective.text=title+' · '+(task.status==='active'?(total?'Step '+Math.min(index+1,total)+' of '+total+(current?': '+current:''):'In progress'):task.status==='completed'?'Completed':'Waiting for a new plan');
 }
 const work=info.sharedTask;let shared=null;
 if(work){
  const partnerName=words(actors[work.partnerId]?.resident?.name||work.partnerName)||'my teammate',title=words(work.title)||'Shared local task',stage=words(work.stage),responsibility=words(work.responsibility),progress=Math.max(0,Math.min(1,Number.isFinite(work.progress)?work.progress:Number(work.goal)>0?(Number(work.elapsed)||0)/work.goal:0));
  shared={id:words(work.id),title,partnerName,stage,responsibility,progress};
  shared.text=title+' with '+partnerName+' · '+Math.floor(progress*100)+'%'+(responsibility?' · '+responsibility:stage?' · '+stage:'');
 }
 return {identity,form:formNames[form]||form,ambition,quirk,objective,shared,completedObjectives:count(info.objectivesCompleted),completedCommunityTasks:count(info.completedCommunityTasks)};
}
