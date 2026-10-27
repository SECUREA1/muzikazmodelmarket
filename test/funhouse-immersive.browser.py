"""First-person attraction actions and real spatial controls with XR event mocks.

The headset fixture uses the production XR controller and funhouse panel modules,
actual procedural attraction hit targets, and real selectstart/selectend events.
It validates controller logic rather than claiming a physical-headset test.
Run after npm run build; --fixture-only runs the source-based controller checks.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from threading import Thread
import time
import uuid

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT.parent / 'scratch'
WORLD = 'muzikaz-clown-funhouse'
os.chdir(ROOT)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def controller_checks(browser):
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        page = browser.new_page(viewport={'width': 1000, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/funhouse-immersive.html')
        page.wait_for_function('window.ready', timeout=15000)
        page.evaluate("setup('water')")
        assert page.evaluate("vr.root.isGroup && vr.root.getObjectByName('FUNHOUSE_VR_ACTION_BOARD').isMesh")
        assert page.locator('dialog').count() == 0, 'headset attraction controls must be real scene geometry'
        page.evaluate("pressButton('water-start')")
        page.wait_for_function("vr.snapshot().round?.status==='active' && !vr.snapshot().pending")
        assert page.evaluate("commands.length===1 && commands[0].action==='funhouse-start' && commands[0].stationId==='funhouse-water-gallery'")
        # A held controller cannot replay an action; a fresh release rearms it.
        page.evaluate("pressButton('water-2')")
        assert page.evaluate('commands.length') == 1
        page.evaluate("releaseTrigger();pressButton('close')")
        page.wait_for_function('!vr.snapshot().visible')
        page.evaluate('releaseTrigger();aimAtTarget(2)')
        page.wait_for_function("commands.at(-1)?.action==='funhouse-squirt' && !vr.snapshot().pending")
        assert page.evaluate("commands.at(-1).targetId===2 && commands.at(-1).roundId==='fixture-water'")
        assert page.evaluate('commands.at(-1).direction.length===3 && Number.isFinite(commands.at(-1).origin.y)')
        page.evaluate('releaseTrigger();aimMiss()')
        page.wait_for_function("commands.at(-1)?.targetId===-1 && !vr.snapshot().pending")
        assert page.evaluate('combatCalls') == 0, 'a missed water shot must never fall through to a combat weapon'

        page.evaluate("releaseTrigger();setup('dressup');pressButton('hat')")
        page.wait_for_function("commands.at(-1)?.action==='funhouse-dress' && !vr.snapshot().pending")
        page.evaluate("releaseTrigger();pressButton('shoes')")
        page.wait_for_function("commands.at(-1)?.shoes===true && !vr.snapshot().pending")
        assert page.evaluate('commands.at(-1).hat===true')

        page.evaluate("releaseTrigger();setup('car');pressButton('ride-start')")
        page.wait_for_function("vr.snapshot().ride?.status==='active' && !vr.snapshot().pending")
        page.evaluate('vr.tick()')
        assert page.evaluate('Math.hypot(...vr.snapshot().position.map((v,i)=>v-headPosition()[i]))<2'), 'boarding recenters the board at the actual seated head'
        page.evaluate("releaseTrigger();aimAtControl('car','honk')")
        page.wait_for_function("commands.at(-1)?.operation==='honk' && !vr.snapshot().pending")
        page.evaluate('vr.setVisible(true)')
        page.evaluate("releaseTrigger();pressButton('honk')")
        page.wait_for_function("commands.at(-1)?.operation==='honk' && !vr.snapshot().pending")
        page.evaluate("releaseTrigger();pressButton('ride-exit')")
        page.wait_for_function("vr.snapshot().ride?.status==='cancelled' && !vr.snapshot().pending")
        assert page.evaluate("commands.at(-1).rideId==='fixture-ride'")

        page.evaluate("releaseTrigger();setup('spinner');pressButton('ride-start')")
        page.wait_for_function("vr.snapshot().ride?.kind==='spinner' && !vr.snapshot().pending")
        page.evaluate('vr.tick()')
        assert page.evaluate('Math.hypot(...vr.snapshot().position.map((v,i)=>v-headPosition()[i]))<2'), 'the spinner seat must retain reachable immersive controls'
        page.evaluate("releaseTrigger();aimAtControl('spinner','balance')")
        page.wait_for_function("commands.at(-1)?.operation==='balance' && !vr.snapshot().pending")
        page.evaluate('vr.setVisible(true)')
        page.evaluate("releaseTrigger();pressButton('balance-0')")
        page.wait_for_function("commands.at(-1)?.operation==='balance' && !vr.snapshot().pending")
        assert page.evaluate('commands.at(-1).targetId===0')
        assert page.evaluate("!vr.snapshot().buttons.find(button=>button.id==='gentle').enabled"), 'reduced-motion preference must keep the comfortable ride enabled'
        page.evaluate('releaseTrigger();reducedMotion=false')
        page.wait_for_function("(()=>{vr.tick();return vr.snapshot().buttons.find(button=>button.id==='gentle').enabled})()")
        page.evaluate("pressButton('gentle')")
        page.wait_for_function("vr.snapshot().ride?.gentle===false && !vr.snapshot().pending")

        page.evaluate("releaseTrigger();setup('jackbox');pressButton('jack-start')")
        page.wait_for_function("vr.snapshot().challenge?.kind==='jackbox' && !vr.snapshot().pending")
        for _ in range(3):
            page.evaluate("releaseTrigger();pressButton('wind')")
            page.wait_for_function('!vr.snapshot().pending')
        page.evaluate("releaseTrigger();pressButton('catch')")
        page.wait_for_function("vr.snapshot().challenge?.status==='complete' && !vr.snapshot().pending")
        assert page.evaluate("commands.at(-1).operation==='catch'")

        page.evaluate("releaseTrigger();setup('ballpit');pressButton('ball-start',0)")
        page.wait_for_function("vr.snapshot().challenge?.kind==='ballpit' && !vr.snapshot().pending")
        page.evaluate("releaseTrigger(0);pressButton('toss-2',0)")
        page.wait_for_function("commands.at(-1)?.operation==='toss' && !vr.snapshot().pending")
        assert page.evaluate('commands.at(-1).targetId===2')
        page.evaluate("releaseTrigger(0);pressButton('close',0)")
        page.wait_for_function('!vr.snapshot().visible')
        page.evaluate("releaseTrigger(0);aimAtTarget(1,0,'ballpit')")
        page.wait_for_function("commands.at(-1)?.operation==='toss' && commands.at(-1).targetId===1 && !vr.snapshot().pending")
        assert page.evaluate('commands.at(-1).direction.length===3')
        assert page.evaluate('combatCalls') == 0

        # A physical start button starts its timed game, as the board does.
        page.evaluate("releaseTrigger(0);setup('ballpit');aimAtControl('ballpit','start',0)")
        page.wait_for_function("vr.snapshot().challenge?.kind==='ballpit' && !vr.snapshot().pending")
        assert page.evaluate("commands.length===1 && commands[0].action==='funhouse-challenge'")

        # The adventure marker and clue token use the same real controller ray
        # dispatch as attraction controls; only the fixture's room is mocked.
        page.evaluate("releaseTrigger(0);setup('adventure');aimAtControl('adventure','adventure-start')")
        page.wait_for_function("vr.snapshot().adventure?.status==='active' && !vr.snapshot().pending")
        assert page.evaluate("commands.at(-1).action==='funhouse-adventure' && commands.at(-1).operation==='start'")
        page.evaluate("releaseTrigger();visitAdventureClue(0);aimAtControl('adventure','inspect',1,'ticket-trick')")
        page.wait_for_function("vr.snapshot().adventure?.clueIndex===1 && !vr.snapshot().pending")
        assert page.evaluate("commands.at(-1).clueId==='ticket-trick' && vr.snapshot().adventure.score===25")
        page.evaluate("releaseTrigger();vr.setVisible(true);pressButton('adventure-stop')")
        page.wait_for_function("vr.snapshot().adventure?.status==='cancelled' && !vr.snapshot().pending")

        # A response already in flight may not resurrect a panel after travel.
        page.evaluate("releaseTrigger();releaseTrigger(0);setup('car');deferred=true;pressButton('ride-start')")
        page.wait_for_function('pending.length===1')
        page.evaluate('vr.reset();resolvePending()')
        page.wait_for_function('pending.length===0')
        assert page.evaluate('!vr.snapshot().visible && vr.snapshot().ride===null && !vr.snapshot().pending')
        page.evaluate("deferred=false;releaseTrigger();setup('water')")
        page.evaluate('moveStick(.7,-.7)')
        assert page.evaluate('Math.hypot(movements.at(-1).x,movements.at(-1).y)>.5')
        page.evaluate('endSession()')
        assert page.evaluate('!vr.snapshot().visible && !xr.isPresenting')
        assert page.evaluate('movements.at(-1).x===0 && movements.at(-1).y===0'), 'session exit must neutralize locomotion'
        count = page.evaluate('commands.length')
        page.evaluate('rawTrigger()')
        assert page.evaluate('commands.length') == count
        assert not errors, errors
        page.evaluate('controls.dispose();vr.dispose()')
        assert page.evaluate("!scene.getObjectByName('MIDNIGHT_LAUGHS_IMMERSIVE_CONTROLS') && !scene.getObjectByName('MUZIKAZ_VR_GAME_MENU')")
        page.close()
        print('Spatial funhouse panel: actual XR controller rays, gallery hits/misses, seated ride controls, challenges, adventure discovery, trigger release and session/travel cleanup pass.', flush=True)
    finally:
        server.shutdown()
        server.server_close()


def game_checks(browser, gallery_only=False, adventure_only=False):
    """Real application, live room and rendered controls; only travel uses the API."""
    ARTIFACTS.mkdir(exist_ok=True)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='funhouse-immersive-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            context = browser.new_context(service_workers='block', viewport={'width': 1000, 'height': 760}, reduced_motion='reduce', has_touch=True)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                for _ in range(100):
                    try:
                        if context.request.get(base + '/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                else:
                    raise AssertionError('Game server failed to start.')
                assert context.request.post(base + '/api/access/guest', data={}).status == 201
                csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']

                def command(action, **fields):
                    response = context.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    assert response.ok, (action, response.status, response.text())
                    return response.json()['data']

                def state():
                    result = command('input', input={})
                    return result['players'][result['selfId']]

                def snapshot():
                    return page.evaluate('window.MuzikazHouseExplorer.snapshot()')

                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                canvas = page.locator('#house-explorer-canvas')
                canvas.scroll_into_view_if_needed()
                panel = page.locator('.funhouse-dialog[open] #clown-funhouse-panel')
                hud = page.locator('.funhouse-experience-hud')

                def travel(x, z):
                    result = command('map-access', position={'x': x, 'z': z})
                    position = result['players'][result['selfId']]['position']
                    page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=position, timeout=15000)

                def open_panel(title):
                    page.wait_for_function('!document.querySelector(".funhouse-use").hidden', timeout=10000)
                    canvas.focus()
                    page.keyboard.press('e')
                    panel.wait_for(state='visible', timeout=10000)
                    assert title.lower() in panel.locator('[data-funhouse-title]').inner_text().lower(), panel.inner_text()

                def world_ready(kind, property_name):
                    page.wait_for_function('(args)=>{const s=window.MuzikazHouseExplorer.snapshot();return s.cameraMode==="first-person"&&s.funhouse?.[args.propertyName]?.status==="active"&&(!args.kind||s.funhouse[args.propertyName].kind===args.kind)&&!s.player.inputBlocked}', arg={'kind': kind, 'propertyName': property_name}, timeout=10000)
                    assert page.locator('.funhouse-dialog[open]').count() == 0
                    hud.wait_for(state='visible')

                def show_actions():
                    toggle = hud.locator('[data-funhouse-hud-toggle]')
                    if toggle.count() and toggle.get_attribute('aria-expanded') == 'false':
                        toggle.click()

                def look(yaw, pitch):
                    """Use drag-to-look rather than changing camera/game state."""
                    view = snapshot()['player']
                    yaw_delta = math.atan2(math.sin(view['yaw'] - yaw), math.cos(view['yaw'] - yaw))
                    box = canvas.bounding_box()
                    start = None
                    for x_fraction, y_fraction in [(.82, .55), (.72, .6), (.82, .35), (.6, .55), (.9, .65)]:
                        candidate = {'x': box['x'] + box['width'] * x_fraction, 'y': box['y'] + box['height'] * y_fraction}
                        if page.evaluate('(p)=>document.elementFromPoint(p.x,p.y)?.id==="house-explorer-canvas"', candidate):
                            start = candidate
                            break
                    assert start, 'the first-person view must retain a clear drag-to-look area'
                    page.mouse.move(start['x'], start['y'])
                    page.mouse.down()
                    page.mouse.move(start['x'] + yaw_delta / .006, start['y'] + (view['pitch'] - pitch) / .005, steps=2)
                    page.mouse.up()
                    page.wait_for_function('(p)=>{const s=window.MuzikazHouseExplorer.snapshot().player;return Math.abs(Math.atan2(Math.sin(s.yaw-p.yaw),Math.cos(s.yaw-p.yaw)))<.03&&Math.abs(s.pitch-p.pitch)<.03}', arg={'yaw': yaw, 'pitch': pitch}, timeout=10000)

                def look_at(point):
                    camera = snapshot()['renderCamera']['position']
                    dx, dy, dz = [point[axis] - camera[axis] for axis in range(3)]
                    look(math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz)))

                def stop_world():
                    hud.locator('[data-funhouse-world-stop]').click()
                    page.wait_for_function('document.querySelector(".funhouse-experience-hud").hidden', timeout=10000)

                def walk():
                    before = snapshot()['player']['position']
                    canvas.focus()
                    page.keyboard.down('w')
                    try:
                        page.wait_for_function('(p)=>{const q=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(q[0]-p[0],q[2]-p[2])>.3}', arg=before, timeout=10000)
                    finally:
                        page.keyboard.up('w')

                def adventure_checks():
                    # Start the real trail marker, walk to its first discovery and
                    # inspect it without map travel or editing the player's pose.
                    travel(0, 44)
                    start_marker = page.evaluate('window.MuzikazHouseExplorer.snapshot().funhouseExperience.targets.find(t=>t.kind==="adventure"&&t.operation==="adventure-start")')
                    assert start_marker, 'the permanent world exposes its adventure start marker'
                    look_at(start_marker['position'])
                    start_marker = page.evaluate('window.MuzikazHouseExplorer.snapshot().funhouseExperience.targets.find(t=>t.kind==="adventure"&&t.operation==="adventure-start")')
                    assert start_marker['screen']['visible']
                    assert page.evaluate('(p)=>document.elementFromPoint(p.x,p.y)?.id==="house-explorer-canvas"', start_marker['screen'])
                    page.mouse.click(start_marker['screen']['x'], start_marker['screen']['y'])
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.adventure?.status==="active"', timeout=10000)
                    trail = page.locator('.funhouse-adventure-hud')
                    trail.wait_for(state='visible')
                    next_point = {'x': 38, 'z': 36}
                    position = snapshot()['player']['position']
                    look(math.atan2(-(next_point['x'] - position[0]), -(next_point['z'] - position[2])), 0)
                    canvas.focus()
                    page.keyboard.down('Shift')
                    page.keyboard.down('w')
                    try:
                        page.wait_for_function('(point)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;if(Math.hypot(p[0]-point.x,p[2]-point.z)>2.5)return false;for(const key of ["w","Shift"])window.dispatchEvent(new KeyboardEvent("keyup",{key,bubbles:true}));return true}', arg=next_point, polling=50, timeout=20000)
                    finally:
                        page.keyboard.up('w')
                        page.keyboard.up('Shift')
                    page.keyboard.press('f')
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.adventure?.clueIndex===1', timeout=10000)
                    discovery = snapshot()['funhouseExperience']['adventure']
                    assert discovery['found'] == ['ticket-trick'] and discovery['score'] == 25, discovery
                    clue_token = page.evaluate('window.MuzikazHouseExplorer.snapshot().funhouseExperience.targets.find(t=>t.clueId==="ticket-trick")')
                    look_at(clue_token['position'])
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-adventure-discovery.png'), timeout=20000)
                    toggle = trail.locator('[data-funhouse-adventure-toggle]')
                    if toggle.get_attribute('aria-expanded') == 'false':
                        toggle.click()
                    trail.locator('[data-funhouse-adventure-stop]').click()
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouseExperience.adventure?.status==="cancelled"', timeout=10000)
                    trail.locator('[data-funhouse-adventure-dismiss]').click()
                    assert state()['funhouse']['adventure']['status'] == 'cancelled'
                    travel(0, 40)
                    walk()
                    assert not errors, errors
                    print('Live adventure: ordered route HUD, real trail start marker, walking discovery, inspect, cancellation and resumed walking pass; no uncaught browser errors.', flush=True)

                if adventure_only:
                    adventure_checks()
                    return

                travel(-30, 12)
                open_panel('Splash the Clowns')
                panel.locator('[data-funhouse-world-play]').click()
                world_ready(None, 'round')
                # Aim the chosen real target at the center reticle using normal
                # drag-to-look input, so every random target clears the HUD.
                before = snapshot()['funhouse']['round']
                target = page.evaluate('(id)=>window.MuzikazHouseExplorer.snapshot().funhouseExperience.targets.find(t=>t.kind==="water"&&t.operation==="squirt"&&t.targetId===id)', before['targetId'])
                look_at(target['position'])
                target = page.evaluate('(id)=>window.MuzikazHouseExplorer.snapshot().funhouseExperience.targets.find(t=>t.kind==="water"&&t.operation==="squirt"&&t.targetId===id)', before['targetId'])
                assert target and target['screen']['visible'], target
                assert page.evaluate('(p)=>document.elementFromPoint(p.x,p.y)?.id==="house-explorer-canvas"', target['screen']), 'the aimed clown must be visible outside action controls'
                page.mouse.click(target['screen']['x'], target['screen']['y'])
                page.wait_for_function('(shots)=>window.MuzikazHouseExplorer.snapshot().funhouse?.round?.shots>shots', arg=before['shots'], timeout=10000)
                after = snapshot()['funhouse']['round']
                assert after['hits'] == before['hits'] + 1 and after['score'] == before['score'] + 10, after
                assert snapshot()['waterGunVisible']
                page.screenshot(path=str(ARTIFACTS / 'funhouse-first-person.png'), timeout=20000)
                stop_world()
                print('Live first-person gallery: rendered clown mesh click scores, water blaster visible, menu closes and Stop releases controls.', flush=True)
                if gallery_only:
                    assert not errors, errors
                    return

                travel(24, 28)
                open_panel('Impossible Clown Car')
                panel.locator('[data-funhouse-board]').click()
                world_ready('car', 'ride')
                show_actions()
                page.wait_for_function('(()=>{const s=window.MuzikazHouseExplorer.snapshot(),p=s.funhouse.ride.pose.position,c=s.renderCamera.position;return Math.hypot(c[0]-p.x,c[2]-p.z)<.15&&Math.abs(c[1]-p.y-s.funhouse.ride.pose.eyeHeight)<.15})()', timeout=10000)
                before = snapshot()['player']['position']
                # Exercise the actual pointer handlers between rendered frames
                # in one browser task. Per-step automation round trips can use
                # an entire short ride under software WebGL rendering.
                views = page.evaluate('''async()=>{
                  const canvas=document.querySelector('#house-explorer-canvas'),r=canvas.getBoundingClientRect(),x=r.x+r.width*.8,y=r.y+r.height*.55;
                  const first=window.MuzikazHouseExplorer.snapshot(),heading=first.player.yaw,views=[];
                  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
                  for(let quarter=1;quarter<=4;quarter++){
                    const current=window.MuzikazHouseExplorer.snapshot().player,targetYaw=heading+quarter*Math.PI/2,targetPitch=quarter%2?.18:-.1;
                    const delta=Math.atan2(Math.sin(current.yaw-targetYaw),Math.cos(current.yaw-targetYaw));
                    for(const [type,dx,dy]of [['pointerdown',0,0],['pointermove',delta/.006,(current.pitch-targetPitch)/.005],['pointerup',delta/.006,(current.pitch-targetPitch)/.005]])canvas.dispatchEvent(new PointerEvent(type,{pointerId:91,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x+dx,clientY:y+dy,bubbles:true}));
                    await frame();const result=window.MuzikazHouseExplorer.snapshot();
                    views.push({position:result.player.position,yaw:result.player.yaw,direction:result.renderCamera.direction,targetYaw,targetPitch,active:result.funhouseExperience.rideActive});
                  }return views;
                }''')
                assert len(views) == 4
                for view in views:
                    position = view['position']
                    assert math.hypot(position[0] - before[0], position[2] - before[2]) < .1, 'looking around cannot leave the car seat'
                    assert view['active'], 'the car retains its seat through a complete 360-degree look'
                    camera_yaw = math.atan2(-view['direction'][0], -view['direction'][2])
                    assert abs(math.atan2(math.sin(camera_yaw - view['targetYaw']), math.cos(camera_yaw - view['targetYaw']))) < .05
                preferred_view = snapshot()['preferredCameraMode']
                page.keyboard.press('v')
                assert snapshot()['cameraMode'] == 'first-person' and snapshot()['preferredCameraMode'] == preferred_view, 'ride look preserves the saved camera preference'
                canvas.focus()
                page.keyboard.down('w')
                page.wait_for_timeout(450)
                page.keyboard.up('w')
                after = snapshot()['player']['position']
                assert math.hypot(after[0] - before[0], after[2] - before[2]) < .1, (before, after)
                # Dispatch in the same browser task as the cue check: a second
                # automation round trip can exceed a short cue under SwiftShader.
                page.wait_for_function('(()=>{const s=window.MuzikazHouseExplorer.snapshot(),r=s.funhouse.ride,t=Date.now()-r.startedAt,cue=t%4000;if(r.status!=="active"||t<4100||t>17000||cue<100||cue>650||document.querySelector("[data-funhouse-experience-message]")?.textContent!=="HONK NOW!")return false;document.querySelector("[data-funhouse-honk]").click();return true})()', polling=50, timeout=10000)
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse.ride.score===10', timeout=10000)
                page.evaluate('document.querySelector("[data-funhouse-ride-exit]")?.click()')
                page.wait_for_function('!window.MuzikazHouseExplorer.snapshot().funhouseExperience.rideActive', timeout=10000)
                exited = state()
                assert exited['funhouse']['ride']['status'] in ('cancelled', 'complete'), 'exit or the ride deadline releases the same safe approach'
                assert math.hypot(exited['position']['x'] - 24, exited['position']['z'] - 28) < 1.5
                page.wait_for_function('(()=>{const s=window.MuzikazHouseExplorer.snapshot();return Math.abs(s.renderCamera.position[1]-s.player.position[1]-1.65)<.2})()', timeout=10000)
                travel(0, 40)
                walk()
                print('Live clown car: authoritative seated camera, complete 360-degree look, locked walking, horn cue, safe exit and fresh walking pass.', flush=True)

                travel(24, 2)
                open_panel('Dizzy')
                panel.locator('[data-funhouse-board]').click()
                world_ready('spinner', 'ride')
                show_actions()
                first_camera = snapshot()['renderCamera']['position']
                page.wait_for_function('(before)=>{const c=window.MuzikazHouseExplorer.snapshot().renderCamera.position;return Math.hypot(c[0]-before[0],c[2]-before[2])>.15}', arg=first_camera, timeout=5000)
                heading = snapshot()['player']['yaw']
                look(heading + math.pi / 2, .2)
                assert snapshot()['funhouseExperience']['rideActive'], 'looking around the spinner must preserve its moving seat'
                page.wait_for_function('(()=>{const button=document.querySelector("[data-funhouse-balance].is-lit:not(:disabled)");if(!button)return false;button.click();return true})()', polling=50, timeout=5000)
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse.ride.score===10', timeout=10000)
                assert hud.locator('[data-funhouse-gentle]').is_disabled(), 'the reduced-motion preference keeps ride comfort enabled'
                assert snapshot()['funhouse']['ride']['gentle'] is True
                hud.locator('[data-funhouse-ride-exit]').click()
                page.wait_for_function('!window.MuzikazHouseExplorer.snapshot().funhouseExperience.rideActive', timeout=10000)
                print('Live spinner: moving seat camera, free look, balance score, locked reduced-motion comfort and exit pass.', flush=True)

                travel(14, -33)
                open_panel('Fright Box')
                panel.locator('[data-funhouse-challenge]').click()
                world_ready('jackbox', 'challenge')
                show_actions()
                for count in range(1, 4):
                    page.wait_for_function('!document.querySelector("[data-funhouse-wind]")?.disabled', timeout=10000)
                    hud.locator('[data-funhouse-wind]').click()
                    page.wait_for_function('(count)=>window.MuzikazHouseExplorer.snapshot().funhouse.challenge.windCount===count', arg=count, timeout=10000)
                page.wait_for_function('(()=>{const button=document.querySelector("[data-funhouse-catch]");if(!button||button.disabled)return false;button.click();return true})()', polling=50, timeout=10000)
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse.challenge.status==="complete"', timeout=10000)
                assert snapshot()['funhouse']['challenge']['score'] == 50
                hud.locator('[data-funhouse-dismiss]').click()
                print('Live surprise box: three winding actions, timed catch and 50-point completion pass.', flush=True)

                travel(10, -21)
                open_panel('Monster Ball Pit')
                panel.locator('[data-funhouse-challenge]').click()
                world_ready('ballpit', 'challenge')
                show_actions()
                for hits in range(1, 3):
                    page.wait_for_function('document.querySelector("[data-funhouse-toss].is-lit:not(:disabled)")', timeout=10000)
                    hud.locator('[data-funhouse-toss].is-lit').click()
                    page.wait_for_function('(hits)=>window.MuzikazHouseExplorer.snapshot().funhouse.challenge.hits===hits', arg=hits, timeout=10000)
                page.wait_for_function('window.MuzikazHouseExplorer.snapshot().funhouse.challenge.status==="complete"', timeout=25000)
                assert snapshot()['funhouse']['challenge']['score'] == 20
                awarded = state()['score']
                page.wait_for_timeout(400)
                assert state()['score'] == awarded, 'a completed challenge may settle its score only once'
                hud.locator('[data-funhouse-dismiss]').click()
                print('Live ball pit: target cues, refill, deadline and exactly-once room score pass.', flush=True)

                travel(-8, -19)
                open_panel('Mirror Maze')
                panel.locator('[data-funhouse-challenge]').click()
                world_ready('mirrors', 'challenge')
                show_actions()
                assert len(snapshot()['funhouse']['challenge']['checkpoints']) == 4
                hud.locator('[data-funhouse-check-in]').click()
                page.wait_for_function('document.querySelector(".funhouse-experience-hud").getAttribute("aria-busy")==="false"')
                stop_world()
                assert state()['funhouse']['challenge']['status'] == 'cancelled'
                travel(0, 40)
                walk()
                print('Live mirror maze: ordered route, check-in, cancellation and resumed walking pass.', flush=True)
                adventure_checks()
            except Exception:
                try:
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-immersive-failure.png'), timeout=15000)
                    print(json.dumps(page.evaluate('(()=>{const s=window.MuzikazHouseExplorer?.snapshot();return {cameraMode:s?.cameraMode,player:s?.player,renderCamera:s?.renderCamera,funhouse:s?.funhouse,rideActive:s?.funhouseExperience?.rideActive,worldStation:s?.funhouseExperience?.worldStation,status:document.querySelector("#house-status")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.className)}})()')), flush=True)
                except Exception as diagnostic_error:
                    print('Browser diagnostics unavailable: ' + str(diagnostic_error), flush=True)
                print(Path(directory, 'server.log').read_text()[-3000:], flush=True)
                raise
            finally:
                context.close()
                server.terminate()
                server.wait(timeout=10)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture-only', action='store_true')
    parser.add_argument('--gallery-only', action='store_true', help='Run the source controller fixture and live first-person aiming check.')
    parser.add_argument('--adventure-only', action='store_true', help='Run the source controller fixture and live walking adventure check.')
    arguments = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        try:
            controller_checks(browser)
            if not arguments.fixture_only:
                game_checks(browser, gallery_only=arguments.gallery_only, adventure_only=arguments.adventure_only)
        finally:
            browser.close()
