import {forgeItemSettings} from './forge-items.js?v=forge-atelier-20261031';

const ROOMS=Object.freeze({
 archive:{id:'forge-village-archive',x:76,z:-10,yaw:-Math.PI/2},inn:{id:'forge-village-inn',x:-76,z:-10,yaw:Math.PI/2},
 guild:{id:'forge-village-museum',x:0,z:-70,yaw:0},westHome:{id:'forge-village-cottage-west',x:-72,z:66,yaw:Math.PI},eastHome:{id:'forge-village-cottage-east',x:72,z:66,yaw:Math.PI}
});
const point=(room,x,z,y=0)=>({x:room.x+x*Math.cos(room.yaw)+z*Math.sin(room.yaw),y,z:room.z-x*Math.sin(room.yaw)+z*Math.cos(room.yaw)});
const decor={active:true,behavior:'decor',action:'none',destructible:false,damage:0};

/** Authored furnishings remain map instances. Displayed products use the same
 * paid store offers as the village market; scenery never awards an owned copy. */
export function forgeVillageDetails(){
 const objects=[];
 function place(id,modelId,name,x,z,{room=null,y=0,yaw=0,scale=null,settings={},dialogue=null}={}){
  const position=room?point(room,x,z,y):{x,y,z},functionalSettings={...decor,...(room?.id?{villageRoomId:room.id}:{}),...settings};
  const object={id:'forge-village-'+id,modelId,asset:{buildAssetId:modelId},name,position,rotation:{x:0,y:(room?.yaw||0)+yaw,z:0},scale:scale||{x:1,y:1,z:1},placementAnchor:'collider-base',functionalSettings};
  if(dialogue)object.dialogueSettings={text:dialogue};
  objects.push(object);return object;
 }
 const sign=(id,name,x,z,text,room=null)=>place(id,'street-sign',name,x,z,{room,settings:{behavior:'talk',interactionDistance:4,prompt:'Read '+name+' · E / Use'},dialogue:text});
 const chair=(id,name,x,z,room,yaw=0)=>place(id,'armchair',name,x,z,{room,yaw,settings:{behavior:'seat',interactionDistance:3,seatOffset:[0,.56,0],exitOffset:[0,0,-1.3],prompt:'Sit by the forge village hearth · E / Use'}});
 const lamp=(id,x,z,room)=>place(id,'forge-lantern','Emberglass · village lantern',x,z,{room,settings:forgeItemSettings('forge-lantern')});
 const productDisplay=(id,name,x,z,products,room=null)=>place(id,'material:display-plinth',name,x,z,{room,settings:{storeProductIds:products}});

 // Archive: readable metallurgy, individual alloy samples and quiet study.
 const archive=ROOMS.archive;
 for(const [index,x]of [-8,-5,-2.4,2.4,5,8].entries())place('archive-bookcase-'+index,'bookshelf','Alloy archive · bound metallurgy volumes',x,-10.8,{room:archive,scale:{x:1.7,y:1.4,z:1.6}});
 for(const [side,x]of [[-1,-7],[1,7]]){
  place('archive-reading-table-'+side,'coffee-table','Archive · oak reading table',x,-1,{room:archive,scale:{x:1.8,y:1.7,z:1.8}});
  chair('archive-chair-'+side+'-west','Archive reading chair',x-1.8,-1,archive,-Math.PI/2);
  chair('archive-chair-'+side+'-east','Archive reading chair',x+1.8,-1,archive,Math.PI/2);
 }
 place('archive-sample-table','coffee-table','Iron, bronze and layered steel · comparison bench',-7,4.5,{room:archive,scale:{x:2.1,y:1.7,z:1.8}});
 for(const [index,modelId]of ['forge-iron-ingot','forge-bronze-ingot','forge-steel-billet'].entries())place('archive-alloy-sample-'+index,modelId,'Archive · labelled '+modelId.replace(/^forge-/,'').replaceAll('-',' '),-7+(index-1)*.75,4.5,{room:archive,y:.79});
 sign('archive-reading-board','THE ALLOY ARCHIVE · Read the metal',-6,7,'Compare the dark iron, warm bronze and bright steel samples. Bronze blends copper and tin; steel gains its character from iron and carbon. At the anvil, drawing out lengthens a billet while upsetting thickens it. Find Sera in the great forge to follow heat, shaping, quenching and tempering through a complete workpiece.',archive);
 sign('archive-quality-board','MAKER’S NOTES · Quality follows the workpiece',6,7,'A clean edge, a straight profile and a sound handle tell the story of careful work. Brann teaches controlled hammer strokes; Sera checks the heat treatment; Kade records the maker’s mark. Finish your workpiece at the workshop bench, then keep it in Backpack, offer it at market or seal it for freight.',archive);
 lamp('archive-lantern-west',-10,6,archive);lamp('archive-lantern-east',10,6,archive);

 // Inn: enterable, furnished shelter with real seating and an operable bell.
 const inn=ROOMS.inn;
 for(const [side,x]of [[-1,-6],[1,6]])place('inn-dining-'+side,'dining-set','Hammer & Hearth · shared oak dining table',x,-3,{room:inn,yaw:side*Math.PI/12,scale:{x:1.25,y:1,z:1.25}});
 place('inn-hearth','fireplace','Hammer & Hearth · stone warming hearth',0,-11.7,{room:inn,scale:{x:1.5,y:1.35,z:1.5}});
 place('inn-low-table','coffee-table','Hammer & Hearth · fireside table',-6,-8.4,{room:inn,scale:{x:1.5,y:1,z:1.5}});
 for(const [index,x,z,yaw]of [[0,-8,-8.4,-Math.PI/2],[1,-4,-8.4,Math.PI/2],[2,5.5,-9.5,0],[3,8,-9.5,0]])chair('inn-hearth-chair-'+index,'Hammer & Hearth · fireside chair',x,z,inn,yaw);
 for(const [index,x]of [6,7.2,8.4].entries())place('inn-coopered-barrel-'+index,'material:barrel','Hammer & Hearth · coopered supply barrel',x,8,{room:inn});
 place('inn-call-bell','forge-bronze-bell','Hammer & Hearth · evening call bell',-8,5,{room:inn,settings:forgeItemSettings('forge-bronze-bell')});
 sign('inn-story-board','HAMMER & HEARTH · The smiths’ common house',-7,8,'Caravans once stopped here while their wheels and tools were repaired beside the great forge. The bronze common-house bell still calls smiths in from the cooling gardens at dusk. Take a seat by the hearth, explore the long tables, then meet Brann Emberhand, Dr. Sera Vale and Kade Ironledger for workshop commissions and conversation.',inn);
 lamp('inn-lantern-west',-10,1,inn);lamp('inn-lantern-east',10,1,inn);

 // Guild museum: eight native product offers, real commerce and maker records.
 const guild=ROOMS.guild;
 const exhibits=[['forge-damascus-blade',-13,-4],['forge-aegis-shield',-7,-4],['forge-warhammer',7,-4],['forge-battle-axe',13,-4],['forge-spear',-13,3],['forge-dagger',-7,3],['forge-lantern',7,3],['forge-bronze-bell',13,3]];
 for(const [index,[product,x,z]]of exhibits.entries())productDisplay('guild-exhibit-'+index,'Guild collection · '+product.replace(/^forge-/,'').replaceAll('-',' '),x,z,[product],guild);
 place('guild-maker-bench','forge-finishing-bench','Guild museum · historical maker’s bench',-12,-9,{room:guild,settings:{forgeStation:false}});
 place('guild-record-cabinet','bookshelf','Guild museum · maker marks and shipping records',12,-10.6,{room:guild,scale:{x:2,y:1.4,z:1.6}});
 place('guild-market-terminal','market-atm','Guild exchange · live MZK metalwork market',11,7,{room:guild,settings:{behavior:'interact',device:'market-atm',interactionDistance:5,storeProductIds:exhibits.map(([product])=>product),prompt:'Inspect & trade guild metalwork · E / Use'}});
 sign('guild-commissions-board','GUILD WORK ORDERS · Make for the world',-12,7,'World inventory requests connect shops, deeds, AI restock calls and other members to real makers. Open World Item Factory → World inventory requests. A member funds the MZK reward, a maker accepts, completes owned forge or factory stock, and sends it through the actual shipping route. The reward pays only after the final receiving receipt covers every requested unit.',guild);
 sign('guild-lineage-board','MAKER TO MARKET · The journey of one item',0,-9.5,'The archive preserves the design; the workshop creates the piece; Backpack holds the owned creation. Seal it only when ready to move its exact copy into freight. A verified lot follows the ship, onward transport and receiving address. Museum displays are live market previews, not free inventory or completed deliveries.',guild);
 lamp('guild-lantern-west',-17,7,guild);lamp('guild-lantern-east',17,7,guild);

 // Artisan homes: furnished interiors around a continuous clear central aisle.
 for(const [id,room,title]of [['west-home',ROOMS.westHome,'The bell founder’s cottage'],['east-home',ROOMS.eastHome,'The pattern welder’s cottage']]){
  place(id+'-bed','loft-bed',title+' · timber sleeping alcove',-6,-6.5,{room});
  place(id+'-cabinet','wardrobe',title+' · fitted timber cupboard',6,-8.8,{room});
  place(id+'-table','coffee-table',title+' · hearth table',6,-2,{room,scale:{x:1.4,y:1.3,z:1.4}});
  chair(id+'-chair-west',title+' · reading chair',4.3,-2,room,-Math.PI/2);
  chair(id+'-chair-east',title+' · reading chair',7.7,-2,room,Math.PI/2);
  lamp(id+'-lantern',-7,4,room);
  sign(id+'-maker-board',title+' · A maker’s life',6,5,id==='west-home'?'A bronze bell begins with a measured alloy and a checked work order. The bell founder’s village examples can be rung, but owned bells come from completed forging or the shared MZK market. Houses, lamps and furnishings remain editable canonical Builder items.':'Pattern welding joins prepared layers into a billet before the recorded forge stages shape and finish the workpiece. Follow a paid saved order in the main smithy, then choose whether to keep, trade or ship the completed item.',room);
 }

 // Civic square: a readable trade village, with its twelve-metre avenue clear.
 place('civic-call-bell','forge-bronze-bell','Emberfall square · guild call bell',-18,75,{settings:forgeItemSettings('forge-bronze-bell'),scale:{x:1.4,y:1.4,z:1.4}});
 productDisplay('civic-metalwork-plinth','Village makers · tools and lanterns',18,75,['forge-pickaxe','forge-lantern','forge-bronze-bell']);
 for(const [side,x]of [[-1,-18],[1,18]]){
  place('civic-stall-'+side,'market-stall',side<0?'Village alloy exchange':'Village toolwright’s stall',x,85,{yaw:Math.PI,settings:{behavior:'interact',device:'market-atm',interactionDistance:5,storeProductIds:side<0?['forge-iron-ingot','forge-bronze-ingot','forge-steel-billet','forge-coal']:['forge-hammer','forge-tongs','forge-pickaxe','forge-lantern'],prompt:'Inspect village MZK offers · E / Use'}});
  place('civic-cart-'+side,'wooden-cart','Village · parked artisan handcart',x+side*7,84,{yaw:side*Math.PI/3});
  place('civic-supply-barrel-'+side,'material:barrel','Village · labelled supply barrel',x+side*7,80);
 }
 sign('civic-village-board','EMBERFALL VILLAGE · Walk the makers’ quarter',-18,66,'Follow the north avenue to the six live forging bays. The western loop leads to the Hammer & Hearth inn; the eastern loop reaches the Alloy Archive. The Guild Museum stands beyond the northern road. Explore the furnished artisan cottages beside the south square, then inspect the real MZK market and dispatch yard before travelling to the World Item Factory or shipping lanes.');
 sign('civic-freight-board','VILLAGE FREIGHT · Every unit is counted',18,66,'Kade’s dispatch yard lies northwest of the square. Carry a finished, unlisted creation there to seal it for freight, then follow its lot through the shipping lanes to the receiving shop or deed. The village stalls offer live MZK prices, and World inventory requests reveal the next place waiting for a maker’s work.');

 // The waterworks is a small outdoor maintenance vignette, away from streets.
 place('waterworks-maintenance-wheel','forge-grinding-wheel','Millrace · treadle maintenance wheel',-85,-78,{settings:{forgeStation:false}});
 place('waterworks-cart','wooden-cart','Millrace · wheelwright’s repair cart',-89,-81,{yaw:Math.PI/2});
 place('waterworks-fitting-bin','material:barrel','Millrace · reclaimed iron fitting barrel',-82,-81);
 sign('waterworks-board','THE MILLRACE · Water and careful work',-85,-73,'The narrow millrace carries cooling water past the stone bridge and the wheelwright’s repair corner. Look for the settling grille, coping stones and treadle wheel beside the old channel. Return to Sera’s quench bath in the great forge when your heated workpiece is ready for its next stage.');
 return objects;
}

