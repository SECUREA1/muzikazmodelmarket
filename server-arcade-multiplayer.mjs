import {multiplayerMode} from './public/js/arcade-multiplayer.js';
import {newArcadeGame,arcadeMove} from './server-arcade-games.mjs';
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
const lobbyOps=new Set(['create-match','join-match','ready-match','start-match','leave-match']);
export function maintainArcadeMatch(sim,state,now){
 const match=state.match;if(!match)return;
 const actor=sim.actors[state.id];
 const present=seat=>{const p=sim.players?.[seat.id];return p&&p.health!==0&&!p.replacedByRoom&&now-p.lastSeen<15000&&actor?.active!==false&&!actor?.holderId&&actor&&Math.hypot(actor.position.x-p.position.x,actor.position.y-p.position.y,actor.position.z-p.position.z)<=5;};
 if(now-(match.lastInputAt||0)>120000||match.seats.some(seat=>!present(seat))){state.running=false;state.match=null;state.activePlayerId=null;state.revision++;return;}
 const game=state.gamers[match.hostId]?.game;
 if(match.phase==='playing'&&game?.done){match.phase='finished';state.running=false;state.revision++;}
}
export function multiplayerCommand(state,player,id,command,now,rng){
 const op=command.operation;
 if(!state.match&&!lobbyOps.has(op))return false;
 if(op==='create-match'){
  if(state.match)fail('A shared match already exists. Join its open seat.');
  const mode=multiplayerMode(state.game);if(!mode)fail('This game supports solo play and spectators.');
  state.match={mode,phase:'lobby',hostId:id,seats:[{id,name:player.username,ready:false}],turn:0,lastInputAt:now};state.activePlayerId=id;state.running=false;
  state.gamers[id] ||= {name:player.username,credits:100,round:0};delete state.gamers[id].game;
 }else{
  const m=state.match;if(!m)fail('Create a multiplayer lobby first.');
  const seat=m.seats.findIndex(p=>p.id===id);
  if(op==='join-match'){
   if(seat>=0)fail('You already have a seat.');if(m.seats.length>=2)fail('Both player seats are occupied.');
   if(m.phase!=='lobby'&&!(m.phase==='playing'&&m.mode==='coop'))fail('Wait for the next round to join.');
   m.seats.push({id,name:player.username,ready:m.phase==='playing'});
  }else{
   if(seat<0)fail('Join a player seat to control this match.');
   if(op==='leave-match'){state.match=null;state.running=false;state.activePlayerId=null;return true;}
   if(op==='ready-match'){
    if(m.phase==='playing')fail('The match has already started.');
    if(m.phase==='finished'){m.phase='lobby';m.seats.forEach(p=>p.ready=false);}
    m.seats[seat].ready=!m.seats[seat].ready;
   }else if(op==='start-match'){
    if(id!==m.hostId)fail('The host starts the match.');if(m.phase!=='lobby')fail('This round has already started.');
    if(m.mode==='versus'&&m.seats.length!==2||!m.seats.every(p=>p.ready))fail('All players must be ready before starting.');
    const gamer=state.gamers[m.hostId];gamer.game=newArcadeGame(state.game,rng);gamer.round++;gamer.lastPlay=now;m.phase='playing';m.turn=0;
    if(m.mode==='versus'){gamer.game.multiplayer=true;gamer.game.message='Player 1 turn';}
    state.running=state.game==='pong';state.nextStepAt=now+250;
   }else{
    if(m.phase!=='playing')fail('Ready up and start the match first.');
    const gamer=state.gamers[m.hostId];if(now-(m.seats[seat].lastMove||0)<100)fail('Wait a moment before the next move.');
    if(op==='start'||op==='select-game'||op==='step'||op==='pause'||op==='resume')fail('Finish or leave the shared match first.');
    if(m.mode==='versus'&&state.game!=='pong'&&seat!==m.turn)fail('Wait for the other player’s turn.');
    if(m.mode==='versus'&&state.game!=='pong'){
     const g=structuredClone(gamer.game),columns=g.type==='tictactoe'?3:7,run=columns===3?3:4;
     if(g.done||g.moves>=1000)fail('This round has finished.');
     if(command.operation!==(columns===3?'cell':'column')||!Number.isInteger(command.index)||command.index<0||command.index>=(columns===3?9:7))fail('Choose a valid game cell.');
     let cell=command.index;if(columns===7){cell=-1;for(let row=5;row>=0;row--)if(!g.board[row*7+command.index]){cell=row*7+command.index;break;}}
     if(cell<0||g.board[cell])fail('Choose an empty cell.');g.board[cell]=seat+1;g.moves++;
     const winner=g.board.some((v,i)=>v&&[[1,0],[0,1],[1,1],[-1,1]].some(([dx,dy])=>Array.from({length:run},(_,n)=>{const x=i%columns+dx*n,y=Math.floor(i/columns)+dy*n;return x>=0&&x<columns&&y>=0&&y<g.board.length/columns&&g.board[y*columns+x]===v;}).every(Boolean)));
     g.done=winner||!g.board.includes(0);g.winner=winner?seat+1:0;m.turn=1-seat;g.message=g.done?(winner?'Player '+(seat+1)+' wins':'Draw'):'Player '+(m.turn+1)+' turn';gamer.game=g;
    }else if(state.game==='pong'){
     if(!['up','down'].includes(op))fail('Use Up or Down to move your paddle.');
     const g=structuredClone(gamer.game),key=seat===0?'paddle':'cpu';g[key]=Math.max(1,Math.min(8,g[key]+(op==='up'?-1:1)));gamer.game=g;
    }else gamer.game=arcadeMove(gamer.game,command,rng);
    m.seats[seat].lastMove=now;gamer.lastPlay=now;
    if(gamer.game.done){m.phase='finished';state.running=false;}
   }
  }
  if(state.match)state.match.lastInputAt=now;
 }
 state.lastInputAt=now;return true;
}
