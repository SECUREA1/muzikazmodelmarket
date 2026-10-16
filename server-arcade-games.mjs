import {arcadeGameIds} from './public/js/arcade-games.js';
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
const shuffle=(values,rng)=>{for(let i=values.length-1;i>0;i--){const j=rng(i+1);[values[i],values[j]]=[values[j],values[i]];}return values;};
const draw=game=>{if(!game.deck.length)fail('Deck is empty. Start a new game.');return game.deck.pop();};
export const blackjackValue=cards=>{let total=0,aces=0;for(const card of cards){const rank=card%13;if(rank===12){aces++;total+=11;}else total+=Math.min(10,rank+2);}while(total>21&&aces-- >0)total-=10;return total;};
function winning(board,columns,run){for(let i=0;i<board.length;i++)if(board[i])for(const [dx,dy]of [[1,0],[0,1],[1,1],[-1,1]]){const x=i%columns,y=Math.floor(i/columns);if(Array.from({length:run},(_,n)=>{const a=x+dx*n,b=y+dy*n;return a>=0&&a<columns&&b>=0&&b<board.length/columns&&board[b*columns+a]===board[i];}).every(Boolean))return board[i];}return 0;}
export function newArcadeGame(type,rng){
 if(!arcadeGameIds.has(type))fail('Unknown arcade game.');const g={type,score:0,done:false,moves:0,message:'Your turn'};
 if(['blackjack','highlow'].includes(type))g.deck=shuffle(Array.from({length:52},(_,i)=>i),rng);
 if(type==='blackjack'){g.hand=[draw(g),draw(g)];g.dealer=[draw(g),draw(g)];}
 if(type==='highlow')g.card=draw(g);
 if(type==='memory'){g.board=shuffle(Array.from({length:16},(_,i)=>i%8),rng);g.shown=[];g.matched=[];}
 if(type==='tictactoe')g.board=Array(9).fill(0);
 if(type==='connect4')g.board=Array(42).fill(0);
 if(type==='mines'){g.board=Array(36).fill(0);g.revealed=[];g.seeded=false;}
 if(type==='lights'){g.board=Array(25).fill(0);for(let i=0;i<15;i++)toggle(g.board,rng(25));if(!g.board.some(Boolean))toggle(g.board,12);}
 if(type==='snake'){g.body=[44,43,42];g.direction='right';g.food=66;}
 if(type==='maze'){g.board=Array.from({length:100},(_,i)=>i<10||i>=90||i%10===0||i%10===9||i%10===4&&Math.floor(i/10)!==5?1:0);g.board[98]=0;g.position=11;}
 if(['pong','breakout'].includes(type)){g.paddle=5;g.cpu=5;g.ball=45;g.dx=1;g.dy=1;g.bricks=Array.from({length:24},(_,i)=>Math.floor(i/3)*10+6+i%3);}
 return g;
}
function toggle(board,i){for(const j of [i,i-5,i+5,...(i%5?[i-1]:[]),...(i%5<4?[i+1]:[])])if(j>=0&&j<25)board[j]=1-board[j];}
function index(command,size){if(!Number.isInteger(command.index)||command.index<0||command.index>=size)fail('Choose a valid game cell.');return command.index;}
export function arcadeMove(game,command,rng){
 const g=structuredClone(game),op=command.operation;if(g.done)fail('Start a new game to play again.');if(g.moves>=1000)fail('Round limit reached. Start a new game.');g.moves++;
 if(g.type==='blackjack'){
  if(!['hit','stand'].includes(op))fail('Choose Hit or Stand.');if(op==='hit')g.hand.push(draw(g));const total=blackjackValue(g.hand);
  if(total>21){g.done=true;g.message='Bust — dealer wins';}else if(op==='stand'||total===21){while(blackjackValue(g.dealer)<17)g.dealer.push(draw(g));const other=blackjackValue(g.dealer);g.done=true;g.score=other>21||total>other?10:total===other?5:0;g.message=g.score===10?'You win':g.score===5?'Push — tied hand':'Dealer wins';}
 }else if(g.type==='highlow'){
  if(!['higher','lower'].includes(op))fail('Choose Higher or Lower.');const next=draw(g),a=g.card%13,b=next%13;g.message='Previous card rank '+(a+2);g.card=next;if(a===b){g.message='Equal rank — try again';}else if(op==='higher'&&b>a||op==='lower'&&b<a){g.score++;g.message='Correct';}else{g.done=true;g.message='Streak ended';}if(!g.deck.length)g.done=true;
 }else if(g.type==='memory'){
  if(op!=='cell')fail('Pick a card.');const i=index(command,16);if(g.matched.includes(i)||g.shown.length===1&&g.shown[0]===i)fail('Choose a hidden card.');if(g.shown.length===2)g.shown=[];g.shown.push(i);if(g.shown.length===2&&g.board[g.shown[0]]===g.board[i]){g.matched.push(...g.shown);g.score++;g.message='Pair found';}else g.message='Find the matching pair';if(g.matched.length===16){g.done=true;g.message='All pairs found';}
 }else if(['tictactoe','connect4'].includes(g.type)){
  const columns=g.type==='tictactoe'?3:7,run=g.type==='tictactoe'?3:4;
  const drop=(column,value)=>{for(let row=5;row>=0;row--)if(!g.board[row*7+column]){g.board[row*7+column]=value;return true;}return false;};
  if(g.type==='tictactoe'){if(op!=='cell')fail('Choose a cell.');const i=index(command,9);if(g.board[i])fail('Choose an empty cell.');g.board[i]=1;}else{if(op!=='column')fail('Choose a column.');const column=index(command,7);if(!drop(column,1))fail('Column is full.');}
  let win=winning(g.board,columns,run);if(!win&&g.board.includes(0)){
   const choices=g.type==='tictactoe'?g.board.flatMap((v,i)=>v?[]:[i]):Array.from({length:7},(_,i)=>i).filter(i=>!g.board[i]);let best;
   for(const value of [2,1]){for(const choice of choices){const copy=[...g.board];if(g.type==='tictactoe')g.board[choice]=value;else drop(choice,value);const test=winning(g.board,columns,run);g.board=copy;if(test){best=choice;break;}}if(best!==undefined)break;}
   const choice=best??choices[rng(choices.length)];if(g.type==='tictactoe')g.board[choice]=2;else drop(choice,2);win=winning(g.board,columns,run);
  }
  if(win||!g.board.includes(0)){g.done=true;g.score=win===1?10:!win?5:0;g.message=win===1?'You win':win===2?'Cabinet wins':'Draw';}
 }else if(g.type==='mines'){
  if(op!=='cell')fail('Reveal a cell.');const i=index(command,36);if(g.revealed.includes(i))fail('Choose an unrevealed cell.');
  if(!g.seeded){const bombs=shuffle(Array.from({length:36},(_,j)=>j).filter(j=>j!==i),rng).slice(0,6);bombs.forEach(j=>g.board[j]=-1);for(let j=0;j<36;j++)if(g.board[j]!==-1)g.board[j]=bombs.filter(b=>Math.abs(b%6-j%6)<=1&&Math.abs(Math.floor(b/6)-Math.floor(j/6))<=1).length;g.seeded=true;}
  g.revealed.push(i);if(g.board[i]===-1){g.done=true;g.message='Mine found';}else{g.score++;if(g.revealed.length===30){g.done=true;g.message='Minefield cleared';}}
 }else if(g.type==='lights'){
  if(op!=='cell')fail('Toggle a light.');toggle(g.board,index(command,25));if(!g.board.some(Boolean)){g.done=true;g.score=25;g.message='All lights cleared';}
 }else if(g.type==='rps'){
  const choices=['rock','paper','scissors'],a=choices.indexOf(op);if(a<0)fail('Choose Rock, Paper or Scissors.');const b=rng(3);g.done=true;g.score=a===b?1:(a-b+3)%3===1?3:0;g.message='Cabinet: '+choices[b]+' · '+(g.score===3?'You win':g.score===1?'Draw':'Cabinet wins');
 }else if(['snake','maze'].includes(g.type)){
  const directions={up:-10,down:10,left:-1,right:1},direction=op==='step'&&g.type==='snake'?g.direction:op;if(!(direction in directions))fail('Choose a direction.');
  if(g.type==='snake'){const opposite={up:'down',down:'up',left:'right',right:'left'};if(direction===opposite[g.direction])fail('Cannot reverse into your tail.');const head=g.body[0],next=head+directions[direction],eating=next===g.food,body=eating?g.body:g.body.slice(0,-1);g.direction=direction;if(next<0||next>=100||Math.abs(next%10-head%10)+Math.abs(Math.floor(next/10)-Math.floor(head/10))!==1||body.includes(next)){g.done=true;g.message='Snake crashed';}else{g.body.unshift(next);if(eating){g.score++;const free=Array.from({length:100},(_,i)=>i).filter(i=>!g.body.includes(i));if(!free.length){g.done=true;g.message='Board completed';}else g.food=free[rng(free.length)];}else g.body.pop();}}
  else{const next=g.position+directions[direction];if(next<0||next>=100||g.board[next])fail('A wall blocks that path.');g.position=next;if(next===98){g.done=true;g.score=25;g.message='Exit reached';}}
 }else if(['pong','breakout'].includes(g.type)){
  if(!['up','down','step'].includes(op))fail('Move the paddle or advance.');g.paddle=Math.max(1,Math.min(8,g.paddle+(op==='up'?-1:op==='down'?1:0)));
  for(let step=0;step<(op==='step'?2:0)&&!g.done;step++){let x=g.ball%10,y=Math.floor(g.ball/10);if(y+g.dy<0||y+g.dy>9)g.dy*=-1;if(g.type==='pong'&&rng(4)!==0)g.cpu=Math.max(1,Math.min(8,g.cpu+Math.sign(y-g.cpu)));
   if(x+g.dx===0){if(Math.abs(y-g.paddle)>1){g.done=true;g.message='Ball missed';break;}g.dx=1;g.dy=Math.sign(y-g.paddle);g.score++;}
   if(x+g.dx===9){if(g.type==='pong'&&Math.abs(y-g.cpu)>1){g.done=true;g.score+=10;g.message='You win the rally';break;}g.dx=-1;}
   const next=(y+g.dy)*10+x+g.dx;if(g.type==='breakout'&&g.bricks.includes(next)){g.bricks=g.bricks.filter(i=>i!==next);g.dx*=-1;g.score++;if(!g.bricks.length){g.done=true;g.message='All bricks cleared';}}
   else g.ball=next;
  }
 }else fail('Unknown game.');return g;
}
// Never disclose future cards or hidden puzzle answers in room snapshots.
export function projectArcadeDevices(devices){
 const result=structuredClone(devices);
 for(const state of Object.values(result))for(const gamer of Object.values(state.gamers||{})){
  const g=gamer.game;if(!g)continue;delete g.deck;
  if(g.type==='memory')g.board=g.board.map((value,i)=>g.shown.includes(i)||g.matched.includes(i)?value:null);
  if(g.type==='mines'&&!g.done)g.board=g.board.map((value,i)=>g.revealed.includes(i)?value:null);
  if(g.type==='blackjack'&&!g.done)g.dealer=[g.dealer[0],null];
 }
 return result;
}
