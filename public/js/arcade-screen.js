import {ARCADE_LIBRARY} from './arcade-library.js';
import {arcadePresentation,cardText} from './arcade-games.js';
const palette=['#56e0ff','#ffb45d','#c89aff','#6cf2b2','#ff779c','#ffe179'];
const symbols=['🍒','◆','7','●','♥','♣'];
export const ARCADE_THEMES=Object.freeze(Object.fromEntries(ARCADE_LIBRARY.map((item,i)=>[item.id,Object.freeze({name:item.name,color:typeof item.color==='number'?'#'+item.color.toString(16).padStart(6,'0'):palette[i%6]})])));
export function practicePresentation(type,gamer={},holds=[]){
 if(type==='slots')return {text:gamer.reels?'Award +'+(gamer.award||0)+' · '+gamer.credits+' practice credits':'Three reels. One practice credit per spin.',cells:(gamer.reels||[0,1,2]).map(v=>symbols[v]||'★'),columns:3,buttons:[['Spin · 1 credit','spin']]};
 if(type==='poker')return {text:gamer.phase==='hold'?'Tap cards to hold, then draw.':'Award +'+(gamer.award||0)+' · '+(gamer.credits??100)+' practice credits',cells:(gamer.hand||[]).map(cardText),columns:5,cellInput:gamer.phase==='hold',buttons:gamer.phase==='hold'?[['Draw hand','draw']]:[['Deal · 1 credit','deal']],holds};
 return {text:gamer.question?.[0]||'Answer questions about your shared world.',buttons:(gamer.question?.[1]||[]).map((answer,index)=>[answer,'answer',index])};
}
export function arcadeVisualModel({type,game,view,gamer,holds=[]}={}){
 type=type||game?.type||'tictactoe';view ||= ['slots','poker','trivia'].includes(type)?practicePresentation(type,gamer,holds):arcadePresentation(game);
 const theme=ARCADE_THEMES[type]||{name:'Arcade',color:palette[0]},motion=['snake','maze','pong','breakout'].includes(type);
 let cells=(view.cells||[]).map((text,index)=>({text:String(text),index,tone:'empty',action:null,selected:false}));
 const clickable=['memory','tictactoe','mines','lights'].includes(type)||view.cellInput;
 for(const c of cells){const i=c.index,v=game?.board?.[i];if(clickable&&!game?.done&&!(view.disabledCells||[]).includes(i))c.action={operation:type==='poker'?'hold':'cell',index:i};
  if(type==='memory'&&(game?.matched?.includes(i)||game?.shown?.length===1&&game.shown[0]===i)||type==='tictactoe'&&v||type==='mines'&&game?.revealed?.includes(i))c.action=null;
  if(type==='connect4'){c.action=!game?.done&&!game?.board?.[i%7]?{operation:'column',index:i%7}:null;c.tone=v===1?'one':v===2?'two':'socket';}
  else if(['tictactoe','reversi'].includes(type))c.tone=v===1?'one':v===2?'two':'empty';
  else if(type==='memory')c.tone=c.text==='?'?'back':game?.matched?.includes(i)?'matched':'face';
  else if(type==='lights')c.tone=v?'lit':'dark';
  else if(type==='merge2048'){c.tone=v?'number':'empty';c.level=Math.min(11,Math.log2(v||1));}
  else if(type==='mines'||type==='battleship')c.tone=c.text==='?'?'back':c.text==='✹'?'danger':'face';
  else if(type==='maze')c.tone=v?'wall':'empty';
  else if(type==='snake')c.tone=game?.body?.includes(i)?'snake':i===game?.food?'food':'empty';
  else if(type==='breakout')c.tone=game?.bricks?.includes(i)?'brick':'empty';
  else if(type==='peg'){c.tone=v===-1?'void':v===0?'socket':'peg';c.selected=i===game?.selected;}
  else if(type==='dotsboxes'){const j=i<6?i:i-6;c.text=i<6?'━':'┃';c.tone=v===1?'one':v===2?'two':'empty';c.gridX=i<6?(j%2)*2+1:(j%3)*2;c.gridY=i<6?Math.floor(j/2)*2:Math.floor(j/3)*2+1;}
  else if(type==='simon')c.tone=['red','blue','green','gold'][i];
  else if(type==='mancala')c.tone=i===6||i===13?'store':'pocket';
  else if(type==='sudoku4'){c.tone=game?.givens?.includes(i)?'given':'number';c.selected=i===game?.selected;}
  else if(type==='dicepoker'){c.text=['','⚀','⚁','⚂','⚃','⚄','⚅'][v]||c.text;c.tone='die';c.selected=game?.holds?.includes(i);}
  else if(type==='shutbox'){c.tone=v?'number':'closed';c.selected=game?.selected?.includes(i);}
  else if(type==='poker'){c.tone=(gamer?.hand?.[i]%52>=13&&gamer?.hand?.[i]%52<39)?'card-red':'card';c.selected=holds.includes(i);}
  else if(type==='slots')c.tone='reel';
  else if(type==='sliding8')c.tone=v?'number':'socket';
  if(motion)c.text=['snake','maze','pong','breakout'].includes(type)?(c.tone==='food'?'★':''):c.text;
 }
 // Card games use actual card faces rather than a paragraph of ranks.
 if(type==='blackjack'&&game){cells=[...game.hand.map((v,i)=>({text:cardText(v),index:i,tone:'card',action:null})),...game.dealer.map((v,i)=>({text:v===null||i>0&&!game.done?'?':cardText(v),index:game.hand.length+i,tone:v===null||i>0&&!game.done?'back':'card',action:null}))];}
 if(type==='highlow'&&game)cells=[{text:cardText(game.card),index:0,tone:'card',action:null}];
 if(type==='scramble'&&game)cells=[...game.scrambled].map((text,index)=>({text,index,tone:'letter',action:null}));
 if(type==='hangman'&&game)cells=[...(game.masked||game.word||'')].map((text,index)=>({text,index,tone:text==='_'?'socket':'letter',action:null}));
 if(type==='nim'&&game)cells=game.board.map((v,index)=>({text:'● '.repeat(v).trim()||'—',index,tone:'heap',action:null}));
 const entities=[];if(game){if(type==='maze')entities.push({id:'hero',index:game.position,tone:'hero',text:'●'},{id:'exit',index:98,tone:'food',text:'★'});if(type==='snake')entities.push({id:'head',index:game.body[0],tone:'hero',text:'●'});if(['pong','breakout'].includes(type)){entities.push({id:'ball',index:game.ball,tone:'ball',text:'●'},{id:'paddle',index:game.paddle*10,tone:'paddle',text:''});if(type==='pong')entities.push({id:'opponent',index:game.cpu*10+9,tone:'paddle two',text:''});}}
 const buttons=(view.buttons||[]).filter(([,op])=>op!=='step'&&!(type==='connect4'&&op==='column')).map(([label,operation,index])=>({label,operation,index}));
 if(type==='rps')for(const b of buttons)b.label=({rock:'✊ Rock',paper:'✋ Paper',scissors:'✌ Scissors'})[b.operation]||b.label;
 return {type,theme,text:view.text||'Ready to play',score:game?.score??gamer?.credits??0,done:Boolean(game?.done),columns:type==='dotsboxes'?5:view.columns||(['blackjack','poker'].includes(type)?5:type==='highlow'?1:type==='nim'?3:Math.min(8,cells.length)||1),cells,entities,buttons,input:view.input,sequence:type==='simon'&&game?.phase==='watch'?game.sequence:[],history:type==='codebreaker'?game?.history:[],misses:type==='hangman'?game?.misses:undefined,boxes:type==='dotsboxes'?game?.boxes:null,motion};
}
function ensureStyle(){if(document.querySelector('link[data-arcade-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/public/css/arcade-screen.css';link.dataset.arcadeStyle='';document.head.append(link);}
export function mountArcadeScreen(parent,{onCommand,onError=()=>{}}={}){
 ensureStyle();const root=document.createElement('section');root.className='arcade-screen';root.setAttribute('aria-label','Interactive arcade screen');parent.append(root);
 const node=(tag,cls,parent=root)=>{const n=document.createElement(tag);n.className=cls;parent.append(n);return n;};
 const header=node('header','arcade-screen-header'),brand=node('span','arcade-brand',header);brand.textContent='MUZIKAZ / ARCADE';const title=node('h3','arcade-title',header),score=node('output','arcade-score',header);
 const status=node('p','arcade-status');status.setAttribute('role','status');
 const art=node('div','arcade-art');art.setAttribute('aria-hidden','true');
 const board=node('div','arcade-board'),tiles=node('div','arcade-tiles',board),entities=node('div','arcade-entities',board),history=node('div','arcade-history'),controls=node('div','arcade-controls');
 const form=node('form','arcade-answer'),label=node('label','',form),answer=node('input','',label),submit=node('button','arcade-action',form);submit.type='submit';submit.textContent='Submit';
 const cells=new Map(),sprites=new Map(),actions=new Map();let current=null,canPlay=false,locked=false,sequenceKey='',sequenceStarted=0,frame=null,alive=true;
 async function run(operation,index,text){if(!canPlay||locked)return;locked=true;root.setAttribute('aria-busy','true');updateDisabled();try{await onCommand?.(operation,index,text);}catch(error){status.textContent=error.message;onError(error);}finally{locked=false;root.setAttribute('aria-busy','false');if(alive)updateDisabled();}}
 function updateDisabled(){for(const {node,cell}of cells.values())node.disabled=!canPlay||locked||!cell.action;for(const n of actions.values())n.disabled=!canPlay||locked;answer.disabled=submit.disabled=!canPlay||locked;}
 form.addEventListener('submit',event=>{event.preventDefault();void run('guess',undefined,answer.value);});
 function update(data){if(!alive)return;const model=arcadeVisualModel(data);current=model;canPlay=data.canPlay!==false&&!model.done;root.dataset.game=model.type;root.dataset.done=String(model.done);root.style.setProperty('--arcade-accent',model.theme.color);title.textContent=model.theme.name;score.textContent=(['slots','poker','trivia'].includes(model.type)?'CREDITS ':'SCORE ')+model.score;if(status.textContent!==model.text)status.textContent=model.text;
  board.style.setProperty('--arcade-columns',model.columns);board.classList.toggle('arcade-motion',model.motion);board.hidden=!model.cells.length;root.dataset.spectator=String(data.canPlay===false);
  const indexes=new Set();for(const c of model.cells){indexes.add(c.index);let entry=cells.get(c.index);if(!entry){const n=node('button','arcade-cell',tiles);n.type='button';entry={node:n,cell:c};n.addEventListener('click',()=>{const action=entry.cell.action;if(action)void run(action.operation,action.index);});cells.set(c.index,entry);}const n=entry.node,changed=n.textContent!==c.text||n.dataset.tone!==c.tone;entry.cell=c;n.textContent=c.text;n.dataset.tone=c.tone;if(!model.sequence?.length)n.dataset.lit='false';n.dataset.selected=String(Boolean(c.selected));n.style.setProperty('--tile-level',c.level||0);n.style.gridColumn=c.gridX===undefined?'':String(c.gridX+1);n.style.gridRow=c.gridY===undefined?'':String(c.gridY+1);n.setAttribute('aria-label',(model.type==='poker'?'Card ':model.type==='dotsboxes'?'Edge ':'Cell ')+(c.index+1)+': '+(c.text||c.tone)+(c.selected?' · selected':''));n.setAttribute('aria-pressed',String(Boolean(c.selected)));if(changed&&n.animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)n.animate([{filter:'brightness(1.7)',transform:'scale(.94)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:230});}
  for(const [key,entry]of cells)if(!indexes.has(key)){entry.node.remove();cells.delete(key);}
  const ids=new Set();for(const entity of model.entities){ids.add(entity.id);let n=sprites.get(entity.id);if(!n){n=node('span','arcade-sprite',entities);n.setAttribute('aria-hidden','true');sprites.set(entity.id,n);}n.className='arcade-sprite '+entity.tone;n.textContent=entity.text;n.style.left=(entity.index%10*10)+'%';n.style.top=(Math.floor(entity.index/10)*10)+'%';}for(const [key,n]of sprites)if(!ids.has(key)){n.remove();sprites.delete(key);}
  const buttonIds=new Set();model.buttons.forEach((b,i)=>{const key=b.operation+':'+b.index;buttonIds.add(key);let n=actions.get(key);if(!n){n=node('button','arcade-action',controls);n.type='button';n.addEventListener('click',()=>void run(b.operation,b.index));actions.set(key,n);}n.textContent=b.label;n.style.setProperty('--action-order',i);});for(const [key,n]of actions)if(!buttonIds.has(key)){n.remove();actions.delete(key);}
  form.hidden=!model.input;if(model.input){let text=label.querySelector('span');if(!text){text=document.createElement('span');label.prepend(text);}text.textContent=model.input.label;answer.maxLength=model.input.maxLength;answer.setAttribute('aria-label',model.input.label);answer.inputMode=model.type==='codebreaker'?'numeric':'text';}
  if(model.history?.length){history.hidden=false;const rows=model.history.map(row=>row.guess+' · '+row.exact+' exact / '+row.misplaced+' misplaced').join('\n');if(history.textContent!==rows)history.textContent=rows;}else history.hidden=true;
  if(model.misses!==undefined){art.hidden=false;if(art.dataset.misses!==String(model.misses)){art.dataset.misses=String(model.misses);art.replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 220 150');svg.setAttribute('width','220');svg.setAttribute('height','150');const paths=['M20 140H150M55 140V12H140V30','M140 30a16 16 0 1 0 .1 0','M140 62V104','M140 72L115 90','M140 72L165 90','M140 104L120 130','M140 104L160 130'];paths.forEach((d,i)=>{if(i>model.misses)return;const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','5');path.setAttribute('stroke-linecap','round');svg.append(path);});art.append(svg);}}else if(model.boxes){art.hidden=false;art.textContent=model.boxes.map(v=>v===1?'🟦':v===2?'🟪':'⬚').join('  ');}else{art.hidden=true;delete art.dataset.misses;}
  const key=JSON.stringify(model.sequence||[]);if(key!==sequenceKey){sequenceKey=key;sequenceStarted=performance.now();}if(model.type==='simon'&&model.sequence?.length&&!frame)frame=requestAnimationFrame(sequenceFrame);updateDisabled();
 }
 function sequenceFrame(now){frame=null;if(!alive||current?.type!=='simon'||!current.sequence?.length)return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){for(const {node:n}of cells.values())n.dataset.lit='false';return;}const i=Math.floor((now-sequenceStarted)/650),lit=(now-sequenceStarted)%650<430?current.sequence[i]:-1;for(const [index,{node:n}]of cells)n.dataset.lit=String(index===lit);if(i<current.sequence.length&&!document.hidden)frame=requestAnimationFrame(sequenceFrame);}
 return {update,dispose(){alive=false;if(frame)cancelAnimationFrame(frame);root.remove();}};
}
