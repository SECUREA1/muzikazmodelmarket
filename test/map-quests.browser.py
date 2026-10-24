"""Real room quests: local offers, walking checkpoints, actual site use and rewards.

The compact authored worlds keep the completion path short. Airport and docks
also launch through the normal explorer to check relevant offers and usable
movement while the automatic quest card is visible.
"""
from pathlib import Path
import argparse
import json
import math
import os
import socket
import subprocess
import tempfile
import time

from playwright.sync_api import sync_playwright

os.chdir(Path(__file__).resolve().parents[1])


def fixture_world(world_id, title):
    def item(item_id, model_id, title, x, z, behavior):
        return {'id': item_id, 'modelId': model_id, 'name': title,
                'position': {'x': x, 'y': 0, 'z': z},
                'rotation': {'x': 0, 'y': 0, 'z': 0},
                'scale': {'x': 1, 'y': 1, 'z': 1},
                'functionalSettings': {'behavior': behavior, 'enabled': True,
                                       'interactionDistance': 3, 'cooldown': .25},
                'dialogueSettings': {'text': 'Welcome to the working discovery garden.'}}
    return {'id': world_id, 'name': title, 'source': 'custom-builder',
            'visibility': 'public', 'playable': True, 'updatedAt': '2026-10-24T00:00:00Z',
            'builderScene': {'layout': 'grand-floor', 'mapSize': 64,
                             'gameplay': {'multiplayer': True},
                             'layoutMeta': {'locations': [
                                 {'id': 'arrival', 'name': 'Garden arrival', 'x': 0, 'z': 2},
                                 {'id': 'lookout', 'name': 'Garden lookout', 'x': 0, 'z': -6},
                                 {'id': 'workbench', 'name': 'Garden workbench', 'x': 8, 'z': -6}]},
                             'objects': [
                                 item('local-guide', 'street-sign', 'Garden guide', 6, 2, 'talk'),
                                 item('garden-switch', 'lever-switch', 'Garden beacon', 10, -6, 'switch')]}}


def unwrap(response):
    payload = response.json()
    return payload.get('data', payload)


def snapshot(context, base, world):
    response = context.request.get(base + '/api/rooms/' + world + '/gameplay')
    assert response.ok, (world, response.status, response.text())
    return unwrap(response)


def own_state(context, base, world, page):
    local = page.evaluate('MuzikazHouseExplorer.snapshot().localQuests ?? null')
    if local:
        return {'players': {'solo': local}, 'actors': {}}, local
    state = snapshot(context, base, world)
    self_id = page.evaluate('MuzikazHouseExplorer.snapshot().serverSelfId')
    return state, state['players'][self_id]


def wait_until(predicate, timeout=20, label='condition'):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = predicate()
        if last:
            return last
        time.sleep(.08)
    raise AssertionError(('Timed out waiting for ' + label, last))


def launch_world(context, base, world, mode='multiplayer'):
    page = context.new_page()
    page.set_default_timeout(20000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://**/*', lambda route: route.abort())
    page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=' + mode,
              wait_until='domcontentloaded', timeout=90000)
    if mode == 'solo':
        page.wait_for_function('''()=>{const s=window.MuzikazHouseExplorer?.snapshot();
          return s?.controlsReady&&s.gameplayStarted&&!s.serverHostedRoom&&s.localQuests;}''', timeout=180000)
    else:
        page.wait_for_function('''()=>{const s=window.MuzikazHouseExplorer?.snapshot();
          return s?.controlsReady&&s.serverReady&&s.serverPlayerInitialized;}''', timeout=180000)
    page.locator('.map-quest-card').wait_for(state='visible')
    assert not page.evaluate('MuzikazHouseExplorer.snapshot().player.inputBlocked')
    assert not page.evaluate('Boolean(document.querySelector("dialog[open][data-gameplay-blocking=true]"))')
    print(world + ': gameplay and automatic quest card ready', flush=True)
    return page, errors


def walk_to(context, base, world, page, target, tolerance=1.6):
    """Drive ordinary keyboard controls; no relocation or server fixture edits."""
    canvas = page.locator('#house-explorer-canvas')
    canvas.focus()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        live, own = own_state(context, base, world, page)
        position = own['position']
        dx, dz = target['x'] - position['x'], target['z'] - position['z']
        distance = math.hypot(dx, dz)
        if target.get('action') == 'interact' and own.get('vehicleMission', {}).get('ready'):
            entity = live['actors'].get(target.get('entityId'))
            if entity and math.hypot(entity['position']['x'] - position['x'], entity['position']['z'] - position['z']) <= target.get('interactionDistance', 3) - .1:
                return
        if distance <= tolerance:
            return
        yaw = page.evaluate('MuzikazHouseExplorer.snapshot().player.yaw')
        forward = -dx * math.sin(yaw) - dz * math.cos(yaw)
        side = dx * math.cos(yaw) - dz * math.sin(yaw)
        key = ('w' if forward > 0 else 's') if abs(forward) >= abs(side) else ('d' if side > 0 else 'a')
        page.keyboard.down(key)
        try:
            page.wait_for_timeout(min(400, max(90, (distance - tolerance) * 100)))
        finally:
            page.keyboard.up(key)
    raise AssertionError((world, 'Could not walk to quest site', target, own_state(context, base, world, page)[1]))


