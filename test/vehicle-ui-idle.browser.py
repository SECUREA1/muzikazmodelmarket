from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os


os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox']
        )
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.wait_for_selector('body[data-ready=true]')
        results = page.evaluate('''async () => {
          const {mountAirportOperations}=await import('/public/js/airport-operations.js');
          const {mountHarborOperations}=await import('/public/js/harbor-operations.js');
          const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
          const stage=document.createElement('div');stage.className='house-stage';
          document.body.replaceChildren(stage);
          const flow=mountGameDisplayFlow(stage);
          const command=async()=>({result:{message:'Applied'}});
          const inputs=[];
          const air=mountAirportOperations({stage,command,onInput:()=>inputs.push({source:'air',...air.flightInput(0),lift:air.lift})});
          const harbor=mountHarborOperations({stage,command,onInput:()=>inputs.push({source:'boat',...harbor.inputs(harbor.ahead),ahead:harbor.ahead})});
          const airport={id:'airport',airport:{enabled:true,ceiling:80,runway:{x:40,z:0,width:16,length:202}},builderScene:{objects:[],layoutMeta:{}}};
          const marina={id:'marina',builderScene:{objects:[],layoutMeta:{harbor:{extent:256,islands:[{id:'beacon',name:'Beacon Island',x:185,z:24}]}}}};
          const common={id:'common',builderScene:{objects:[],layoutMeta:{}}};
          let environment=common;
          const state={players:{pilot:{id:'pilot',health:100,ammo:120,fuel:100,vehicleId:null,position:{x:0,y:0,z:0}}},actors:{
            plane:{id:'plane',modelId:'corsair-aircraft',active:true,health:400,maxHealth:400,holderId:null,position:{x:100,y:0,z:100},rotation:{x:0,y:0,z:0},flight:{speed:0,airspeed:0,altitude:0,airborne:false,phase:'parked',gear:true,flaps:0}},
            boat:{id:'boat',modelId:'harbor-skiff',active:true,health:200,maxHealth:200,position:{x:144,y:0,z:20.6},rotation:{x:0,y:-Math.PI/2,z:0},boating:{speed:0,speedKnots:0,anchor:true,heading:90,fuel:100}}
          }};
          const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const refresh=()=>{air.update(structuredClone(state),'pilot');harbor.update(structuredClone(state),'pilot',environment);};
          const setEnvironment=value=>{environment=value;air.updateEnvironment(value);harbor.updateEnvironment(value);refresh();};
          const measure=async(name,walk=false)=>{
            refresh();await settle();
            const records=[],inputCount=inputs.length;
            const observer=new MutationObserver(changes=>records.push(...changes));
            observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
            for(let i=0;i<40;i++){
              // Room timestamps and on-foot movement may change without any
              // vehicle readout or control state needing a new DOM node.
              state.serverTime=i;
              if(walk)state.players.pilot.position.x=i/20;
              refresh();air.updateAim();
            }
            await settle();records.push(...observer.takeRecords());observer.disconnect();
            if(inputs.length!==inputCount)throw Error(name+': unchanged snapshots requested new inputs');
            return {name,count:records.length,changes:records.slice(0,8).map(record=>({type:record.type,attribute:record.attributeName,target:record.target.className||record.target.nodeName}))};
          };
          const results=[];
          setEnvironment(common);
          results.push(await measure('Walking outside vehicle maps',true));
          setEnvironment(airport);
          state.players.pilot.position={x:1,y:0,z:1};
          state.actors.plane.position={x:2,y:0,z:1};refresh();
          if(stage.querySelector('[aria-label="Enter nearby aircraft cockpit"]').closest('section').hidden)throw Error('Nearby cockpit entry disappeared');
          results.push(await measure('On foot beside a cockpit'));
          state.players.pilot.vehicleId='plane';state.actors.plane.holderId='pilot';refresh();
          results.push(await measure('Seated aircraft with functions collapsed'));
          stage.querySelector('.aircraft-controls-toggle').click();
          const power=stage.querySelector('[aria-label="Flight power"]');
          power.value='65';power.dispatchEvent(new Event('input',{bubbles:true}));
          if(inputs.at(-1)?.source!=='air'||inputs.at(-1)?.throttle!==.65)throw Error('Power input was not published synchronously');
          const climb=stage.querySelector('[aria-label="Climb aircraft"]');
          climb.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          if(inputs.at(-1)?.lift!==1)throw Error('Held climb input was not published synchronously');
          climb.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
          if(inputs.at(-1)?.lift!==0)throw Error('Released climb input was not published synchronously');
          results.push(await measure('Seated aircraft with functions expanded'));
          state.actors.plane.flight={...state.actors.plane.flight,speed:18,airspeed:18,airborne:true,altitude:35,phase:'cruise',assist:'cruise',assistStage:'level-flight'};
          refresh();results.push(await measure('Aircraft in assisted flight'));
          setEnvironment(marina);
          state.players.pilot.vehicleId='boat';refresh();
          results.push(await measure('Boat with functions collapsed'));
          stage.querySelector('.harbor-functions-toggle').click();
          const ahead=stage.querySelector('[aria-label="Ahead boat"]');
          ahead.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          if(inputs.at(-1)?.source!=='boat'||inputs.at(-1)?.ahead!==1)throw Error('Ahead input was not published synchronously');
          ahead.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
          if(inputs.at(-1)?.ahead!==0)throw Error('Boat release input was not published synchronously');
          results.push(await measure('Boat with functions expanded'));
          // Readings still update when state actually changes.
          state.actors.boat.boating.speedKnots=9.5;refresh();
          if(!stage.querySelector('[aria-label="Boat navigation readings"]').textContent.includes('9.5 kt'))throw Error('Boat readings became stale');
          results.push(await measure('Boat after a speed change'));

          // Direct additions are collected, while descendant changes no longer
          // cause the stage collector to scan unrelated controls.
          const dynamicPanel=document.createElement('section');dynamicPanel.className='airport-flight-controls';stage.append(dynamicPanel);
          const camera=document.createElement('button');camera.className='game-camera-toggle';stage.append(camera);
          const trigger=document.createElement('button');trigger.className='rad-tox-fire-trigger';stage.append(trigger);
          await settle();
          if(dynamicPanel.parentElement!==flow.root)throw Error('Dynamic panel not collected');
          if(!camera.parentElement.classList.contains('game-display-flow-views'))throw Error('Dynamic camera not collected');
          if(!trigger.parentElement.classList.contains('game-display-flow-actions'))throw Error('Dynamic trigger not collected');
          const sentinel=document.createElement('aside');let scans=0;
          sentinel.matches=function(selector){scans++;return Element.prototype.matches.call(this,selector);};
          stage.append(sentinel);await settle();scans=0;
          dynamicPanel.textContent='Updated child';dynamicPanel.hidden=true;
          await settle();if(scans)throw Error('Descendant changes rescanned the stage');
          air.dispose();harbor.dispose();flow.dispose();
          return results;
        }''')
        assert not errors, errors
        for result in results:
            assert result['count'] == 0, result
        browser.close()
finally:
    server.shutdown()

print('Vehicle panels produce no mutations for unchanged on-foot or piloting snapshots; dynamic controls still collect.')
