"""Exercise the mobile cockpit controls with real layout and input modules."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os


os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


SETUP = """async () => {
    const stage=document.createElement('div');
    stage.className='house-stage';
    document.body.replaceChildren(stage);
    const style=document.createElement('style');
    style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden}'+
      '.house-stage{position:relative;width:100%;height:100dvh;background:#142b39}'+
      '.test-chat{position:absolute;top:80px;left:8px;padding:8px;background:#fff;color:#000}';
    document.head.append(style);
    const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
    const {mountAirportOperations}=await import('/public/js/airport-operations.js');
    const {flightStickAxes}=await import('/public/js/aircraft-input.js');
    window.flightStickAxes=flightStickAxes;
    window.commands=[];window.views=[];window.centers=0;window.fireDelay=80;
    const command=async(action,fields={})=>{
      commands.push({action,...fields,at:performance.now()});
      if(action==='fire')await new Promise(resolve=>setTimeout(resolve,fireDelay));
      return {result:{message:'Flight action accepted.'}};
    };
    window.ops=mountAirportOperations({stage,command,
      fire:()=>command('fire',{tool:'laser'}),
      getAim:()=>({origin:{x:0,y:1,z:0},direction:[0,0,-1]}),
      onView:mode=>views.push(mode),onRecenter:()=>centers++});
    window.flow=mountGameDisplayFlow(stage);
    const chat=document.createElement('section');chat.id='crib-chat-panel';
    chat.className='test-chat';chat.hidden=true;chat.textContent='Chat open';stage.append(chat);
    window.setChat=open=>{chat.hidden=!open;window.dispatchEvent(new CustomEvent('muzikaz:chat-panel',{detail:{open}}));};
    window.makePlane=(id='plane',patch={})=>({id,modelId:'corsair-aircraft',active:true,
      health:400,maxHealth:400,position:{x:0,y:.4,z:0},rotation:{x:0,y:0,z:0},
      scale:{x:1,y:1,z:1},flight:{phase:'parked',speed:0,airspeed:0,airborne:false,
      throttle:0,throttleCommand:0,altitude:0,gear:true,flaps:0,...patch}});
    window.setFlight=(patch={},own=true,extras={})=>{
      const plane=makePlane('plane',patch);plane.holderId=own?'pilot':null;
      window.currentSnapshot={players:{pilot:{id:'pilot',actorId:'pilot',name:'Test pilot',
        health:100,position:{x:0,y:.4,z:2},vehicleId:own?'plane':null}},
        actors:{plane,...extras}};
      ops.update(currentSnapshot,'pilot');
    };
    ops.updateEnvironment({id:'airport',airport:{enabled:true}});
    setFlight();
    document.body.dataset.flightReady='true';
} """


def update(page, patch=None, own=True):
    page.evaluate("([patch,own])=>setFlight(patch,own)", [patch or {}, own])


def fire_count(page):
    return page.evaluate("commands.filter(command=>command.action==='fire').length")


def begin_hold(page, fire):
    fire.scroll_into_view_if_needed()
    box = fire.bounding_box()
    count = fire_count(page)
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down()
    page.wait_for_timeout(25)
    assert fire_count(page) == count + 1, 'A held cannon must fire immediately.'
    assert fire.get_attribute('aria-pressed') == 'true'
    return count


def assert_stopped(page, fire):
    page.wait_for_timeout(270)
    count = fire_count(page)
    assert fire.get_attribute('aria-pressed') == 'false'
    page.wait_for_timeout(250)
    assert fire_count(page) == count, 'Firing continued after its input was cancelled.'
    page.mouse.up()


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(320, 568), (390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.wait_for_selector('body[data-ready=true]')
            page.evaluate(SETUP)
            page.wait_for_selector('body[data-flight-ready=true]')
            page.wait_for_timeout(100)
            panel = page.get_by_role('region', name='Aircraft flight controls')
            fire = page.get_by_role('button', name='Fire aircraft cannons', exact=True, include_hidden=True)
            exit_button = page.get_by_role('button', name='Exit parked aircraft', exact=True)

            # The compact controls fit above the viewport edge, with actual touch targets.
            assert panel.is_visible()
            assert panel.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
            panel_box = panel.bounding_box()
            assert panel_box['x'] >= 0 and panel_box['y'] >= 0, (width, panel_box)
            assert panel_box['x'] + panel_box['width'] <= width + 1, (width, panel_box)
            assert panel_box['y'] + panel_box['height'] <= height + 1, (width, panel_box)
            controls = panel.locator('button:visible').all()
            boxes = [control.bounding_box() for control in controls]
            for control, box in zip(controls, boxes):
                assert box['width'] >= 43.9 and box['height'] >= 43.9, (width, control.get_attribute('aria-label'), box)
            for index, box in enumerate(boxes):
                for other in boxes[index + 1:]:
                    overlap_x = min(box['x'] + box['width'], other['x'] + other['width']) - max(box['x'], other['x'])
                    overlap_y = min(box['y'] + box['height'], other['y'] + other['height']) - max(box['y'], other['y'])
                    assert overlap_x < 1 or overlap_y < 1, (width, box, other)

            # On-screen power and view controls work without opening a modal.
            page.get_by_role('slider', name='Flight power', exact=True).fill('63')
            assert page.evaluate('ops.flightInput(0).throttle') == .63
            assert page.locator('dialog[open]').count() == 0
            axes = page.evaluate('''()=>{
                const axes=flightStickAxes(.35,-.6);
                return ops.flightControls({side:axes.x,forward:-axes.y});
            }''')
            assert .1 < axes['side'] < .5 and .3 < axes['lift'] < .8, axes
            assert axes['forward'] == 0 and axes['throttle'] == .63, axes
            page.get_by_role('button', name='Switch to chase view', exact=True).click()
            assert page.evaluate('ops.view') == 'chase'
            center = page.get_by_role('button', name='Center flight view', exact=True)
            assert center.is_enabled()
            center.click()
            assert page.evaluate('centers') == 1
            page.get_by_role('button', name='Switch to cockpit view', exact=True).click()
            assert page.evaluate('ops.view') == 'cockpit'
            assert page.evaluate('views') == ['chase', 'cockpit']
            assert page.locator('dialog[open]').count() == 0

            # Ground boarding sends the exact available aircraft, never an occupied/in-flight one.
            update(page, own=False)
            enter = page.get_by_role('button', name='Enter nearby aircraft cockpit', exact=True)
            assert enter.is_visible()
            enter.click()
            assert page.evaluate('commands.at(-1).action') == 'interact'
            assert page.evaluate('commands.at(-1).entityId') == 'plane'
            page.evaluate("()=>{currentSnapshot.actors.plane.holderId='other';ops.update(currentSnapshot,'pilot');}")
            assert enter.is_hidden()
            update(page, {'airborne': True}, own=False)
            assert enter.is_hidden()
            page.evaluate("()=>{setFlight({},false);currentSnapshot.actors.plane.position.x=20;ops.update(currentSnapshot,'pilot');}")
            assert enter.is_hidden()
            update(page)

            # Assistance clears a latched wheel brake before departing.
            page.get_by_role('button', name='Flight instruments and controls', exact=True).click()
            deck = page.get_by_role('dialog', name='Flight instruments and controls', exact=True)
            deck.get_by_role('button', name='Wheel brake', exact=True).click()
            assert page.evaluate('ops.flightInput(0).brake') is True
            deck.get_by_role('button', name='Close', exact=True).click()

            # Assistance has direct takeoff, landing, manual cancel and ground parking paths.
            page.get_by_role('button', name='Assisted takeoff', exact=True).click()
            assert page.evaluate('commands.at(-1).operation') == 'takeoff'
            assert page.evaluate('ops.flightInput(0).throttle===undefined')
            assert page.evaluate('ops.flightInput(0).brake') is False
            update(page, {'airborne': True, 'speed': 14, 'airspeed': 14, 'altitude': 15})
            assert exit_button.is_disabled()
            page.get_by_role('button', name='Assisted landing', exact=True).click()
            assert page.evaluate('commands.at(-1).operation') == 'land'
            update(page, {'airborne': True, 'speed': 14, 'airspeed': 14, 'altitude': 15, 'assist': 'land'})
            page.get_by_role('button', name='Cancel flight assistance', exact=True).click()
            assert page.evaluate('commands.at(-1).operation') == 'cancel'
            update(page, {'speed': 8, 'airspeed': 8})
            assert exit_button.is_disabled()
            page.get_by_role('button', name='Park aircraft', exact=True).click()
            assert page.evaluate('commands.at(-1).operation') == 'park'
            update(page)
            assert exit_button.is_enabled()

            # Cannons respond now and repeat near 220 ms, including command latency.
            count = begin_hold(page, fire)
            page.wait_for_timeout(465)
            page.mouse.up()
            shots = page.evaluate("commands.filter(command=>command.action==='fire').slice(-3)")
            assert fire_count(page) >= count + 3, (width, shots)
            gaps = [shots[index + 1]['at'] - shots[index]['at'] for index in range(2)]
            assert all(175 <= gap <= 280 for gap in gaps), (width, gaps)
            assert_stopped(page, fire)

            # Pointer cancellation, dialogs, chat and authoritative exit stop held fire.
            begin_hold(page, fire)
            fire.dispatch_event('pointercancel', {'pointerId': 99})
            assert fire.get_attribute('aria-pressed') == 'true', 'An unrelated touch cancelled firing.'
            fire.dispatch_event('pointercancel', {'pointerId': 1})
            assert_stopped(page, fire)
            begin_hold(page, fire)
            page.get_by_role('button', name='Flight instruments and controls', exact=True).evaluate('(el)=>el.click()')
            deck = page.get_by_role('dialog', name='Flight instruments and controls', exact=True)
            assert deck.is_visible()
            assert_stopped(page, fire)
            deck.get_by_role('button', name='Close', exact=True).click()
            begin_hold(page, fire)
            page.evaluate('setChat(true)')
            assert_stopped(page, fire)
            old_count = fire_count(page)
            fire.evaluate("el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}))")
            page.wait_for_timeout(120)
            assert fire_count(page) == old_count, 'Chat must also block one-shot fire.'
            page.evaluate('setChat(false)')
            begin_hold(page, fire)
            exit_button.evaluate('(el)=>el.click()')
            assert page.evaluate('commands.at(-1).action') == 'interact'
            update(page, own=False)
            assert_stopped(page, fire)
            update(page)

            # Defeat cancels firing even if a delayed snapshot still carries the vehicle ID.
            begin_hold(page, fire)
            page.evaluate("()=>{currentSnapshot.players.pilot.health=0;ops.update(currentSnapshot,'pilot');}")
            assert_stopped(page, fire)
            update(page)

            # Keyboard firing must not also reach gameplay jump/pitch listeners.
            page.evaluate("()=>{window.flightKeys=[];window.addEventListener('keydown',event=>flightKeys.push(event.key));}")
            count=fire_count(page)
            fire.focus()
            page.keyboard.down('Space')
            page.wait_for_timeout(35)
            page.keyboard.up('Space')
            page.wait_for_timeout(80)
            assert fire_count(page)==count+1
            assert page.evaluate("!flightKeys.includes(' ')")

            # Tuning remains available as an explicit popup, with the same controls.
            page.get_by_role('button', name='Flight instruments and controls', exact=True).click()
            assert deck.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
            deck.get_by_role('slider', name='Engine throttle', exact=True).fill('72')
            assert page.evaluate('ops.flightInput(0).throttle') == .72
            deck.get_by_role('button', name='Gear down', exact=True).click()
            assert page.evaluate('ops.flightInput(0).gear') is False
            deck.get_by_role('button', name='Flaps up', exact=True).click()
            assert page.evaluate('ops.flightInput(0).flaps') == 1
            deck.get_by_role('button', name='Close', exact=True).click()
            assert not errors, (width, errors)
            if width == 390:
                page.screenshot(path='/tmp/mobile-flight-controls.png')
            page.close()
        browser.close()
    print('Mobile cockpit boarding, flight input, views, assists, exit and held-fire cancellation passed at 320, 390, landscape and desktop sizes.')
    print('Screenshot: /tmp/mobile-flight-controls.png')
finally:
    server.shutdown()
