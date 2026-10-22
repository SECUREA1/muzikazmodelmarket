import {isAircraft} from './aircraft-flight.js';
import {isWatercraft} from './harbor-water.js';
import {airportRunways} from './airport-navigation.js';
import {harborDestinations} from './harbor-destinations.js';
export function vehicleDestinations(environment,vehicle){
 if(isAircraft(vehicle))return airportRunways(environment).map(runway=>({id:runway.id,name:runway.name,x:runway.x,z:runway.z,mode:'fly',width:runway.width,depth:runway.length}));
 if(isWatercraft(vehicle))return harborDestinations(environment,vehicle).map(dock=>({...dock,mode:'sail'}));
 return [];
}
