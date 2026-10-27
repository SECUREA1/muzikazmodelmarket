/** Catalog metadata for fictional game-testing and underground facility assets. */
const item=(name,description,dimensions,priceMzk,role=null,approachZ=3.5,target=null)=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),priceMzk,role,approach:Object.freeze({x:0,y:0,z:approachZ}),target,thumbnailUrl:'/public/images/factory-testing/equipment.svg'});
export const FACTORY_TESTING_ITEMS=Object.freeze({
 'testing-launch-pad':item('Atlas Test Launch Pad','Place a drive-over launch platform for factory testing jobs in your own map.',[14,.12,18],450,'pad',0),
 'testing-launch-console':item('Range Launch Console','Operate fictional test launches from a detailed three-screen control desk.',[5,2.5,2.4],240,'control'),
 'testing-range-target':item('Segmented Range Target','An accuracy objective with layered scoring sectors and a moving tracking line.',[7,7,2.5],120,null,3.5,'accuracy'),
 'testing-telemetry-terminal':item('Range Telemetry Terminal','Set up a test run and review game telemetry from this systems desk.',[5,2.6,2.5],160,'setup'),
 'testing-blast-door':item('Compound Blast Door','An eight-metre clear doorway with decorative sliding panels and an underground-compound entry interaction.',[12,7,1.4],350,'hatch'),
 'testing-containment-core':item('Luminous Containment Core','A fictional underground power-core puzzle station with luminous rings, an observation sphere and service pipes.',[8,6,8],650,'containment',6),
 'testing-cargo-platform':item('Cargo Test Platform','A drive-over receiving platform defining the cargo test destination in a custom range.',[10,.12,12],180,null,0,'cargo')
});
export function factoryTestingItemSettings(id){
 const value=FACTORY_TESTING_ITEMS[id];if(!value)return null;
 return {active:true,behavior:value.role?'interact':'decor',testingStation:value.role||false,...(value.role?{testingApproach:{...value.approach},interactionKey:'e',interactionDistance:value.role==='pad'?8:6,prompt:'Use '+value.name+' · E / Use'}:{}),...(value.target?{testingTarget:value.target,testingTargetId:value.target==='accuracy'?'target-alpha':'cargo-zone'}:{}),destructible:false,damage:0};
}
