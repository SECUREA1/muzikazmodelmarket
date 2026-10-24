"""Real vehicle UI release handlers clear holds/capture without changing selected settings."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        if self.path == '/__vehicle-release':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<!doctype html><body></body>')
        else:
            super().do_GET()

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1000, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/__vehicle-release')
        results = page.evaluate('''async()=>{
          const {mountAirportOperations}=await import('/public/js/airport-operations.js');
          const {mountHarborOperations}=await import('/public/js/harbor-operations.js');
          const {mountConstructionUI}=await import('/public/js/construction-ui.js');
          const {mountPatrolControls}=await import('/public/js/patrol-controls.js');
          const {requestGameInputRelease}=await import('/public/js/game-input-release.js');
          const assert=(test,message)=>{if(!test)throw Error(message);};
          const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
          const release=()=>requestGameInputRelease('vehicle-release-regression');
          const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='position:relative;width:900px;height:800px';document.body.append(stage);
          const key=(node,name,type='keydown',repeat=false)=>node.dispatchEvent(new KeyboardEvent(type,{key:name,bubbles:true,cancelable:true,repeat}));
          const pointer=(node,id,type='pointerdown')=>{const r=node.getBoundingClientRect();node.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:true,button:0,clientX:r.left+r.width*.85,clientY:r.top+r.height*.2,bubbles:true,cancelable:true}));};
          const capture=node=>{const ids=new Set();node.setPointerCapture=id=>ids.add(id);node.hasPointerCapture=id=>ids.has(id);node.releasePointerCapture=id=>ids.delete(id);return ids;};
          const results=[];

          let inputCount=0,shots=0;
          const air=mountAirportOperations({stage,command:async()=>false,onInput:()=>inputCount++,fire:async()=>{shots++;return {};}});
          air.updateEnvironment({id:'airport',airport:{enabled:true},builderScene:{objects:[],layoutMeta:{}}});
          air.update({players:{p:{health:100,ammo:100,vehicleId:'plane'}},actors:{plane:{id:'plane',modelId:'corsair-aircraft',active:true,health:400,holderId:'p',flight:{gear:false,flaps:.3,speed:0,airspeed:0,assist:'cruise'}}}},'p');
          stage.querySelector('.aircraft-controls-toggle').click();
          const power=stage.querySelector('[aria-label="Flight power"]');power.value='67';power.dispatchEvent(new Event('input'));
          const settings=JSON.stringify(air.flightInput(0)),climb=stage.querySelector('[aria-label="Climb aircraft"]'),fire=stage.querySelector('[aria-label="Fire aircraft cannons"]'),liftCapture=capture(climb),fireCapture=capture(fire);
          pointer(climb,11);pointer(fire,12);assert(air.lift===1&&fire.getAttribute('aria-pressed')==='true','flight holds did not engage');
          const beforeAir=inputCount;release();assert(air.lift===0&&fire.getAttribute('aria-pressed')==='false','flight holds survived release');assert(liftCapture.size===0&&fireCapture.size===0,'flight capture survived release');assert(inputCount===beforeAir,'flight release sent an intermediate input');assert(JSON.stringify(air.flightInput(0))===settings,'flight release changed selected power/configuration');
          const heldShots=shots;await new Promise(resolve=>setTimeout(resolve,230));assert(shots===heldShots,'aircraft cannon timer survived release');key(climb,' ', 'keydown',true);assert(air.lift===0,'repeat key revived released lift');key(climb,' ');assert(air.lift===1,'fresh aircraft key did not work');key(climb,' ','keyup');assert(air.lift===0,'fresh aircraft key did not release');air.dispose();results.push('aircraft hold/capture/timer release and fresh input');

          const harbor=mountHarborOperations({stage,command:async()=>({}),onInput:()=>inputCount++});
          const environment={id:'harbor',builderScene:{objects:[],layoutMeta:{harbor:{extent:256,islands:[]}}}};harbor.updateEnvironment(environment);
          harbor.update({players:{p:{health:100,vehicleId:'boat'}},actors:{boat:{id:'boat',modelId:'harbor-sailboat',active:true,health:200,position:{x:144,y:0,z:20},rotation:{y:0},boating:{speed:0,anchor:false,sailTrim:.65}}}},'p',environment);
          stage.querySelector('.harbor-functions-toggle').click();const ahead=stage.querySelector('[aria-label="Ahead boat"]'),aheadCapture=capture(ahead);pointer(ahead,21);assert(harbor.ahead===1,'boat ahead hold did not engage');const beforeBoat=inputCount;release();assert(harbor.ahead===0&&aheadCapture.size===0&&!ahead.classList.contains('is-active'),'boat hold/capture survived release');assert(inputCount===beforeBoat,'boat release sent an intermediate input');key(ahead,' ','keydown',true);assert(harbor.ahead===0,'repeat key revived released boat hold');key(ahead,' ');assert(harbor.ahead===1,'fresh boat key did not work');key(ahead,' ','keyup');
          const boatPower=document.querySelector('[aria-label="Boat throttle"]');boatPower.value='35';boatPower.dispatchEvent(new Event('input'));const boatSettings=JSON.stringify(harbor.inputs(0));release();assert(JSON.stringify(harbor.inputs(0))===boatSettings,'release changed a selected boat setting');harbor.dispose();results.push('boat hold/capture release and fresh input');

          const commands=[];const construction=mountConstructionUI(stage,async(action,fields)=>{commands.push({action,...fields});return {};},{onInput:()=>inputCount++});
          construction.update({players:{p:{health:100,vehicleId:'machine'}},actors:{machine:{id:'machine',modelId:'site-excavator',active:true,position:{x:0,y:0,z:0},driving:{speed:0},construction:{kind:'excavator',boom:.7,stick:-.8,bucket:0,swing:0,telemetry:{travelAllowed:true}}}}},'p');
          const hydraulic=stage.querySelector('[data-control-kind="hydraulic"]');hydraulic.style.cssText='width:120px;height:120px';const machineCapture=capture(hydraulic);pointer(hydraulic,31);await settle();assert(commands.some(command=>Object.values(command.axes||{}).some(value=>Math.abs(value)>.1)),'hydraulic input did not engage');release();await settle();assert(machineCapture.size===0&&!hydraulic.classList.contains('is-active'),'hydraulic capture survived release');assert(!Object.values(commands.at(-1).axes).some(Boolean),'hydraulic axes did not reach neutral');const afterNeutral=commands.length;key(hydraulic,'ArrowRight','keydown',true);await settle();assert(commands.length===afterNeutral,'repeat key revived released hydraulics');key(hydraulic,'ArrowRight');await settle();assert(commands.length>afterNeutral,'fresh hydraulic key did not work');release();await settle();
          stage.querySelector('[data-construction-mode="drive"]').click();const travel=stage.querySelector('[data-control-kind="travel"]');travel.style.cssText='width:120px;height:120px';const travelCapture=capture(travel);pointer(travel,32);assert(construction.inputs()?.forward>.1,'machine travel did not engage');const beforeMachine=inputCount;release();assert(construction.inputs()===null&&travelCapture.size===0,'machine travel survived release');assert(inputCount===beforeMachine,'machine release sent an intermediate input');construction.dispose();results.push('hydraulic/travel release and fresh input');

          let patrolShots=0;const patrol=mountPatrolControls({stage,command:async()=>{patrolShots++;return {};},getAim:()=>({direction:[0,0,-1]})});patrol.update({players:{p:{ammo:40,vehicleId:'patrol'}},actors:{patrol:{id:'patrol',modelId:'harbor-patrol',active:true,health:650}}},'p');
          const cannon=stage.querySelector('[aria-label="Fire patrol cannon"]'),patrolCapture=capture(cannon);pointer(cannon,41);await settle();assert(patrolShots===1,'patrol cannon did not engage');release();assert(patrolCapture.size===0&&cannon.getAttribute('aria-pressed')==='false','patrol capture survived release');await new Promise(resolve=>setTimeout(resolve,310));assert(patrolShots===1,'patrol cannon timer survived release');pointer(cannon,42);await settle();assert(patrolShots===2,'fresh patrol input did not work');release();patrol.dispose();results.push('patrol hold/timer release and fresh input');
          return results;
        }''')
        assert not errors, errors
        browser.close()
        print('PASS: ' + '; '.join(results))
finally:
    server.shutdown()
