/** Native sports maps keep their own surfaces and gameplay, outside RAD-TOX. */
export const BASKETBALL_SOURCE_COMMIT='2d6ff8b201d0bd149312a1ca213c86385be35490';
export function isCleanSportsEnvironment(environment={}){
 const layout=environment?.builderScene?.layout||environment?.layout;
 return Boolean(environment?.basketball||['basketball-arena','hockey-arena','firing-range','neon-junction'].includes(environment?.id)||['basketball-stadium','hockey-arena','firing-range','arcade-park'].includes(layout)||['hockey','arcade','firing-range'].includes(environment?.game));
}
export const canonicalWorldId=id=>id==='basketball'?'basketball-arena':id;
export function legacyArcadeDestination(id){
 if(id==='basketball')return 'model-explorer.html?environment=basketball-arena&house=basketball-arena&autoplay=1';
 if(['shooting','air-hockey','billiards'].includes(id))return `arcade.html?environment=neon-junction&attraction=${id}`;
 return null;
}
