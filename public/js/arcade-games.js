export const ARCADE_GAMES=Object.freeze({
 'blackjack-cabinet':{game:'blackjack',name:'Blackjack Club',description:'Hit or stand against the house dealer. Practice cards only.',color:0x67dfa3,shape:'table'},
 'high-low-cabinet':{game:'highlow',name:'High / Low Cards',description:'Predict the next card and build a streak.',color:0xffcf70,shape:'arcade'},
 'memory-match-cabinet':{game:'memory',name:'Memory Match',description:'Find all eight matching pairs on a hidden card board.',color:0xcc96ff,shape:'arcade'},
 'tic-tac-toe-cabinet':{game:'tictactoe',name:'Neon Noughts & Crosses',description:'Play a three-in-a-row match against the cabinet.',color:0x76dfff,shape:'arcade'},
 'four-in-row-cabinet':{game:'connect4',name:'Four in a Row',description:'Drop discs and connect four against the cabinet.',color:0xff8a80,shape:'arcade'},
 'mine-sweeper-cabinet':{game:'mines',name:'Minefield Puzzle',description:'Reveal safe cells on a six-by-six board. First pick is safe.',color:0xa4e775,shape:'arcade'},
 'lights-out-cabinet':{game:'lights',name:'Neon Lights Out',description:'Toggle a light and its neighbours until every light is off.',color:0xffe781,shape:'arcade'},
 'rock-paper-scissors-cabinet':{game:'rps',name:'Rock Paper Scissors',description:'Challenge the machine to a quick hand-gesture duel.',color:0xfca6d7,shape:'arcade'},
 'retro-snake-cabinet':{game:'snake',name:'Pixel Snake',description:'Steer through the grid, eat stars and avoid your tail.',color:0x8dff80,shape:'arcade'},
 'retro-pong-cabinet':{game:'pong',name:'Neon Paddle Rally',description:'Move your paddle and return the ball against the machine.',color:0x79ddff,shape:'arcade'},
 'brick-breaker-cabinet':{game:'breakout',name:'Cosmic Brick Breaker',description:'Bounce the ball into every brick with your paddle.',color:0xffa45f,shape:'arcade'},
 'maze-runner-cabinet':{game:'maze',name:'Pixel Maze Quest',description:'Navigate a maze and reach the exit.',color:0xb69aff,shape:'arcade'}
});
export const arcadeGameIds=new Set(Object.values(ARCADE_GAMES).map(item=>item.game));
export const cardText=card=>['2','3','4','5','6','7','8','9','10','J','Q','K','A'][card%13]+['♣','♦','♥','♠'][Math.floor(card/13)];
export function arcadePresentation(game){
 if(!game)return {text:'Start a game.',buttons:[]};const {type,board=[]}=game;
 let cells=null,columns=0,buttons=[],text=game.message||'Your turn';
 if(type==='blackjack'){text+=' · You: '+game.hand.map(cardText).join(' ')+' · Dealer: '+(game.done?game.dealer.map(cardText).join(' '):cardText(game.dealer[0])+' ?');buttons=[['Hit','hit'],['Stand','stand']];}
 if(type==='highlow'){text+=' · Card: '+cardText(game.card)+' · Streak '+game.score;buttons=[['Higher','higher'],['Lower','lower']];}
 if(type==='memory'){columns=4;cells=board.map((value,i)=>game.matched.includes(i)||game.shown.includes(i)?String(value+1):'?');}
 if(type==='tictactoe'){columns=3;cells=board.map(value=>value===1?'X':value===2?'O':'·');}
 if(type==='connect4'){columns=7;cells=board.map(value=>value===1?'●':value===2?'○':'·');buttons=Array.from({length:7},(_,i)=>['Drop '+(i+1),'column',i]);}
 if(type==='mines'){columns=6;cells=board.map((value,i)=>game.revealed.includes(i)?value===-1?'✹':String(value):game.done&&value===-1?'✹':'?');}
 if(type==='lights'){columns=5;cells=board.map(value=>value?'●':'·');}
 if(type==='rps')buttons=[['Rock','rock'],['Paper','paper'],['Scissors','scissors']];
 if(['snake','maze','pong','breakout'].includes(type)){
  columns=10;cells=Array.from({length:100},(_,i)=>{
   if(type==='snake')return game.body.includes(i)?'■':i===game.food?'★':'·';
   if(type==='maze')return i===game.position?'●':i===98?'★':board[i]?'█':'·';
   const x=i%10,y=Math.floor(i/10);return game.ball===i?'●':type==='breakout'&&game.bricks.includes(i)?'■':(x===0&&Math.abs(y-game.paddle)<=1||type==='pong'&&x===9&&Math.abs(y-game.cpu)<=1)?'▌':'·';
  });buttons=[['↑ Up','up'],['← Left','left'],['↓ Down','down'],['Right →','right']];if(['pong','breakout'].includes(type))buttons=[['↑ Paddle up','up'],['Advance','step'],['↓ Paddle down','down']];
 }
 return {text:text+' · Score '+(game.score||0)+(game.done?' · Game over':''),cells,columns,buttons:game.done?[]:buttons};
}
