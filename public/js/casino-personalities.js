import {CASINO_RESIDENTS} from './casino-config.js';
export const CASINO_SKILLS=['poker','blackjack','roulette','dice','slots','baccarat','threecard','hospitality','security','social'];
export const casinoClamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
export function casinoHash(value){let result=2166136261;for(const character of String(value))result=Math.imul(result^character.charCodeAt(0),16777619);return result>>>0;}
// Avalanche each deterministic practice draw before reducing it to a range.
// Adjacent FNV suffixes alone have correlated low bits (notably modulo six).
export function casinoSample(seed,size){let value=casinoHash(seed);value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return ((value^(value>>>16))>>>0)%size;}
export const casinoPracticeDice=seed=>[1+casinoSample(seed+':die:0',6),1+casinoSample(seed+':die:1',6)];
export const casinoPracticeReels=seed=>[0,1,2].map(index=>casinoSample(seed+':reel:'+index,6));
export const casinoChoice=(values,seed)=>values[casinoHash(seed)%values.length];
const stories=[
 ['Steady protector','Marcus is a former theatre steward who remembers faces and keeps crowded evenings calm.','clear directions','blackjack','mint tea',.35,.95,.4,.25],
 ['Observant problem solver','Imani restored mechanical clocks before joining security; she notices small changes and explains boundaries without fuss.','how things work','roulette','sparkling water',.4,.9,.8,.3],
 ['Warm organizer','Amira grew up helping in a family guesthouse and loves matching a visitor with a good first experience.','travel stories','poker','citrus water',.95,.85,.7,.25],
 ['Curious connector','Jules is an amateur city guide who collects stories and introduces people with shared interests.','local discoveries','dice','coffee',.9,.7,.95,.35],
 ['Precise mentor','Sofia studied bookkeeping and finds satisfaction in explaining a confusing receipt clearly.','useful advice','blackjack','green tea',.55,.95,.55,.35],
 ['Playful craftsperson','Theo learned hospitality in a busy café and experiments with new alcohol-free refreshments between services.','food and hobbies','slots','spiced coffee',.85,.8,.85,.3],
 ['Patient strategist','Nora once organized a community chess club; she likes explaining why a careful card choice helps.','strategy','poker','black tea',.55,.95,.85,.7],
 ['Friendly analyst','Ellis is a puzzle maker who tracks patterns in decisions while respecting the chance in every draw.','puzzles','poker','citrus water',.7,.85,.9,.65],
 ['Calm coach','Maya used to teach swimming and now breaks blackjack decisions into manageable steps.','learning something new','blackjack','mint tea',.65,.95,.75,.55],
 ['Dry-witted professional','Leo is a keen gardener who brings the same patient attention to every blackjack hand.','quiet hobbies','blackjack','coffee',.5,.9,.65,.6],
 ['Reflective storyteller','Robin has travelled with a small jazz group and enjoys the stories shared around the roulette wheel.','music and travel','roulette','sparkling water',.8,.85,.8,.4],
 ['Energetic host','Alex organized community board-game nights and enjoys making a dice table welcoming to newcomers.','board games','dice','citrus water',.95,.7,.8,.6],
 ['Thoughtful learner','Avery is a design student practising patient choices and sketching the casino architecture during breaks.','design and strategy','poker','green tea',.6,.85,.95,.6],
 ['Sociable competitor','Morgan coaches a weekend quiz team and likes comparing a close poker hand with a friend.','friendly competition','poker','coffee',.9,.65,.75,.9],
 ['Independent explorer','Rowan restores bicycles and enjoys trying unfamiliar games one careful round at a time.','hands-on hobbies','poker','sparkling water',.45,.9,.95,.45],
 ['Methodical planner','Casey is a librarian who enjoys learning a game’s rules before taking a seat.','books and useful tips','blackjack','black tea',.45,.95,.8,.65],
 ['Generous encourager','Jamie volunteers at a community kitchen and cheers for a good decision even after an unlucky result.','cooking and community','blackjack','mint tea',.9,.85,.65,.35],
 ['Easygoing observer','Harper photographs old buildings and likes the rhythm of roulette while meeting people between spins.','architecture and travel','roulette','citrus water',.75,.85,.85,.3],
 ['Playful experimenter','Quinn makes little tabletop games and likes explaining what a dice result can and cannot tell you.','game design','dice','coffee',.85,.65,.95,.65],
 ['Quiet tinkerer','Reese repairs radios and likes the light and sound design of slot machines more than chasing a result.','music and machines','slots','green tea',.35,.9,.9,.25],
 ['Upbeat socializer','Riley runs a walking group and came to catch up with friends before trying a few games.','friends and weekend plans','slots','citrus water',.95,.65,.65,.3],
 ['Patient enthusiast','Sky is a florist with an eye for colour who enjoys a relaxed game and a friendly conversation.','creative hobbies','slots','mint tea',.8,.9,.75,.35]
];
const outfits=['#263b58','#263b58','#b79449','#9d7148','#476c62','#8e4c63','#294e49','#3b5369','#35594d','#4c475e','#485d63','#664b68','#9466a0','#4c8f96','#b47a63','#577db0','#8d6c99','#598677','#496d82','#4c7894','#9c617a','#747e51'];
export const CASINO_PERSONALITIES=Object.fromEntries(CASINO_RESIDENTS.map((source,index)=>{
 const [temperament,backstory,conversation,favourite,drink,sociability,patience,curiosity,competitiveness]=stories[index];
 const skills=Object.fromEntries(CASINO_SKILLS.map(skill=>[skill,12+casinoHash(source.id+skill)%24]));skills.social=Math.round(30+sociability*50);skills.hospitality=source.duty==='host'||source.duty==='vendor'||source.duty==='cashier'?76+index%12:25+index%16;skills.security=source.duty==='guard'?88+index:10+index%12;if(source.game)skills[source.game]=source.duty==='dealer'?82+index%10:24+index*3%38;
 const appearance={outfit:outfits[index],accent:['#d8b56b','#a2d0c6','#c2a3dd'][index%3],hair:['#32241e','#332a29','#5b3928','#746452','#161e27'][index%5],skin:['#b78361','#e5ba98','#76503d','#c99275','#946343'][index%5],hairstyle:['short','swept','curly','bob','bald','bun'][index%6],accessory:source.duty==='guard'?'watch':['glasses','earrings','necklace','watch','none'][index%5],height:.95+index%6*.025,build:.94+index%5*.035};
 const advanced=source.id.endsWith('guest-3')?'threecard':source.id.endsWith('guest-7')?'baccarat':null;
 if(source.id.endsWith('dealer-poker-2'))skills.threecard=86;if(source.id.endsWith('dealer-blackjack-2'))skills.baccarat=88;
 return [source.id,{id:source.id,name:source.name,temperament,backstory,preferences:{games:[...(advanced?[advanced]:[]),favourite,...['poker','blackjack','roulette','dice','slots'].filter(game=>game!==favourite).slice(index%3,index%3+2)],conversation,drink,room:advanced==='baccarat'?'high-limit salon':advanced==='threecard'?'three-card salon':index%2?'social lounge':'main floor'},traits:{sociability,patience,curiosity,competitiveness},appearance,skills}];
}));
export function casinoPersonality(id){return CASINO_PERSONALITIES[id]||CASINO_PERSONALITIES[CASINO_RESIDENTS[0].id];}
export function growCasinoSkill(skills,key,amount=.35){if(!CASINO_SKILLS.includes(key))return 0;const previous=casinoClamp(skills[key]),gain=casinoClamp(amount,0,1)*(1-previous/125);skills[key]=Math.round(casinoClamp(previous+gain)*100)/100;return skills[key]-previous;}
export function casinoSkillLevel(value){return value>=80?'Expert':value>=60?'Skilled':value>=35?'Practised':'Learning';}
export function casinoGoalUtilities(info,{queued=0,roundReady=false}={}){
 const profile=casinoPersonality(info.personalityId||info.id),needs=info.needs||{energy:75,social:55,fun:40,comfort:65},traits=profile.traits;
 if(info.duty==='guard')return [{kind:'service',score:queued?120:0},{kind:'patrol',score:80},{kind:'observe',score:35}];
 if(info.duty!=='guest')return [{kind:'service',score:queued?115:0},{kind:info.duty==='dealer'?'deal':info.duty==='host'?'guide':'prepare',score:roundReady?95:65},{kind:'social',score:(100-needs.social)*.4+traits.sociability*12}];
 return [{kind:'play',score:(100-needs.fun)*.8+traits.competitiveness*12+traits.curiosity*6-(needs.energy<25?75:0)},{kind:'social',score:(100-needs.social)*.9+traits.sociability*18},{kind:'refreshment',score:(100-needs.comfort)*.85+(needs.energy<40?12:0)},{kind:'rest',score:(100-needs.energy)*1.1+(needs.energy<25?40:0)}].sort((a,b)=>b.score-a.score);
}
