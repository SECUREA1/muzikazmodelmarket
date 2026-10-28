"""Real map buttons replace the room connection and activate the destination.

A completed old-room heartbeat is held across travel, then delivered after the
new room is playable. The destination join is held separately to verify that a
loaded map cannot borrow readiness from the previous server connection.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, math, os, signal, socket, subprocess, time

ROOT = Path(__file__).resolve().parents[1]
READY = """id => {const game=window.MuzikazHouseExplorer?.snapshot();return game?.roomId===id&&game.serverHostedRoom&&game.serverReady&&game.serverPlayerInitialized&&game.controlsReady&&game.gameplayStarted&&!game.worldLoading;}"""


def choose_world(page, world):
    page.locator('#house-world-button').click()
    lobby = page.locator('.world-map-picker')
    lobby.wait_for(state='visible')
    lobby.locator('[data-world-search]').fill(world)
    lobby.locator('[data-world-view="list"]').click()
    lobby.locator('[data-world-card="' + world + '"]').click()
    lobby.locator('[data-world-join]').click()


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='map-room-refresh-') as directory:
    env = {**os.environ, 'PORT': str(port), 'MUZIKAZ_STATIC_SOURCE': 'repository', 'MUZIKAZ_DATA_DIR': directory,
           'MUZIKAZ_USER_DATABASE_FILE': directory + '/users.json', 'MUZIKAZ_ACCOUNTS_FILE': directory + '/accounts.json',
           'MUZIKAZ_PAYMENT_ORDERS_FILE': directory + '/orders.json', 'MUZIKAZ_ACCOUNT_SESSIONS_FILE': directory + '/sessions.json',
           'MUZIKAZ_GAME_SESSIONS_FILE': directory + '/game-sessions.json'}
    with open(directory + '/server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                             args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844},
                                              is_mobile=True, has_touch=True, reduced_motion='reduce')
                for _ in range(120):
                    try:
                        if context.request.get(base + '/api/health', timeout=500).ok:
                            break
                    except Exception:
                        time.sleep(.05)
                else:
                    raise AssertionError(Path(directory + '/server.log').read_text())
                assert context.request.post(base + '/api/access/free-play', data={
                    'username': 'MapRoomRefreshTest', 'password': 'map-room-refresh-password'}).ok
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.add_init_script("""(() => {
                    localStorage.setItem('muzikazGameCameraMode','top-down');
                    window.mapRoomProbe={rows:[],joins:[],events:[],armInput:false,armJoin:false};
                    document.addEventListener('muzikaz:gameplay-ready',event=>{const game=window.MuzikazHouseExplorer?.snapshot();mapRoomProbe.events.push({type:'ready',room:game?.roomId,controlsReady:game?.controlsReady,serverReady:game?.serverReady,worldLoading:game?.worldLoading,detail:event.detail});});
                    window.addEventListener('muzikaz:multiplayer-world-change',event=>mapRoomProbe.events.push({type:'world',detail:event.detail}));
                    const nativeFetch=window.fetch.bind(window);
                    window.fetch=async function(resource,options={}){
                        const response=await nativeFetch(resource,options);
                        const path=String(resource),match=path.match(/\\/api\\/rooms\\/([^/]+)\\/gameplay/);
                        if(!match||!options.body)return response;
                        const body=JSON.parse(options.body),world=decodeURIComponent(match[1]);
                        if(!['join','input'].includes(body.action))return response;
                        const payload=await response.clone().json(),state=payload.data||{},self=state.players?.[state.selfId];
                        const row={world,action:body.action,status:response.status,sequence:state.sequence,epoch:state.inputEpoch||state.result?.inputEpoch,position:self?.position,input:body.input};
                        mapRoomProbe.rows.push(row);
                        if(body.action==='join'&&response.ok)mapRoomProbe.joins.push({world,epoch:row.epoch,selfId:state.selfId,residents:Object.values(state.actors||{}).filter(actor=>actor.resident).map(actor=>actor.id)});
                        if(body.action==='input'&&response.ok&&mapRoomProbe.armInput){mapRoomProbe.armInput=false;mapRoomProbe.heldInputWorld=world;await new Promise(resolve=>mapRoomProbe.releaseInput=resolve);mapRoomProbe.oldReplyDelivered=true;}
                        if(body.action==='join'&&response.ok&&mapRoomProbe.armJoin){mapRoomProbe.armJoin=false;mapRoomProbe.heldJoinWorld=world;await new Promise(resolve=>mapRoomProbe.releaseJoin=resolve);}
                        return response;
                    };
                })()""")
                try:
                    page.goto(base + '/model-explorer.html?environment=public-commons&mode=multiplayer&autoplay=1',
                              wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function(READY, arg='public-commons', timeout=120000)
                    print('Commons is playable on its confirmed server connection.', flush=True)
                    reports = []
                    for destination in ['muzikaz-main', 'public-commons', 'public-commons']:
                        previous = page.evaluate('MuzikazHouseExplorer.snapshot().roomId')
                        before_joins = page.evaluate('mapRoomProbe.joins.length')
                        previous_epoch = page.evaluate('mapRoomProbe.joins.at(-1).epoch')
                        before_events = page.evaluate('mapRoomProbe.events.length')
                        page.evaluate('Object.assign(mapRoomProbe,{armInput:true,armJoin:true,heldInputWorld:null,heldJoinWorld:null,oldReplyDelivered:false})')
                        page.wait_for_function('mapRoomProbe.heldInputWorld!==null', timeout=15000)
                        choose_world(page, destination)
                        page.wait_for_function('mapRoomProbe.heldJoinWorld!==null', timeout=120000)
                        loading = page.evaluate('MuzikazHouseExplorer.snapshot()')
                        assert page.evaluate('mapRoomProbe.heldJoinWorld') == destination
                        assert loading['roomId'] == destination
                        assert loading['worldLoading'] and not loading['controlsReady'] and not loading['serverReady'], loading
                        loading_events = page.evaluate('start=>mapRoomProbe.events.slice(start)', before_events)
                        assert not any(event['type'] == 'ready' for event in loading_events), ('A loaded map activated before its server join.', loading_events)
                        departures = [event for event in loading_events if event['type'] == 'world']
                        assert len(departures) == 1 and departures[0]['detail']['roomId'] == destination, loading_events
                        page.evaluate('mapRoomProbe.releaseJoin()')
                        page.wait_for_function(READY, arg=destination, timeout=60000)
                        arrival_events = page.evaluate('start=>mapRoomProbe.events.slice(start).filter(event=>event.type==="ready")', before_events)
                        assert len(arrival_events) == 1 and arrival_events[0]['room'] == destination, arrival_events
                        assert arrival_events[0]['controlsReady'] and arrival_events[0]['serverReady'] and not arrival_events[0]['worldLoading'], arrival_events
                        assert page.evaluate('mapRoomProbe.joins.length') == before_joins + 1
                        current_join = page.evaluate('mapRoomProbe.joins.at(-1)')
                        assert current_join['world'] == destination and current_join['residents'], current_join
                        assert current_join['epoch'] and current_join['epoch'] != previous_epoch, ('The destination reused a previous connection input epoch.', current_join)
                        assert page.evaluate('window.MUZIKAZ_HOUSE_TRACKING.roomId') == destination
                        page.evaluate('mapRoomProbe.releaseInput()')
                        page.wait_for_function('mapRoomProbe.oldReplyDelivered')
                        page.wait_for_timeout(300)
                        assert page.evaluate(READY, destination), 'A late old-room reply corrupted destination readiness.'
                        row_start = page.evaluate('mapRoomProbe.rows.length')
                        page.locator('#house-explorer-canvas').focus()
                        page.keyboard.down('s')
                        try:
                            page.wait_for_function("""({world,start})=>mapRoomProbe.rows.slice(start).filter(row=>row.world===world&&row.action==='input'&&row.status===200&&row.input?.forward<-.5).length>=3""",
                                                   arg={'world': destination, 'start': row_start}, timeout=20000)
                        finally:
                            page.keyboard.up('s')
                        rows = page.evaluate('start=>mapRoomProbe.rows.slice(start)', row_start)
                        active = [row for row in rows if row['world'] == destination and row['status'] == 200 and row.get('position')]
                        assert all(row['world'] == destination for row in rows), rows
                        assert len(active) >= 3
                        positions = [row['position'] for row in active]
                        displacement = max(math.hypot(point['x']-positions[0]['x'], point['z']-positions[0]['z']) for point in positions)
                        assert displacement > .05, ('The new room accepted controls but did not move the player.', active)
                        reports.append({'from': previous, 'to': destination, 'freshJoin': True, 'activationEvent': True, 'residentCount': len(current_join['residents']), 'movement': round(displacement, 3), 'staleReplyIgnored': True})
                        print(json.dumps(reports[-1]), flush=True)
                    assert not errors, errors
                    print(json.dumps({'actualMapButtons': True, 'mobile': True, 'transitions': reports, 'errors': errors}), flush=True)
                except Exception:
                    print(json.dumps(page.evaluate('''()=>({game:MuzikazHouseExplorer?.snapshot(),probe:{...mapRoomProbe,rows:mapRoomProbe.rows.slice(-10)},status:document.querySelector('#house-status')?.textContent})''')), flush=True)
                    print(Path(directory + '/server.log').read_text()[-4000:], flush=True)
                    raise
                finally:
                    context.close()
                    browser.close()
        finally:
            if server.poll() is None:
                os.killpg(server.pid, signal.SIGTERM)
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(server.pid, signal.SIGKILL)
                    server.wait(timeout=5)
