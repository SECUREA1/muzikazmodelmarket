export function startUrbanMission(player,config,now){
 if(!config?.id||!Array.isArray(config.checkpoints)||!config.checkpoints.length||config.checkpoints.length>16||config.checkpoints.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))throw Object.assign(Error('This driving route needs valid checkpoints.'),{statusCode:422});
 if(player.urbanCompleted?.includes(config.id))return 'Circuit already completed. Explore the city or try another route.';
 if(player.urbanMission?.state==='active'&&player.urbanMission.id===config.id)return 'Circuit active. Drive to checkpoint '+(player.urbanMission.next+1)+'.';
 player.urbanMission={id:String(config.id),name:String(config.name||'Courier circuit'),checkpoints:config.checkpoints.map(p=>({x:p.x,z:p.z,radius:Math.min(8,Math.max(2,Number(p.radius)||5))})),next:0,startedAt:now,deadline:now+Math.min(600,Math.max(30,Number(config.timeLimit)||120))*1000,rewardScore:Math.min(50,Math.max(0,Number(config.rewardScore)||0)),requiresVehicle:config.requiresVehicle!==false,state:'active'};
 return 'Courier circuit started. Enter a vehicle and drive through the checkpoints in order.';
}
export function updateUrbanMission(player,now){
 const mission=player.urbanMission;if(!mission||mission.state!=='active')return;
 if(now>=mission.deadline){mission.state='expired';return;}
 if(player.health<=0||mission.requiresVehicle&&!player.vehicleId)return;
 const point=mission.checkpoints[mission.next];if(!point||Math.hypot(player.position.x-point.x,player.position.z-point.z)>point.radius)return;
 mission.next++;
 if(mission.next===mission.checkpoints.length){mission.state='complete';player.urbanCompleted ||= [];if(!player.urbanCompleted.includes(mission.id)){player.urbanCompleted.push(mission.id);player.score=(player.score||0)+mission.rewardScore;}}
}
