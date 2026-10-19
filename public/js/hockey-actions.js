/** Contextual trigger decisions. The simulation still owns possession, range and penalties. */
import {RINK,attackDirection} from './hockey-rules.js';

export const HOCKEY_TRIGGER_MODES=Object.freeze([
 {value:'auto',label:'Auto · best available action'},
 {value:'shoot',label:'Shoot only'},
 {value:'pass',label:'Pass only'},
 {value:'steal',label:'Steal / poke only'},
 {value:'check',label:'Body check only'},
 {value:'collect',label:'Collect puck only'}
]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const decision=(action='none',label='Move into range',input={})=>({action,label,input});
const active=p=>p.onIce&&!p.ejected&&!(p.misconduct>0)&&!(p.penalty>0)&&!p.queuedReplacement;
function laneClear(state,player,target){
 const dx=target.x-player.x,dz=target.z-player.z,length2=dx*dx+dz*dz;
 return !state.players.some(q=>{
  if(q.team===player.team||!q.onIce||q.goalie)return false;
  const t=((q.x-player.x)*dx+(q.z-player.z)*dz)/(length2||1);
  return t>.06&&t<.94&&Math.hypot(q.x-player.x-t*dx,q.z-player.z-t*dz)<.85;
 });
}
function shotAim(state,player,aim){
 const d=attackDirection(state,player.team),goalX=d*RINK.goalX;
 // Keep a deliberate aim that crosses the goal mouth; otherwise assist toward its open side.
 if(Number.isFinite(aim?.x)&&Number.isFinite(aim?.z)){
  const t=(goalX-player.x)/(aim.x-player.x),crossZ=player.z+(aim.z-player.z)*t;
  if(t>0&&t<4&&Math.abs(crossZ)<RINK.goalWidth/2-.12)return {aimX:goalX,aimZ:crossZ};
 }
 const goalie=state.players.find(q=>q.team!==player.team&&q.goalie&&q.onIce&&!state.goaliesPulled?.[q.team]);
 return {aimX:goalX,aimZ:goalie?.z>=0?-.72:.72};
}

export function selectHockeyTriggerAction(state,player,{mode='auto',aim}={}){
 if(!state?.puck||!player||!active(player))return decision('none','Not available');
 if(!['playing','shootout'].includes(state.phase)||state.phase==='shootout'&&!state.shootout?.active)return decision('none','Wait for play');
 if(player.cooldown>0)return decision('none','Action recovering');
 const owner=state.players.find(q=>q.id===state.puck.owner),hasPuck=owner===player;
 if(!HOCKEY_TRIGGER_MODES.some(option=>option.value===mode))mode='auto';
 // Match release()'s recipient ordering so Auto evaluates the pass the server will actually make.
 const d=attackDirection(state,player.team),mate=state.players.filter(q=>q!==player&&q.team===player.team&&!q.goalie&&q.onIce&&q.penalty<=0).sort((a,b)=>(distance(player,a)-d*a.x*.3)-(distance(player,b)-d*b.x*.3))[0];
 if(hasPuck){
  const shoot=()=>decision('shoot','Shoot',{shoot:true,...(mode==='auto'?shotAim(state,player,aim):{})});
  if(mode==='shoot')return shoot();
  if(mode==='pass')return mate?decision('pass','Pass',{pass:true}):decision('none','No teammate available');
  if(mode!=='auto')return decision('none','You have the puck');
  // In a shootout there is no eligible receiver. Take the shot rather than passing away the attempt.
  if(state.phase==='shootout')return shoot();
  const goal={x:d*RINK.goalX,z:0},towardGoal=RINK.goalX-d*player.x;
  const shootingChance=d*player.x>RINK.blue&&towardGoal>.25&&Math.abs(player.z)<Math.max(2,towardGoal*.72)&&laneClear(state,player,goal);
  const pressured=state.players.some(q=>q.team!==player.team&&q.onIce&&!q.goalie&&distance(q,player)<2.4);
  const clearPass=mate&&laneClear(state,player,mate),saferPass=clearPass&&d*mate.x>d*player.x+2;
  if(clearPass&&(!shootingChance||pressured&&saferPass))return decision('pass','Pass',{pass:true});
  return shoot();
 }
 if(mode==='shoot'||mode==='pass')return decision('none','Get possession first');
 if(!owner){
  // Collection is automatic inside the simulation's .95 m reach; never waste its cooldown on a poke.
  if((mode==='auto'||mode==='collect')&&state.puck.y<.55&&distance(player,state.puck)<.95)return decision('collect','Collect puck');
  return decision('none',state.puck.y>=.55?'Wait for puck to drop':'Skate to puck');
 }
 if(owner.team===player.team)return decision('none','Teammate has the puck');
 if(mode==='collect'||state.phase==='shootout')return decision('none','Wait for a loose puck');
 // Contact applies to the nearest opponent, so do not target through another skater or a goalie.
 const victim=state.players.filter(q=>q.team!==player.team&&q.onIce&&distance(q,player)<1.8).sort((a,b)=>distance(a,player)-distance(b,player))[0];
 if(victim!==owner||owner.goalie&&!state.goaliesPulled?.[owner.team])return decision();
 const safeCheck=!(Math.abs(owner.z)>RINK.width/2-1.2&&Math.hypot(player.vx,player.vz)>5)&&Math.hypot(player.vx-owner.vx,player.vz-owner.vz)<=12;
 if(mode==='check')return decision('check','Body check',{check:true});
 if(mode==='steal')return state.puck.y<=1.45?decision('steal','Steal / poke',{poke:true}):decision('none','Puck too high for poke');
 if(safeCheck&&(state.puck.y>1.45||distance(player,owner)<1.25&&Math.hypot(owner.vx,owner.vz)>3))return decision('check','Body check',{check:true});
 if(state.puck.y<=1.45)return decision('steal','Steal / poke',{poke:true});
 return decision('none','Move into safe checking range');
}

/** One press performs one kind of action, even if a pickup changes possession before release. */
export function createHockeyTrigger(){
 let selected=null;
 return {
  reset(){selected=null;},
  read(state,player,{pressed=false,mode='auto',aim,manual={}}={}){
   if(!pressed)selected=null;
   const choice=pressed?selectHockeyTriggerAction(state,player,{mode,aim}):null;
   if(choice&&choice.action!=='none'&&selected===null)selected=choice.action;
   if(['shoot','pass','check','poke','hook','slash','hold'].some(key=>manual[key]))return manual;
   return choice&&choice.action===selected?choice.input:{};
  }
 };
}
