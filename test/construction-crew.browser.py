"""Real server QA for custom construction crew, work cameras and mobile controls.

Run after npm run build. Chromium software rendering stays at phone sizes and
640x480; deterministic mechanical/terrain tests cover the complete work route.
"""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROOM = 'skyscraper-construction'
GUI_ONLY = os.environ.get('CONSTRUCTION_CREW_GUI_ONLY') == '1'
NATIVE_ONLY = os.environ.get('CONSTRUCTION_CREW_NATIVE_ONLY') == '1'
MOBILE_ONLY = os.environ.get('CONSTRUCTION_CREW_MOBILE_ONLY') == '1'
FOCUSED = os.environ.get('CONSTRUCTION_CREW_FOCUSED') == '1'
os.chdir(ROOT)


def hittable(locator):
    return locator.evaluate("""element => {
      const r=element.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&!!top&&(top===element||element.contains(top));
    }""")


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'

with tempfile.TemporaryDirectory(prefix='construction-crew-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], stdout=log, stderr=log,
                                  env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory})
        try:
            with sync_playwright() as playwright:
                api = playwright.request.new_context(base_url=base)
                for _ in range(100):
                    try:
                        if api.get('/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                else:
                    raise AssertionError('Construction integration server did not start')
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                for mobile in ([False] if NATIVE_ONLY else [True] if MOBILE_ONLY else [True, False]):
                    context = browser.new_context(viewport={'width': 390 if mobile else 640, 'height': 844 if mobile else 480},
                        has_touch=mobile, is_mobile=mobile, device_scale_factor=1, service_workers='block', reduced_motion='reduce')
                    context.add_init_script("Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4})")
                    if mobile:
                        context.add_init_script("Object.defineProperty(Element.prototype,'requestFullscreen',{value:undefined,configurable:true});Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{value:undefined,configurable:true})")
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    page = context.new_page()
                    errors, requests = [], []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())

                    def record(request):
                        if request.method == 'POST' and '/gameplay' in request.url:
                            requests.append(request.post_data_json)
                    page.on('request', record)

                    def state():
                        response = context.request.get(base + '/api/rooms/' + ROOM + '/gameplay', timeout=10000)
                        assert response.ok, response.text()
                        return response.json()['data']

                    def wait_for(predicate, label, seconds=15):
                        deadline = time.monotonic() + seconds
                        while time.monotonic() < deadline:
                            snapshot = state()
                            if predicate(snapshot):
                                return snapshot
                            page.wait_for_timeout(100)
                        raise AssertionError(label)

                    def request_seen(predicate, start):
                        deadline = time.monotonic() + 10
                        while time.monotonic() < deadline:
                            if any(predicate(item) for item in requests[start:]):
                                return
                            page.wait_for_timeout(50)
                        raise AssertionError('Missing live input: ' + json.dumps(requests[-12:]))

                    try:
                        print('Opening actual ' + ('390px mobile fallback' if mobile else '640px native fullscreen'), flush=True)
                        page.goto(base + '/model-explorer.html?environment=' + ROOM + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded')
                        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
                        initial = state()
                        assert len(initial['construction']['earthworks']['patches']) >= 7, 'Expanded yard earth patches missing from native room'
                        crew_toggle = page.get_by_role('button', name='Construction crew and jobs', exact=True)
                        crew_toggle.wait_for(state='visible')
                        viewport_toggle = page.locator('.game-viewport-toggle')
                        viewport_toggle.scroll_into_view_if_needed()
                        viewport_toggle.click()
                        page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
                        assert page.locator('.game-viewport-expanded').get_attribute('data-viewport-mode') == ('page' if mobile else 'native')
                        crew_toggle.click()
                        dialog = page.locator('.construction-crew-dialog')
                        assert dialog.is_visible() and hittable(dialog.get_by_role('button', name='Close crew', exact=True))
                        assert dialog.locator('[data-worker-id]').count() == 4
                        assert dialog.locator('[data-job-id]').count() == 6
                        machine_id = next(a['id'] for a in initial['actors'].values() if a['modelId'] == 'site-excavator')
                        worker_id = 'crew-noor'
                        card = dialog.locator('[data-worker-id="' + worker_id + '"]')
                        if mobile and not GUI_ONLY:
                            current_name = next(w['name'] for w in initial['construction']['crew']['workers'] if w['id'] == worker_id)
                            card.get_by_label('Edit ' + current_name + ' appearance', exact=True).click()
                            card.get_by_label('Name for ' + current_name, exact=True).fill('Site QA Operator')
                            card.get_by_label('hardHat for ' + current_name, exact=True).select_option('blue')
                            card.get_by_label('vest for ' + current_name, exact=True).select_option('orange')
                            card.get_by_role('button', name='Save ' + current_name + ' appearance', exact=True).click()
                            wait_for(lambda s: any(w['id'] == worker_id and w['name'] == 'Site QA Operator' and w['appearance']['hardHat'] == 'blue' and w['appearance']['vest'] == 'orange' for w in s['construction']['crew']['workers']), 'Custom worker details did not reach authority')
                            card.get_by_label('Job for Site QA Operator', exact=True).select_option('dig')
                            card.get_by_label('Machine for Site QA Operator', exact=True).select_option(machine_id)
                            card.get_by_role('button', name='Assign Site QA Operator', exact=True).click()
                            wait_for(lambda s: any(j['id'] == 'dig' and j['workerId'] == worker_id and j['machineId'] == machine_id for j in s['construction']['crew']['jobs']), 'Job assignment did not reach authority')
                            # Isolate one real worker so this browser check tests
                            # GUI dispatch without starting several long routes.
                            for worker in state()['construction']['crew']['workers']:
                                if worker['id'] != worker_id:
                                    other_id = worker['id']
                                    dialog.locator('[data-worker-id="' + other_id + '"]').get_by_role('button', name='Pause worker', exact=True).click()
                                    wait_for(lambda s: any(w['id'] == other_id and not w['enabled'] for w in s['construction']['crew']['workers']), 'Individual worker pause did not reach authority')
                            old = next(w['position'] for w in state()['construction']['crew']['workers'] if w['id'] == worker_id)
                            dialog.get_by_role('button', name='Start crew', exact=True).click()
                            wait_for(lambda s: s['construction']['crew']['enabled'], 'Start crew was not applied')
                            wait_for(lambda s: any(w['id'] == worker_id and (abs(w['position']['x']-old['x'])+abs(w['position']['z']-old['z']) > .1) for w in s['construction']['crew']['workers']), 'Dispatched named worker did not actually walk', seconds=20)
                            dialog.get_by_role('button', name='Pause crew', exact=True).click()
                            wait_for(lambda s: not s['construction']['crew']['enabled'] and all(not a.get('construction', {}).get('crewOperator') for a in s['actors'].values()), 'Pause crew did not neutralize trusted operators')
                            card.locator('details').evaluate('element=>element.open=false')
                            card.scroll_into_view_if_needed()
                            page.screenshot(path='/tmp/construction-crew-jobs-390x844.png')
                            print('Custom worker, physical dispatch, assignment and pause reached the actual server.', flush=True)
                        dialog.get_by_role('button', name='Close crew', exact=True).click()

                        page.locator('.district-map-toggle').click()
                        page.get_by_role('button', name='Vehicles', exact=True).click()
                        page.locator('[data-craft-id="' + machine_id + '"]').click()
                        page.locator('.district-map-dialog').get_by_role('button', name='Close', exact=True).click()
                        panel = page.locator('.construction-controls')
                        panel.wait_for(state='visible')
                        print('Boarded native excavator; checking operator and Work cameras.', flush=True)
                        wait_for(lambda s: s['actors'][machine_id].get('holderId') is not None and not s['actors'][machine_id]['construction'].get('crewOperator'), 'Human did not take exclusive machine ownership')
                        panel.locator('[data-construction-more]').click()
                        functions = page.locator('.construction-functions-dialog')
                        functions.locator('[data-camera-view=operator]').click()
                        functions.get_by_role('button', name='Close functions', exact=True).click()
                        page.wait_for_timeout(150)
                        operator = page.evaluate('MuzikazHouseExplorer.snapshot().renderCamera.position')
                        if mobile:
                            page.screenshot(path='/tmp/construction-excavator-operator-390x844.png')
                        panel.locator('[data-construction-more]').click()
                        functions.locator('[data-camera-view=work]').click()
                        functions.get_by_role('button', name='Close functions', exact=True).click()
                        page.wait_for_function('prior=>{const p=MuzikazHouseExplorer.snapshot().renderCamera.position;return Math.hypot(...p.map((v,i)=>v-prior[i]))>5}', arg=operator)
                        print('Actual Work camera moved clear of the operator cab.', flush=True)

                        for width, height in ([(390, 844)] if mobile and FOCUSED else [(390, 844), (320, 568), (844, 390)] if mobile else [(640, 480)]):
                            page.set_viewport_size({'width': width, 'height': height})
                            page.wait_for_timeout(100)
                            assert page.locator('.house-stage').bounding_box()['height'] >= height * .7
                            assert panel.bounding_box()['height'] <= (152 if height <= 430 else 252)
                            pads = panel.locator('.construction-work-sticks .construction-stick:visible')
                            assert pads.count() == 2 and all(hittable(pads.nth(i)) for i in range(2))
                            assert panel.locator('[data-operation=exit]:visible').count() == 1
                            assert not page.locator('.nearby-gameplay-actions').is_visible()
                            # Changing modes must synchronously neutralize live
                            # travel, even before a periodic input heartbeat.
                            panel.locator('[data-construction-mode=drive]').click()
                            travel = panel.locator('.construction-travel-stick')
                            start = len(requests)
                            travel.focus()
                            page.keyboard.down('ArrowUp')
                            request_seen(lambda r: r.get('action') == 'input' and r.get('input', {}).get('forward', 0) > .5, start)
                            start = len(requests)
                            panel.locator('[data-construction-mode=work]').click()
                            page.keyboard.up('ArrowUp')
                            request_seen(lambda r: r.get('action') == 'input' and abs(r.get('input', {}).get('forward', 0)) < .01 and abs(r.get('input', {}).get('side', 0)) < .01, start)
                            panel.locator('[data-operation=park]').click()
                            print(f'{width}x{height} compact pads, travel input and mode neutral passed.', flush=True)

                        page.set_viewport_size({'width': 390 if mobile else 640, 'height': 844 if mobile else 480})
                        panel.locator('[data-construction-view=instruments]').click()
                        instruments = page.locator('.construction-instruments-dialog')
                        assert instruments.locator('meter:visible').count() >= 6
                        assert hittable(instruments.get_by_role('button', name='Close instruments', exact=True))
                        instruments.get_by_role('button', name='Close instruments', exact=True).click()
                        before = state()['actors'][machine_id]['construction']['boom']
                        key = 'ArrowUp' if before > 1.2 else 'ArrowDown'
                        direction = -1 if key == 'ArrowUp' else 1
                        pads = panel.locator('.construction-work-sticks .construction-stick:visible')
                        pads.nth(1).focus()
                        page.keyboard.down(key)
                        wait_for(lambda s: (s['actors'][machine_id]['construction']['boom']-before)*direction > .005, 'Real hydraulic lever did not move authoritative boom')
                        start = len(requests)
                        toggle = page.get_by_role('button', name='Show or hide construction dashboard', exact=True)
                        toggle.click()
                        page.keyboard.up(key)
                        panel.wait_for(state='hidden')
                        request_seen(lambda r: r.get('action') == 'construction-controls' and r.get('operation') == 'control' and not any(r.get('axes', {}).values()), start)
                        wait_for(lambda s: not any(s['actors'][machine_id]['construction']['axes'].values()), 'Hidden dashboard left hydraulic demand active')
                        assert hittable(toggle) and hittable(viewport_toggle)
                        if mobile:
                            page.screenshot(path='/tmp/construction-earthwork-hidden-390x844.png')
                        toggle.click()
                        panel.wait_for(state='visible')
                        assert hittable(panel.locator('[data-operation=park]'))
                        if mobile:
                            page.screenshot(path='/tmp/construction-earthwork-workcam-390x844.png')
                        panel.locator('[data-operation=park]').click()
                        panel.locator('[data-operation=exit]').click()
                        panel.wait_for(state='hidden')
                        if mobile:
                            crane_id = next(a['id'] for a in state()['actors'].values() if a['modelId'] == 'tower-crane')
                            page.locator('.district-map-toggle').click()
                            page.get_by_role('button', name='Vehicles', exact=True).click()
                            page.locator('[data-craft-id="' + crane_id + '"]').click()
                            page.locator('.district-map-dialog').get_by_role('button', name='Close', exact=True).click()
                            panel.wait_for(state='visible')
                            primary = panel.locator('.sports-primary-trigger')
                            assert primary.get_attribute('data-operation') == 'attach', 'Guided steel action should offer the ready hook connection'
                            primary.click()
                            wait_for(lambda s: bool(s['actors'][crane_id]['construction']['load']), 'Guided steel Attach did not reach shared crane')
                            page.wait_for_function('document.querySelector(".construction-controls .sports-primary-trigger").dataset.operation==="aim-target"')
                            assert primary.is_enabled(), 'After attaching steel the one-button guide should offer Raise to tower'
                            panel.locator('[data-operation=park]').click()
                            page.screenshot(path='/tmp/construction-expanded-yard-crane-390x844.png')
                            page.set_viewport_size({'width': 844, 'height': 390})
                            page.wait_for_timeout(150)
                            toggle.click()
                            panel.wait_for(state='hidden')
                            page.screenshot(path='/tmp/construction-expanded-yard-landscape.png')
                            page.set_viewport_size({'width': 390, 'height': 844})
                            toggle.click()
                            panel.wait_for(state='visible')
                            assert not panel.locator('[data-operation=exit]').is_enabled(), 'Suspended steel must be secured before leaving the machine'
                            panel.locator('[data-construction-more]').click()
                            functions.locator('[data-operation=release]').click()
                            wait_for(lambda s: not s['actors'][crane_id]['construction']['load'], 'Safe rack set-down did not release the actual attached beam')
                            assert state()['construction']['tower']['placed'] == 0, 'Returning steel to its rack cannot award building progress'
                            functions.get_by_role('button', name='Close functions', exact=True).click()
                            panel.locator('[data-operation=exit]').click()
                            panel.wait_for(state='hidden')
                            page.screenshot(path='/tmp/construction-expanded-yard-on-foot.png')
                            print('Guided crane Attach reached authority and advanced to the tower action.', flush=True)
                        viewport_toggle.click()
                        page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded!=="true"')
                        assert not errors, errors
                        print(('Mobile fallback' if mobile else 'Native fullscreen') + ' Work camera, controls, hide/neutral and dialogs passed.', flush=True)
                    except Exception:
                        Path('/tmp/construction-crew-browser-failure.json').write_text(json.dumps({'errors': errors, 'requests': requests[-20:], 'snapshot': page.evaluate('window.MuzikazHouseExplorer?.snapshot()'), 'state': state()}, indent=2))
                        page.screenshot(path='/tmp/construction-crew-browser-failure.png')
                        raise
                    finally:
                        context.close()
                browser.close()
                api.dispose()
        finally:
            server.terminate()
            server.wait(timeout=10)

print('Live expanded-yard crew and mobile/native construction integration passed.')
