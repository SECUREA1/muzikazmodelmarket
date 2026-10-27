import {tropicalIslandPlayUrl} from './tropical-island-destination.js';

// Old bookmarks enter the one shared world. No parallel renderer, controls,
// quests, position state, AI actors or drink simulation run on this page.
const params=new URLSearchParams(location.search);
const target=new URL(tropicalIslandPlayUrl({id:'tropical-island'},{mode:params.get('mode')||'multiplayer',meet:params.get('meet')}),location.href);
for(const key of ['useItem','avatar','quality'])if(params.has(key))target.searchParams.set(key,params.get(key));
location.replace(target.href);
