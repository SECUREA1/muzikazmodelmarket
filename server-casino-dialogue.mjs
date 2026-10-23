import {casinoResidentIntelligence,observeCasinoInteraction} from './server-casino-residents.mjs';
import {casinoTaskCommand,casinoTaskOffer,noteCasinoTaskConversation} from './server-casino-tasks.mjs';

export const CASINO_DIALOGUE_CHOICES=[
 ['day','How is your evening?'],['question','Ask about the casino'],['casino-activity','What are you doing now?'],['casino-personality','Tell me about yourself'],['casino-rules','Explain your game'],['casino-staff','Who can help me?'],['casino-skills','Our skills and progress'],['casino-task','Could I help with something?'],['casino-accept','Accept this casino favor'],['casino-progress','Casino favor progress'],['casino-confirm','Confirm casino checkpoint'],['casino-cancel','Cancel casino favor'],['joke','Share something amusing'],['thanks','Thank you'],['bye','See you later']
].map(([id,label])=>({id,label}));
const ruleBook={
 poker:'Five-card draw starts with five cards. Hold any cards you want to keep, then draw once. Jacks or better returns your stake; the panel lists every winning hand. We use a fresh server-shuffled deck for each round.',
 blackjack:'Try to get closer to twenty-one than the dealer without going over. Hit draws a card; Stand ends your turn. Aces count as one or eleven. The dealer stands on all seventeens. This table has no splitting, insurance or doubling.',
 roulette:'This is a single-zero European wheel: zero through thirty-six. Red, black, odd and even return twice the wager when they win; a single number returns thirty-six times. Zero loses the even-money bets. Every spin is independent.',
 dice:'Call low for a total of two to six, high for eight to twelve, or seven exactly. Two fair dice decide the result. Low and high return twice the wager, while seven returns five times. The panel shows your total before the next round.',
 slots:'The slot machine draws three independent symbols. Three matches return twenty times the wager; exactly two return your stake. Timing the button does not change the result.'
};
const directions={poker:'The two five-card draw tables are in the west salon, on the left of the central promenade.',blackjack:'Blackjack is in the east salon, on the right of the central promenade.',roulette:'The roulette table is at the back of the west wing, before the vault corridor.',dice:'Hosted dice is at the back of the east wing, opposite roulette.',slots:'Six slot machines line each side gallery. Leave space behind their chairs as you pass.',vendor:'Theo serves water, coffee and snacks at the Velvet Lounge counter in the southwest lobby.',cashier:'Sofia is at the southeast cashier counter. The nearby ATM shows the same MZK wallet balance and recent receipts.',vault:'The bank vault is at the back, beyond the public corridor. Its safe door is locked; Marcus and Imani patrol the public approaches.'};
const jokes={guard:['The vault has a fantastic poker face. It has never given anything away.','My partner calls this a short patrol. I call it a very thorough appreciation of the carpet.'],dealer:['My cards asked for a break. I told them we would deal with it.','The best hand I have seen tonight was a guest helping someone find their seat.'],vendor:['The coffee is excellent at holding a conversation. It always perks people up.','I tried counting the snacks. They keep disappearing into very convincing alibis.'],cashier:['My favourite kind of drama is a receipt that balances on the first try.','Someone asked for change of scenery. I pointed them toward the lounge.'],host:['My floor tour has excellent odds of finding the snack counter.','I know every shortcut here. They all mysteriously pass the refreshments.'],guest:['I practised my poker face, then the vendor offered snacks and ruined everything.','My biggest win tonight was remembering where I parked my coat.']};
const gameIn=text=>['blackjack','roulette','poker','slots','dice'].find(game=>new RegExp('\\b'+(game==='slots'?'slots?|machines?':game)+'\\b','i').test(text));
const trim=value=>String(value||'').trim().slice(0,180);
function relationship(player,npc,now){
 player.casinoSocial ||= {};
 const memory=player.casinoSocial[npc.id] ||= {visits:0,affinity:0,preferences:{},turns:[],topic:'greeting',lastAt:now};
 const records=Object.entries(player.casinoSocial).sort((a,b)=>b[1].lastAt-a[1].lastAt);
 for(const [id]of records.slice(24))if(id!==npc.id)delete player.casinoSocial[id];
 return memory;
}
function socialSummary(memory){return {affinity:memory.affinity,visits:memory.visits,topic:memory.topic,rememberedGame:memory.preferences?.game||null};}
function intentFor(choice,text,memory){
 if(choice.startsWith('casino-')&&(!text||['casino-accept','casino-confirm','casino-cancel','casino-progress'].includes(choice)))return choice.slice(7);
 if(!text)return choice;
 if(/\b(bye|goodbye|see you|good night)\b/i.test(text))return 'bye';
 if(/\b(remember|last time|told you|know about me|say earlier|said earlier)\b/i.test(text))return 'memory';
 if(/\b(cancel|never mind|changed my mind)\b/i.test(text))return 'cancel';
 if(/\b(accept|i(?:'ll| will| can) help|let me help|yes.*favor|yes.*favour)\b/i.test(text))return memory.topic==='task'?'accept':'task';
 if(/\b(confirm|check.?in|delivered|finished.*stop)\b/i.test(text))return 'confirm';
 if(/\b(progress|next stop|what.*next|where.*marker)\b/i.test(text))return 'progress';
 if(/\b(task|favor|favour|job|errand|need.*help|can i help|anything.*help|something.*do)\b/i.test(text))return 'task';
 if(/\b(i (?:really )?(?:like|love|enjoy|prefer)|my (?:favourite|favorite)|i(?:'m| am) into)\b/i.test(text)&&gameIn(text))return 'preference';
 if(/\b(tired|thirsty|hungry|overwhelmed|nervous|new here|first visit|first time)\b/i.test(text))return 'feeling';
 if(/\b(skill|learned|practise|practice|talent|good at|experience|teach me|learn to)\b/i.test(text))return 'skills';
 if(/\b(who.*(you|yourself)|tell me about yourself|backstory|personality|why.*work|why.*here|your.*(?:favourite|favorite)|hobbies|interests)\b/i.test(text))return 'personality';
 if(/\b(doing|activity|working on|busy with|right now|what happened|happening|news)\b/i.test(text))return 'activity';
 if(/\b(where|find|directions|way to|which wing)\b/i.test(text))return 'directions';
 if(/\b(who|staff|host|dealer|guard|vendor|cashier)\b/i.test(text)&&!gameIn(text))return 'staff';
 if(/\b(rule|payout|odds|winning|win|play|deal|hit|stand|hold|bet)\b/i.test(text)||gameIn(text))return 'rules';
 if(/\b(joke|funny|laugh|amusing)\b/i.test(text))return 'joke';
 if(/\b(thank|thanks|appreciate)\b/i.test(text))return 'thanks';
 if(/\bhelp\b/i.test(text))return 'help';
 if(/how are you|how.*(day|evening)|hello|\bhi\b/i.test(text))return 'day';
 return 'followup';
}
function activityReply(sim,npc,intelligence){
 const info=npc.resident,goal=intelligence.goal||info.goal;
 const target=goal?.targetId&&sim.actors[goal.targetId]?.resident?.name;
 let text='Right now I am '+(intelligence.activity||info.task||'checking the public floor')+'.';
 if(target)text+=' I am meeting '+target+' next.';
 else if(goal?.kind)text+=' My next plan is '+String(goal.kind).replaceAll('-',' ')+'.';
 const recent=(info.memory||[]).filter(item=>item.text&&item.kind!=='player-conversation').at(-1);
 if(recent)text+=' '+trim(recent.text)+(/\.$/.test(recent.text)?'':'.');
 const game=intelligence.gameState||info.gameState;
 if(game?.phase&&info.duty==='guest')text+=' My practice session is '+game.phase+(game.game?' at '+game.game:'')+'.';
 return text;
}
function staffReply(sim,requested){
 const cast=Object.values(sim.actors).filter(actor=>actor.resident?.casino);
 const staff=cast.filter(actor=>requested?new RegExp(requested,'i').test(actor.resident.role+' '+actor.resident.duty):['host','cashier','vendor','guard'].includes(actor.resident.duty)).slice(0,5);
 return (staff.length?staff.map(actor=>actor.resident.name+' is our '+actor.resident.role.toLowerCase()).join('; ')+'. ':'Our hosts, dealers, cashier, vendor and two guards are on the public floor. ')+'You can approach them and ask a question. A dealer explains their own table, and the hosts can offer a walking favor.';
}
function personalityReply(info,intelligence){
 const personality=intelligence.personality;
 const trait=typeof personality==='string'?personality:personality?.trait||personality?.description||personality?.style;
 const background=typeof intelligence.backstory==='string'?intelligence.backstory.replace(new RegExp('^'+info.name.split(' ')[0]+'\\b'),'I').replace(/^I is\b/,'I am'):'';
 const preferences=intelligence.preferences||{};
 return 'I am '+info.name+', the '+info.role.toLowerCase()+'. '+(background||('I enjoy '+(info.duty==='guard'?'keeping busy places calm':info.duty==='dealer'?'making the rules clear before a hand begins':info.duty==='vendor'?'remembering what makes a guest comfortable':info.duty==='cashier'?'making every receipt easy to understand':'helping people find their place on the floor')+'.'))+(trait?' My colleagues describe me as a '+trait.toLowerCase()+'.':'')+(preferences.conversation?' I enjoy talking about '+preferences.conversation+'.':'')+(preferences.games?.[0]?' I am especially interested in '+preferences.games[0]+'.':'');
}

/** Contextual deterministic dialogue: answers come from live role, plans,
 * observations and bounded player-specific memory, never invented wallet data. */
export function casinoDialogue(sim,player,npc,choice,text,now){
 const info=npc.resident,memory=relationship(player,npc,now),message=trim(text),previousMessage=memory.lastPlayerMessage;
 const intent=intentFor(choice,message,memory),intelligence=casinoResidentIntelligence(info)||{},game=gameIn(message)||info.game||memory.preferences.game;
 const visit=memory.visits,variant=visit%3;
 let reply='',offer=null,taskResult=null;
 const tasks=['task','accept','progress','confirm','cancel'];
 if(tasks.includes(intent)){
  taskResult=casinoTaskCommand(sim,player,npc,'casino-'+intent,now);reply=taskResult.text;offer=taskResult.offer||null;
  if(taskResult.completed)observeCasinoInteraction(sim,npc.id,{actorId:player.actorId,kind:'task-complete',text:player.username+' completed a '+player.casinoTask.kind+' favor',skill:taskResult.reward.skill,requestId:player.casinoTask.id},now);
 }else if(intent==='memory'){
  reply=visit?'Of course, '+player.username+'. We have spoken '+visit+' time'+(visit===1?'':'s')+'. '+(memory.preferences.game?'You told me you enjoy '+memory.preferences.game+'. ':'')+(memory.preferences.pace?'You prefer to take things '+memory.preferences.pace+'. ':'')+'Last time we were talking about '+memory.topic.replaceAll('-',' ')+'.':'This is our first proper conversation. Tell me which game interests you, or whether you would prefer a quiet tour.';
 }else if(intent==='preference'){
  memory.preferences.game=game;
  reply=['I will remember that you enjoy ','A good choice for a conversation. I will remember your interest in ','Then I know where to start next time: '][variant]+game+'. '+(info.game===game?'That is my table, so ask me about any part of a hand.':directions[game])+' Do you enjoy learning the rules or watching other people play?';
 }else if(intent==='feeling'){
  if(/first|new here/i.test(message)){memory.preferences.pace='slowly';reply='Welcome. There is no rush to place a wager. Walk the promenade, watch a round, and ask the dealer to explain it. I can also offer a walking favor if you would like to learn the floor.';}
  else{memory.preferences.pace='at an easy pace';reply=/thirsty|hungry/i.test(message)?directions.vendor+' Check the posted MZK price before buying; the house supplies trays for service favors.':'It is fine to take a break. The lounge has seating, and nothing here requires you to keep playing. Would you prefer directions, a quiet chat, or a simple walking favor?';}
 }else if(intent==='skills'){
  const skills=intelligence.skills||info.skills||{},best=Object.entries(skills).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,value])=>name+' '+Math.round(Number(value)||0));
  reply='My strongest skills are '+(best.length?best.join(', '):info.duty==='guard'?'observation and calm communication':'listening and looking after guests')+'. '+(game?ruleBook[game]+' ':'')+casinoTaskCommand(sim,player,npc,'casino-skills',now).text+' Game practice records familiarity; it never changes a random draw or guarantees a win.';
 }else if(intent==='personality')reply=personalityReply(info,intelligence);
 else if(intent==='activity')reply=activityReply(sim,npc,intelligence);
 else if(intent==='staff'){
  const role=/guard|security|vault/i.test(message)?'guard':/dealer/i.test(message)?'dealer':/vendor|drink|coffee/i.test(message)?'vendor':/cashier|receipt|wallet/i.test(message)?'cashier':/host/i.test(message)?'host':null;
  reply=staffReply(sim,role);
 }else if(intent==='directions'){
  const place=game||(/vault|safe|bank/i.test(message)?'vault':/cashier|atm|wallet|receipt/i.test(message)?'cashier':/bar|lounge|coffee|drink|snack|vendor/i.test(message)?'vendor':null);
  reply=place?directions[place]:'The broad central promenade runs from the lobby to the public vault corridor. Poker and roulette are west; blackjack and hosted dice are east. The lounge is southwest, and the cashier and ATM are southeast.';
 }else if(intent==='question'){
  reply=info.duty==='cashier'?'I check MZK wallet balances and settlement receipts. Your wagers and payouts use that same wallet automatically. The cashier and ATM panels show the balance and recent casino history.':info.duty==='vendor'?directions.vendor:info.duty==='guard'?directions.vault:game?ruleBook[game]:'This is Starlight Grand Casino. The central promenade connects the game salons, lounge, cashier and public vault corridor. Tell me which area interests you, and I can explain it.';
 }else if(intent==='rules'){
  reply=game?ruleBook[game]:'Walk to a table or machine and press E / Use. Poker, blackjack, roulette, dice and slots use your MZK wallet. The cashier and ATM show your MZK wallet balance and receipts. Ask me about one game and I can explain its rules.';
  const recent=player.casinoGameHistory?.filter(round=>round.game===game).at(-1);
  if(recent)reply+=' Your last completed '+game+' round was '+recent.outcome+'. We can talk through the rules, but the next random result is independent.';
 }else if(intent==='joke'){const pool=jokes[info.duty]||jokes.guest;reply=pool[visit%pool.length];}
 else if(intent==='thanks')reply=(memory.affinity>5?'It is a pleasure to see a familiar face, ':'You are welcome, ')+player.username+'. '+(player.casinoTask?.status==='active'?'Your next stop is '+player.casinoTask.checkpoints[player.casinoTask.index].name+'.':'Enjoy the floor at your own pace.');
 else if(intent==='bye')reply='See you around, '+player.username+'. '+(memory.preferences.game?'I will remember your interest in '+memory.preferences.game+'.':'Have a comfortable evening.');
 else if(intent==='help'){
  offer=casinoTaskOffer(npc);reply='I can explain the games, introduce the staff, or help you find your next stop. '+offer.description+' Choose Accept this casino favor if you want to help.';
 }else if(intent==='day')reply=(visit?'Good to see you again, ':'Welcome, ')+player.username+'. '+activityReply(sim,npc,intelligence)+' '+(visit&&memory.preferences.game?'How has '+memory.preferences.game+' been treating you?':info.duty==='guest'?'Which game are you curious about?':'Would you like directions, a rules explanation, or something useful to do?');
 else{
  if(/slow|quiet|take my time/i.test(message))memory.preferences.pace='slowly';
  reply=variant===0?'I hear you. ':variant===1?'That gives me something to think about. ':'Tell me a little more. ';
  reply+=(memory.preferences.game?'Since you enjoy '+memory.preferences.game+', we could talk about a hand or visit its table. ':previousMessage&&memory.topic!=='followup'?'We were just talking about '+memory.topic.replaceAll('-',' ')+'. ':'')+activityReply(sim,npc,intelligence)+' Is your question about the games, the staff, or what we could do together?';
 }
 memory.visits++;memory.affinity=Math.min(100,Math.max(-20,memory.affinity+(/\b(stupid|idiot|hate you)\b/i.test(message)?-2:1)));memory.lastAt=now;memory.topic=intent;memory.lastPlayerMessage=message||choice;memory.turns=[...memory.turns,{text:message||choice,intent,at:now}].slice(-6);
 noteCasinoTaskConversation(player,npc,now);
 observeCasinoInteraction(sim,npc.id,{actorId:player.actorId,kind:'player-conversation',text:player.username+' asked about '+intent,skill:'social',requestId:'conversation:'+player.actorId+':'+npc.id+':'+now},now);
 return {text:reply,intent,closed:intent==='bye',metadata:{relationship:socialSummary(memory),personality:intelligence.personality||null,backstory:intelligence.backstory||'',skills:intelligence.skills||info.skills||{},activity:intelligence.activity||info.task||'',taskOffer:offer}};
}
