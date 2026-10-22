export const AIRCRAFT_TYPES=Object.freeze({
 'corsair-aircraft':{name:'Blackwing Corsair',armed:true,dimensions:[10.5,2.7,8.2],eye:[0,1.78,.68],seat:[0,.89,.63],maxSpeed:29,thrust:16,stallSpeed:7,fixedGear:false},
 'diamond-da40':{name:'Diamond DA40',armed:false,dimensions:[11.9,2.7,8.1],eye:[-.28,1.66,.45],seat:[-.28,.72,.45],maxSpeed:26,thrust:13,stallSpeed:6.5,fixedGear:true},
 'piper-cub':{name:'Piper Cub',armed:false,dimensions:[10.7,2.6,6.8],eye:[0,1.68,.2],seat:[0,.8,.2],maxSpeed:19,thrust:9,stallSpeed:4.7,fixedGear:true}
});
export const aircraftType=actor=>AIRCRAFT_TYPES[actor?.asset?.buildAssetId]||AIRCRAFT_TYPES[actor?.modelId]||null;
export const armedAircraft=actor=>aircraftType(actor)?.armed===true;
