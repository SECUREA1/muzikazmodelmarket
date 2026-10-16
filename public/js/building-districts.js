const rows=[
 ['frontier-tavern','Frontier Tavern','Hospitality',16,12,4,'timber','A timber gathering hall with a bar and covered entry.'],
 ['dusty-saloon','Dusty Trail Saloon','Hospitality',18,14,4.2,'western','A western saloon with a broad porch and open main room.'],
 ['civic-bank','Civic Bank','Commerce',18,14,4.8,'civic','A columned banking hall with a rear vault room.'],
 ['general-store','General Store','Commerce',14,12,3.8,'shop','A storefront with display windows and open retail floor.'],
 ['corner-bakery','Corner Bakery','Commerce',12,10,3.8,'cafe','A warm bakery shell with a service counter.'],
 ['courtyard-cafe','Courtyard Café','Hospitality',14,12,3.8,'cafe','An airy cafe with a terrace for tables and media.'],
 ['roadside-diner','Roadside Diner','Hospitality',18,12,3.8,'retro','A wide diner with a service bar and dining space.'],
 ['grand-restaurant','Grand Restaurant','Hospitality',22,16,4.4,'civic','A dining hall with a rear preparation room.'],
 ['neighborhood-pharmacy','Neighborhood Pharmacy','Services',14,12,3.8,'clinical','A clean retail shell with a consultation room.'],
 ['medical-clinic','Medical Clinic','Services',20,16,4.2,'clinical','A reception hall with rear treatment space.'],
 ['district-police','District Police Station','Services',20,16,4.5,'civic','A civic station with a reception counter and rear office.'],
 ['district-firehouse','District Firehouse','Services',22,18,5,'industrial','A fire station with a vehicle-size open bay.'],
 ['town-post-office','Town Post Office','Services',16,12,4,'civic','A postal hall with a counter and rear sorting space.'],
 ['public-library','Public Library','Community',22,18,4.8,'civic','A reading hall ready for shelves, seating and quests.'],
 ['boutique-hotel','Boutique Hotel','Hospitality',22,18,4.8,'civic','A spacious lobby and rear guest rooms.'],
 ['roadside-motel','Roadside Motel','Hospitality',22,14,3.8,'retro','A lobby, guest rooms and sheltered entrance.'],
 ['freight-warehouse','Freight Warehouse','Industrial',24,20,5,'industrial','A tall loading hall with a wide drive-in entrance.'],
 ['artisan-workshop','Artisan Workshop','Industrial',18,14,4.2,'timber','A workshop with benches along the rear wall.'],
 ['motor-garage','Motor Garage','Industrial',22,18,5,'industrial','An open vehicle bay and repair space.'],
 ['service-station','Service Station','Industrial',20,16,4.2,'retro','A service shop with a wide bay and forecourt canopy.'],
 ['community-supermarket','Community Supermarket','Commerce',24,20,4.5,'shop','An open retail hall for shelves and vending machines.'],
 ['fashion-boutique','Fashion Boutique','Commerce',16,14,4,'shop','A glazed storefront with fitting and display space.'],
 ['picture-house','Picture House Cinema','Entertainment',24,20,5,'theatre','A screening hall and entrance lobby for shared video.'],
 ['live-music-club','Live Music Club','Entertainment',22,18,4.8,'theatre','A music venue with a raised rear stage.'],
 ['neighborhood-center','Neighborhood Center','Community',22,18,4.5,'civic','A flexible community hall for games, meetings and classes.']
];
export const ENTERABLE_BUILDINGS=Object.freeze(Object.fromEntries(rows.map(([id,name,category,width,depth,height,style,description])=>[id,{id,name,category,width,depth,height,style,description,entranceWidth:['industrial'].includes(style)?6:3,thumbnailUrl:'/public/images/building-kit/'+id+'.svg'}])));
export const BUILDING_DISTRICTS=Object.freeze({
 'urban-frontier-town':{name:'Frontier Main Street',icon:'▥',description:'A furnished frontier street with a tavern, saloon, bank and trading shops.',color:0x77624c,sky:0x17202a,buildings:['frontier-tavern','dusty-saloon','civic-bank','general-store','artisan-workshop','roadside-motel','town-post-office','motor-garage']},
 'urban-civic-quarter':{name:'Civic & Market Quarter',icon:'▦',description:'A playable civic district with services, shops and community buildings.',color:0x5d6b69,sky:0x15212b,buildings:['medical-clinic','district-police','district-firehouse','public-library','neighborhood-center','neighborhood-pharmacy','community-supermarket','fashion-boutique']},
 'urban-hospitality-row':{name:'Hospitality & Nightlife Row',icon:'♫',description:'A social district with cafes, dining, hotels, cinema and music.',color:0x51495b,sky:0x171326,buildings:['courtyard-cafe','corner-bakery','roadside-diner','grand-restaurant','boutique-hotel','picture-house','live-music-club','service-station']},
 'urban-building-showcase':{name:'25-Building Town',icon:'▤',description:'Every new building in one explorable town, with empty interiors to furnish.',color:0x536254,sky:0x15232b,buildings:Object.keys(ENTERABLE_BUILDINGS)}
});
export function createBuildingDistrict(layout,mapSize=160){
 const preset=BUILDING_DISTRICTS[layout];if(!preset)throw Error('Choose a building district.');
 const all=preset.buildings.length>10,size=Math.max(all?240:160,Math.min(320,Number(mapSize)||160)),columns=all?5:4,gap=38,rows=Math.ceil(preset.buildings.length/columns),objects=[];
 const add=(id,modelId,x,z,extra={})=>objects.push({id,modelId,position:{x,y:Number(extra.groundOffset)||0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor'},...extra});
 preset.buildings.forEach((id,index)=>{const x=(index%columns-(columns-1)/2)*gap,z=(Math.floor(index/columns)-(rows-1)/2)*gap;
 add('town-building-'+index,id,x,z);if(!all){const profile=ENTERABLE_BUILDINGS[id];add('town-seating-'+index,'pillow-ring',x-3,z,{groundOffset:.18});add('town-table-'+index,'coffee-table',x-3,z-2,{groundOffset:.18});
 const device=id==='civic-bank'?'market-atm':profile.category==='Commerce'?'item-vending-machine':id==='picture-house'?'cinema-screen':profile.category==='Entertainment'?'shared-jukebox':'community-noticeboard';
 add('town-device-'+index,device,x+3,z,{groundOffset:.18,functionalSettings:{behavior:'interact',device,interactionDistance:5,prompt:'Use the '+profile.name+' terminal'}});
 }});
 const entryZ=-rows*gap/2-6;add('town-spawn','hero-spawn',0,entryZ,{functionalSettings:{behavior:'talk',isPlayerSpawn:true,interactionDistance:3}});
 const streets=Array.from({length:rows+1},(_,index)=>({id:'town-street-'+index,name:'Main Street '+(index+1),from:{x:-size*.46,z:(index-rows/2)*gap},to:{x:size*.46,z:(index-rows/2)*gap},width:7}));
 return {name:preset.name,layout,mapSize:size,weather:'clear',streets,objects,gameplay:{multiplayer:true,buildingDistrict:true}};
}
