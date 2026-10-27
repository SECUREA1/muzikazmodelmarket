import {isWatercraft} from '../public/js/harbor-water.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {isRoadVehicle} from '../public/js/road-vehicles.js';
import {flightStickAxes} from '../public/js/aircraft-input.js';
const {walkingStick,walkingSprint} = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../public/js/walking-motion.js', import.meta.url), 'utf8')).toString('base64'));
const source = readFileSync(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
function controller(name, ready=true) {
  const handlers = {}, windowHandlers = {}, resetters = new Set(), knob = {style: {}}, input = {leftX:0,leftY:0,rightX:0,rightY:0}, flushes = [];
  let shots = 0, jumps = 0, captures = 0;
  const stick = {querySelector: () => knob, getBoundingClientRect: () => ({left: 0, top: 0, width: 100, height: 100}), classList: {add(){}, remove(){}}, addEventListener(type, fn){handlers[type] = fn;}};
  const context = vm.createContext({gameplayControlsReady:()=>ready,gameplayOverlayOpen:()=>false,isAircraft,isWatercraft,isRoadVehicle,flightStickAxes,serverActors:{},serverVehicleId:null,walkingStick, authoritativeClient:{requestInput:(immediate=true)=>flushes.push(immediate)}, document: {querySelector: () => stick}, window: {addEventListener(type,fn){windowHandlers[type]=fn;}}, THREE: {MathUtils: {clamp: (v,a,b) => Math.max(a,Math.min(b,v))}}, thumbInput: input, thumbstickResetters:resetters, safelyCapturePointer(){captures++;}, safelyInteract: (_,fn) => fn(), shootAtReticle: () => shots++, jump: () => jumps++});
  vm.runInContext(source.slice(source.indexOf('  function setupThumbstick(name)'), source.indexOf("  setupThumbstick('left')")), context);
  context.setupThumbstick(name);
  return {input, flushes, setReady:value=>{ready=value;}, captures:()=>captures, reset:()=>{for(const reset of resetters)reset(false);}, windowSend:(type,pointerId=1)=>windowHandlers[type]({type,pointerId}), send: (type,x,y,fields={}) => handlers[type]({type, button:0, pointerId: 1, clientX: x, clientY: y, preventDefault(){},...fields}), shots: () => shots, jumps: () => jumps};
}
test('touches before world readiness neither capture nor own a drag, and the next ready gesture works',()=>{
  for(const name of ['left','right']){
    const c=controller(name,false);
    c.send('pointerdown',50,50);
    c.send('pointermove',70,20);
    assert.equal(c.captures(),0,'joining must not capture a finger');
    assert.equal(c.shots()+c.jumps(),0,'joining must not fire or jump');
    assert.deepEqual(c.input,{leftX:0,leftY:0,rightX:0,rightY:0});
    assert.equal(c.flushes.length,0,'joining must not queue walking input');
    c.setReady(true);
    c.send('pointermove',70,20);
    assert.equal(c.input[name+'Y'],0,'an early drag must not become active when joining completes');
    // No release or primary-touch reset: the ignored gesture cannot retain
    // private ownership that would block the next finger after readiness.
    c.send('pointerdown',50,50,{pointerId:7});
    c.send('pointermove',70,20,{pointerId:7});
    assert.equal(c.captures(),1);
    assert.equal(c.shots()+c.jumps(),0,'ready movement gestures must not invoke item actions');
    assert.ok(c.input[name+'Y']<0,'a new ready gesture must steer');
    c.send('pointerup',70,20,{pointerId:7});
    assert.equal(c.input[name+'Y'],0);
  }
});
test('walking uses a small center dead zone while the look stick retains fine linear response', () => {
  const left=controller('left'),right=controller('right');
  left.send('pointerdown',50,50);right.send('pointerdown',50,50);
  for(const offset of [0,1,2]){
    left.send('pointermove',50,50-offset);right.send('pointermove',50,50-offset);
    assert.equal(left.input.leftX,0);assert.equal(left.input.leftY,0);
    assert.ok(Math.abs(right.input.rightY+offset/29)<1e-10);
  }
  left.send('pointermove',50,46);assert.ok(left.input.leftY<-.05,'a small thumb adjustment must produce walking input');
  left.send('pointermove',50,34.34);right.send('pointermove',50,35.5);
  assert.ok(Math.abs(left.input.leftY+.5)<1e-10);
  assert.ok(Math.abs(right.input.rightY+.5)<1e-10);
  left.send('pointermove',50,0);right.send('pointermove',50,0);
  assert.equal(left.input.leftY,-1);assert.equal(right.input.rightY,-1);
  left.send('pointercancel',50,0);right.send('pointercancel',50,0);
  assert.equal(left.input.leftY,0);assert.equal(right.input.rightY,0);
  assert.equal(left.shots(),0);assert.equal(right.jumps(),0);
});
test('pressing an off-center left-stick direction walks immediately without requiring an extra drag', () => {
  const left = controller('left');
  left.send('pointerdown', 30, 20);
  assert.ok(left.input.leftX<-.5);assert.ok(left.input.leftY<-.5);
  assert.ok(Math.hypot(left.input.leftX,left.input.leftY)<=1);
  assert.equal(left.shots(),0);
  left.send('pointermove',50,34.34);
  assert.ok(Math.abs(left.input.leftY+.5)<1e-10);
  left.send('pointerup', 30, 1.5);
  assert.equal(left.shots(), 0);
  const right = controller('right');
  right.send('pointerdown', 50, 35.5);
  assert.ok(Math.abs(right.input.rightY + .5) < 1e-10);
  assert.equal(right.jumps(),0);
  right.send('pointerup', 50, 35.5);
  assert.equal(right.jumps(), 0);
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
  const start = source.indexOf('    if(!serverHostedRoom&&!menuOpen&&!vehicleController.update(frameDelta))');
  const end = source.indexOf('else if(serverHostedRoom)', start);
  const script = new vm.Script(source.slice(start, end));
  for (const delta of [1/120, 1/60, 1/30, .05]) {
    const steps = [];
    script.runInNewContext({delta, frameDelta:delta, serverHostedRoom:false, menuOpen:false, vehicleController:{update:()=>false}, updatePlayer:dt=>steps.push(dt)});
    assert.ok(steps.every(dt=>dt<=1/60));
    assert.ok(Math.abs(steps.reduce((a,b)=>a+b,0)-delta)<1e-10);
  }
  for (const [serverHostedRoom,menuOpen,vehicle] of [[true,false,false],[false,true,false],[false,false,true]]) {
    let calls = 0;
    script.runInNewContext({delta:1/30,frameDelta:1/30,serverHostedRoom,menuOpen,vehicleController:{update:()=>vehicle},updatePlayer:()=>calls++});
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

test('left-stick presses, steering changes and releases flush immediately', () => {
  const c=controller('left');
  c.send('pointerdown',50,50);
  c.send('pointermove',50,43);assert.equal(c.flushes.at(-1),true);
  c.send('pointermove',50,30);assert.equal(c.flushes.at(-1),true);
  c.send('pointermove',50,25);assert.equal(c.flushes.at(-1),true);
  c.send('pointerup',50,25);assert.equal(c.flushes.at(-1),true);
  const right=controller('right');right.send('pointerdown',50,50);right.send('pointermove',60,50);right.send('pointerup',60,50);assert.equal(right.flushes.length,0);
});

test('a fresh primary touch recovers a gesture whose release was discarded',()=>{
  for(const name of ['left','right']){
    const c=controller(name);
    c.send('pointerdown',50,50);c.send('pointermove',70,30);
    assert.ok(Math.abs(c.input[name+'X'])>0);
    c.send('pointerdown',50,50,{pointerId:7,isPrimary:true});
    c.send('pointermove',50,20,{pointerId:7});
    assert.ok(c.input[name+'Y']<0,'a new finger must steer without reloading');
    assert.equal(c.shots()+c.jumps(),0,'fresh touches recover steering without invoking actions');
    c.send('pointerup',50,20,{pointerId:7});
    assert.equal(c.input[name+'Y'],0);
  }
});

test('menu/lifecycle reset clears private pointer ownership and global terminal events stop a drag',()=>{
  const c=controller('left');
  c.send('pointerdown',50,50);c.send('pointermove',50,20);
  c.reset();assert.equal(c.input.leftY,0);
  c.send('pointerdown',50,50,{pointerId:8});c.send('pointermove',50,20,{pointerId:8});
  assert.ok(c.input.leftY<0,'reset must release ownership even without pointerup');
  c.windowSend('pointercancel',8);assert.equal(c.input.leftY,0);
  c.send('pointerdown',50,50,{pointerId:9});c.send('pointermove',50,20,{pointerId:9});
  c.windowSend('pointerup',9);assert.equal(c.input.leftY,0);
});
