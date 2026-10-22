export const ROAD_VEHICLES={
 'alpine-quad':{name:'Atlas Trail Quad',speed:16,reverse:5,acceleration:7,turn:1.5,width:1.35,length:2.2,color:'#e6ad45',seat:[0,.85,.2]},
 'grand-tourer':{name:'Aurelia Grand Tourer',speed:25,reverse:6,acceleration:8,turn:1.05,width:1.9,length:4.5,color:'#408ba6',seat:[-.38,.78,.35]},
 'touring-motorcycle':{name:'Veloce Touring Motorcycle',speed:22,reverse:3,acceleration:9,turn:1.65,width:.85,length:2.3,color:'#cf554e',seat:[0,.8,.25]},
 'tower-crane':{name:'Titan 78 Tower Crane',speed:0,reverse:0,acceleration:0,turn:0,width:8,length:8,height:85,color:'#edb832',seat:[3.4,1.24,3.45],eyeHeight:2.07,siteOnly:true},
 'site-dumptruck':{name:'Terra 40 Articulated Dump Truck',speed:8,reverse:3,acceleration:2.5,turn:.55,width:3.4,length:8.8,height:3.7,color:'#f0ad32',seat:[-.48,1.89,-2],eyeHeight:2.72,siteOnly:true},
 'site-bulldozer':{name:'D9 Crawler Bulldozer',tracked:true,speed:3.5,reverse:2.5,acceleration:1.8,turn:.8,width:4.2,length:6.3,height:3.2,color:'#e2a72f',seat:[0,1.79,.8],eyeHeight:2.62,siteOnly:true},
 'site-excavator':{name:'HX350 Hydraulic Excavator',tracked:true,speed:3,reverse:2,acceleration:1.5,turn:.85,width:3.2,length:5.4,height:3.5,color:'#e89c28',seat:[-.78,2.44,.05],eyeHeight:3.27,siteOnly:true}
};
export const roadVehicleId=actor=>actor?.asset?.buildAssetId||actor?.modelId;
export const isRoadVehicle=actor=>!!ROAD_VEHICLES[roadVehicleId(actor)];
export const roadVehicleType=actor=>ROAD_VEHICLES[roadVehicleId(actor)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
export function stepRoadVehicle(actor,input,dt,{groundAt=point=>point,blocked=()=>false}={}){
 const config=roadVehicleType(actor),prior=actor.driving||{},throttle=clamp(input.forward,-1,1),steer=clamp(input.side,-1,1);dt=clamp(dt,0,.1);
 let speed=Number(prior.speed)||0;const braking=input.brake||prior.parked&&Math.abs(throttle)<.05,target=braking?0:throttle*(throttle<0?config.reverse:config.speed),rate=braking?14:Math.abs(throttle)<.05?3:config.acceleration;
 speed+=clamp(target-speed,-rate*dt,rate*dt);
 const yaw=(actor.rotation?.y||0)-steer*config.turn*dt*(config.tracked?1:Math.min(1,Math.abs(speed)/3))*Math.sign(speed||1),to={x:actor.position.x-Math.sin(yaw)*speed*dt,y:actor.position.y,z:actor.position.z-Math.cos(yaw)*speed*dt};
 const ground=groundAt(to,actor);let stopped=!ground||Math.abs(ground.y-actor.position.y)>Math.max(.55,Math.abs(speed)*dt*.9)||blocked(actor.position,{...to,y:ground?.y??to.y},yaw,actor);
 const position=stopped?{...actor.position}:{...to,y:ground.y};if(stopped)speed=0;
 return {position,rotation:{x:0,y:yaw,z:0},driving:{...prior,speed,steering:steer,throttle,parked:braking&&Math.abs(speed)<.05,blocked:stopped,distance:(prior.distance||0)+Math.abs(speed)*dt}};
}
