// The carnival's reusable assemblies share identities across the renderer,
// editable map, authenticated market, Backpack and room placement runtimes.
const item=(name,description,dimensions,{type='props',priceMzk=100,kind=null,approach=null,...settings}={})=>Object.freeze({
 name,description:description+' From Midnight Laughs Funhouse.',dimensions:Object.freeze(dimensions),
 type,category:'funhouse',collection:'Clown funhouse',priceMzk,kind,
 thumbnailUrl:'/public/images/funhouse/midnight-laughs.svg',
 ...(approach?{approach:Object.freeze(approach)}:{}),...settings
});
const authoredItems={
 'funhouse-horror-house':item('Midnight Laughs Horror House','Enterable striped horror house with a giant grinning clown mouth, glowing eyes, propeller marquee and crooked mirror passages.',[49.6,22.917,38.295],{priceMzk:900,kind:'mirrors',approach:{x:-8,y:0,z:9}}),
 'funhouse-mirror-wall':item('Crooked Mirror Wall','A solid cyan-edged mirror partition with gold frames and crooked reflection details.',[19.619,3.32,.44],{priceMzk:65}),
 'funhouse-maze-bell':item('Mirror Maze Exit Bell','Gold carnival bell and red support post marking a successful mirror-maze finish.',[8,4.3,2.42],{priceMzk:85,kind:'maze-finish',approach:{x:0,y:0,z:2}}),
 'funhouse-water-gallery':item('Splash the Clowns Water Gallery','Striped shooting-gallery counter with six creepy clown targets, mounted toy water blasters, marquee and animated splash effects.',[20,6.19,14.7],{priceMzk:650,kind:'water',approach:{x:0,y:0,z:9}}),
 'funhouse-water-gun':item('Carnival Water Blaster','A portable mint and orange toy water gun with a tank, grip, trigger guard and spray nozzle.',[.48,.97,1.41],{type:'tools',priceMzk:50,funhouseTool:'water'}),
 'funhouse-clown-target':item('Splash Gallery Clown Target','A creepy pallid clown target with angular dark makeup, a toothy grin, a conical hat, glowing cyan target ring and a springing support stem.',[2.01,3.22,.96],{priceMzk:55}),
 'funhouse-clown-car':item('Impossible Clown Car','Tiny detailed carnival car with four wheels, a steering wheel, squeeze horn and a surprise creepy-clown passenger show. This is a honking attraction.',[14,5.375,14],{priceMzk:450,kind:'car',approach:{x:-4,y:0,z:3}}),
 'funhouse-dizzy-spinner':item('Dizzy Hat Spinner','Six-cup carnival spinner under a giant animated propeller hat, with colorful arms and illuminated platform edging.',[15,6.307,15.3],{priceMzk:600,kind:'spinner',approach:{x:-4,y:0,z:6}}),
 'funhouse-dressing-room':item('Clown Dressing Room','Striped wardrobe canopy, costume display tables, giant shoes, spinning hats, bow ties and a creepy clown attendant.',[19.522,5.3,11],{priceMzk:350,kind:'dressup',approach:{x:0,y:0,z:4}}),
 'funhouse-propeller-hat':item('Crazy Propeller Clown Hat','A wearable carnival beanie with a brightly colored crown, gold brim and spinning propeller.',[1.32,.74,1.32],{type:'wearable',priceMzk:50,funhouseCostume:'hat',attachment:Object.freeze({socket:'head',slot:'funhouse-hat',fit:'avatar'})}),
 'funhouse-clown-shoes':item('Oversized Clown Shoes','A wearable pair of enormous glossy clown shoes with contrasting toes, layered soles and white laces.',[1.599,.636,1.801],{type:'wearable',priceMzk:50,funhouseCostume:'shoes',attachment:Object.freeze({socket:'feet',slot:'funhouse-shoes',fit:'avatar'})}),
 'funhouse-ball-pit':item('Monster Ball Pit','A circular candy-colored ball pit with animated bouncing balls and a silly hidden monster.',[12,4.01,10.45],{priceMzk:350,kind:'ballpit',approach:{x:0,y:0,z:6}}),
 'funhouse-jack-box':item('Jack in the Fright Box','Striped surprise box with a winding handle, hinged lid, coiled spring and a popping creepy clown character.',[15,6.05,7.29],{priceMzk:250,kind:'jackbox',approach:{x:0,y:0,z:4}}),
 'funhouse-popcorn-stall':item('Carnival Popcorn Stall','Complete striped refreshment stall with canopy, counter, glazed popcorn machine and individual kernels.',[7.8,7.55,7.495],{priceMzk:180}),
 'funhouse-ticket-booth':item('Midnight Ticket Booth','Striped carnival ticket booth with a counter, canopy, rolls of tickets and an illuminated sign.',[7.8,7.55,7.495],{priceMzk:180}),
 'funhouse-candy-stall':item('Clown Candy Stall','Striped sweet stand with a canopy, counter and a row of colorful spiral lollipops.',[7.8,7.55,7.495],{priceMzk:180}),
 'funhouse-circus-tent':item('Midnight Circus Tent','Large round purple circus tent with a red conical roof, gold finial and guy ropes.',[14.444,9.89,12.6],{priceMzk:200}),
 'funhouse-fence':item('Carnival Fence Section','Red carnival posts joined by timber rails for framing the spooky midway.',[4.22,2.3,.22],{priceMzk:25}),
 'funhouse-balloon-bunch':item('Carnival Balloon Bunch','Five colorful helium balloons with curved strings and a grounded gold weight.',[2.133,4.952,1.766],{priceMzk:35}),
 'funhouse-bunting':item('Illuminated Circus Bunting','A suspended carnival cable with colorful hanging pennants and warm glowing bulbs.',[12.014,1.924,.15],{priceMzk:40}),
 'funhouse-lamp':item('Midnight Midway Lamp','Tall carnival lamp with a purple hat shade, warm globe and gold footing.',[.84,5.975,.84],{priceMzk:40}),
 'funhouse-welcome-board':item('Funhouse Welcome Board','Striped information podium and readable map-and-attractions sign.',[4,3,1.12],{priceMzk:45,behavior:'talk',dialogue:'Welcome to Midnight Laughs! Explore the clown house, splash the targets, try the costumes and enjoy the carnival.'}),
 'funhouse-midway-floor':item('Midnight Midway Floor','A walkable checker-paved carnival foundation with purple paths, gold edging and direction arrows.',[120,.436,120],{priceMzk:150}),
 'funhouse-ringmaster-avatar':item('Midnight Ringmaster Clown','Playable creepy clown ringmaster with pallid makeup, angular dark eyes, a sinister toothy grin, a dark crimson circus suit, oversized shoes and animated propeller hat.',[.95,1.8,.906],{type:'avatar',priceMzk:300,characterRole:'Ringmaster',dialogue:'Step right up! Welcome to Midnight Laughs. Find the six attractions and fill your carnival passport.'}),
 'funhouse-juggler-avatar':item('Midnight Juggler Clown','Playable creepy clown performer in a dark plum carnival suit, with pallid makeup, sharply arched brows, a sinister toothy grin, giant shoes, a spinner hat and juggling animation.',[1,1.8,.906],{type:'avatar',priceMzk:300,characterRole:'Juggler',dialogue:'One ball, two balls, three! Follow the glowing clown in the water gallery, then try the mirror maze.'}),
 'funhouse-greeter-avatar':item('Midnight Greeter Clown','Playable creepy midway clown with dark red carnival clothing, pallid makeup, angular dark eyes, a sinister toothy grin, oversized shoes and a spinning hat.',[.95,1.8,.906],{type:'avatar',priceMzk:300,characterRole:'Greeter',dialogue:'Welcome, brave guest. The water gallery is on the west midway and the impossible clown car waits to the east.'}),
 'funhouse-driver-avatar':item('Impossible Car Driver Clown','Playable creepy tiny-car driver clown with pallid makeup, sharply arched brows, a sinister toothy grin, a dark circus outfit, huge shoes and an animated propeller hat.',[.95,1.8,.906],{type:'avatar',priceMzk:300,characterRole:'Clown driver',dialogue:'HONK HONK! Nobody knows how we all fit into that car. Give its horn a squeeze and watch.'}),
 'funhouse-scare-clown-avatar':item('Fright Box Scary Clown','Playable creepy fright-box clown with pallid makeup, angular dark eyes, a sinister toothy grin, a dark purple carnival suit, enormous shoes and a spinning hat.',[.95,1.8,.906],{type:'avatar',priceMzk:300,characterRole:'Scare clown',dialogue:'Boo! Wind up the fright box, find the maze bell and remember to keep laughing.'})
};
export const FUNHOUSE_ITEMS=Object.freeze(Object.fromEntries(Object.entries(authoredItems).map(([id,value])=>[id,Object.freeze({...value,thumbnailUrl:'/public/images/funhouse/items/'+id+'.svg'})])));
export const FUNHOUSE_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(FUNHOUSE_ITEMS).map(([id,value])=>[id,[value.name,value.description,value.dimensions]])));
export function funhouseItemSettings(id){
 const value=FUNHOUSE_ITEMS[id];if(!value)return null;
 const costume=value.funhouseCostume,tool=value.funhouseTool,behavior=value.behavior||(value.type==='avatar'?'talk':value.kind||costume||tool?'interact':'decor');
 return {active:true,behavior,damage:0,destructible:false,funhouseItem:id,
  ...(value.kind?{funhouseKind:value.kind,funhouseStation:value.kind,funhouseApproach:{...(value.approach||{x:0,y:0,z:3})},interactionKey:'e',interactionDistance:6.5,prompt:'Use '+value.name+' · E / Use'}:{}),
  ...(costume?{funhouseCostume:costume,attachment:{...value.attachment},prompt:'Wear '+value.name+' · E / Use'}:{}),
  ...(tool?{funhouseTool:tool,prompt:'Equip water blaster · E / Use'}:{}),
  ...(value.dialogue?{prompt:'Talk to '+value.name,dialogue:{text:value.dialogue}}:{})};
}
export function funhouseNativeItem(id){
 const value=FUNHOUSE_ITEMS[id];if(!value)return null;
 const settings=funhouseItemSettings(id);
 return {...value,buildAssetId:id,image:value.thumbnailUrl,procedural:true,assetKind:'premade',behavior:settings.behavior,
  function_data:settings,...(value.type==='avatar'?{targetHeight:1.8,animation:'idle',dialogueSettings:{text:value.dialogue},aiSettings:{type:'friendly',detectionRange:6}}:{}),
  ...(value.funhouseCostume?{attachment:{...value.attachment}}:{})};
}
