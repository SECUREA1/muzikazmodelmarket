// Original carnival dialogue. The captions are exactly the words in each clip.
const CLIP_DURATIONS=Object.freeze({
 "welcome-shadow-ticket": 3225,
 "welcome-imaginary-friends": 6000,
 "car-nightmare-license": 4025,
 "car-five-clowns": 5075,
 "honk-if-haunted": 3250,
 "car-shadow-collection": 5800,
 "spinner-other-you": 3950,
 "spinner-ghost-balance": 3800,
 "water-nose-bath": 4125,
 "water-nervous-puddle": 3625,
 "jack-cranky-entrance": 4675,
 "jack-caught-giggles": 3875,
 "jack-bedtime-chase": 4575,
 "maze-reflection-plans": 4500,
 "maze-reflection-stays": 5050,
 "shoes-haunted-languages": 3875,
 "ticket-parking-fines": 4025,
 "wardrobe-your-size": 4100,
 "mask-water-bill": 4100,
 "shadow-clown-bargain": 3675,
 "toys-pretend-sleep": 3575,
 "lantern-suspicious-glow": 6675,
 "six-lost-laughs": 6825,
 "stage-fright-follows": 4750,
 "watch-nervous-nightlight": 6950,
 "nursery-toy-chest-breathing": 4325,
 "clock-screams-on-hour": 4225,
 "reflection-owes-rent": 3700,
 "portrait-blinked-first": 3850,
 "ghosts-demand-refund": 6825
});
const line=(id,event,speaker,voice,speed,style,text)=>Object.freeze({id,event,speaker,voice,speed,style,text,caption:text,url:'/public/audio/funhouse/voices/'+id+'.wav',durationMs:CLIP_DURATIONS[id]||null});

