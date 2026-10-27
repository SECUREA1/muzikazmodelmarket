"""Deferred funhouse commands preserve newer snapshots and release UI on travel."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 900, 'height': 850})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/clown-funhouse-ui.html')
        page.wait_for_function('window.ready')

        # A newer live snapshot can arrive while a gallery command is pending.
        page.evaluate("setup('water');publish(1)")
        page.keyboard.press('e')
        page.get_by_role('button', name='Start 30-second round', exact=True).click()
        page.wait_for_function('pending.length===1')
        page.evaluate("publish(5,{round:round({targetId:2,score:20}),costume:{hat:true,shoes:true}});resolveNext(4,{round:round({targetId:0}),costume:{hat:false,shoes:false}},[{id:'stale-splash',at:fixtureNow,funhouseEffect:{stationId:'funhouse-water-gallery',kind:'squirt',targetId:0}}])")
        page.wait_for_function("document.querySelector('#clown-funhouse-panel').getAttribute('aria-busy')==='false'")
        assert page.locator('[data-funhouse-target="2"]').evaluate('(node)=>node.classList.contains("is-lit")')
        assert page.locator('[data-funhouse-score]').inner_text() == '20'
        assert page.evaluate('receivedStates.at(-1).costume.hat && receivedStates.at(-1).costume.shoes')
        assert page.evaluate('effects.length') == 0

        # Both click and numeric keyboard input honor the server's refill time.
        page.evaluate("publish(6,{round:round({targetId:3,lastShotAt:fixtureNow})})")
        assert page.locator('[data-funhouse-target]:disabled').count() == 6
        page.keyboard.press('4')
        assert page.evaluate('commands.length') == 1
        page.evaluate('fixtureNow+=299;ui.update()')
        assert page.locator('[data-funhouse-target]:disabled').count() == 6
        page.evaluate('fixtureNow+=1;ui.update()')
        assert page.locator('[data-funhouse-target]:disabled').count() == 0
        page.keyboard.press('4')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).action==='funhouse-squirt' && commands.at(-1).targetId===3 && commands.at(-1).roundId==='water-round'")
        page.evaluate("resolveNext(7,{round:round({targetId:4,lastShotAt:fixtureNow,score:30})})")
        page.wait_for_function("document.querySelector('#clown-funhouse-panel').getAttribute('aria-busy')==='false'")
        page.wait_for_function("document.querySelectorAll('.funhouse-target.is-splashed').length===0")
        page.keyboard.press('Escape')
        page.wait_for_function('!ui.visible()')

        # Failed commands remain visible to the player and restore the button.
        page.evaluate("setup('car');publish(1)")
        page.keyboard.press('e')
        page.get_by_role('button', name='Honk! Release the clowns', exact=True).click()
        page.wait_for_function('pending.length===1')
        page.evaluate("rejectNext('The horn is cooling down. Try again.')")
        page.get_by_role('status').filter(has_text='The horn is cooling down. Try again.').wait_for()
        assert page.get_by_role('button', name='Honk! Release the clowns', exact=True).is_enabled()
        page.evaluate("publish(2,{stamps:['funhouse-clown-car']})")
        assert page.locator('.funhouse-passport-hud .is-stamped').count() == 1

        # Navigation invalidates commands that were already sent to the old map.
        page.get_by_role('button', name='Honk! Release the clowns', exact=True).click()
        page.wait_for_function('pending.length===1')
        page.evaluate("environment={id:'another-world'};ui.reset();resolveNext(99,{costume:{hat:true,shoes:true},stamps:['funhouse-clown-car']},[{id:'late-car',at:fixtureNow,funhouseEffect:{stationId:'funhouse-clown-car',kind:'car'}}])")
        page.wait_for_function('pending.length===0')
        assert not page.evaluate('ui.visible()')
        assert page.locator('.funhouse-use').is_hidden()
        assert page.locator('.funhouse-passport-hud').is_hidden()
        assert page.evaluate('effects.length') == 0
        assert page.evaluate('Object.keys(receivedStates.at(-1)).length') == 0
        page.evaluate("environment={id:'muzikaz-clown-funhouse'};ui.update()")
        assert page.locator('.funhouse-passport-hud .is-stamped').count() == 0
        assert not page.evaluate('ui.visible()')
        assert page.evaluate('Object.keys(receivedStates.at(-1)).length') == 0
        # Server relocation closes a modal while world rendering is paused and
        # the locally projected walking position still points at the gallery.
        page.evaluate("setup('water');publish(1);ui.open();const moved=snapshot(2);moved.players.me.position={x:0,y:.02,z:40};ui.receive(moved,'me')")
        assert not page.evaluate('ui.visible()')
        assert page.evaluate('position.x===-30 && position.z===12')
        # Owned costumes stay projected in ordinary rooms without a public
        # attraction, and an individually placed car still opens its real game.
        page.evaluate("ui.reset();environment={id:'plain-room',builderScene:{objects:[]}};actors={};commands.length=effects.length=receivedStates.length=0;publish(1,{costume:{hat:true,shoes:true}});ui.update()")
        assert page.evaluate('receivedStates.at(-1).costume.hat && receivedStates.at(-1).costume.shoes')
        assert page.locator('.funhouse-use').is_hidden()
        page.evaluate("actors={'bought-car':{id:'bought-car',active:true,position:{x:12,y:0,z:5},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},asset:{name:'Purchased clown car',buildAssetId:'funhouse-clown-car',function_data:{funhouseStation:'car',funhouseApproach:{x:0,y:0,z:0},interactionDistance:4}}}};position={x:12,y:0,z:5};ui.update()")
        page.keyboard.press('e')
        page.get_by_role('button', name='Honk! Release the clowns', exact=True).click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).stationId==='funhouse-instance:bought-car'")
        page.evaluate("resolveNext(2,{},[{id:'portable-honk',at:fixtureNow,funhouseEffect:{stationId:'funhouse-instance:bought-car',canonicalStationId:'funhouse-clown-car',objectId:'bought-car',kind:'car'}}])")
        page.wait_for_function("document.querySelector('#clown-funhouse-panel').getAttribute('aria-busy')==='false'")
        assert page.evaluate("effects.length===1 && effects[0].objectId==='bought-car'")
        page.evaluate("actors['bought-car'].active=false;publish(3)")
        assert not page.evaluate('ui.visible()')
        page.evaluate('ui.dispose()')
        assert not errors, errors
        browser.close()
    print('Funhouse UI snapshot ordering, refill/keyboard controls, error recovery, Escape and travel invalidation pass.')
finally:
    server.shutdown()
