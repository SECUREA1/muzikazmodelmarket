import {projectExtraGame} from './extra-arcade-games.js';
import {pokerPayout} from './poker-rules.js';
import {newArcadeGame,arcadeMove} from './arcade-rules.js';
import {arcadePresentation,cardText} from './arcade-games.js';
export function createDeviceDemo(profile,rng=max=>Math.floor(Math.random()*max)){
 let game=profile.game?newArcadeGame(profile.game,rng):null,round=0,hand=[],holds=[],phase='deal',credits=100,message='',reels=['★','◆','7'];
 const draw=(count,excluded=[])=>{const deck=Array.from({length:52},(_,index)=>index).filter(card=>!excluded.includes(card)),cards=[];while(cards.length<count)cards.push(deck.splice(rng(deck.length),1)[0]);return cards;};
 return {move(operation,index,text){if(game)game=arcadeMove(game,{operation,index,text},rng);else if(profile.kind==='poker'){
   if(operation==='deal'){if(phase==='hold')throw Error('Draw to finish this hand first.');hand=draw(5);holds=[];phase='hold';credits--;message='Choose cards to hold, then draw.';}
   else if(operation==='hold'){if(phase!=='hold'||!Number.isInteger(index)||index<0||index>4)throw Error('Choose a card in the current hand.');holds=holds.includes(index)?holds.filter(value=>value!==index):[...holds,index];}
   else if(operation==='draw'){if(phase!=='hold')throw Error('Deal first.');const cards=draw(5-holds.length,hand);hand=hand.map((card,index)=>holds.includes(index)?card:cards.shift());const award=pokerPayout(hand);credits+=award;phase='result';message='Demo award +'+award;}
  }else if(profile.kind==='slots'){reels=Array.from({length:3},()=>['★','◆','7','●','♥','♣'][rng(6)]);const award=new Set(reels).size===1?20:new Set(reels).size===2?2:0;credits+=award-1;message='Demo award +'+award;}
  else{round++;message=index===0?'Correct: arcade machines use practice credits.':'Try again: choose practice credits.';}return this.view();},reset(){round=0;hand=[];holds=[];phase='deal';credits=100;message='';reels=['★','◆','7'];game=profile.game?newArcadeGame(profile.game,rng):null;return this.view();},view(){
  if(game)return {...arcadePresentation(projectExtraGame(game)),type:game.type,done:game.done};
  if(profile.kind==='slots')return {text:'Demo reels · '+reels.join('  ')+' · '+credits+' demo credits · '+message,buttons:[['Spin demo reels','spin']]};
  if(profile.kind==='poker')return {text:'Demo poker · '+hand.map((card,index)=>cardText(card)+(holds.includes(index)?' [held]':'')).join('  ')+' · '+credits+' demo credits · '+message,buttons:phase==='hold'?[...hand.map((card,index)=>[(holds.includes(index)?'Release ':'Hold ')+cardText(card),'hold',index]),['Draw','draw']]:[['Deal demo hand','deal']]};
  if(profile.kind==='trivia')return {text:message||'Which credits do arcade machines use?',buttons:[['Practice credits','answer',0],['Wallet MZK','answer',1],['Land deeds','answer',2]]};
  return {text:profile.kind==='market'?'Preview equipment, furniture and arcade cabinets. Open the live marketplace for actual items.':profile.kind==='board'?'Preview a local notice before sharing.':'Built-in media test card · no upload or camera required.',buttons:[]};
 }};
}
export function mountDeviceDemo(parent,profile){
 const details=document.createElement('details');details.className='device-demo';details.addEventListener('click',event=>event.stopPropagation());parent.append(details);
 const summary=document.createElement('summary');summary.textContent='Try built-in demo · local preview';details.append(summary);
 const note=document.createElement('p');note.textContent='Local demonstration. Shared playback, live rounds and your wallet stay unchanged.';details.append(note);
 const body=document.createElement('div');body.tabIndex=0;body.setAttribute('aria-label','Demo game controls');details.append(body);
 const demo=createDeviceDemo(profile);let timer=null,playing=false,frame=0,status,alive=true,audio=null;
 const button=(label,run,container=body)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.addEventListener('click',run);container.append(node);return node;};
 function move(operation,index,text){try{demo.move(operation,index,text);render();}catch(error){playing=false;status.textContent=error.message;}}
 function render(){const focused=body.contains(document.activeElement);body.replaceChildren();const view=demo.view();status=document.createElement('p');status.setAttribute('role','status');status.textContent=view.text;body.append(status);
  if(view.cells){const grid=document.createElement('div');grid.className='device-demo-grid';grid.style.setProperty('--demo-columns',view.columns);body.append(grid);view.cells.forEach((text,index)=>{const interactive=(['memory','tictactoe','mines','lights'].includes(view.type)||view.cellInput)&&!view.done&&!(view.disabledCells||[]).includes(index),node=interactive?button(text,()=>move('cell',index),grid):document.createElement('span');if(!interactive){node.textContent=text;grid.append(node);}node.setAttribute('aria-label','Cell '+(index+1)+': '+text);});}
  for(const [label,operation,index]of view.buttons||[])button(label,()=>move(operation,index));
  if(view.input){const label=document.createElement('label');label.textContent=view.input.label;const answer=document.createElement('input');answer.maxLength=view.input.maxLength;answer.setAttribute('aria-label',view.input.label);label.append(answer);body.append(label);button('Submit answer',()=>move('guess',undefined,answer.value));}
  button('Restart demo',()=>{demo.reset();render();});
  if(['snake','pong','breakout'].includes(view.type))button(playing?'Pause demo':'Run demo',()=>{playing=!playing;render();});
  if(['video','audio','image'].includes(profile.kind)){
   const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;canvas.className='device-demo-screen';canvas.setAttribute('aria-label','Local media test card');body.append(canvas);draw(canvas);
   button(playing?'Pause test card':'Play test card',()=>{playing=!playing;render();});
   if(profile.kind==='audio')button('Hear demo tone',async()=>{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){status.textContent='Audio preview unavailable.';return;}try{await audio?.close();audio=new Audio();const gain=audio.createGain(),osc=audio.createOscillator();osc.connect(gain);gain.connect(audio.destination);await audio.resume();if(!alive){await audio.close();return;}gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.5);osc.frequency.setValueAtTime(440,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(880,audio.currentTime+.4);osc.start();osc.stop(audio.currentTime+.5);}catch(error){playing=false;status.textContent=error.message;}});
  }
  if(profile.kind==='board'){const text=document.createElement('textarea');text.maxLength=1000;text.setAttribute('aria-label','Local notice preview');body.append(text);button('Preview notice',()=>{status.textContent=text.value||'Your notice appears here.';});}
  if(profile.kind==='market')for(const name of ['Equipment','Furniture','Arcade cabinets'])button(name,()=>{status.textContent=name+' selected in the demo. Open the live marketplace for actual items.';});
  if(focused)body.focus({preventScroll:true});
 }
 function draw(canvas){const ctx=canvas.getContext('2d');if(!ctx)return;ctx.fillStyle='#071221';ctx.fillRect(0,0,480,270);for(let i=0;i<7;i++){ctx.fillStyle=['#67dfa3','#ffcf70','#cc96ff','#76dfff','#ff8a80','#a4e775','#fca6d7'][i];ctx.fillRect(i*69,60,69,135);}ctx.fillStyle='#071221';ctx.fillRect(frame*9%450,90,30,65);ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.fillText('MUZIKAZ · LOCAL DEMO',24,35);ctx.font='16px sans-serif';ctx.fillText('Media ready · no upload needed',24,237);}
 details.addEventListener('toggle',()=>{if(!alive)return;if(details.open){render();timer ||= setInterval(()=>{if(!playing||document.hidden)return;frame++;if(profile.game){if(demo.view().done){playing=false;render();return;}move('step');}else{const canvas=body.querySelector('canvas');if(canvas)draw(canvas);}},250);}else{clearInterval(timer);timer=null;playing=false;audio?.suspend().catch(()=>{});}});
 details.addEventListener('keydown',event=>{event.stopPropagation();const operation={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[event.key];if(operation&&details.open&&['snake','maze','pong','breakout'].includes(demo.view().type)&&!event.target.matches('input,textarea,button,summary')){event.preventDefault();move(operation);}});
 return {dispose(){alive=false;clearInterval(timer);audio?.close().catch(()=>{});details.remove();}};
}