export const FUNHOUSE_CLOWN_LINES=Object.freeze([
 line('welcome-shadow-ticket','welcome','Madame Giggles','female',1.03,'playful greeter','Step right up! Your shadow already bought a ticket.'),
 line('welcome-imaginary-friends','welcome','The Ringmaster','male',.98,'theatrical host','Please keep your hands, feet, and imaginary friends inside the funhouse.'),
 line('car-nightmare-license','car-start','Honk the Driver','male',1.05,'boastful driver','Buckle up! I passed my driving test in a nightmare.'),
 line('car-five-clowns','car-start','Honk the Driver','male',1.03,'boastful driver','Four wheels, five clowns, and absolutely no sense of direction.'),
 line('honk-if-haunted','car-honk','Honk the Driver','male',1.07,'delighted driver','Honk if you are haunted! Oh, good. Me too.'),
 line('car-shadow-collection','car-complete','Honk the Driver','male',.99,'cheerful driver','We made it! Please collect your belongings, and whichever shadow is yours.'),
 line('spinner-other-you','spinner-start','Dotty the Juggler','female',1.03,'mischievous juggler','Around we go! If you see yourself waving, do not wave back.'),
 line('spinner-ghost-balance','spinner-hit','Dotty the Juggler','female',1.06,'delighted juggler','Perfect balance! The ghost in your hat is very impressed.'),
 line('water-nose-bath','water-hit','Professor Puddles','male',1.06,'silly showman','Right in the nose! Finally, a bath with an audience.'),
 line('water-nervous-puddle','water-miss','Professor Puddles','male',1.02,'teasing showman','Missed me! Your puddle is looking very nervous.'),
 line('jack-cranky-entrance','jack-wind','Jack the Fright','male',.96,'whispery prankster','Wind it gently. I get cranky before my grand entrance.'),
 line('jack-caught-giggles','jack-catch','Jack the Fright','male',1.06,'surprised prankster','You caught me! Most people only catch the giggles.'),
 line('jack-bedtime-chase','jack-miss','Jack the Fright','male',.97,'mock sinister prankster','Boo! Too slow. My bedtime stories have a chase scene.'),
 line('maze-reflection-plans','maze-start','The Mirror Keeper','female',.96,'mysterious storyteller','The mirrors are perfectly safe. The reflections have other plans.'),
 line('maze-reflection-stays','maze-complete','The Mirror Keeper','female',1.00,'mysterious storyteller','You found the exit! Your reflection says it might stay for one more ride.'),
 line('shoes-haunted-languages','dressup','Madame Giggles','female',1.06,'playful greeter','Lovely shoes! They squeak in several haunted languages.'),
 line('ticket-parking-fines','adventure:ticket-trick','The Ringmaster','male',1.03,'theatrical host','A disappearing ticket! Just like my parking fines.'),
 line('wardrobe-your-size','adventure:wardrobe-whisper','Madame Giggles','female',.98,'mischievous keeper','Open the wardrobe. My best skeleton is wearing your size.'),
 line('mask-water-bill','adventure:drowned-mask','Professor Puddles','male',1.01,'silly showman','That mask is smiling. I told it the water bill.'),
 line('shadow-clown-bargain','adventure:spinner-shadow','Dotty the Juggler','female',1.04,'mischievous juggler','Two shadows for one clown. Now that is a bargain.'),
 line('toys-pretend-sleep','adventure:playroom-secret','The Mirror Keeper','female',.95,'quiet storyteller','Shh. The toys are pretending to be asleep.'),
 line('lantern-suspicious-glow','adventure:last-laugh','The Ringmaster','male',.97,'theatrical host','The last laugh! I knew it was hiding behind that extremely suspicious glow.'),
 line('six-lost-laughs','adventure-complete','The Ringmaster','male',1.00,'proud host','Six lost laughs returned! The house promises to stop giggling at you. Probably.'),
 line('stage-fright-follows','ambient','The Mirror Keeper','female',.96,'dry comic storyteller','I used to have stage fright. Then the stage started following me.'),
 line('watch-nervous-nightlight','haunt-start','The Ringmaster','male',.99,'theatrical night watch host','Night Watch begins! Four lanterns, three minutes, and one very nervous nightlight.'),
 line('nursery-toy-chest-breathing','haunt:nursery-lantern','The Mirror Keeper','female',.95,'quiet comic storyteller','The toys are asleep. That breathing? Probably the toy chest.'),
 line('clock-screams-on-hour','haunt:clockwork-lantern','Jack the Fright','male',1.02,'delighted clockwork prankster','You stopped the clock! Now it only screams on the hour.'),
 line('reflection-owes-rent','haunt:mirror-lantern','The Mirror Keeper','female',.98,'dry comic storyteller','One reflection sealed. The other one owes me rent.'),
 line('portrait-blinked-first','haunt:portrait-lantern','Madame Giggles','female',1.03,'playful keeper','The portrait blinked first. I call that a professional victory.'),
 line('ghosts-demand-refund','haunt-complete','The Ringmaster','male',1.01,'proud theatrical host','Four lanterns lit! The ghosts demand a refund for excellent customer scaring.')
]);

export const FUNHOUSE_LINES_BY_EVENT=Object.freeze(Object.fromEntries([...new Set(FUNHOUSE_CLOWN_LINES.map(value=>value.event))].map(event=>[event,Object.freeze(FUNHOUSE_CLOWN_LINES.filter(value=>value.event===event))])));
const byId=new Map(FUNHOUSE_CLOWN_LINES.map(value=>[value.id,value]));

/** A stable rotation keeps repeat interactions varied without replaying a queue. */
export function funhouseClownLine(event,variant=0){
 const choices=Object.hasOwn(FUNHOUSE_LINES_BY_EVENT,event)?FUNHOUSE_LINES_BY_EVENT[event]:null;
 if(!choices?.length)return null;
 const index=Number.isFinite(variant)?Math.abs(Math.trunc(variant))%choices.length:0;
 return choices[index];
}
export function funhouseClownLineById(id){return byId.get(id)||null;}
