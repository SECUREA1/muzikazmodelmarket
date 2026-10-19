/** Native sports maps keep their own surfaces and gameplay, outside RAD-TOX. */
export const BASKETBALL_SOURCE_COMMIT='2d6ff8b201d0bd149312a1ca213c86385be35490';
const sportLayouts=new Map(Object.entries({'basketball-arena':'basketball','basketball-stadium':'basketball','hockey-arena':'hockey','firing-range':'range','arcade-park':'arcade','arcade':'arcade','neon-junction':'arcade'}));
const sportIds=new Map(Object.entries({'basketball-arena':'basketball','hockey-arena':'hockey','firing-range':'range','force-training-range':'range','neon-junction':'arcade'}));
const sportGames=new Map(Object.entries({basketball:'basketball',hockey:'hockey','firing-range':'range',arcade:'arcade'}));
function ownSport(environment){
 const layout=environment.builderScene?.layout||environment.layout;
 return sportLayouts.get(layout)||sportIds.get(environment.id)
  ||(environment.basketball===true||environment.basketballCourt===true?'basketball':environment.firingRange===true?'range':sportGames.get(environment.game))||null;
}
/** Saved repository maps retain the gameplay of the base they actually render. */
export function sportsEnvironmentSource(environment={}){
 const visited=new Set(),sources=[];let current=environment;
 while(current&&typeof current==='object'&&!visited.has(current)){
  visited.add(current);sources.unshift(current);
  current=current.builderScene?.baseEnvironment||current.baseEnvironment;
 }
 return sources.find(source=>ownSport(source))||null;
}
export const sportsEnvironmentKind=environment=>ownSport(sportsEnvironmentSource(environment)||{});
export function sportsEnvironmentSettings(environment,game){
 const source=sportsEnvironmentSource(environment)||{};
 return {...source[game],...source.builderScene?.gameplay?.[game],...environment?.[game],...environment?.builderScene?.gameplay?.[game]};
}
export function isCleanSportsEnvironment(environment={}){
 return Boolean(sportsEnvironmentKind(environment));
}
export const canonicalWorldId=id=>id==='basketball'?'basketball-arena':id;
export function legacyArcadeDestination(id){
 if(id==='basketball')return 'model-explorer.html?environment=basketball-arena&house=basketball-arena&autoplay=1';
 if(['shooting','air-hockey','billiards'].includes(id))return `arcade.html?environment=neon-junction&attraction=${id}`;
 return null;
}