def complete_compact_quest(context, base, world, kind):
    page, errors = launch_world(context, base, world)
    try:
        state, own = own_state(context, base, world, page)
        offers = state['questOffers']
        offer = next(offer for offer in offers if offer.get('siteQuest') and offer['kind'] == kind and not offer.get('challenge'))
        start_score = own['score']
        page.get_by_label('Choose local challenge', exact=True).select_option(offer['id'])
        page.locator('[data-quest-accept]').click()
        wait_until(lambda: own_state(context, base, world, page)[1].get('vehicleMission', {}).get('status') == 'active', label='accepted map quest')
        seen_sites = []
        while True:
            state, own = own_state(context, base, world, page)
            mission = own['vehicleMission']
            if mission['status'] != 'active':
                break
            index = mission['index']
            point = mission['checkpoints'][index]
            target = state['actors'].get(point.get('actorId'), {}).get('position', point)
            walk_to(context, base, world, page, target, tolerance=.8 if point.get('action') == 'interact' else 1.6)
            if point.get('action') == 'interact':
                entity = state['actors'][point['entityId']]
                _, standing = own_state(context, base, world, page)
                if math.hypot(standing['position']['x'] - entity['position']['x'], standing['position']['z'] - entity['position']['z']) > 2.7:
                    walk_to(context, base, world, page, entity['position'], tolerance=2.2)
            page.locator('.map-quest-launcher').click() if not page.locator('.map-quest-card').is_visible() else None
            if point.get('action') == 'interact':
                assert page.locator('[data-quest-confirm]').count() == 0, 'Site jobs must use the real object.'
                action = page.locator('[data-quest-use]')
            else:
                action = page.locator('[data-quest-confirm]')
            wait_until(lambda: action.count() and action.is_enabled(), label='objective action ready')
            action.click()
            wait_until(lambda: (lambda q: q['status'] != 'active' or q['index'] > index)(own_state(context, base, world, page)[1]['vehicleMission']),
                       label='authoritative objective advancement')
            seen_sites.append(point.get('entityId') or point.get('siteId') or point['name'])
        assert mission['status'] == 'completed', (world, mission)
        assert len(seen_sites) == len(mission['checkpoints'])
        assert own['score'] == start_score + offer['reward'], (world, start_score, own['score'], offer)
        page.get_by_role('heading', name='Challenge complete', exact=True).wait_for()
        assert page.locator('.map-quest-card').inner_text().find(str(offer['reward'])) >= 0
        # A subsequent snapshot cannot repeat either completion or payment.
        page.wait_for_timeout(900)
        after, own_after = own_state(context, base, world, page)
        assert own_after['score'] == own['score']
        assert len([result for result in after['questResults'] if result['questId'] == offer['id'] and result['actorId'] == own_after['id']]) == 1
        if kind == 'site-job':
            assert after['actors']['garden-switch']['switched'] is True
            assert 'garden-switch' in seen_sites, seen_sites
        page.get_by_role('button', name='Explore more quests', exact=True).click()
        assert page.get_by_label('Choose local challenge', exact=True).is_visible()
        assert not errors, errors
        print(world + ': real walking, ordered ' + kind + ' objectives and one authoritative reward passed', flush=True)
    except Exception:
        print(world, 'failure player', own_state(context, base, world, page)[1], 'errors', errors, flush=True)
        page.screenshot(path='/tmp/map-quests-' + world + '-failure.png')
        raise
    finally:
        page.close()


