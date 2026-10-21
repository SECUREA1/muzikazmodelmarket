from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
server = ThreadingHTTPServer(('127.0.0.1', 0), SimpleHTTPRequestHandler)
Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(320,568),(390,844),(844,390),(1280,800)]:
        page = browser.new_page(viewport={'width':width,'height':height})
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.evaluate('''async () => {
          window.spoken=[];window.commands=[];
          window.SpeechSynthesisUtterance=class {constructor(text){this.text=text}};
          Object.defineProperty(window,'speechSynthesis',{value:{speak:u=>{spoken.push(u.text);queueMicrotask(()=>u.onend?.());},cancel(){},resume(){}},configurable:true});
          const {mountAirportOperations}=await import('/public/js/airport-operations.js');
          window.ops=mountAirportOperations({stage:document.querySelector('.house-stage'),getAim:()=>({origin:{x:0,y:1,z:0},direction:[0,0,-1]}),command:async(action,fields)=>{commands.push({action,...fields});return {result:{message:'Tower. Cleared for takeoff.'}}}});
          ops.updateEnvironment({airport:{enabled:true}});
          ops.update({players:{pilot:{vehicleId:'plane'}},actors:{plane:{id:'plane',modelId:'corsair-aircraft',flight:{phase:'parked'}}}},'pilot');
        }''')
        page.get_by_role('button',name='Show flight controls',exact=True).click()
        page.get_by_role('button',name='Airport tower radio',exact=True).click()
        dialog=page.get_by_role('dialog',name='Airport tower radio')
        dialog.get_by_role('button',name='Mute tower audio').click()
        dialog.get_by_role('button',name='Enable tower audio').click()
        dialog.get_by_role('button',name='Takeoff clearance').click()
        assert page.evaluate('commands[0].action')=='airport-radio'
        assert page.evaluate('commands[0].operation')=='takeoff'
        assert page.evaluate('spoken.length')==3
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        dialog.get_by_role('button',name='Close',exact=True).click()
        climb=page.get_by_role('button',name='Climb aircraft')
        climb.scroll_into_view_if_needed()
        box=climb.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
        page.mouse.down();assert page.evaluate('ops.lift')==1
        page.mouse.up();assert page.evaluate('ops.lift')==0
        page.evaluate("ops.update({players:{pilot:{vehicleId:'plane'}},actors:{plane:{id:'plane',modelId:'corsair-aircraft',flight:{phase:'climb',altitude:12,speed:15,airborne:true}}}},'pilot')")
        assert page.get_by_role('button',name='Exit parked aircraft').is_disabled()
        page.evaluate("ops.update({players:{pilot:{vehicleId:'plane',health:100}},actors:{plane:{id:'plane',modelId:'corsair-aircraft',health:350,flight:{phase:'climb',airborne:true}},enemy:{id:'enemy',modelId:'corsair-aircraft',active:true,health:200,position:{x:0,y:0,z:-50},rotation:{y:0}}}},'pilot');ops.updateAim()")
        assert page.get_by_label('Aircraft target').inner_text().endswith('HP 200')
        page.get_by_role('button',name='Fire aircraft cannons').click()
        assert page.evaluate('commands.at(-1).action')=='fire'
        assert page.locator('.airport-flight-controls').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        page.get_by_role('button',name='Flight instruments and controls',exact=True).click()
        deck=page.get_by_role('dialog',name='Flight instruments and controls',exact=True)
        assert deck.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        deck.get_by_role('slider',name='Engine throttle').fill('65')
        assert page.evaluate('ops.flightInput(0).throttle')==.65
        deck.get_by_role('button',name='Gear down',exact=True).click()
        assert page.evaluate('ops.flightInput(0).gear')==False
        deck.get_by_role('button',name='Flaps up',exact=True).click()
        assert page.evaluate('ops.flightInput(0).flaps')==1
        deck.get_by_role('button',name='Chase view',exact=True).click()
        assert page.evaluate('ops.view')=='chase'
        assert deck.is_hidden()
        page.evaluate("ops.update({players:{pilot:{vehicleId:null,health:0}},actors:{}},'pilot')")
        page.get_by_role('button',name='Respawn pilot').click()
        assert page.evaluate('commands.at(-1).action')=='respawn'
        page.evaluate('ops.updateEnvironment({})')
        assert page.get_by_role('button',name='Airport tower radio',exact=True).is_hidden()
        page.close()
    browser.close()
server.shutdown()
print('Airport radio, voice, flight controls and mobile layouts passed at four viewport sizes.')
