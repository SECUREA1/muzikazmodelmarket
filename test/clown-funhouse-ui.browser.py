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
        # First-person gallery play starts an authoritative round and leaves
        # the full-screen modal so the actual world remains visible.
        page.evaluate("setup('water');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-world-play]').click()
        page.wait_for_function('pending.length===1')
        page.evaluate("resolveNext(2,{round:round({stationId:'funhouse-water-gallery'})})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        assert page.locator('.funhouse-experience-hud').is_visible()
        assert page.locator('[data-funhouse-experience-time]').inner_text() == '30s'
        assert page.evaluate("worldPlays[0]==='funhouse-water-gallery'")
        page.locator('[data-funhouse-world-stop]').click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).action==='funhouse-stop'")
        page.evaluate("resolveNext(3,{round:round({stationId:'funhouse-water-gallery',status:'cancelled'})})")
        page.wait_for_function('document.querySelector(".funhouse-experience-hud").hidden')

        # A real ride exposes live controls and cues without stopping rendering.
        page.evaluate("setup('car');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-board]').click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).action==='funhouse-ride'")
        page.evaluate("window.rideState={id:'car-ride',kind:'car',stationId:'funhouse-clown-car',status:'active',startedAt:fixtureNow,endsAt:fixtureNow+20000,nextCueAt:fixtureNow+4000,cueUntil:fixtureNow+5500,score:0,hits:0,gentle:true};resolveNext(2,{ride:rideState})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        assert page.locator('[data-funhouse-honk]').is_visible()
        page.evaluate('fixtureNow+=4000;ui.update()')
        assert 'HONK NOW' in page.locator('[data-funhouse-experience-message]').inner_text()
        page.keyboard.press('h')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='honk'")
        page.evaluate("rideState={...rideState,hits:1,score:10,lastActionAt:fixtureNow,nextCueAt:fixtureNow+4000,cueUntil:fixtureNow+5500};resolveNext(3,{ride:rideState})")
        page.wait_for_function('document.querySelector(".funhouse-experience-hud").getAttribute("aria-busy")==="false"')
        assert page.locator('[data-funhouse-experience-score]').inner_text() == '10'
        assert page.locator('[data-funhouse-honk]').is_disabled()
        page.locator('[data-funhouse-gentle]').click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='gentle' && commands.at(-1).enabled===false")
        page.evaluate("rideState={...rideState,gentle:false};resolveNext(4,{ride:rideState})")
        page.wait_for_function('document.querySelector("[data-funhouse-gentle]").getAttribute("aria-pressed")==="false"')
        page.locator('[data-funhouse-ride-exit]').click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).action==='funhouse-ride-exit' && commands.at(-1).rideId==='car-ride'")
        page.evaluate("resolveNext(5,{ride:{...rideState,status:'cancelled'}})")
        page.wait_for_function('document.querySelector(".funhouse-experience-hud").hidden')

        # A newer input snapshot may confirm boarding before the command's
        # older HTTP reply arrives. Keep the newer state and still enter the
        # world view once, instead of leaving the ride behind a blocking modal.
        page.evaluate("setup('car');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-board]').click()
        page.wait_for_function('pending.length===1')
        page.evaluate("rideState={id:'reordered-ride',kind:'car',stationId:'funhouse-clown-car',status:'active',startedAt:fixtureNow,endsAt:fixtureNow+20000,nextCueAt:fixtureNow+4000,score:20,hits:2};publish(5,{ride:rideState});resolveNext(4,{ride:{...rideState,score:0,hits:0}})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        assert page.locator('[data-funhouse-experience-score]').inner_text() == '20'

        # Wind and catch timing uses the authoritative clock, with a compact
        # outcome that can be restarted without reopening a blocking panel.
        page.evaluate("setup('jackbox');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-challenge]').click()
        page.wait_for_function('pending.length===1')
        page.evaluate("window.jack={id:'jack-challenge',kind:'jackbox',stationId:'funhouse-jack-box',status:'active',phase:'winding',startedAt:fixtureNow,endsAt:fixtureNow+30000,windCount:0,score:0};resolveNext(2,{challenge:jack})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        page.locator('[data-funhouse-wind]').click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='wind'")
        page.evaluate("jack={...jack,phase:'ready',windCount:3,lastActionAt:fixtureNow,readyAt:fixtureNow+500,catchUntil:fixtureNow+2000};resolveNext(3,{challenge:jack})")
        page.wait_for_function('document.querySelector(".funhouse-experience-hud").getAttribute("aria-busy")==="false"')
        assert page.locator('[data-funhouse-wind]').is_disabled()
        assert page.locator('[data-funhouse-catch]').is_disabled()
        page.evaluate('fixtureNow+=499;ui.update()')
        assert page.locator('[data-funhouse-catch]').is_disabled()
        page.evaluate('fixtureNow+=1;ui.update()')
        assert page.locator('[data-funhouse-catch]').is_enabled()
        page.keyboard.press('f')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='catch'")
        page.evaluate("resolveNext(4,{challenge:{...jack,status:'complete',phase:'finished',score:50,message:'Caught the clown! +50 points.'}})")
        page.wait_for_function('document.querySelector("[data-funhouse-experience-score]").textContent==="50"')
        assert page.locator('[data-funhouse-again]').is_visible()

        # Ball buttons are real target choices, with the lit target readable on
        # touch, and immersive VR owns its own controls instead of HTML dialogs.
        page.evaluate("setup('ballpit');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-challenge]').click()
        page.wait_for_function('pending.length===1')
        page.evaluate("window.ball={id:'ball-round',kind:'ballpit',stationId:'funhouse-ball-pit',status:'active',phase:'playing',startedAt:fixtureNow,endsAt:fixtureNow+20000,targetId:2,hits:0,score:0};resolveNext(2,{challenge:ball})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        assert page.locator('[data-funhouse-toss="2"]').evaluate('(node)=>node.classList.contains("is-lit")')
        assert page.locator('[data-funhouse-toss="1"]').inner_text() == 'Gold · 2'
        assert page.locator('[data-funhouse-toss="2"]').inner_text() == 'Cyan · 3'
        assert page.evaluate('stateTimes.at(-1)===fixtureNow')
        page.keyboard.press('3')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='toss' && commands.at(-1).targetId===2")
        page.evaluate("ball={...ball,targetId:1,hits:1,score:10,lastActionAt:fixtureNow};resolveNext(3,{challenge:ball})")
        page.wait_for_function('document.querySelector(".funhouse-experience-hud").getAttribute("aria-busy")==="false"')
        assert page.locator('[data-funhouse-toss="1"]').is_disabled()
        page.evaluate('fixtureNow+=350;ui.update()')
        assert page.locator('[data-funhouse-toss="1"]').is_enabled()
        page.evaluate('immersive=true;ui.update()')
        assert page.locator('.funhouse-experience-hud').is_hidden()
        assert page.locator('.funhouse-use').is_hidden()
        assert page.locator('.funhouse-passport-hud').is_hidden()
        page.keyboard.press('e')
        assert not page.evaluate('ui.visible()')
        page.evaluate('immersive=false;ui.update()')
        assert page.locator('.funhouse-experience-hud').is_visible()
        # Spinner balance uses both left/right cue actions and obeys refill.
        page.evaluate("setup('spinner');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-board]').click()
        page.wait_for_function('pending.length===1')
        page.evaluate("window.spin={id:'spin-ride',kind:'spinner',stationId:'funhouse-spinner',status:'active',startedAt:fixtureNow-3000,endsAt:fixtureNow+12000,nextCueAt:fixtureNow,cueUntil:fixtureNow+3000,cueIndex:1,targetId:1,score:0,hits:0,gentle:true};resolveNext(2,{ride:spin})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        assert page.locator('[data-funhouse-balance="1"]').evaluate('(node)=>node.classList.contains("is-lit")')
        page.keyboard.press('2')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='balance' && commands.at(-1).targetId===1")
        page.evaluate("resolveNext(3,{ride:{...spin,lastActionAt:fixtureNow,lastCueHit:1,hits:1,score:10}})")
        page.wait_for_function('document.querySelector(".funhouse-experience-hud").getAttribute("aria-busy")==="false"')
        assert page.locator('[data-funhouse-balance="0"]').is_disabled()
        assert page.locator('[data-funhouse-balance="1"]').is_disabled()

        # Maze controls remain nonblocking while walking far beyond its entry;
        # the final control operates the actual exit bell rather than a marker.
        page.evaluate("setup('mirrors');publish(1)")
        page.keyboard.press('e')
        page.locator('[data-funhouse-challenge]').click()
        page.wait_for_function('pending.length===1')
        page.evaluate("window.maze={id:'maze-run',kind:'mirrors',stationId:'funhouse-mirror-maze',status:'active',phase:'walking',startedAt:fixtureNow,endsAt:fixtureNow+120000,checkpointIndex:0,checkpoints:[{x:-4.5,y:.02,z:-28,name:'Mirror corner'}],score:0};resolveNext(2,{challenge:maze})")
        page.wait_for_function('worldPlays.length===1 && !ui.visible()')
        page.evaluate('position={x:-4.5,y:.02,z:-28};ui.update()')
        assert page.locator('.funhouse-experience-hud').is_visible()
        page.keyboard.press('f')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).operation==='check-in'")
        page.evaluate("resolveNext(3,{challenge:{...maze,checkpointIndex:1,phase:'bell'}})")
        page.wait_for_function('document.querySelector("[data-funhouse-ring-bell]")')
        assert page.locator('[data-funhouse-ring-bell]').is_disabled()
        page.evaluate('position={x:-18,y:.02,z:-38};ui.update()')
        assert page.locator('[data-funhouse-ring-bell]').is_enabled()
        page.keyboard.press('f')
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).action==='funhouse-use' && commands.at(-1).stationId==='funhouse-maze-finish'")
        page.evaluate("resolveNext(4,{challenge:{...maze,checkpointIndex:1,phase:'finished',status:'complete',score:50}})")
        page.wait_for_function('document.querySelector("[data-funhouse-experience-score]").textContent==="50"')
        page.evaluate('ui.dispose()')
        assert not errors, errors
        browser.close()
    print('Funhouse UI snapshot ordering, ride controls, timed challenges, first-person HUD, immersive handoff and travel invalidation pass.')
finally:
    server.shutdown()
