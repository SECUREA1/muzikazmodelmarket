/** Full-court basketball simulation shared by solo and server rooms. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export function basketballConfig(raw={}){return {teamSize:Math.round(clamp(raw.teamSize||3,1,5)),periodSeconds:clamp(raw.periodSeconds||raw.roundSeconds||60,15,600),difficulty:raw.difficulty==='normal'?'normal':'easy',aiFill:raw.aiFill!==false};}
export function createBasketballMatch(raw={}){
 const config=basketballConfig(raw),players=Array.from({length:config.teamSize*2},(_,id)=>({id,team:Math.floor(id/config.teamSize),name:'AI',human:id===0?'local':null,x:0,y:0,vx:0,vy:0,input:{},cooldown:0,points:0,assists:0,rebounds:0,steals:0}));
 let seed=731,period=1,remaining=config.periodSeconds,elapsed=0,shotClock=24,ended=false,shot=null,owner=0,teamScore=[0,0],attempts=0,feedback='Ready for tip-off.',lastPass=null,stoppage=0;
 const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},goal=team=>({x:400,y:team===0?65:395}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const ball={x:400,y:230,height:1};
 function inbound(team,message){owner=players.find(p=>p.team===team).id;players.forEach(p=>{p.x=220+(p.id%config.teamSize)*360/Math.max(1,config.teamSize-1);if(config.teamSize===1)p.x=400;p.y=p.team===team?270:170;if(team===1)p.y=460-p.y;p.vx=p.vy=0;});players[owner].x=400;players[owner].y=team===0?350:110;shotClock=24;shot=null;lastPass=null;stoppage=.7;feedback=message;}
 inbound(0,'Tip-off · Home ball.');
 function input(value={},slot=0){const p=players[slot];if(!p)return;p.input={moveX:clamp(value.moveX,-1,1),moveY:clamp(value.moveY,-1,1),aimX:clamp(value.aimX??value.x??400,100,700),aimY:clamp(value.aimY??value.y??230,50,410)};}
 function action(slot=0,kind='shoot'){const p=players[slot];if(!p||ended||stoppage>0||p.cooldown>0)return false;
 if(kind==='steal'){p.cooldown=.65;const carrier=players[owner];if(carrier&&carrier.team!==p.team&&distance(p,carrier)<38&&!shot){if(rng()<.55){owner=p.id;shotClock=24;p.steals++;lastPass=null;feedback=p.name+' steals possession.';}else feedback='Steal missed.';}return true;}
 if(owner!==slot||shot)return false;
 if(kind==='pass'){const mates=players.filter(q=>q.team===p.team&&q.id!==p.id);if(!mates.length)return false;const target={x:p.input.aimX??400,y:p.input.aimY??goal(p.team).y};mates.sort((a,b)=>distance(a,target)-distance(b,target));owner=mates[0].id;lastPass=p.id;p.cooldown=.25;feedback=p.name+' passes to '+mates[0].name;return true;}
 const rim=goal(p.team),d=distance(p,rim),defenders=players.filter(q=>q.team!==p.team&&distance(q,p)<50).length,points=d>175?3:2;
 const chance=clamp(.92-d/650-defenders*.16,.12,.94);shot={x:p.x,y:p.y,tx:rim.x,ty:rim.y,p:0,team:p.team,shooter:slot,points,scored:rng()<chance};attempts++;p.cooldown=1.1;owner=null;feedback=p.name+' shoots for '+points+'.';return true;}
 function stepOnce(dt){if(ended)return;elapsed+=dt;if(stoppage>0){stoppage=Math.max(0,stoppage-dt);return;}remaining=Math.max(0,remaining-dt);shotClock=Math.max(0,shotClock-dt);
 for(const p of players){p.cooldown=Math.max(0,p.cooldown-dt);let dx=p.input.moveX||0,dy=p.input.moveY||0;
 if(!p.human){dx=dy=0;if(config.aiFill){const carrier=players[owner],attack=carrier?.team===p.team,rim=goal(p.team);let target;
 if(owner===p.id){target={x:400+Math.sin(elapsed+p.id)*45,y:rim.y+(p.team===0?100:-100)};if(distance(p,rim)<175&&p.cooldown<=0)action(p.id);}
 else if(shot){target={x:shot.tx+(p.id%3-1)*25,y:shot.ty+(p.team===0?30:-30)};}
 else if(attack)target={x:180+(p.id%config.teamSize)*440/Math.max(1,config.teamSize-1),y:rim.y+(p.team===0?100:-100)};
 else target=carrier?{x:carrier.x+(p.id%3-1)*45,y:carrier.y+(p.team===0?20:-20)}:{x:400,y:230};
 if(target){const d=distance(p,target);if(d>8){dx=(target.x-p.x)/d;dy=(target.y-p.y)/d;}}if(carrier&&carrier.team!==p.team&&distance(p,carrier)<34&&p.cooldown<=0)action(p.id,'steal');}}
 const len=Math.max(1,Math.hypot(dx,dy)),speed=p.human?140:config.difficulty==='normal'?122:100;p.vx=dx/len*speed;p.vy=dy/len*speed;p.x=clamp(p.x+p.vx*dt,115,685);p.y=clamp(p.y+p.vy*dt,72,388);
 }
 if(shot){shot.p+=dt*1.5;ball.x=shot.x+(shot.tx-shot.x)*Math.min(1,shot.p);ball.y=shot.y+(shot.ty-shot.y)*Math.min(1,shot.p);ball.height=1.5+Math.min(1,shot.p)*1.26+Math.sin(Math.min(1,shot.p)*Math.PI)*3;
 if(shot.p>=1){const release=shot;shot=null;if(release.scored){teamScore[release.team]+=release.points;players[release.shooter].points+=release.points;if(lastPass!==null)players[lastPass].assists++;inbound(1-release.team,(release.team===0?'HOME':'VISITORS')+' score '+release.points+'!');}else{const near=players.slice().sort((a,b)=>distance(a,ball)-distance(b,ball));owner=near[0].id;near[0].rebounds++;shotClock=24;lastPass=null;feedback=near[0].name+' gets the rebound.';}}}
 else if(owner!==null){const p=players[owner];ball.x=p.x+12;ball.y=p.y;ball.height=.45+Math.abs(Math.sin(elapsed*11))*.8;}
 if(shotClock<=0&&!shot){const team=players[owner]?.team??0;inbound(1-team,'Shot-clock violation · turnover.');}
 if(remaining<=0&&!shot){if(period<4){period++;remaining=config.periodSeconds;inbound(period%2,'Quarter '+period+' · inbound.');}else if(teamScore[0]===teamScore[1]){period++;remaining=60;inbound(period%2,'Overtime · tied game.');}else{ended=true;feedback=(teamScore[0]>teamScore[1]?'HOME':'VISITORS')+' WIN · '+teamScore.join(' — ');}}
 }
 return {config,input,action,opponent(){},setRoster(slots=[]){players.forEach((p,i)=>{p.human=slots[i]?.actor||null;p.name=slots[i]?.name||(p.human?'Player':'AI');if(!p.human)p.input={};});},step(delta){let left=clamp(delta,0,.5);while(left>1e-8){const dt=Math.min(1/60,left);stepOnce(dt);left-=dt;}},snapshot(){return structuredClone({game:2,score:teamScore[0]+teamScore[1],remaining,gameElapsed:elapsed,ended,attempts,shot,pointer:{x:ball.x,y:ball.y},puck:null,balls:[],targets:[],opponent:null,feedback,basketball:{config,players,ball,owner,teamScore,period,shotClock,shot,ended,feedback}});}};
}
