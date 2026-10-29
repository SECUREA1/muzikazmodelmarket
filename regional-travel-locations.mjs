// Small, shared-model courier courts extend existing districts without adding
// terrain or inventing airport/harbor services on maps that cannot support them.
export const REGIONAL_TRAVEL_VERSION=1;
const regionNames={
 'studio-ridge':'Studio Ridge', 'volt-city':'Volt City', 'skyline-deck':'Skyline Deck',
 'echo-gardens':'Echo Gardens', 'crew-plaza':'Crew Plaza', 'neon-docks':'Neon Docks',
 'bassline-badlands':'Bassline Badlands', 'pixel-peaks':'Pixel Peaks'
};
export function regionalTravelLocations(environment){
 const regionId=environment.atlasDistrict?.id,regionName=regionNames[regionId];
 if(!regionName)return null;
 const block=environment.atlasDistrict.page||0,name=regionName+(block?' · Block '+(block+1):''),prefix='public-experience-regional-'+regionId+'-',objects=[];
 const add=(id,modelId,x,z,extra={})=>{
  const item={id:prefix+id,modelId,name:extra.name||id.replaceAll('-',' '),placementAnchor:'collider-base',position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:false},...extra};
  objects.push(item);return item;
 };
 // Dispatch is west of the road, and the road vehicle bay east of it. Neither
 // court overlaps the centre road or the atlas gateway building rows.
 for(let index=0;index<3;index++)add('dispatch-paving-'+index,'material:baseplate',-5.4-index*4.8,-44);
 add('dispatch-counter','material:counter',-13,-47,{name:name+' dispatch desk'});
 add('dispatch-seat','material:bench',-15,-41.2,{functionalSettings:{behavior:'seat',interactionDistance:3,destructible:false}});
 add('dispatch-guide','world-resident',-10,-47,{name:name+' Route Coordinator',functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Ask about regional deliveries'},dialogueSettings:{text:'This is '+name+' Dispatch. Open the World Map to plan a route through multiple deeds and follow the real district gateway buildings. Factory orders retain their own sea, optional air, port handling and doorstep receipts. Visiting a map never completes or restocks an order.'}});
 add('dispatch-sign','street-sign',-6.4,-47,{name:name+' Dispatch and World Routes',functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read regional route directory'},dialogueSettings:{text:'Courier Road joins the district road grid. The public pickup is in the bay opposite. Deed and region gateway buildings connect separate map rooms; vehicles remain in their own map. For boats visit Neon Marina or the Strait; cargo flights use the marked Strait airfields.'}});
 add('courier-pickup','frontier-pickup',10,-50.4,{name:name+' Public Courier Pickup',rotation:{x:0,y:Math.PI,z:0},functionalSettings:{behavior:'vehicle',interactionDistance:5,prompt:'Drive regional courier pickup',destructible:true,health:300}});
 add('courier-sign','street-sign',14,-48,{name:name+' Courier Bay',functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read courier bay instructions'},dialogueSettings:{text:'Board the public pickup and drive west along Courier Road to the district road grid. Keep the receiving entrance clear. Tracked supply orders complete only when their verified cargo is delivered to the recorded door.'}});
 const location=(id,title,x,z,width,depth,description)=>({id:regionId+'-'+id,mapId:environment.id,regionId,name:name+' · '+title,kind:'transport',modes:['road','foot'],x,y:0,z,width,depth,arrival:{x,y:0,z},description});
 const locations=[
  location('route-dispatch','Route Dispatch',-10,-44,14,8,'A walk-in route coordinator and district directory. Plan multiple deeds on the World Map; follow their physical gateways.'),
  location('courier-bay','Courier Pickup Bay',10,-50.4,12,10,'A real public road pickup connects its off-road parking bay to Courier Road and the district road grid. Vehicles stay in this map.'),
  location('courier-junction','Courier Road Junction',0,-44,5,5,'Courier Road meets the north–south district road. Boats and aircraft are offered only at their actual ports and runways.')
 ];
 locations[1].arrival={x:6.4,y:0,z:-50.4};
 const streets=[{id:'regional-courier-road',name:name+' Courier Road',from:{x:0,z:-44},to:{x:17,z:-44},width:5},{id:'regional-courier-parking',name:name+' Courier Parking',from:{x:10,z:-44},to:{x:10,z:-53},width:3.5}];
 return {version:REGIONAL_TRAVEL_VERSION,objects,locations,streets};
}
