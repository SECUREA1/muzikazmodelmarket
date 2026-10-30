from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(320,568),(390,844),(844,390),(1280,800)]:
        page = browser.new_page(viewport={'width':width,'height':height}, has_touch=True)
        errors=[];page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.evaluate('''async () => {
          window.spoken=[];window.commands=[];window.deferDeparture=false;window.failDeparture=false;window.deferManual=false;
          const Utterance=class {constructor(text){this.text=text}};
          const {GENERATED_VOICES}=await import('/public/js/neural-character-speech.js');
          const speech={getVoices:()=>GENERATED_VOICES,speak:u=>{spoken.push(u.text);u.onstart?.();queueMicrotask(()=>u.onend?.());},cancel(){},resume(){}};
          const {mountAirportOperations}=await import('/public/js/airport-operations.js');
          window.ops=mountAirportOperations({audioOptions:{speech,Utterance,audioFactory:()=>null},stage:document.querySelector('.house-stage'),getAim:()=>({origin:{x:0,y:1,z:0},direction:[0,0,-1]}),command:async(action,fields)=>{
            commands.push({action,...fields});
            if(action==='aircraft-assist'&&fields.operation==='emergency-departure'){
              if(failDeparture)throw Error('Taxi route unavailable. Use manual control or try again.');
              if(deferDeparture)return await new Promise(resolve=>window.resolveDeparture=resolve);
              return {result:{message:'Tower. Emergency preflight checks started.'}};
            }
            if(action==='aircraft-assist'&&fields.operation==='cancel'&&deferManual)return await new Promise(resolve=>window.resolveManual=resolve);
            return {result:{message:fields.operation==='cancel'?'Tower. Manual flight controls active.':'Tower. Cleared for takeoff.'}};
          }});
          ops.updateEnvironment({airport:{enabled:true}});
          ops.update({players:{pilot:{vehicleId:'plane'}},actors:{plane:{id:'plane',modelId:'corsair-aircraft',flight:{phase:'parked'}}}},'pilot');
          window.emergencyEnvironment={id:'response-airfield',name:'Alpine Response Airfield',airport:{enabled:true,ceiling:140,runway:{x:0,z:0,width:16,length:202},runways:[{id:'runway',name:'International Runway',x:0,z:0,width:16,length:202},{id:'alpine',name:'Alpine Ridge paved runway',x:620,z:-500,width:20,length:240}]}};
          window.publishEmergency=(stage=null,status='active',id='departure-1',reason=null,vehicleId='evac')=>{
            const airborne=stage==='climb'||status==='complete';
            const flight={phase:airborne?'climb':stage==='taxi'?'taxi':'parked',airborne,altitude:airborne?26:0,speed:airborne?14:0,airspeed:airborne?14:0,runwayId:'alpine',assist:stage&&['active','waiting','blocked'].includes(status)?'emergency-departure':null,assistStage:stage,assistSince:1000};
            if(stage)flight.emergencyDeparture={id,runwayId:'alpine',runwayName:'Alpine Ridge paved runway',status,stage,startedAt:1000,updatedAt:2000,reason};
            window.emergencyPlane={id:vehicleId,modelId:'doomsday-evacuation-aircraft',active:true,health:400,holderId:'pilot',position:{x:600,y:.4,z:-400},rotation:{y:0},flight};
            ops.update({players:{pilot:{vehicleId,health:100,ammo:120}},actors:{[vehicleId]:emergencyPlane}},'pilot');
          };
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

        # Emergency departures have a visible primary action without opening
        # the instrument drawer, and never offer weapons on an unarmed craft.
        page.evaluate("document.querySelector('.rad-sports-viewport').hidden=true;document.querySelector('.basketball-hud').hidden=true;ops.updateEnvironment(emergencyEnvironment);publishEmergency()")
        departure=page.get_by_role('region',name='Emergency departure guide')
        start=page.get_by_role('button',name='Start emergency departure',exact=True)
        manual=page.get_by_role('button',name='Take manual flight control',exact=True)
        assert departure.is_visible() and start.is_enabled() and manual.is_disabled()
        assert page.get_by_role('button',name='Show flight controls',exact=True).is_visible()
        assert 'unarmed' in page.evaluate('spoken.at(-1)').lower()
        assert 'fire' not in page.evaluate('spoken.at(-1)').lower()
        assert 'Ammo' not in page.locator('.aircraft-flight-summary').inner_text()
        for control in [start,manual]:
            assert control.bounding_box()['height']>=44
        assert departure.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        departure.scroll_into_view_if_needed();page.screenshot(path=f'/workspace/emergency-flight-guide-ready-{width}.png')
        page.get_by_role('button',name='Show flight controls',exact=True).click()
        assert page.get_by_role('button',name='Fire aircraft cannons',exact=True).is_hidden()
        assert page.locator('.aircraft-combat-reticle').is_hidden()
        assert 'fire' not in page.locator('.aircraft-mobile-help').inner_text().lower()
        page.get_by_role('button',name='Airport tower radio',exact=True).click()
        assert 'Alpine Ridge paved runway' in dialog.locator('[data-airspace]').inner_text()
        assert '140 m' in dialog.locator('[data-airspace]').inner_text()
        assert 'fire' not in dialog.locator('[data-flight-help]').inner_text().lower()
        dialog.get_by_role('button',name='Close',exact=True).click()
        page.get_by_role('slider',name='Flight power',exact=True).fill('65')
        page.get_by_role('button',name='Flight instruments and controls',exact=True).click()
        assert 'unarmed' in deck.locator('[data-instrument-help]').inner_text().lower()
        assert 'fire' not in deck.locator('[data-instrument-help]').inner_text().lower()
        deck.get_by_role('button',name='Wheel brake',exact=True).click()
        assert page.evaluate('ops.flightInput(0).throttle===.65 && ops.flightInput(0).brake===true')
        deck.get_by_role('button',name='Close',exact=True).click()
        page.get_by_role('button',name='Hide flight controls',exact=True).click()

        # One real tap starts one request and reports loading immediately.
        page.evaluate('deferDeparture=true;window.beforeDepartureCommands=commands.length')
        start.tap()
        assert start.get_attribute('aria-busy')=='true' and start.is_disabled()
        assert page.evaluate("!('throttle' in ops.flightInput(0)) && ops.flightInput(0).brake===false"),'Old manual throttle/brake canceled the pending assisted departure.'
        assert 'Requesting an emergency departure' in departure.locator('[data-departure-guidance]').inner_text()
        assert page.get_by_role('button',name='Show flight controls',exact=True).is_enabled()
        page.wait_for_timeout(100)
        assert page.evaluate('commands.length===beforeDepartureCommands+1')
        page.evaluate("deferDeparture=false;resolveDeparture({result:{message:'Tower. Emergency preflight checks started.'}})")
        page.wait_for_function("document.querySelector('[data-emergency-start]').getAttribute('aria-busy')==='false'")

        # Tower narrates each actual stage once, with the current strip and
        # ceiling; waiting and blocked routes retain manual takeover.
        for stage,label in [('preflight','Preflight'),('taxi','Taxi'),('lineup','Line up'),('roll','Takeoff roll'),('climb','Climb')]:
            page.evaluate('(stage)=>{window.beforeStageSpeech=spoken.length;publishEmergency(stage)}',stage)
            assert departure.locator('[data-departure-stage]').inner_text()==label
            assert manual.is_enabled() and start.is_disabled()
            page.evaluate('(stage)=>publishEmergency(stage)',stage)
            assert page.evaluate('spoken.length===beforeStageSpeech+1'),(stage,page.evaluate('spoken.slice(-3)'))
            if stage in ['lineup','roll']:
                assert 'Alpine Ridge paved runway' in page.evaluate('spoken.at(-1)')
            if stage=='climb':
                assert '140 metres' in page.evaluate('spoken.at(-1)')
        page.evaluate("publishEmergency('hold-short','waiting','departure-2','Another pilot is using the runway.')")
        assert departure.locator('[data-departure-stage]').inner_text()=='Waiting for clearance'
        assert 'Another pilot' in departure.locator('[data-departure-guidance]').inner_text()
        assert manual.is_enabled()
        departure.scroll_into_view_if_needed();page.screenshot(path=f'/workspace/emergency-flight-guide-waiting-{width}.png')
        page.evaluate("publishEmergency('taxi','blocked','departure-3','Taxi corridor blocked. Waiting for it to clear.')")
        assert departure.locator('[data-departure-stage]').inner_text()=='Route blocked'
        assert 'Taxi corridor blocked' in departure.locator('[data-departure-guidance]').inner_text()
        assert manual.is_enabled()
        page.evaluate('window.beforeManual=commands.length')
        manual.tap()
        assert page.evaluate("commands.length===beforeManual+1 && commands.at(-1).operation==='cancel'")
        page.evaluate("publishEmergency('taxi','cancelled','departure-3','Manual flight controls active.')")
        assert manual.is_disabled()
        assert 'Manual flight controls active' in departure.locator('[data-departure-guidance]').inner_text()
        page.evaluate("publishEmergency('climb','complete','departure-4')")
        assert departure.locator('[data-departure-stage]').inner_text()=='Departure complete'
        assert 'Departure complete' in page.evaluate('spoken.at(-1)')
        page.evaluate("publishEmergency('hold-short','timed-out','departure-5','Departure timed out. Manual control is active.')")
        assert 'timed out' in departure.locator('[data-departure-guidance]').inner_text()
        assert manual.is_disabled() and start.is_enabled()

        # A failed request is recoverable and its reason stays visible beside
        # the action, rather than disappearing inside a closed radio dialog.
        page.evaluate('publishEmergency();failDeparture=true')
        start.tap()
        page.wait_for_function("document.querySelector('[data-departure-stage]').textContent==='Try again'")
        assert 'Taxi route unavailable' in departure.locator('[data-departure-guidance]').inner_text()
        assert start.is_enabled()
        page.evaluate('failDeparture=false')
        start.tap()
        page.wait_for_function("document.querySelector('[data-departure-stage]').textContent==='Ready'")
        assert start.is_enabled() and 'Taxi route unavailable' not in departure.inner_text()

        # A delayed reply from a previous map must not overwrite its successor.
        page.evaluate('deferDeparture=true')
        start.tap()
        page.evaluate("window.oldDepartureReply=resolveDeparture;ops.updateEnvironment({...emergencyEnvironment,id:'other-airfield'});publishEmergency();window.beforeStaleSpeech=spoken.length;oldDepartureReply({result:{message:'STALE DEPARTURE REPLY'}})")
        page.wait_for_timeout(100)
        assert page.evaluate('spoken.length===beforeStaleSpeech')
        assert start.is_enabled()
        # Swapping aircraft within the same map invalidates the old start just
        # as changing maps does. The outgoing request names its exact craft.
        start.tap()
        assert page.evaluate("commands.at(-1).vehicleId==='evac'")
        page.evaluate("window.oldVehicleReply=resolveDeparture;publishEmergency(null,'active','departure-next',null,'other-evac');window.beforeVehicleReply=spoken.length;oldVehicleReply({result:{message:'STALE AIRCRAFT REPLY'}})")
        page.wait_for_timeout(100)
        assert page.evaluate('spoken.length===beforeVehicleReply')
        assert start.is_enabled()
        page.evaluate("deferDeparture=false;deferManual=true;publishEmergency('taxi','active','departure-manual')")
        manual.tap()
        assert page.evaluate("commands.at(-1).vehicleId==='evac'")
        page.evaluate("window.oldManualReply=resolveManual;ops.updateEnvironment({...emergencyEnvironment,id:'manual-successor'});publishEmergency();window.beforeManualReply=spoken.length;oldManualReply({result:{message:'STALE MANUAL REPLY'}})")
        page.wait_for_timeout(100)
        assert page.evaluate('spoken.length===beforeManualReply')
        assert start.is_enabled()
        page.evaluate("deferDeparture=false;ops.updateEnvironment({id:'remote-world',name:'Remote world'});publishEmergency()")
        assert start.is_disabled()
        assert 'no marked runway' in departure.locator('[data-departure-guidance]').inner_text().lower()
        assert 'manual' in page.evaluate('spoken.at(-1)').lower()
        assert 'choose emergency departure' not in page.evaluate('spoken.at(-1)').lower()
        page.get_by_role('button',name='Show flight controls',exact=True).click()
        assert page.get_by_role('button',name='Climb aircraft',exact=True).is_enabled()
        assert page.locator('.airport-flight-controls').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        page.screenshot(path=f'/workspace/emergency-flight-guide-{width}.png')

        if width in [320,390]:
            # Real page styles apply wider button defaults than the standalone
            # fixture. The short embedded view must still expose the action.
            page.add_style_tag(url=f'http://127.0.0.1:{server.server_port}/styles.css')
            page.add_style_tag(url=f'http://127.0.0.1:{server.server_port}/public/assets/game-menus.css')
            page.evaluate("""()=>{const stage=document.querySelector('.house-stage'),host=document.createElement('div');host.className='house-explorer-shell';stage.before(host);host.append(stage);host.style.setProperty('height','316px','important');host.style.setProperty('width','100%','important');stage.style.setProperty('height','316px','important');stage.style.setProperty('flex','0 0 316px','important');ops.updateEnvironment(emergencyEnvironment);publishEmergency();}""")
            assert departure.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            assert start.bounding_box()['height']>=44
            before_host=page.evaluate('commands.length')
            start.tap()
            page.wait_for_function('(before)=>commands.length===before+1',arg=before_host)
            assert start.is_enabled()
            page.screenshot(path=f'/workspace/emergency-flight-guide-host-{width}.png')

        page.evaluate("ops.update({players:{pilot:{vehicleId:null,health:0}},actors:{}},'pilot')")
        page.get_by_role('button',name='Respawn pilot').click()
        assert page.evaluate('commands.at(-1).action')=='respawn'
        page.evaluate('ops.updateEnvironment({})')
        assert page.get_by_role('button',name='Airport tower radio',exact=True).is_hidden()
        assert not errors,errors
        page.evaluate('ops.dispose()')
        page.close()
    browser.close()
server.shutdown()
print('Airport radio, emergency departure stages, loading/retry/manual guidance and mobile layouts passed at four viewport sizes.')