/** These check-in points sit in the unobstructed room aisles. The parent keeps
 * an anchor reference so intentionally deleted village buildings stay removed. */
export function forgeVillageDetailLocations(){
 return [
  {id:'forge-village-archive',name:'The Alloy Archive · metallurgy library',x:76,y:.02,z:-10,width:18,depth:18,villageAnchorId:'forge-village-archive-floor',description:'Explore the bound metallurgy volumes, compare iron and bronze samples, and read the recorded path from workpiece to market.'},
  {id:'forge-village-inn',name:'The Hammer & Hearth Inn · smiths’ common house',x:-76,y:.02,z:-10,width:18,depth:18,villageAnchorId:'forge-village-inn-floor',description:'Sit by the stone hearth, explore the shared oak tables and ring the bronze village bell.'},
  {id:'forge-village-guild',name:'Guild Museum · makers and world work orders',x:0,y:.02,z:-70,width:32,depth:18,villageAnchorId:'forge-village-museum-floor',description:'Inspect eight canonical metalwork exhibits, use the live MZK exchange and learn how funded world requests reach receiving stock.'},
  {id:'forge-village-west-home',name:'The bell founder’s cottage',x:-72,y:.02,z:66,width:16,depth:14,villageAnchorId:'forge-village-cottage-west-floor',description:'Enter a furnished artisan home with timber sleeping alcove, books and an operable forged lantern.'},
  {id:'forge-village-east-home',name:'The pattern welder’s cottage',x:72,y:.02,z:66,width:16,depth:14,villageAnchorId:'forge-village-cottage-east-floor',description:'Explore the pattern welder’s reading corner and learn the connection between layered billets and a saved forging order.'},
  {id:'forge-village-waterworks',name:'Millrace · wheelwright’s corner',x:-85,y:.02,z:-74,width:14,depth:10,villageAnchorId:'forge-village-waterworks-board',description:'Follow the millrace edge to inspect the wheelwright’s maintenance vignette and the role of controlled quenching.'}
 ];
}
