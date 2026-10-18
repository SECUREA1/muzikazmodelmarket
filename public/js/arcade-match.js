import {arcadePointer,arcadePhysicsSteps,basketballPosition,basketballRelease} from './arcade-runtime.js';
export function createArcadeMatch(i,gameConfig={roundSeconds:45,difficulty:'easy'}) {
 let game,score,remaining,gameElapsed,ended,attempts,shot,pointer,puck,balls,targets,feedback='Ready. Make it count.',opponent=null;
 const pressed=new Set(),beep=()=>{};
 function award(n,msg){score+=n;feedback=msg;}function finish(){ended=true;feedback='Round complete! '+score+' points.';}
 game=i;score=0;remaining=gameConfig.roundSeconds;gameElapsed=0;ended=false;attempts=0;shot=null;pointer={x:400,y:370};pressed.clear();puck={x:400,y:230,vx:130,vy:180};balls=Array.from({length:6},(_,j)=>({x:480+(j%3)*27,y:200+Math.floor(j/3)*27,vx:0,vy:0,c:['#eabd5f','#b09ae0','#e78d99','#79c8cf','#d2e881','#eea06e'][j],sunk:false}));balls.unshift({x:220,y:240,vx:0,vy:0,c:'#e8eee0',sunk:false});targets=Array.from({length:5},(_,j)=>({x:100+j*145,y:150+(j%2)*90,r:20+j*4,phase:j}));function action(){if(game===null||ended)return;if(game===0&&!shot){shot={x:400,y:400,tx:Math.max(100,Math.min(700,pointer.x)),p:0};attempts++;beep(220)}if(game===1){attempts++;let hit=false;for(const t of targets){if(Math.hypot(pointer.x-t.dx,pointer.y-t.dy)<t.r){award(Math.round(100-t.r),'Bullseye!');t.phase+=2.4;hit=true;break}}if(!hit)feedback='Miss — keep tracking the targets.'}if(game===2&&!shot){const x=basketballPosition(gameElapsed);shot={x,y:385,tx:x,p:0,...basketballRelease(x,gameConfig.difficulty)};attempts++;beep(250)}if(game===4&&balls.every(b=>Math.hypot(b.vx,b.vy)<8)){const b=balls[0];b.sunk=false;const dx=pointer.x-b.x,dy=pointer.y-b.y,l=Math.hypot(dx,dy)||1;b.vx=dx/l*560;b.vy=dy/l*560;attempts++;beep(180)}}
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
    if(puck.x>300&&puck.x<500){if(puck.y<42)award(100,'GOAL! Great angle.');else feedback='Opponent scores. Defend your goal!';puck={x:400,y:230,vx:100,vy:puck.y<42?180:-180};}
    else{puck.y=Math.max(42,Math.min(418,puck.y));puck.vy*=-1;}
   }
  }
 }
 if(game===4&&!ended){
  const pockets=[[80,70],[400,65],[720,70],[80,390],[400,395],[720,390]];
  for(const step of arcadePhysicsSteps(active)){
   for(const b of balls){
    if(b.sunk)continue;b.x+=b.vx*step;b.y+=b.vy*step;b.vx*=Math.pow(.31,step);b.vy*=Math.pow(.31,step);
    if(pockets.some(p=>Math.hypot(b.x-p[0],b.y-p[1])<23)){b.sunk=true;b.vx=b.vy=0;if(b===balls[0]){feedback='Scratch! Cue ball reset.';b.x=220;b.y=240;b.sunk=false;}else award(100,'Pocketed! Nice shot.');continue;}
    if(b.x<90||b.x>710){b.x=Math.max(90,Math.min(710,b.x));b.vx*=-.9;}
    if(b.y<80||b.y>380){b.y=Math.max(80,Math.min(380,b.y));b.vy*=-.9;}
   }
   for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
    const a=balls[i],b=balls[j];if(a.sunk||b.sunk)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<24&&d>0){const nx=dx/d,ny=dy/d,v=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(v>0){a.vx-=v*nx;a.vy-=v*ny;b.vx+=v*nx;b.vy+=v*ny;}a.x-=nx*(24-d)/2;a.y-=ny*(24-d)/2;b.x+=nx*(24-d)/2;b.y+=ny*(24-d)/2;}
   }
  }
  if(balls.slice(1).every(b=>b.sunk)){award(300,'Table cleared! +300 bonus');finish();}
 }
 if(remaining<=0&&!ended)finish();
}

 return {step:updateGame,action,opponent(value={}){if(value===null){opponent=null;return;}opponent={x:Math.max(115,Math.min(685,Number(value.x)||400)),y:Math.max(60,Math.min(210,460-(Number(value.y)||370)))};},input(value={}){pointer=arcadePointer(Number(value.x),Number(value.y));},snapshot(){return structuredClone({game,score,remaining,gameElapsed,ended,attempts,shot,pointer,puck,balls,targets,feedback,opponent});}};
}
