export const GAME_INPUT_RELEASE_EVENT='muzikaz:release-game-input';

// Panels signal a release; the game and individual controls clear their own
// held state without synthesizing clicks or changing selected game settings.
export function requestGameInputRelease(reason='panel-change',target=globalThis.document){
 if(!target?.dispatchEvent)return false;
 const ReleaseEvent=target.defaultView?.CustomEvent||globalThis.CustomEvent;
 return target.dispatchEvent(new ReleaseEvent(GAME_INPUT_RELEASE_EVENT,{bubbles:true,detail:{reason}}));
}
