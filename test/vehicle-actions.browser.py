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

def assert_layout(panel):
    result = panel.evaluate('''root => {
      const box=root.getBoundingClientRect();
      const buttons=[...root.querySelectorAll('button')].filter(el=>{
        const rect=el.getBoundingClientRect();return rect.width&&rect.height&&getComputedStyle(el).visibility!=='hidden';
      });
      const rects=buttons.map(el=>({label:el.getAttribute('aria-label')||el.textContent,rect:el.getBoundingClientRect()}));
      const small=rects.filter(({rect})=>rect.width<43.5||rect.height<43.5).map(({label})=>label);
      const overflow=rects.filter(({rect})=>rect.left<box.left-.5||rect.right>box.right+.5).map(({label})=>label);
      const overlaps=[];for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
        const a=rects[i].rect,b=rects[j].rect;
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)overlaps.push([rects[i].label,rects[j].label]);
      }
      return {small,overflow,overlaps,scrolls:root.scrollWidth>root.clientWidth+1};
    }''')
    assert not result['small'], result
    assert not result['overflow'], result
    assert not result['overlaps'], result
    assert not result['scrolls'], result

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
            page=browser.new_page(viewport={'width':width,'height':height})
            page.set_default_timeout(6000)
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.wait_for_selector('body[data-ready=true]')
            page.evaluate('''async()=>{
              const {mountAirportOperations}=await import('/public/js/airport-operations.js');
              const {mountHarborOperations}=await import('/public/js/harbor-operations.js');
              const stage=document.querySelector('.house-stage');
              for(const element of stage.querySelectorAll('.basketball-hud,.basketball-aim'))element.hidden=true;
              window.commands=[];window.fired=0;
              window.flightEnv={id:'test-airport',airport:{enabled:true,ceiling:80,runway:{x:40,z:0,width:16,length:202}},builderScene:{objects:[],layoutMeta:{}}};
              window.boatEnv={id:'test-marina',builderScene:{layoutMeta:{harbor:{extent:256,islands:[{id:'island',name:'Beacon Island',x:185,z:24,width:48,depth:48}]}},objects:[{id:'boat',modelId:'harbor-skiff',position:{x:144,y:0,z:20.6},rotation:{y:-Math.PI/2}}]}};
              window.state={players:{pilot:{id:'pilot',username:'Pilot',health:100,ammo:120,fuel:100,vehicleId:'plane',position:{x:-18,y:.4,z:62}}},actors:{
                plane:{id:'plane',modelId:'corsair-aircraft',active:true,health:400,position:{x:-18,y:.4,z:62},rotation:{x:0,y:0,z:0},holderId:'pilot',flight:{speed:0,airspeed:0,altitude:0,airborne:false,phase:'parked'}},
                boat:{id:'boat',modelId:'harbor-skiff',active:true,health:200,position:{x:144,y:0,z:20.6},rotation:{x:0,y:-Math.PI/2,z:0},boating:{speed:0,speedKnots:0,anchor:true,heading:90}}
              }};
              const command=async(action,fields={})=>{commands.push({action,...fields});return {...state,selfId:'pilot',result:{message:'Action applied.'}};};
              window.air=mountAirportOperations({stage,command,fire:async()=>{fired++;},getAim:()=>null});
              window.harbor=mountHarborOperations({stage,command});
              air.updateEnvironment(flightEnv);harbor.updateEnvironment(boatEnv);
              window.refresh=()=>{air.update(state,'pilot');harbor.update(state,'pilot',boatEnv);};
              window.flight=(fields)=>{state.players.pilot.vehicleId='plane';state.actors.plane.flight={speed:18,airspeed:18,altitude:35,airborne:true,phase:'cruise',verticalSpeed:0,...fields};refresh();};
              window.boating=(fields,position={x:144,y:0,z:20.6})=>{state.players.pilot.vehicleId='boat';state.actors.boat.position=position;state.actors.boat.boating={speed:0,speedKnots:0,heading:90,anchor:false,...fields};refresh();};
              refresh();
            }''')
            air_panel=page.get_by_role('region',name='Aircraft flight controls')
            if not air_panel.count():
                air_panel=page.locator('.airport-flight-controls')
            auto=air_panel.locator('.aircraft-auto-action')
            summary=air_panel.locator('.aircraft-flight-summary')
            assert auto.inner_text()=='Auto · Take off and climb'
            assert summary.is_visible()
            assert air_panel.locator('.aircraft-manual-controls').is_hidden()
            assert air_panel.locator('button:visible').count()==2
            assert page.locator('.airport-ops-toggle').is_hidden()
            assert page.locator('.aircraft-combat-reticle').is_hidden()
            assert_layout(air_panel)
            if width==390: page.screenshot(path='/tmp/flight-auto-controls.png')
            auto.click()
            assert page.evaluate('commands.at(-1).action')=='vehicle-action'
            assert page.evaluate('commands.at(-1).mode')=='auto'
            # Actual state-dependent labels remain useful with functions hidden.
            for fields,label in [
                ({'altitude':10,'phase':'climb'},'Climb to safe altitude'),
                ({'altitude':35,'phase':'cruise'},'Hold level flight'),
                ({'speed':3,'airspeed':3,'altitude':20,'stall':True},'Recover airspeed'),
                ({'altitude':10,'phase':'approach','verticalSpeed':-2},'Land and park')]:
                page.evaluate('fields=>flight(fields)',fields)
                assert auto.inner_text()=='Auto · '+label
                assert summary.is_visible()
                assert air_panel.locator('.aircraft-manual-controls').is_hidden()
            before=summary.inner_text()
            page.get_by_role('button',name='Show flight controls',exact=True).click()
            assert air_panel.locator('.aircraft-manual-controls').is_visible()
            assert summary.inner_text()==before
            assert_layout(air_panel)
            page.get_by_role('button',name='Cruise flight override',exact=True).click()
            assert page.evaluate('commands.at(-1).action')=='aircraft-assist'
            assert page.evaluate('commands.at(-1).operation')=='cruise'
            assert auto.get_attribute('aria-pressed')=='true'
            # Programmatically collapse while the real primary pointer is held.
            fire=page.get_by_role('button',name='Fire aircraft cannons',exact=True)
            fire.scroll_into_view_if_needed()
            box=fire.bounding_box()
            page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
            page.mouse.down()
            page.wait_for_function('fired>=1')
            page.wait_for_timeout(250)
            assert page.evaluate('fired')>=2
            page.get_by_role('button',name='Hide flight controls',exact=True).evaluate('(el)=>el.click()')
            stopped=page.evaluate('fired')
            page.wait_for_timeout(300)
            assert page.evaluate('fired')==stopped
            assert page.evaluate('air.lift')==0
            page.mouse.up()
            assert summary.is_visible() and auto.is_visible()
            assert air_panel.locator('.aircraft-manual-controls').is_hidden()
            assert_layout(air_panel)
            # The public trigger API is also the contextual mobile action hook.
            page.evaluate('air.triggerAuto()')
            assert page.evaluate('commands.at(-1).mode')=='auto'

            page.evaluate('boating({anchor:true})')
            boat_panel=page.locator('.harbor-helm-controls')
            boat_auto=boat_panel.locator('.harbor-primary-action')
            readings=boat_panel.get_by_label('Boat navigation readings')
            assert boat_auto.inner_text()=='Auto · Weigh anchor and depart'
            assert readings.is_visible()
            assert boat_panel.locator('.harbor-boat-functions').is_hidden()
            assert boat_panel.locator('button:visible').count()==2
            page.evaluate("boating({assist:'cruise',speed:3,speedKnots:5.8},{x:144,y:0,z:90})")
            assert boat_panel.locator('button:visible').count()==2
            assert page.get_by_role('button',name='Manual boat control',exact=True,include_hidden=True).is_hidden()
            page.evaluate('boating({anchor:true})')
            assert_layout(boat_panel)
            if width==390: page.screenshot(path='/tmp/boat-auto-controls.png')
            boat_auto.click()
            assert page.evaluate('commands.at(-1).action')=='vehicle-action'
            assert page.evaluate('commands.at(-1).mode')=='auto'
            page.evaluate('boating({anchor:false},{x:146,y:0,z:20.6})')
            assert boat_auto.inner_text()=='Auto · Moor at the landing'
            page.evaluate('boating({speed:3,speedKnots:5.8},{x:144,y:0,z:90})')
            assert boat_auto.inner_text()=='Auto · Cruise the waterway'
            page.evaluate('boating({speed:4,speedKnots:7.8},{x:155,y:0,z:24})')
            assert boat_auto.inner_text()=='Auto · Slow for the waterway'
            before=readings.inner_text()
            page.get_by_role('button',name='Show boat functions',exact=True).click()
            assert boat_panel.locator('.harbor-boat-functions').is_visible()
            assert readings.inner_text()==before
            assert_layout(boat_panel)
            page.get_by_role('button',name='Override: Slow',exact=True).click()
            assert page.evaluate('commands.at(-1).action')=='vehicle-action'
            assert page.evaluate('commands.at(-1).mode')=='slow'
            page.get_by_role('button',name='Hide boat functions',exact=True).click()
            assert readings.is_visible() and boat_auto.is_visible()
            assert boat_panel.locator('.harbor-boat-functions').is_hidden()
            assert_layout(boat_panel)
            page.evaluate('harbor.triggerAuto()')
            assert page.evaluate('commands.at(-1).mode')=='auto'
            assert not errors,errors
            page.close()
        browser.close()
    print('Vehicle Auto actions, stable information rows, explicit overrides, collapsed controls, held-fire cancellation and touch layouts passed at four viewport sizes.')
finally:
    server.shutdown()
