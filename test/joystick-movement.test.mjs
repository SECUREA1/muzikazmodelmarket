import {mountThumbstick} from '../public/js/thumbstick-input.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const {walkingStick,walkingSprint} = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../public/js/walking-motion.js', import.meta.url), 'utf8')).toString('base64'));
const source = readFileSync(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
function controller(name) {
  const handlers = {}, knob = {style: {}}, input = {leftX:0,leftY:0}, flushes = [];
  let shots = 0, jumps = 0;
  const stick = {querySelector: () => knob, getBoundingClientRect: () => ({left: 0, top: 0, width: 100, height: 100}), classList: {add(){}, remove(){}}, addEventListener(type, fn){handlers[type] = fn;}};
  const context = vm.createContext({mountThumbstick,envLoader:{world:{}},gameplayOverlayOpen:()=>false,walkingStick, authoritativeClient:{requestInput:(immediate=true)=>flushes.push(immediate)}, document: {querySelector: () => stick}, window: {addEventListener(){}},gameplayStarted:true,multiplayerWorldLoading:false,thumbsticks:[], THREE: {MathUtils: {clamp: (v,a,b) => Math.max(a,Math.min(b,v))}}, thumbInput: input, safelyCapturePointer(){}, safelyInteract: (_,fn) => fn(), shootAtReticle: () => shots++, jump: () => jumps++});
  vm.runInContext(source.slice(source.indexOf('  function setupThumbstick(name)'), source.indexOf("  setupThumbstick('left')")), context);
  context.setupThumbstick(name);
  return {input, flushes, send: (type,x,y) => handlers[type]({type, pointerId: 1, clientX: x, clientY: y, preventDefault(){}}), shots: () => shots, jumps: () => jumps};
}
test('both sticks use their visible center and respond to fine movements within a small dead zone', () => {
  const left=controller('left'),right=controller('right');
  for(const [type,x,y]of [['pointerdown',50,50],['pointermove',50,49],['pointermove',50,35.5],['pointermove',50,0]]){
    left.send(type,x,y);right.send(type,x,y);assert.ok(Math.abs(left.input.leftX-right.input.rightX)<.05);assert.ok(Math.abs(left.input.leftY-right.input.rightY)<.05);
  }
  assert.equal(left.input.leftY,-1);left.send('pointercancel',50,0);assert.equal(left.input.leftY,0);assert.equal(left.shots(),0);
});
test('tap still shoots and right look and jump retain their response', () => {
  const left = controller('left');
  left.send('pointerdown', 50, 50); left.send('pointerup', 50, 50);
  assert.equal(left.shots(), 1);
  const right = controller('right');
  right.send('pointerdown', 50, 35.5);
  assert.ok(Math.abs(right.input.rightY + .5) < 1e-10);
  right.send('pointerup', 50, 35.5);
  assert.equal(right.jumps(), 0,'a directional look press cannot jump on release');right.send('pointerdown',50,50);right.send('pointerup',50,50);assert.equal(right.jumps(),1);
});
test('analog movement covers the same distance at 30, 60, and 120 FPS', () => {
  const movement = source.slice(source.indexOf('move.copy(forward).multiplyScalar(input.y)'), source.indexOf('    if(!player.onGround&&!jetpackThrust)', source.indexOf('  function updatePlayer(delta)')));
  const vector = (x=0,y=0,z=0) => ({x,y,z,copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;},multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;},addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;},lengthSq(){return this.x**2+this.y**2+this.z**2;}});
  for (const fps of [30,60,120]) {
    let distance = 0;
    const context = vm.createContext({walkingSprint,stickSprinting:false,touchSprint:false,keys:new Set(),thumbInput:{leftX:0,leftY:-.25},move:vector(),forward:vector(0,0,-1),right:vector(1),input:{x:0,y:.25},delta:1/fps,player:{speed:4},useJetpack:()=>false,playerCollider:{translate(v){distance-=v.z;}}});
    const step = new vm.Script(`{${movement}}`);
    for(let frame=0;frame<fps;frame++){step.runInContext(context);distance-=context.move.z;}
    assert.ok(Math.abs(distance-1)<1e-10, `${fps} FPS: ${distance}`);
  }
});
test('slow frames split collision work without losing elapsed time; menus and vehicles block walking', () => {
  const start = source.indexOf('    if(!serverHostedRoom&&!menuOpen&&!vehicleController.update(delta))');
  const end = source.indexOf('else if(serverHostedRoom)', start);
  const script = new vm.Script(source.slice(start, end));
  for (const delta of [1/120, 1/60, 1/30, .05]) {
    const steps = [];
    script.runInNewContext({delta, serverHostedRoom:false, menuOpen:false, vehicleController:{update:()=>false}, updatePlayer:dt=>steps.push(dt)});
    assert.ok(steps.every(dt=>dt<=1/60));
    assert.ok(Math.abs(steps.reduce((a,b)=>a+b,0)-delta)<1e-10);
  }
  for (const [serverHostedRoom,menuOpen,vehicle] of [[true,false,false],[false,true,false],[false,false,true]]) {
    let calls = 0;
    script.runInNewContext({delta:1/30,serverHostedRoom,menuOpen,vehicleController:{update:()=>vehicle},updatePlayer:()=>calls++});
    assert.equal(calls,0);
  }
});
test('left stick supports strafe, reverse, bounded diagonal movement, and capture loss', () => {
  const c = controller('left');
  c.send('pointerdown',50,50);
  c.send('pointermove',100,50);
  assert.equal(c.input.leftX,1);
  assert.equal(c.input.leftY,0);
  c.send('pointermove',50,100);
  assert.equal(c.input.leftY,1);
  c.send('pointermove',100,0);
  assert.ok(Math.abs(Math.hypot(c.input.leftX,c.input.leftY)-1)<1e-10);
  c.send('lostpointercapture',100,0);
  assert.equal(c.input.leftX,0);
  assert.equal(c.input.leftY,0);
  assert.equal(c.shots(),0);
});

test('left-stick edges flush immediately while continued drags share the normal update stream', () => {
  const c=controller('left');
  c.send('pointerdown',50,50);
  c.send('pointermove',50,30);assert.equal(c.flushes.at(-1),true);
  c.send('pointermove',50,25);assert.equal(c.flushes.at(-1),false);
  c.send('pointerup',50,25);assert.equal(c.flushes.at(-1),true);
  const right=controller('right');right.send('pointerdown',50,50);right.send('pointermove',60,50);right.send('pointerup',60,50);assert.equal(right.flushes.length,0);
});
