/** Server and solo 8-ball: one shared table, legal turns and equal-mass ball physics. */
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const RADIUS=12,DIAMETER=RADIUS*2,POCKETS=[[80,70],[400,65],[720,70],[80,390],[400,395],[720,390]];
const groupOf=id=>id>0&&id<8?'solids':id>8?'stripes':null;
const colors=['#e8eee0','#eabd5f','#598ce4','#e78d99','#b09ae0','#efa35e','#79c8cf','#96394b','#161a20','#eabd5f','#598ce4','#e78d99','#b09ae0','#efa35e','#79c8cf','#96394b'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function createBilliardsMatch(raw={}){
 const config={roundSeconds:clamp(finite(raw.roundSeconds,45),15,180),difficulty:raw.difficulty==='normal'?'normal':'easy',aiFill:raw.aiFill!==false};
 const balls=Array.from({length:16},(_,id)=>({id,number:id,x:220,y:240,vx:0,vy:0,c:colors[id],sunk:false,group:groupOf(id),striped:id>8}));
 // The 8 is centered in row three; opposite groups occupy the back corners.
 const rack=[1,9,2,3,8,10,11,4,12,5,6,13,7,14,15];let index=0;
 for(let row=0;row<5;row++)for(let column=0;column<=row;column++){
  const ball=balls[rack[index++]];ball.x=500+row*20.95;ball.y=230+(column-row/2)*24.2;
 }
 const inputs=[{x:500,y:230,power:.7},{x:220,y:240,power:.7}],humans=[true,true],groups=[null,null],playerScores=[0,0];
 let turn=0,winner=null,remaining=config.roundSeconds,gameElapsed=0,ended=false,attempts=0,ballInHand=false,shot=null,aiDelay=.8,feedback='8-ball · Player 1 breaks. Aim, set power, then shoot.';
 const moving=()=>balls.some(ball=>!ball.sunk&&Math.hypot(ball.vx,ball.vy)>0);
 const groupCleared=slot=>Boolean(groups[slot])&&balls.every(ball=>ball.group!==groups[slot]||ball.sunk);
 function safeCuePosition(preferred={x:220,y:240}){
  const free=point=>balls.slice(1).every(ball=>ball.sunk||distance(ball,point)>DIAMETER+1);
  if(free(preferred))return preferred;
  for(let y=100;y<=360;y+=28)for(let x=110;x<=690;x+=28)if(free({x,y}))return {x,y};
  return {x:220,y:240};
 }
 function finish(message,winningSlot=null){ended=true;winner=winningSlot;feedback=message;balls.forEach(ball=>{ball.vx=ball.vy=0;});shot=null;}
 function settleShot(){
  const current=shot;if(!current)return;shot=null;
  const shooter=current.slot,other=1-shooter,objects=current.pocketed.filter(id=>id!==0&&id!==8),first=balls[current.firstContact];
  const legalFirst=first&&first.id!==0&&(groups[shooter]?(groupClearedBefore(current,shooter)?first.id===8:first.group===groups[shooter]):first.id!==8);
  const foul=current.scratch||!legalFirst||(!current.pocketed.length&&!current.railContact);
  if(current.pocketed.includes(8)){
   const cleared=groupClearedBefore(current,shooter),won=cleared&&!foul;
   finish(won?'Player '+(shooter+1)+' wins · 8-ball pocketed.':'Player '+(shooter+1)+' pockets the 8 early or fouls · Player '+(other+1)+' wins.',won?shooter:other);return;
  }
  if(!foul&&!groups[shooter]&&objects.length){groups[shooter]=groupOf(objects[0]);groups[other]=groups[shooter]==='solids'?'stripes':'solids';}
  groups.forEach((group,slot)=>{playerScores[slot]=group?balls.filter(ball=>ball.sunk&&ball.group===group).length:0;});
  if(foul){
   turn=other;ballInHand=true;const cue=balls[0];Object.assign(cue,safeCuePosition(),{sunk:false,vx:0,vy:0});
   feedback=(current.scratch?'Scratch':!legalFirst?'Wrong first contact':'No pocket or cushion after contact')+' · Player '+(turn+1)+' has ball in hand.';
  }else{
   const ownPocket=objects.some(id=>groupOf(id)===groups[shooter]);turn=ownPocket?shooter:other;ballInHand=false;
   feedback=ownPocket?'Legal pocket · Player '+(turn+1)+' shoots again.':'Player '+(turn+1)+' to shoot.';
  }
  aiDelay=config.difficulty==='normal'?.65:1.1;
 }
 function groupClearedBefore(current,slot){return Boolean(groups[slot])&&balls.every(ball=>ball.group!==groups[slot]||current.sunkBefore.includes(ball.id));}
 function input(value={},slot=0){
  if(slot!==0&&slot!==1)return;const target=inputs[slot];
  if(value.x!==undefined)target.x=clamp(finite(value.x,target.x),80,720);
  if(value.y!==undefined)target.y=clamp(finite(value.y,target.y),65,395);
  if(value.power!==undefined)target.power=clamp(finite(value.power,target.power),.2,1);
 }
 function action(slot=0,kind='shoot'){
  if(ended||slot!==turn||moving()||shot)return false;
  const cue=balls[0],aim=inputs[slot];
  if(kind==='place'){
   if(!ballInHand||aim.x<90||aim.x>710||aim.y<80||aim.y>380||POCKETS.some(([x,y])=>Math.hypot(aim.x-x,aim.y-y)<25)||balls.slice(1).some(ball=>!ball.sunk&&distance(ball,aim)<DIAMETER+1))return false;
   Object.assign(cue,{x:aim.x,y:aim.y,sunk:false,vx:0,vy:0});feedback='Cue ball placed · aim and shoot.';return true;
  }
  if(kind!=='shoot'&&kind!=='play')return false;
  const dx=aim.x-cue.x,dy=aim.y-cue.y,length=Math.hypot(dx,dy);if(length<1)return false;
  const speed=220+aim.power*680;cue.vx=dx/length*speed;cue.vy=dy/length*speed;cue.sunk=false;ballInHand=false;
  shot={slot,pocketed:[],scratch:false,firstContact:null,railContact:false,sunkBefore:balls.filter(ball=>ball.sunk).map(ball=>ball.id)};attempts++;
  feedback='Player '+(slot+1)+' shoots · wait for the balls to stop.';return true;
 }
 function physics(dt){
  for(const ball of balls){
   if(ball.sunk)continue;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
   const drag=Math.exp(-1.15*dt);ball.vx*=drag;ball.vy*=drag;
   if(POCKETS.some(([x,y])=>Math.hypot(ball.x-x,ball.y-y)<23)){
    ball.sunk=true;ball.vx=ball.vy=0;shot?.pocketed.push(ball.id);if(ball.id===0&&shot)shot.scratch=true;continue;
   }
   if(ball.x<90||ball.x>710){ball.x=clamp(ball.x,90,710);ball.vx*=-.88;if(shot&&shot.firstContact!==null)shot.railContact=true;}
   if(ball.y<80||ball.y>380){ball.y=clamp(ball.y,80,380);ball.vy*=-.88;if(shot&&shot.firstContact!==null)shot.railContact=true;}
  }
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
   const a=balls[i],b=balls[j];if(a.sunk||b.sunk)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=DIAMETER)continue;
   const nx=d>1e-7?dx/d:1,ny=d>1e-7?dy/d:0,closing=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
   if(closing>0){
    if(shot&&shot.firstContact===null&&(a.id===0||b.id===0))shot.firstContact=a.id===0?b.id:a.id;
    const impulse=closing*.985;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
   }
   const separation=(DIAMETER-d+.001)/2;a.x-=nx*separation;a.y-=ny*separation;b.x+=nx*separation;b.y+=ny*separation;
  }
  for(const ball of balls)if(Math.hypot(ball.vx,ball.vy)<8)ball.vx=ball.vy=0;
  if(shot&&!moving())settleShot();
 }
 function pathClear(start,end,ignore=[]){
  const dx=end.x-start.x,dy=end.y-start.y,length=dx*dx+dy*dy;if(length<1)return false;
  return balls.every(ball=>ball.sunk||ignore.includes(ball.id)||(()=>{const t=clamp(((ball.x-start.x)*dx+(ball.y-start.y)*dy)/length,0,1);return Math.hypot(ball.x-start.x-dx*t,ball.y-start.y-dy*t)>DIAMETER+1;})());
 }
 function aiShoot(){
  const cue=balls[0],targets=balls.filter(ball=>!ball.sunk&&ball.id!==0&&(groups[turn]?(groupCleared(turn)?ball.id===8:ball.group===groups[turn]):ball.id!==8));let best=null;
  for(const target of targets)for(const [x,y] of POCKETS){
   const d=Math.hypot(x-target.x,y-target.y),unit={x:(x-target.x)/d,y:(y-target.y)/d},ghost={x:target.x-unit.x*(DIAMETER+.1),y:target.y-unit.y*(DIAMETER+.1)};
   if(ghost.x<90||ghost.x>710||ghost.y<80||ghost.y>380)continue;
   const cueDistance=distance(cue,ghost),alignment=((ghost.x-cue.x)*unit.x+(ghost.y-cue.y)*unit.y)/Math.max(1,cueDistance),clear=pathClear(cue,ghost,[0,target.id])&&pathClear(target,{x,y},[0,target.id]);
   const cost=cueDistance+d+(1-alignment)*450+(clear?0:1500);if(!best||cost<best.cost)best={...ghost,cost,power:clamp((cueDistance+d)*1.15/680,.35,.95)};
  }
  if(best){input(best,turn);action(turn);}
 }
 function step(delta){
  let left=clamp(finite(delta),0,1);while(left>1e-8&&!ended){const dt=Math.min(1/120,left);left-=dt;gameElapsed+=dt;remaining=Math.max(0,remaining-dt);physics(dt);
   if(!ended&&!moving()&&!shot&&config.aiFill&&!humans[turn]){aiDelay-=dt;if(aiDelay<=0){aiShoot();aiDelay=1;}}
   if(!ended&&remaining<1e-7){remaining=0;const victor=playerScores[0]===playerScores[1]?null:playerScores[0]>playerScores[1]?0:1;finish('Time · '+(victor===null?'Draw':('Player '+(victor+1)+' wins'))+' · '+playerScores.join(' — '),victor);}
  }
 }
 return {config,input,action,step,opponent(){},setRoster(slots=[]){humans.forEach((_,slot)=>{humans[slot]=Boolean(slots[slot]?.actor);});},snapshot(){return structuredClone({game:4,score:playerScores[0]+playerScores[1],remaining,gameElapsed,ended,attempts,shot:null,pointer:inputs[turn],puck:null,balls,targets:[],feedback,opponent:null,playerScores,billiards:{turn,groups,winner,power:inputs[turn].power,moving:moving(),ballInHand,firstContact:shot?.firstContact??null,pocketed:shot?.pocketed??[],players:humans.map((human,id)=>({id,human})),pockets:POCKETS.map(([x,y])=>({x,y})),rules:'8-ball'}});}};
}
