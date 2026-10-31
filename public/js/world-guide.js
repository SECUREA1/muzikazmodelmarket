// Keep the arrival guide useful for authored, imported and newly built maps.
// It describes available controls; accepting work still requires a player action.
export function worldGuideIntroduction(environment={}, {solo=false}={}){
 const name=String(environment.name||environment.id||'this world').trim().slice(0,140),game=environment.game||environment.builderScene?.layout||'',id=environment.id||'',meta=environment.builderScene?.layoutMeta||{};
 let guidance;
 if(/prison/.test(game)||/prison/.test(id))guidance='Use the local map to find the marked prison areas. Read the posted instructions and follow the available role and activity objectives.';
 else if(game==='casino'||id==='muzikaz-casino')guidance='Speak with the hosts for favors, or approach a table to see its rules before playing.';
 else if(game==='fitness'||id==='muzikaz-fitness-centre')guidance='Walk to a training station and use its controls to start a set. The coaches can help you choose a workout.';
 else if(game==='factory-proving'||id==='muzikaz-factory-proving-grounds')guidance='Use the testing controls to prepare a saved factory model, deploy it on the pad and follow the launch checklist.';
 else if(game==='mountain-compound'||id==='muzikaz-mountain-compound')guidance='Follow the marked consoles and solve the containment power puzzle to reach the deeper bunker.';
 else if(game==='forge'||id==='traditional-forge')guidance='Choose a metal and fuel kit at the stock rack, heat the billet, shape it at the anvil, quench, temper and finish it. Talk to the forge crew for quests. Finished items are saved to your Backpack.';
 else if(game==='missile-factory'||id==='muzikaz-missile-factory')guidance='Visit the factory stations to choose a recipe, fabricate an item, load it and complete its dispatch job.';
 else if(game==='construction'||id==='skyscraper-construction'||meta.construction)guidance='Open the construction controls to choose a machine or assign crew work. Follow the marked site objectives.';
 else if(game==='shipping'||meta.shipping)guidance='Open Shipping to choose a cargo contract. Load evenly, secure your cargo, then follow the chart to dock and unload.';
 else if(game==='fishing'||meta.fishing||environment.fishing?.enabled)guidance='Choose a fishing spot or board a fishing boat. Open the fishing controls to select your tackle, cast and reel.';
 else if(game==='airport'||environment.airport?.enabled)guidance='Choose an available aircraft on the local map, then use Tower radio for runway clearance. Quests offers cargo and rescue flights.';
 else if(game==='ski'||id==='pixel-peaks-ski-resort')guidance='Use the resort map to find the lifts and runs. Open the ski controls to join a race or explore the mountain.';
 else if(game==='basketball'||id==='basketball-arena'||environment.basketball)guidance='Use the court controls to join a team or watch the game. Follow your team objectives and the live score.';
 else if(game==='hockey'||id==='hockey-arena')guidance='Use the match controls to join a team or watch. Follow the puck, your team objectives and the live score.';
 else if(game==='arcade'||id==='neon-junction')guidance='Choose an arcade machine and open its controls to play. Supported games let you join another player or watch their round.';
 else if(game==='tropical-island'||id==='tropical-island')guidance='Explore the beaches and resort activities with the standard world controls. Meet the AI residents, accept Quests, or board a boat from the map. Beach-bar drinks have independent two-minute buzz effects.';
 else if(game==='funhouse'||id==='muzikaz-clown-funhouse')guidance='Walk to an attraction to see its controls. Choose a ride, skill challenge or adventure and follow its on-screen objectives.';
 else if(/firing|range/.test(game)||environment.firingRange||['firing-range','force-training-range'].includes(id))guidance='Open the range controls to join a firing lane, choose a practice session or enter an available competition.';
 else if(meta.harbor)guidance='Use the local map to find a free boat and nearby docks. Crew Dispatch offers supply, escort and rescue assignments.';
 else guidance='Use the local map to find nearby places and Quests to choose a walking route or activity.';
 const native=['hockey','arcade'].includes(game)||['hockey-arena','neon-junction'].includes(id);
 const help=native?'Open the game controls whenever you need help getting started.':solo?'Open Quests for local practice objectives. Your guide will announce objective changes as you explore.':'Open World radio for new jobs and players calling for help. Choose a call to travel, accept a job or join a team when ready.';
 return 'Welcome to '+name+'. '+guidance+' '+help;
}
