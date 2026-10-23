// Additive airport district. The valley and paved strip share the airport's
// ground plane; mountains stay outside the runway and its straight approaches.
export function addMountainFlyIn({add,part,sign,building,locations}){
 const place=(id,model,x,z,extra={})=>add('alpine-'+id,model,x,0,z,extra);
 const seat=(id,x,z,yaw=0)=>place(id,'camp-log-bench',x,z,{rotation:{x:0,y:yaw,z:0},functionalSettings:{behavior:'seat',interactionDistance:3,prompt:'Rest at Alpine Ridge',seatOffset:[0,.55,0],exitOffset:[0,0,1.5]}});
 const talk=(id,name,x,z,text,model='camp-trail-sign')=>place(id,model,x,z,{name,functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read '+name},dialogueSettings:{text}});
 const quest=(id,title,x,z,requiredItems,rewardScore,text)=>place(id,'camp-activity-board',x,z,{name:title,functionalSettings:{behavior:'quest',interactionDistance:4,prompt:title,quest:{id:'alpine-'+id,title,requiredItems,rewardScore}},dialogueSettings:{text}});
 const pickup=(id,model,name,x,z)=>place(id,model,x,z,{name,functionalSettings:{behavior:'pickup',interactionDistance:3,prompt:'Collect '+name,destructible:false}});
 const trail=(id,from,to)=>{
  const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz),steps=Math.ceil(length/3.5);
  for(let i=0;i<=steps;i++){
   const item=place('trail-'+id+'-'+i,'path-tile',from[0]+dx*i/steps,from[1]+dz*i/steps,{scale:{x:1.4,y:.6,z:3.1},rotation:{x:0,y:Math.atan2(dx,dz),z:0},name:'Alpine walking trail'});
   item.functionalSettings.destructible=false;
  }
 };

 // Faceted stone ranges and integrated snow caps give the fly-in a distinct
 // mountain silhouette while leaving a generous, level approach corridor.
 // Scene scales stay within the renderer's twenty-times authoring limit so
 // remote views and the server's collision projection agree exactly.
 for(const [i,x,z,sx,sy,sz]of [[0,365,-535,20,18,20],[1,410,-680,18,20,18],[2,520,-755,17,17,18],[3,770,-480,20,19,20],[4,795,-650,18,20,19],[5,700,-780,18,18,17]]){
  place('peak-'+i,'alpine-mountain',x,z,{name:'Alpine Ridge mountain '+(i+1),scale:{x:sx,y:sy,z:sz},rotation:{x:0,y:i*.71,z:0},functionalSettings:{behavior:'decor',destructible:false}});
 }

 building('alpine-lodge','Alpine Ridge Lodge',556,-500,19.2,14.4,3.6);
 place('lodge-desk','studio-desk',556,-503,{position:{x:556,y:.2,z:-503},name:'Lodge welcome desk'});
 place('lodge-sofa-west','sofa',550,-498,{position:{x:550,y:.2,z:-498},functionalSettings:{behavior:'seat',interactionDistance:3,prompt:'Sit in the mountain lodge'}});
 place('lodge-sofa-east','sofa',562,-498,{position:{x:562,y:.2,z:-498},functionalSettings:{behavior:'seat',interactionDistance:3,prompt:'Sit in the mountain lodge'}});
 place('lodge-table','coffee-table',556,-497,{position:{x:556,y:.2,z:-497}});
 talk('lodge-welcome','Alpine Ridge Lodge',558,-489,'Welcome to the Alpine Ridge mountain fly-in. Park at the western apron and leave your aircraft once stopped. Follow the lantern trail to the campground, lake and valley lookout. The trail board and ranger station offer collection quests that award room score.');

 building('alpine-ranger','Alpine Ranger Station',556,-535,14.4,9.6,3);
 place('ranger-desk','studio-desk',556,-537,{position:{x:556,y:.2,z:-537}});
 talk('ranger','Ranger Rowan',552,-533,'Welcome, pilot. Keep the runway and approach clear. Our trail loop stays on the valley floor between the peaks. Take the ranger cache quest outside, recover the supply crate by the lookout and the signal crystal by the lake, then return to this station.','forest-ranger');
 quest('ranger-cache','Ranger cache recovery',562,-526,['supply-crate','treasure-crystal'],50,'Recover the marked supply crate at the valley lookout and the signal crystal at the lake, then report back here. Earn 50 room score once.');

 building('alpine-supplies','Alpine Supply Hut',556,-455,14.4,9.6,3);
 place('supply-shelf','bookshelf',551,-457,{position:{x:551,y:.2,z:-457}});
 place('supply-counter','studio-desk',559,-456,{position:{x:559,y:.2,z:-456}});
 place('first-aid','healing-potion',552,-452,{position:{x:552,y:.2,z:-452},name:'Alpine first-aid station',functionalSettings:{behavior:'heal',interactionDistance:3,value:25,cooldown:15,prompt:'Use the mountain first-aid kit'}});
 talk('supply-guide','Fly-in supplies',561,-447,'First aid is inside the supply hut. Ground service repairs and refuels a parked aircraft through Tower radio. Carry one quest item at a time, then Drop it to free your hands; collected item types remain in your room inventory.');

 const trailPoints=[[590,-480],[532,-480],[532,-444],[504,-444],[462,-480],[462,-520],[505,-550],[532,-550],[556,-525]];
 for(let i=0;i<trailPoints.length-1;i++)trail(i,trailPoints[i],trailPoints[i+1]);
 trail('lodge',[556,-480],[556,-489]);trail('supply',[532,-444],[556,-447]);
 for(const [i,x,z]of [[0,580,-477],[1,540,-477],[2,535,-460],[3,519,-440],[4,490,-452],[5,465,-494],[6,484,-539],[7,524,-546],[8,549,-519]])place('lantern-'+i,'camp-lantern',x,z);
 for(const [i,x,z,label]of [[0,584,-477,'Lodge and campground'],[1,530,-475,'Camp trail loop'],[2,510,-440,'Tent clearing'],[3,466,-516,'Valley lookout'],[4,529,-547,'Ranger station']])talk('waymarker-'+i,label,x,z,'Follow the stone trail through the Alpine Ridge valley. Stay west of the runway. Campground → lake → valley lookout → ranger station → lodge.');

 // Tent entrances face the open clearing; usable benches surround the fire.
 for(const [i,x,z]of [[0,495,-422],[1,505,-419],[2,516,-422],[3,518,-434]])place('tent-'+i,'camp-tent',x,z,{name:'Alpine campsite '+(i+1)});
 place('campfire','campfire',504,-434,{name:'Alpine campfire',functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Gather at the campfire'},dialogueSettings:{text:'The campfire is the mountain fly-in meeting point. Rest on a bench, share your flight and explore the marked trail together.'}});
 seat('fire-seat-north',504,-438);seat('fire-seat-south',504,-430,Math.PI);seat('fire-seat-west',500,-434,Math.PI/2);seat('fire-seat-east',508,-434,-Math.PI/2);
 place('picnic-west','camp-picnic-table',490,-435);place('picnic-east','camp-picnic-table',524,-426);
 place('camp-flag','camp-flag',513,-447);
 quest('trail-explorer','Alpine trail explorer',524,-440,['camp-supply-pack','camp-trail-badge'],40,'Collect the trail supply pack at the north rest cabin and the compass badge at the valley lookout, then return to this board. Earn 40 room score once.');
 place('rest-cabin','camp-cabin',504,-563,{name:'Alpine Trail Rest Cabin'});
 pickup('trail-pack','camp-supply-pack','Alpine trail supply pack',509,-562);
 pickup('trail-badge','camp-trail-badge','Alpine compass badge',465,-521);

 place('lake','camp-lake',475,-442,{name:'Alpine Mirror Lake'});
 place('lake-dock','camp-dock',475,-451,{name:'Mirror Lake viewing dock'});
 place('canoe-rack','camp-canoe-rack',484,-450,{name:'Stored camp canoes'});
 pickup('signal-crystal','treasure-crystal','Ranger signal crystal',469,-450);
 talk('lake-guide','Mirror Lake',480,-455,'A quiet scenic lake with a viewing dock and stored canoes. The ranger signal crystal is beside the western shore. Follow the stone path north to the valley lookout.');
 seat('lake-seat',485,-458,Math.PI/2);
 pickup('ranger-crate','supply-crate','Ranger lookout supply crate',458,-515);
 seat('lookout-seat',457,-524,Math.PI/2);
 place('lookout-flag','camp-flag',455,-528);
 talk('lookout-guide','Alpine Valley Lookout',460,-526,'You have reached the valley lookout below the western peaks. Recover the compass badge and ranger supply crate nearby. Return along the marked trail past the rest cabin to the ranger station.');

 // Sparse forest edges give players clear sight lines and keep every walking
 // objective and runway approach reachable without pushing through trees.
 for(const [i,x,z,scale]of [[0,486,-407,1.4],[1,500,-402,1.2],[2,522,-407,1.5],[3,534,-420,1.3],[4,488,-417,1],[5,490,-464,1.3],[6,478,-472,1.4],[7,451,-464,1.5],[8,446,-486,1.4],[9,445,-507,1.6],[10,476,-547,1.4],[11,491,-577,1.5],[12,520,-577,1.4],[13,539,-564,1.3],[14,576,-553,1.4],[15,580,-523,1.2],[16,580,-456,1.3],[17,578,-435,1.5],[18,686,-443,1.6],[19,689,-481,1.3],[20,683,-536,1.5],[21,687,-575,1.4]])place('pine-'+i,'pine-tree',x,z,{scale:{x:scale,y:scale,z:scale}});
 for(const [i,x,z]of [[0,451,-537],[1,446,-519],[2,486,-578],[3,536,-578],[4,490,-405],[5,530,-407],[6,692,-512]])place('rocks-'+i,'garden-rocks',x,z,{scale:{x:2,y:2,z:2}});

 locations.push(
  {id:'alpine-camp',name:'Alpine Ridge Campground',x:504,y:0,z:-434,width:52,depth:42,description:'Four walk-in tents, a campfire with usable log seats, picnic tables and the Alpine trail explorer collection quest. Awards 40 room score once.'},
  {id:'alpine-lake',name:'Alpine Mirror Lake',x:475,y:0,z:-442,width:28,depth:28,description:'Scenic mountain lake, viewing dock, stored canoes and the ranger signal crystal.'},
  {id:'alpine-lookout',name:'Alpine Valley Lookout',x:462,y:0,z:-520,width:20,depth:24,description:'A marked walking destination below the snowy western peaks, with a rest bench, compass badge and ranger supply cache.'},
  {id:'alpine-rest-cabin',name:'Alpine Trail Rest Cabin',x:504,y:0,z:-563,width:12,depth:16,description:'Walk-in timber rest cabin on the lantern trail. Find the trail supply pack beside its porch.'}
 );
}
