import {RESIDENT_RIDDLES as riddles,residentRiddlePool,residentJokePool} from './server-resident-humor.mjs';
import {residentHash} from './public/js/resident-personalities.js';

export const RESIDENT_PLAY_CHOICES=[
 ['resident-riddle','Play a riddle'],['resident-rather','Would you rather?'],['resident-story','Make a silly story together'],['resident-highfive','High five!'],['resident-dance','Show me your dance'],
 ['resident-answer-a','Choose A'],['resident-answer-b','Choose B'],['resident-reveal','Reveal the answer'],['resident-play-stop','End our mini-game']
].map(([id,label])=>({id,label}));
const localPairs={park:['give a tree a tiny hat','teach a mushroom to dance'],music:['play a concert for clouds','form a band with singing teapots'],arcade:['race a giant rubber duck','play pinball on the moon'],harbor:['sail a boat made of toast','be captain of a floating garden'],airport:['fly a paper-plane airliner','give the clouds silly names'],construction:['build a bouncy castle skyscraper','design a house for a giant snail'],factory:['invent a snack-sorting robot','build a machine that folds clouds'],skiing:['ski down a mountain of marshmallows','wear skis that sing'],basketball:['play with a squeaky basketball','have a hoop that cheers every pass'],hockey:['skate with a penguin team','play with a glowing puck']};
const formLines={mossling:'My leaves are rustling with excitement.',foxfolk:'My tail has already voted yes.',automaton:'Activating my completely unnecessary celebration circuit.',human:'I have been saving my best celebration for this.'};
const clean=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,120);
const normalizeGuess=value=>clean(value).toLowerCase().replace(/[.!?]+$/,'').replace(/^(?:i think (?:it is|it.s)|it is|it.s|the answer is)\s+/,'').replace(/^(?:a|an|the) /,'');
export function residentPlayIntent(choice,message,intent,memory,now){
 if(RESIDENT_PLAY_CHOICES.some(item=>item.id===choice))return choice.slice(9);
 if(/\b(?:stop|end|quit) (?:our |the |this )?(?:mini[ -]?game|riddle|story)\b/i.test(message))return 'play-stop';
 if(memory.play?.expiresAt>now&&/\b(?:reveal|give up|tell me the answer)\b/i.test(message))return 'reveal';
 if(memory.play?.kind==='riddle'&&memory.play.expiresAt>now&&riddles[memory.play.index]?.aliases.some(alias=>alias===normalizeGuess(message)))return 'play-answer';
 if(/\b(high[ -]?five|fist bump)\b/i.test(message))return 'highfive';
 if(/\b(dance|dance-off)\b/i.test(message))return 'dance';
 if(/\b(riddle|brain teaser)\b/i.test(message))return 'riddle';
 if(/\bwould you rather\b/i.test(message))return 'rather';
 if(/\b(make|start|silly|continue|our)\b.*\bstory\b/i.test(message))return 'story';
 if(memory.play?.expiresAt>now&&['followup','question'].includes(intent)&&message&&!message.includes('?'))return 'play-answer';
 return intent;
}
export function residentPlay(info,memory,intent,message,now){
 if(memory.play?.expiresAt<=now)delete memory.play;
 const seed=residentHash((info.personalityId||info.name)+'|'+(memory.visits||0)),form=info.appearance?.form||info.identity?.form||'human',flair=formLines[form]||formLines.human;
 const place=clean(info.placeName)||'the local square';let text='',gesture=null;
 if(intent==='play-stop'){delete memory.play;text='Mini-game ended. We can chat, explore, or try something else whenever you like.';}
 else if(intent==='highfive'){text='High five, teammate! '+flair+' That deserves a victory pose.';gesture='cheer';}
 else if(intent==='dance'){text=flair+' Here comes my '+({mossling:'leaf shuffle',foxfolk:'tail-twist two-step',automaton:'clockwork pop-and-lock'}[form]||'tiny victory shuffle')+'! Your turn: invent a name for your best move.';gesture='dance';}
 else if(intent==='riddle'){
  const pool=residentRiddlePool(info),round=Math.max(0,Math.floor(Number(memory.riddleRound)||0));
  const index=pool[(residentHash(info.personalityId||info.name)+round)%pool.length];memory.riddleRound=(round+1)%1000000;
  memory.play={kind:'riddle',index,attempts:0,expiresAt:now+300000};text='Riddle time at '+place+'! '+riddles[index].question+' Type your guess, or choose Reveal the answer.';
 }else if(intent==='rather'){
  const pair=localPairs[info.context?.kind]||['explore with a talking backpack','travel with a tiny dragon guide'];
  memory.play={kind:'rather',pair:[...pair],favorite:seed%2,expiresAt:now+300000};text='Would you rather A: '+pair[0]+', or B: '+pair[1]+'? Choose A or B, or type your own idea.';
 }else if(intent==='story'&&memory.play?.kind!=='story'){
  memory.play={kind:'story',turn:0,expiresAt:now+300000};text='Let’s make a tiny story together. At '+place+', a '+({mossling:'mushroom wearing roller skates',automaton:'robot with a hiccuping compass',foxfolk:'fox with a backpack full of stars'}[form]||'duck in an enormous hat')+' discovered a mysterious button. What happened next? Type a sentence, or choose A for a surprise visitor or B for a magical object.';
 }else if(['play-answer','answer-a','answer-b','reveal','story'].includes(intent)){
  const play=memory.play;
  if(!play)text='Our last mini-game has ended. Choose a riddle, a would-you-rather question, or a new silly story.';
  else if(play.kind==='riddle'){
   const riddle=riddles[play.index],guess=normalizeGuess(message);
   if(intent==='reveal'||riddle.aliases.some(alias=>alias===guess)){text=intent==='reveal'?'The answer is '+riddle.answer+'!':'You got it: '+riddle.answer+'! '+flair;delete memory.play;gesture='cheer';}
   else{play.attempts++;text=play.attempts>=2?'The answer is '+riddle.answer+'. Good guessing! Shall we try something else?':'Good guess! Here is a hint: '+riddle.hint+' Try again or reveal the answer.';if(play.attempts>=2)delete memory.play;}
  }else if(play.kind==='rather'){
   const picked=intent==='answer-a'||/^a\b/i.test(message)?0:intent==='answer-b'||/^b\b/i.test(message)?1:null;
   text=picked===null?'An original idea! I would choose to '+play.pair[play.favorite]+'. '+flair:(picked===play.favorite?'We picked the same adventure! ':'We would make an interesting team! ')+'I would '+play.pair[play.favorite]+'. What a day that would be at '+place+'.';delete memory.play;gesture='laugh';
  }else{
   const contribution=intent==='answer-a'?'a tap-dancing visitor appeared':intent==='answer-b'?'a floating umbrella lit up':clean(message)||'a mysterious door opened';
   play.turn++;text='Then '+contribution.replace(/[.!?]+$/,'')+'. '+(play.turn>=2?'Everyone at '+place+' celebrated with a ridiculous victory dance. The end! We made a wonderfully strange team.':'The button sneezed confetti and a tiny voice said, “We need a name for this adventure!” What should we call it?');if(play.turn>=2){delete memory.play;gesture='cheer';}
  }
 }else {if(['bye','cancel','decline'].includes(intent))delete memory.play;return null;}
 return {text,gesture,play:memory.play?{kind:memory.play.kind,expiresAt:memory.play.expiresAt}:null};
}
export function residentPlayChoices(play){
 const ids=play?.kind==='riddle'?['resident-reveal','resident-play-stop']:play?['resident-answer-a','resident-answer-b','resident-play-stop']:[];
 return RESIDENT_PLAY_CHOICES.filter(item=>ids.includes(item.id));
}

export function residentPlayJoke(info,round=0){
 const lines=residentJokePool(info);
 return lines[(residentHash(info.personalityId||info.name)+Math.max(0,Math.floor(Number(round)||0)))%lines.length];
}
