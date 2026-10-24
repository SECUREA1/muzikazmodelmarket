/** Native factory assets shared by Builder, the MZK market and Backpack. */
const item=(name,description,dimensions,priceMzk,kind=null)=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),priceMzk,kind,thumbnailUrl:'/public/images/factory/missile-factory.svg'});
export const FACTORY_ITEMS=Object.freeze({
 'factory-training-missile':item('Atlas Training Missile','Factory-crafted inert training collectible with segmented shell, stabilizer fins and a display cradle.',[2.4,2.3,8.7],180),
 'factory-cargo-rocket':item('Atlas Cargo Rocket','Factory-crafted cargo rocket collectible with booster pods, payload fairing and a service cradle.',[4.2,3.7,12.8],320),
 'factory-fabricator':item('CNC Shell Fabricator','Operate this component-fabrication station in a custom factory, with a sliding tool head, stock rollers and an operator console.',[7,4.8,4],650,'fabrication'),
 'factory-assembly-jig':item('Rocket Assembly Jig','A production assembly station with twin robotic arms, a segmented workpiece and an overhead service gantry.',[11,6.5,5],900,'assembly'),
 'factory-calibration-rig':item('Systems Calibration Rig','A quality-control station with a circular inspection arch, animated scan bar and twin systems consoles.',[4.8,4.8,4],450,'calibration'),
 'factory-procurement-terminal':item('Procurement Terminal','Buy game production kits and open factory jobs at this MZK order desk with a stock manifest screen and material bins.',[6,2.4,3],160,'procurement'),
 'factory-dispatch-terminal':item('Factory Dispatch Terminal','Deliver completed orders and collect crafted items to Backpack from this shipment console.',[6,2.4,3],160,'dispatch'),
 'factory-conveyor':item('Industrial Roller Conveyor','A movable steel material conveyor with individual animated rollers and safety rails.',[3.5,1.1,8],120),
 'factory-loading-bay':item('Factory Freight Loading Bay','A marked freight-loading station for the factory truck. Move or rotate it to define your custom production route.',[9,.12,14],180,'loading')
});

/** Approaches move, rotate and scale with the placed equipment. */
export function factoryItemSettings(id){
 const value=FACTORY_ITEMS[id];if(!value)return null;
 return {active:true,behavior:value.kind?'interact':'decor',factoryStation:value.kind||false,...(value.kind?{factoryStationId:'factory-'+value.kind,factoryApproach:{x:0,y:0,z:value.kind==='loading'?0:3.5},interactionKey:'e',interactionDistance:6,prompt:'Open '+value.name+' · E / Use'}:{}),destructible:false,damage:0};
}
