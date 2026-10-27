/** Shared, metre-scale Ironwood facility layout. Browser and server use these
 * same wall and door boxes so security gates have physical consequences. */
export const PRISON_ID='ironwood-prison';
export const PRISON_SIZE=240;
export const PRISON_SPAWN=Object.freeze({x:0,y:.02,z:88,rotationY:0});
export function isPrisonEnvironment(environment){return environment?.id===PRISON_ID||environment?.game==='prison'||environment?.prison?.enabled===true||(environment?.builderScene?.sourceLayout||environment?.builderScene?.layout||environment?.layout)==='prison';}

const walls=[];
const solid=(id,x,z,width,depth,height=4.8,color='#647277',y=height/2)=>walls.push({id,x,y,z,width,height,depth,color});
// A six metre clear security walk runs inside the perimeter; the southern gate
// opens onto a marked escape finish pad inside the world's containment shell.
solid('perimeter-west',-109,0,1,218,7,'#58636a');
solid('perimeter-east',109,0,1,218,7,'#58636a');
solid('perimeter-north',0,-109,218,1,7,'#58636a');
for(const x of [-59,59])solid('perimeter-south-'+x,x,109,100,1,7,'#58636a');
// Cell blocks each have an east entrance aligned with the broad central spine.
for(const [block,z]of [['a',27],['b',-30]]){
 solid(block+'-north-wall',-62,z-23,78,.55,5.4);
 solid(block+'-south-wall',-62,z+23,78,.55,5.4);
 solid(block+'-west-wall',-101,z,.55,46,5.4);
 for(const side of [-1,1])solid(block+'-entry-wall-'+side,-23,z+side*15,.55,16,5.4);
 solid(block+'-entry-lintel',-23,z,.55,14,1.5,'#647277',4.65);
}
const cells=[];
for(const [block,cz]of [['a',27],['b',-30]])for(const [row,side]of [['n',-1],['s',1]])for(let index=0;index<6;index++){
 const x=-94+index*12,z=cz+side*15.5,front=cz+side*8,id=block+'-'+row+(index+1),name='Block '+block.toUpperCase()+' · '+row.toUpperCase()+(index+1);
 cells.push({id,name,block,position:{x,y:0,z},doorPosition:{x,y:1.5,z:front},door:{x,y:1.5,z:front,width:2.8,height:3,depth:.22},interactionPosition:{x,y:0,z:front-side*2}});
 for(const dx of [-4.2,4.2])solid(id+'-front-panel-'+dx,x+dx,front,5.6,.25,3.9,'#394d57');
 solid(id+'-front-header',x,front,2.8,.25,.9,'#394d57',3.45);
 if(index===0)solid(id+'-divider-west',x-6,z,.28,15,4.4);
 solid(id+'-divider-east',x+6,z,.28,15,4.4);
 solid(id+'-bunk',x-3.8,z,2.2,4.4,1.9,'#3d5661',.95);
 solid(id+'-desk',x+3.8,z+side*3,2.2,1.2,.8,'#a68f71',.4);
}
// East wing: clear double entrances face the central boulevard.
for(const [id,z,depth]of [['cafeteria',31,52],['recreation',-31,52]]){
 solid(id+'-east',101,z,.55,depth,5.4);
 solid(id+'-north',62,z-depth/2,78,.55,5.4);
 solid(id+'-south',62,z+depth/2,78,.55,5.4);
 for(const side of [-1,1])solid(id+'-entry-'+side,23,z+side*(depth/4+3),.55,depth/2-6,5.4);
 solid(id+'-lintel',23,z,.55,12,1.5,'#647277',4.65);
}
// Medical, laundry and security buildings keep the intake promenade open.
for(const [id,x,z,w,d,color]of [['infirmary',-66,77,62,30,'#788d89'],['laundry',55,78,36,30,'#6a7986'],['security',89,78,20,30,'#4d6471']]){
 solid(id+'-back',x,z+d/2,w,.5,4.6,color);
 solid(id+'-left',x-w/2,z,.5,d,4.6,color);
 solid(id+'-right',x+w/2,z,.5,d,4.6,color);
 for(const side of [-1,1])solid(id+'-front-'+side,x+side*(w/4+2),z-d/2,w/2-4,.5,4.6,color);
}
// Furnishings are shared obstacles too; aisles between tables remain 5 m wide.
for(const x of [42,61,80])for(const z of [27,44])solid('canteen-table-'+x+'-'+z,x,z,8,3,1.05,'#7e9294',.525);
solid('meal-counter',61,12,48,2,1.1,'#8ca3a7',.55);
solid('tv-couch-west',43,-30,9,2,1,'#587985',.5);
solid('tv-couch-east',57,-30,9,2,1,'#587985',.5);
solid('rec-pool-table',51,-13,11,6,.9,'#416f58',.45);
for(const x of [78,84,90])solid('arcade-cabinet-'+x,x,-20,2.2,2,2.2,'#303e55',1.1);
for(const x of [-85,-72,-59,-46])solid('medical-bed-'+x,x,80,3,7,.7,'#d4e6e2',.35);
for(const x of [44,49,54,59,64])solid('washing-machine-'+x,x,86,3.4,3.4,2.5,'#b8c6ca',1.25);
solid('security-console',89,86,12,2.5,1.2,'#354b59',.6);
// Workshop wall and equipment occupy the yard's east edge.
solid('workshop-back',84,-101,34,.5,4.5,'#6e7b78');
solid('workshop-east',101,-87,.5,28,4.5,'#6e7b78');
solid('workshop-west',67,-87,.5,28,4.5,'#6e7b78');
solid('workbench',84,-96,22,3,1,'#ae906b',.5);
export const PRISON_WALLS=Object.freeze(walls.map(Object.freeze));
export const PRISON_CELLS=Object.freeze(cells.map(Object.freeze));
export const PRISON_STATIONS=Object.freeze([
 {id:'intake',kind:'intake',name:'Intake & daily challenges',position:{x:0,y:0,z:83},description:'Choose your role and start a day at Ironwood.'},
 ...cells.map(cell=>({id:'cell-'+cell.id,kind:'cell',name:cell.name,cellId:cell.id,position:cell.interactionPosition,description:'Operate this cell lock or rest in your bunk.'})),
 {id:'meal',kind:'meal',name:'Cafeteria meal service',position:{x:43,y:0,z:16},description:'A hot tray restores your energy.'},
 {id:'tv',kind:'tv',name:'Common-room television',position:{x:45,y:0,z:-38},description:'Watch a show and relax with the other prisoners.'},
 {id:'radio',kind:'radio',name:'Radio corner',position:{x:69,y:0,z:-45},description:'Tune in to the Ironwood station.'},
 {id:'arcade',kind:'arcade',name:'Video-game tournament',position:{x:84,y:0,z:-16},description:'Test your timing at the arcade machines.'},
 {id:'gym',kind:'gym',name:'Yard boxing & fitness',position:{x:-66,y:0,z:-83},description:'Train, spar or settle a non-graphic rivalry.'},
 {id:'work',kind:'work',name:'Workshop shift',position:{x:84,y:0,z:-91},description:'Complete a shift to earn credits and trust.'},
 {id:'stash',kind:'stash',name:'Laundry supply stash',position:{x:55,y:0,z:78},description:'Search the laundry supplies for a useful item.'},
 {id:'security',kind:'security',name:'Security control room',position:{x:89,y:0,z:77},description:'Patrol orders, CCTV and restricted security controls.'},
 {id:'vent',kind:'vent',name:'Maintenance passage',position:{x:79,y:0,z:101},description:'A restricted service passage connects to the outer gate.'},
 {id:'gate',kind:'gate',name:'South service gate',position:{x:0,y:0,z:104},description:'The last security obstacle before the escape finish.'},
 {id:'escape',kind:'escape',name:'Escape finish',position:{x:0,y:0,z:116},description:'Reach the marked finish after clearing the service gate.'}
].map(station=>Object.freeze({interactionDistance:4,...station})));
export const PRISON_NPCS=Object.freeze([
 {id:'guard-ward',name:'Officer Ward',role:'guard',position:{x:6,y:0,z:71}},
 {id:'guard-rook',name:'Officer Rook',role:'guard',position:{x:-15,y:0,z:27}},
 {id:'guard-chen',name:'Officer Chen',role:'guard',position:{x:9,y:0,z:-32}},
 {id:'guard-bell',name:'Officer Bell',role:'guard',position:{x:-12,y:0,z:-77}},
 {id:'guard-tower',name:'Officer Stone',role:'guard',position:{x:89,y:0,z:70}},
 {id:'prisoner-jax',name:'Jax',role:'prisoner',position:{x:-50,y:0,z:27}},
 {id:'prisoner-milo',name:'Milo',role:'prisoner',position:{x:-76,y:0,z:-30}},
 {id:'prisoner-ray',name:'Ray',role:'prisoner',position:{x:39,y:0,z:38}},
 {id:'prisoner-ace',name:'Ace',role:'prisoner',position:{x:53,y:0,z:-23}},
 {id:'prisoner-sol',name:'Sol',role:'prisoner',position:{x:-48,y:0,z:-78}},
 {id:'prisoner-ari',name:'Ari',role:'prisoner',position:{x:38,y:0,z:71}},
 {id:'prisoner-lee',name:'Lee',role:'prisoner',position:{x:-31,y:0,z:27}},
 {id:'prisoner-nico',name:'Nico',role:'prisoner',position:{x:-33,y:0,z:-30}}
].map(npc=>Object.freeze(npc)));
