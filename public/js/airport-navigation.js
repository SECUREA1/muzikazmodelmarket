export function airportRunways(environment){
 const airport=environment?.airport;if(!airport?.enabled)return [];
 return airport.runways?.length?airport.runways:airport.runway?[{id:'runway',name:'Runway 18 / 36',...airport.runway}]:[];
}
export function aircraftRunway(environment,aircraft){
 const runways=airportRunways(environment),selected=runways.find(runway=>runway.id===aircraft?.flight?.runwayId);
 if(selected)return selected;
 if(aircraft?.flight?.airborne)return runways[0];
 return [...runways].sort((a,b)=>Math.hypot(a.x-(aircraft?.position?.x||0),a.z-(aircraft?.position?.z||0))-Math.hypot(b.x-(aircraft?.position?.x||0),b.z-(aircraft?.position?.z||0)))[0];
}
// The original runway retains its legacy fields; remote strips lease independently.
export function runwayClearance(airport,runway){
 if(!airport)return null;if(!runway?.id||runway.id==='runway')return airport;
 airport.runwayClearances ||= {};return airport.runwayClearances[runway.id] ||= {runwayHolder:null,expires:0};
}
export function runwayParking(runway){return {x:runway.x-runway.width/2-11,z:runway.z};}
