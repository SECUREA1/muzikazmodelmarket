"""Real main-game API pipeline: autonomous greeting, alternate invite, join and map marker.

Runs a production Node server and real shared/solo resident simulations. It does
not replace resident snapshots, movement logic, invitation commands or renderers.
Speech synthesis is covered by the dedicated resident audio browser tests.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, math, os, signal, socket, subprocess, time

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='resident-invitations-live-') as directory:
    env = {**os.environ, 'PORT': str(port), 'MUZIKAZ_STATIC_SOURCE': 'repository', 'MUZIKAZ_DATA_DIR': directory,
           'MUZIKAZ_USER_DATABASE_FILE': directory+'/users.json', 'MUZIKAZ_ACCOUNTS_FILE': directory+'/accounts.json',
           'MUZIKAZ_PAYMENT_ORDERS_FILE': directory+'/orders.json', 'MUZIKAZ_ACCOUNT_SESSIONS_FILE': directory+'/account-sessions.json',
           'MUZIKAZ_GAME_SESSIONS_FILE': directory+'/game-sessions.json'}
    with open(directory+'/server.log', 'w') as log:
        process = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                for mode in os.environ.get('RESIDENT_INVITATION_MODES','multiplayer,solo').split(','):
                    world_id = 'world-item-factory' if mode == 'solo' else 'tropical-island'
                    context = browser.new_context(service_workers='block', viewport={'width': 1100, 'height': 800},
                                                  has_touch=True, reduced_motion='reduce')
                    for _ in range(50):
                        try:
                            if context.request.get(base+'/api/health', timeout=1000).ok: break
                        except Exception: pass
                        time.sleep(.1)
                    assert context.request.post(base+'/api/access/free-play', data={
                        'username': 'InviteLive'+mode, 'password': 'resident-invitations-live-password'}).ok
                    session = context.request.get(base+'/api/game/room-session').json()['data']
                    page = context.new_page(); errors = []; snapshots = []; actions = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    def record(response):
                        if '/api/rooms/'+world_id+'/' in response.url and response.ok and response.request.method == 'POST':
                            try:
                                value = response.json()['data']
                                if 'players' in value:
                                    snapshots.append(value)
                                    if len(snapshots) > 120: snapshots.pop(0)
                                request = response.request.post_data_json or {}
                                if request.get('action') == 'npc-social': actions.append(request)
                            except Exception: pass
                    page.on('response', record)
                    page.route('https://**/*', lambda route: route.abort())
                    page.add_init_script("localStorage.setItem('muzikazGameCameraMode','top-down')")
                    try:
                        page.goto(base+'/model-explorer.html?environment='+world_id+'&mode='+mode, wait_until='domcontentloaded')
                        page.get_by_role('button', name='Begin Game', exact=True).click()
                        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                        page.evaluate("dispatchEvent(new CustomEvent('muzikaz:audio-preferences',{detail:{masterMuted:true,introductionMuted:true,dialogueMuted:true}}))")
                        if mode == 'solo':
                            page.wait_for_function('MuzikazHouseExplorer.snapshot().soloResidents.ready', timeout=40000)
                        else:
                            page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady', timeout=40000)
                        assert snapshots, 'No real resident room responses'
                        print(mode+' controls and real resident snapshots ready',flush=True)
                        if mode == 'multiplayer':
                            current = snapshots[-1]; self_id = current['selfId']; position = current['players'][self_id]['position']
                            closest = min((a for a in current['actors'].values() if a.get('resident')),
                                key=lambda a: math.hypot(a['position']['x']-position['x'], a['position']['z']-position['z']))
                            moved = context.request.post(base+'/api/rooms/'+world_id+'/gameplay', headers={'X-CSRF-Token':session['csrfToken']},
                                data={'action':'map-access', 'requestId':'invite-browser-approach', 'position':{'x':closest['position']['x'], 'z':closest['position']['z']}})
                            assert moved.ok, moved.text()
                        else:
                            # Use actual local walking input to reach the nearest resident.
                            for _ in range(24):
                                current = page.evaluate('MuzikazHouseExplorer.snapshot()'); position = current['player']['position']
                                closest = min(current['soloResidents']['actors'], key=lambda a:
                                    math.hypot(a['position']['x']-position[0], a['position']['z']-position[2]))
                                dx = closest['position']['x']-position[0]; dz = closest['position']['z']-position[2]
                                if math.hypot(dx,dz) < 3.7: break
                                keys = (['d' if dx>0 else 'a'] if abs(dx)>1.5 else []) + (['s' if dz>0 else 'w'] if abs(dz)>1.5 else [])
                                for key in keys: page.keyboard.down(key)
                                page.wait_for_timeout(450)
                                for key in keys: page.keyboard.up(key)
                        prompt = page.locator('.resident-visitor-prompt')
                        prompt.wait_for(state='visible', timeout=40000)
                        assert page.locator('.world-resident-panel').is_hidden(), 'An autonomous greeting must preserve play'
                        current = snapshots[-1]; first = current['players'][current['selfId']].get('residentInvitation')
                        if not first or first.get('status') != 'offered':
                            prompt.locator('[data-visitor-talk]').click()
                            page.locator('.world-resident-panel [data-resident-reply="resident-invite"]').wait_for(state='visible', timeout=15000)
                            page.wait_for_timeout(1100)
                            page.locator('.world-resident-panel [data-resident-reply="resident-invite"]').click()
                            page.wait_for_timeout(1300)
                            current = snapshots[-1]; first = current['players'][current['selfId']].get('residentInvitation')
                            assert first and first['status']=='offered', current['players'][current['selfId']].get('npcConversation')
                            page.get_by_role('button',name='Close resident conversations',exact=True).click()
                        prompt.locator('[data-visitor-join]').wait_for(state='visible', timeout=15000)
                        page.wait_for_timeout(1100)
                        prompt.locator('[data-visitor-other]').click()
                        page.wait_for_timeout(1300)
                        assert any(a.get('choice')=='resident-other' for a in actions), actions
                        current = snapshots[-1]; invitation = current['players'][current['selfId']]['residentInvitation']
                        assert invitation['locationId'] != first['locationId'], (first, invitation)
                        assert invitation['status'] == 'offered'
                        prompt.locator('[data-visitor-join]').click()
                        prompt.locator('[data-visitor-confirm]').wait_for(state='visible', timeout=15000)
                        print(mode+' alternate invitation joined through real UI',flush=True)
                        page.wait_for_timeout(1100)
                        current = snapshots[-1]; visit = current['players'][current['selfId']]['residentVisit']
                        assert visit['status'] == 'active' and visit['worldId'] == world_id, visit
                        assert any(a.get('choice')=='resident-join' for a in actions)
                        assert page.locator('.world-resident-panel').is_hidden(), 'Compact Join must preserve the gameplay view'
                        # Open the actual map and inspect the production 3D visit pin.
                        map_toggle = page.locator('.district-map-toggle')
                        if not map_toggle.is_visible(): page.get_by_role('button', name='More view controls', exact=True).click()
                        map_toggle.click()
                        page.locator('[data-quest-markers] [aria-label*="Resident invitation"]').wait_for(state='attached',timeout=15000)
                        page.get_by_role('button',name='3D map',exact=True).click()
                        page.locator('[data-map-tag^="resident-visit:"]').wait_for(state='attached', timeout=20000)
                        page.keyboard.press('Escape')
                        page.wait_for_timeout(1100)
                        prompt.locator('[data-visitor-dismiss]').click()
                        page.wait_for_timeout(1100)
                        current = snapshots[-1]; assert current['players'][current['selfId']]['residentVisit']['status'] == 'cancelled'
                        assert page.evaluate('MuzikazHouseExplorer.snapshot().controlsReady')
                        assert not errors, errors
                        print(json.dumps({'mode':mode,'greetingResident':first['residentId'],'first':first['locationId'],
                                          'alternative':invitation['locationId'],'visit':visit['status'],'realMapPin':True,'real2DMapPin':True,
                                          'actions':[a.get('choice') for a in actions]}), flush=True)
                    except Exception:
                        print(json.dumps({'mode':mode,'errors':errors,'actions':actions,'game':page.evaluate('(()=>{const s=window.MuzikazHouseExplorer?.snapshot();return {roomId:s?.roomId,player:s?.player,controlsReady:s?.controlsReady,serverHostedRoom:s?.serverHostedRoom,soloResidents:s?.soloResidents}})()'),
                                          'latestSelf':snapshots[-1]['players'].get(snapshots[-1].get('selfId')) if snapshots else None}), flush=True)
                        page.screenshot(path='/tmp/resident-invitations-'+mode+'-failure.png',timeout=15000)
                        print(Path(directory+'/server.log').read_text()[-3000:],flush=True)
                        raise
                    finally: context.close()
                browser.close()
        finally:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
