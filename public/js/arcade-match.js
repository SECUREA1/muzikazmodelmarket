import {createBilliardsMatch} from './arcade-billiards-rules.js';
import {createBasketballMatch} from './arcade-basketball-rules.js';
import {arcadePointer,arcadePhysicsSteps,basketballPosition,basketballRelease} from './arcade-runtime.js';
export function createArcadeMatch(i,gameConfig={roundSeconds:45,difficulty:'easy'}) {
 if(i===2&&gameConfig.basketballMode!=='shooting')return createBasketballMatch(gameConfig);
 if(i===4)return createBilliardsMatch(gameConfig);
 let game,score,remaining,gameElapsed,ended,attempts,shot,pointer,puck,balls,targets,feedback='Ready. Make it count.',opponent=null;
 const pressed=new Set(),beep=()=>{},playerScores=[0,0];let actingPlayer=0;
 function award(n,msg,owner=shot?.player??actingPlayer){score+=n;playerScores[owner]+=n;feedback=msg;}function finish(){ended=true;feedback='Round complete · Player 1 '+playerScores[0]+' — '+playerScores[1]+' Player 2.';}
 game=i;score=0;remaining=gameConfig.roundSeconds;gameElapsed=0;ended=false;attempts=0;shot=null;pointer={x:400,y:370};pressed.clear();puck={x:400,y:230,vx:130,vy:180};balls=[];targets=Array.from({length:5},(_,j)=>({x:100+j*145,y:150+(j%2)*90,r:20+j*4,phase:j,dx:100+j*145+Math.sin(j)*45,dy:150+(j%2)*90+Math.cos(j)*48}));function action(slot=0){if(game===null||ended)return;actingPlayer=slot===1?1:0;if(game===0&&!shot){shot={player:actingPlayer,x:400,y:400,tx:Math.max(100,Math.min(700,pointer.x)),p:0};attempts++;beep(220)}if(game===1){attempts++;let hit=false;for(const t of targets){if(Math.hypot(pointer.x-t.dx,pointer.y-t.dy)<t.r){award(Math.round(100-t.r),'Bullseye!');t.phase+=2.4;hit=true;break}}if(!hit)feedback='Miss — keep tracking the targets.'}if(game===2&&!shot){const x=basketballPosition(gameElapsed);shot={player:actingPlayer,x,y:385,tx:x,p:0,...basketballRelease(x,gameConfig.difficulty)};attempts++;beep(250)}}
function updateGame(dt){
 if(game===null)return;
 let active=0;
 if(!ended){active=Math.min(dt,remaining);gameElapsed+=active;remaining=Math.max(0,remaining-dt);pointer=arcadePointer(pointer.x+((pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0))*360*active,pointer.y+((pressed.has('ArrowDown')?1:0)-(pressed.has('ArrowUp')?1:0))*360*active);}
 const now=gameElapsed*1000;
 if(game===0&&shot&&!ended){
  shot.p+=active*2.1;
  if(shot.p>=1){const goalie=400+Math.sin(now/600)*145;if(shot.tx>220&&shot.tx<580&&Math.abs(shot.tx-goalie)>52)award(100,'GOAL! Top shelf.');else{feedback='Saved! Aim away from the goalie.';beep(120);}shot=null;}
 }
 if(game===1)for(const t of targets){t.dx=t.x+Math.sin(now/1000+t.phase)*45;t.dy=t.y+Math.cos(now/1300+t.phase)*48;}
 if(game===2&&shot&&!ended){
  shot.p+=active*1.6;
  if(shot.p>=1){if(shot.scored)award(150,'SWISH! Nothing but net.');else{feedback='Off the rim. Release under the hoop.';beep(120);}shot=null;}
 }
 if(game===3&&!ended){
  const mx=Math.max(115,Math.min(685,pointer.x)),my=Math.max(250,Math.min(400,pointer.y)),aiX=opponent?.x??400+Math.sin(now/(gameConfig.difficulty==='normal'?650:1000))*190;
  for(const step of arcadePhysicsSteps(active)){
   puck.x+=puck.vx*step;puck.y+=puck.vy*step;
   if(puck.x<105||puck.x>695){puck.x=Math.max(105,Math.min(695,puck.x));puck.vx*=-1;}
   for(const m of [{x:mx,y:my},{x:aiX,y:opponent?.y??95}]){
    const dx=puck.x-m.x,dy=puck.y-m.y,l=Math.hypot(dx,dy);
    if(l<42){const speed=Math.hypot(puck.vx,puck.vy),nx=l>1e-6?dx/l:speed?puck.vx/speed:0,ny=l>1e-6?dy/l:speed?puck.vy/speed:-1;puck.x=m.x+nx*43;puck.y=m.y+ny*43;puck.vx=nx*390;puck.vy=ny*390;beep(230);}
   }
   if(puck.y<42||puck.y>418){
    if(puck.x>300&&puck.x<500){if(puck.y<42)award(100,'Player 1 scores! Defend the bottom goal.',0);else award(100,'Player 2 scores! Defend the top goal.',1);puck={x:400,y:230,vx:100,vy:puck.y<42?180:-180};}
    else{puck.y=Math.max(42,Math.min(418,puck.y));puck.vy*=-1;}
   }
  }
 }
 if(remaining<=0&&!ended)finish();
}

 return {step:updateGame,action,opponent(value={}){if(value===null){opponent=null;return;}opponent={x:Math.max(115,Math.min(685,Number(value.x)||400)),y:Math.max(60,Math.min(210,460-(Number(value.y)||370)))};},input(value={}){pointer=arcadePointer(Number(value.x),Number(value.y));},snapshot(){return structuredClone({game,score,remaining,gameElapsed,ended,attempts,shot,pointer,puck,balls,targets,feedback,opponent,playerScores});}};
}
