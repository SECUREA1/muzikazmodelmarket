// Renderer-free identity shared by the catalog, thumbnails and runtime finish.
export const VEHICLE_DESIGN_VERSION='crafted-vehicles-v1';
export const VEHICLE_DESIGN_IDS=Object.freeze([
 'frontier-pickup','alpine-quad','grand-tourer','touring-motorcycle','dune-quad',
 'corsair-aircraft','diamond-da40','piper-cub','doomsday-command-aircraft','doomsday-evacuation-aircraft',
 'harbor-skiff','harbor-sailboat','harbor-yacht','harbor-patrol','harbor-fishing-boat',
 'resort-paddle-boat','resort-pontoon','shipping-feeder','shipping-container','shipping-tanker',
 'tower-crane','site-dumptruck','site-bulldozer','site-excavator','utility-cargo-trailer',
 'wooden-cart','camp-canoe-rack','funhouse-clown-car',
 'arcade-part-train','arcade-part-coaster','arcade-part-train-engine','arcade-part-train-carriage','arcade-part-coaster-car',
 'factory-training-missile','factory-cargo-rocket'
]);
const ids=new Set(VEHICLE_DESIGN_IDS);
export const isCraftedVehicleDesign=id=>ids.has(id);