def check_authored_world(context, base, world, expected_title):
    page, errors = launch_world(context, base, world)
    try:
        state, _ = own_state(context, base, world, page)
        assert any(offer['title'] == expected_title for offer in state['questOffers']), (world, state['questOffers'])
        page.get_by_label('Choose local challenge', exact=True).select_option(next(offer['id'] for offer in state['questOffers'] if offer['title'] == expected_title))
        assert page.locator('[data-quest-accept]').is_enabled()
        assert page.locator('.map-quest-card').is_visible()
        # The arrival guidance stays a companion while actual touch movement works.
        stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
        assert stick.evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node||node.contains(hit);}'''), 'Quest card covers movement.'
        box = stick.bounding_box()
        cdp = context.new_cdp_session(page)
        finger = {'id': 5, 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
        before = page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [finger]})
        try:
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{**finger, 'y': finger['y'] - box['height'] * .35}]})
            page.wait_for_function('(a)=>{const b=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(a[0]-b[0],a[2]-b[2])>.15}', arg=before, timeout=20000)
        finally:
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            cdp.detach()
        assert not errors, errors
        print(world + ': correct local offers and fresh touch movement with arrival popup passed', flush=True)
    finally:
        page.close()


def complete_solo_quest(context, base):
    world = 'quest-practice-garden'
    page, errors = launch_world(context, base, world, mode='solo')
    commands = []
    page.on('request', lambda request: commands.append(request.post_data_json) if request.method == 'POST' and '/gameplay' in request.url else None)
    try:
        assert 'Solo practice' in page.locator('.map-quest-world').inner_text()
        assert 'practice score' in page.locator('.map-quest-card').inner_text()
        assert page.get_by_role('button', name='Open crew radio', exact=True).count() == 0
        initial = page.evaluate('MuzikazHouseExplorer.snapshot().localQuests')
        selector = page.get_by_label('Choose local challenge', exact=True)
        selector.select_option('map:' + world + ':tour')
        selector.focus()
        start = page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
        page.keyboard.down('s')
        page.wait_for_timeout(600)
        page.keyboard.up('s')
        end = page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
        assert math.hypot(end[0] - start[0], end[2] - start[2]) > .3, 'A focused solo quest selector blocked movement.'
        assert page.evaluate('document.activeElement.id === "house-explorer-canvas"'), 'Solo selection did not return gameplay focus.'
        page.locator('[data-quest-accept]').click()
        page.wait_for_function('MuzikazHouseExplorer.snapshot().localQuests.vehicleMission?.status === "active"')
        page.locator('.map-quest-objective').wait_for(state='visible')
        # The local runtime uses normal movement and real elapsed dwell time.
        visited = []
        while True:
            own = page.evaluate('MuzikazHouseExplorer.snapshot().localQuests')
            mission = own['vehicleMission']
            if mission['status'] != 'active':
                break
            index = mission['index']
            point = mission['checkpoints'][index]
            walk_to(context, base, world, page, point)
            confirm = page.locator('[data-quest-confirm]')
            wait_until(lambda: confirm.count() and confirm.is_enabled(), label='solo checkpoint dwell')
            confirm.click()
            page.wait_for_function('(index)=>{const q=MuzikazHouseExplorer.snapshot().localQuests.vehicleMission;return q.status!=="active"||q.index>index;}', arg=index)
            visited.append(point['siteId'])
        assert mission['status'] == 'completed', mission
        assert len(visited) == len(mission['checkpoints'])
        assert own['score'] == initial['score'] + mission['reward']
        assert own['mapQuestProgress']['completed'][mission['questId']]['count'] == 1
        page.get_by_role('heading', name='Challenge complete', exact=True).wait_for()
        assert 'practice score' in page.locator('.map-quest-card').inner_text()
        assert page.locator('.map-quest-objective').is_hidden(), 'The completed route left a stale objective HUD.'
        page.wait_for_timeout(900)
        after = page.evaluate('MuzikazHouseExplorer.snapshot().localQuests')
        assert after['score'] == own['score']
        assert after['mapQuestProgress']['completed'][mission['questId']]['count'] == 1
        assert not any(command.get('action') == 'vehicle-mission' for command in commands), commands
        page.get_by_role('button', name='Explore more quests', exact=True).click()
        assert 'Completed once' in page.locator('.map-quest-completion').inner_text()
        assert not errors, errors
        print(world + ': solo arrival, native walking, timed check-ins, clear HUD and exactly one local practice reward passed', flush=True)
    except Exception:
        print(world, 'failure state', page.evaluate('MuzikazHouseExplorer.snapshot()'), 'errors', errors, flush=True)
        page.screenshot(path='/tmp/map-quests-solo-failure.png')
        raise
    finally:
        page.close()


def main(authored=True, solo_only=False):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='map-quests-') as directory:
        Path(directory, 'custom-maps.json').write_text(json.dumps([
            fixture_world('quest-discovery-garden', 'Discovery Garden'),
            fixture_world('quest-working-garden', 'Working Garden'),
            fixture_world('quest-practice-garden', 'Practice Garden')]))
        with open(Path(directory, 'server.log'), 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, service_workers='block', reduced_motion='reduce')
                    base = 'http://127.0.0.1:' + str(port)
                    wait_until(lambda: health_ready(context, base), timeout=30, label='server health')
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    if not solo_only:
                        complete_compact_quest(context, base, 'quest-discovery-garden', 'site-tour')
                        complete_compact_quest(context, base, 'quest-working-garden', 'site-job')
                        if authored:
                            check_authored_world(context, base, 'muzikaz-airport', 'Airport ground discovery')
                            check_authored_world(context, base, 'world-district-neon-docks', 'Waterfront discovery walk')
                    complete_solo_quest(context, base)
                    browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


def health_ready(context, base):
    try:
        return context.request.get(base + '/api/health', timeout=1000).ok
    except Exception:
        return False


parser = argparse.ArgumentParser()
parser.add_argument('--compact-only', action='store_true')
parser.add_argument('--solo-only', action='store_true')
args = parser.parse_args()
main(not args.compact_only, solo_only=args.solo_only)
