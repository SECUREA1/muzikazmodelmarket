"""Companion maps preserve live vehicle controls; real modal menus stop them."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1000,'height':900}); errors=[]
  page.on('pageerror',lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.wait_for_selector('body[data-ready=true]')
  page.evaluate('''async()=>{
   document.querySelectorAll('dialog').forEach(dialog=>dialog.close());
   const stage=document.querySelector('.house-stage');
   const {mountAirportOperations}=await import('/public/js/airport-operations.js');
   const {mountHarborOperations}=await import('/public/js/harbor-operations.js');
   const {mountPatrolControls}=await import('/public/js/patrol-controls.js');
   window.commands=[];window.shots=0;const command=async(action,fields)=>{commands.push({action,...fields});return {result:{message:'Confirmed'}}};
   window.airport=mountAirportOperations({stage,command,fire:async()=>{shots++;return {};}});
   airport.updateEnvironment({airport:{enabled:true}});
   airport.update({players:{pilot:{vehicleId:'plane',health:100,ammo:100}},actors:{plane:{id:'plane',modelId:'corsair-aircraft',active:true,health:350,flight:{phase:'cruise',airborne:true}}}},'pilot');
   stage.querySelector('.aircraft-controls-toggle').click();
   window.harbor=mountHarborOperations({stage,command});window.harborEnvironment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}};
   harbor.updateEnvironment(harborEnvironment);harbor.update({players:{pilot:{vehicleId:'boat',health:100}},actors:{boat:{id:'boat',modelId:'harbor-skiff',active:true,health:200,position:{x:140,y:0,z:0},rotation:{y:0},boating:{speed:0}}}},'pilot',harborEnvironment);
   stage.querySelector('.harbor-functions-toggle').click();
   window.patrol=mountPatrolControls({stage,command,getAim:()=>({direction:[0,0,-1]})});patrol.update({players:{pilot:{vehicleId:'patrol',ammo:100}},actors:{patrol:{id:'patrol',modelId:'harbor-patrol',active:true,health:100}}},'pilot');
   window.map=document.createElement('dialog');map.dataset.gameplayBlocking='false';map.textContent='Companion map';document.body.append(map);
   window.menu=document.createElement('dialog');menu.textContent='Actual modal menu';document.body.append(menu);
   window.climb=stage.querySelector('[aria-label="Climb aircraft"]');window.ahead=[...stage.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='Ahead boat');
   window.press=button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   window.release=button=>button.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
   press(climb);press(ahead);airport.startFiring({external:true});
   window.beforeMap=shots;map.show();
  }''')
  page.wait_for_timeout(250)
  assert page.evaluate('airport.lift===1&&harbor.ahead===1&&shots>beforeMap'), 'modeless map cancelled held flight or helm controls'
  page.evaluate("document.querySelector('.patrol-cannon button').dispatchEvent(new MouseEvent('click',{detail:0}));")
  page.wait_for_function("commands.some(command=>command.action==='fire')")
  page.evaluate('menu.showModal();window.beforeModal=shots;')
  page.wait_for_timeout(250)
  assert page.evaluate('airport.lift===0&&shots===beforeModal'), 'actual modal failed to stop aircraft input'
  page.evaluate("window.beforePatrol=commands.filter(command=>command.action==='fire').length;document.querySelector('.patrol-cannon button').dispatchEvent(new MouseEvent('click',{detail:0}));")
  page.wait_for_timeout(25)
  assert page.evaluate("commands.filter(command=>command.action==='fire').length===beforePatrol"), 'actual modal permitted patrol cannon'
  page.evaluate('menu.close();map.close();map.showModal();')
  assert page.evaluate('airport.fireOnce({external:true})===false'), 'companion marker must not override actual modality'
  page.evaluate('map.close();airport.dispose();patrol.dispose();harbor.dispose();')

  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/construction-controls.html')
  page.wait_for_selector('body[data-ready=true]')
  page.evaluate('''()=>{
   const stage=document.querySelector('main');stage.dataset.hudHidden='true';
   document.dispatchEvent(new CustomEvent('muzikaz:game-hud-visibility',{detail:{stage,hidden:true}}));
   window.map=document.createElement('dialog');map.dataset.gameplayBlocking='false';map.textContent='Companion map';document.body.append(map);map.show();
   window.pad=document.querySelector('.construction-stick');pad.focus();pad.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  }''')
  page.wait_for_function("calls.some(call=>call.action==='construction-controls'&&Math.abs(call.axes?.trolley||0)>.1)")
  assert page.locator('.construction-controls').is_visible(), 'removed global eye state must not hide construction controls'
  page.evaluate("window.beforeModal=calls.length;map.close();map.showModal();")
  page.wait_for_function("calls.slice(beforeModal).some(call=>call.axes&&Object.values(call.axes).every(value=>Math.abs(value)<.001))")
  page.evaluate('map.close();dashboard.dispose();road.dispose();flow.dispose?.();')
  assert not errors, errors
  browser.close()
 print('Companion maps preserve aircraft, harbor, patrol and construction controls; actual modal menus stop input.')
finally:
 server.shutdown()
