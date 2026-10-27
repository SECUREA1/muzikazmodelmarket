"""Prison browser integration: native world startup, walking, doors and activity UI.

The live-server section never changes player state. The isolated UI section uses
an in-memory simulation so each physical station can be exercised directly.
"""
from pathlib import Path
import json
import os
import socket
import subprocess
import tempfile
import time
import uuid
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS = ROOT.parent / 'scratch'
ARTIFACTS.mkdir(exist_ok=True)
WORLD = 'ironwood-prison'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='prison-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900}, reduced_motion='reduce', has_touch=True)
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Prison server did not start: ' + Path(directory, 'server.log').read_text()[-3000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                    def command(action, **fields):
                        response = context.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (action, response.status, response.text())
                        return response.json()['data']
                    listing = context.request.get(base + '/api/environments').json()['data']
                    worlds = listing if isinstance(listing, list) else listing.get('environments', [])
                    world = next(row for row in worlds if row['id'] == WORLD)
                    assert world['permanent'] and world['playable'] and world['multiplayer'], world
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    snapshot = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert snapshot['roomId'] == WORLD and snapshot['serverPlayerInitialized'], snapshot
                    assert not snapshot['world']['slimeFloor'], snapshot['world']
                    assert not page.locator('.map-quest-card').is_visible()
                    state = command('input', input={})
                    assert state.get('prison'), state.keys()
                    assert not state.get('radTox')
                    assert not any(actor.get('loot') or actor.get('roadFleet') for actor in state['actors'].values())
                    canvas = page.locator('#house-explorer-canvas')
                    canvas.scroll_into_view_if_needed()
                    canvas.focus()
                    before = page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
                    page.keyboard.down('w')
                    try:
                        page.wait_for_function('(before)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-before[0],p[2]-before[2])>.3}', arg=before, timeout=15000)
                    finally:
                        page.keyboard.up('w')
                    live_trigger=page.get_by_role('button',name='Open Ironwood prison activities',exact=True)
                    if not live_trigger.is_visible():
                        page.get_by_role('button',name='More view controls',exact=True).click()
                    assert page.locator('.game-display-flow-views .prison-toggle').count()==1
                    assert live_trigger.locator('svg').count()==1
                    live_trigger.click()
                    live_panel=page.locator('#ironwood-prison-panel')
                    assert live_panel.is_visible()
                    assert live_panel.locator('[data-role]').inner_text()=='PRISONER'
                    live_panel.locator('[data-tab="map"]').click()
                    assert page.get_by_role('img',name='Ironwood facility map').is_visible()
                    page.screenshot(path=str(ARTIFACTS / 'prison-live-panel.png'))
                    live_panel.locator('[data-close]').click()
                    assert not live_panel.is_visible()
                    canvas.focus()
                    after_menu=page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
                    page.keyboard.down('d')
                    try:
                        page.wait_for_function('(before)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-before[0],p[2]-before[2])>.2}',arg=after_menu,timeout=15000)
                    finally:
                        page.keyboard.up('d')
                    page.screenshot(path=str(ARTIFACTS / 'prison-live.png'))
                    assert not errors, errors
                    print('Prison live world: registered, authoritative startup, clear spawn, walking, no ambient toxin encounters.', flush=True)
                    # Independent geometry fixture verifies bars against the client
                    # collision tree, rather than merely inspecting a lock flag.
                    page.goto(base + '/test/fixtures/compact-sports-actions.html')
                    geometry = page.evaluate("""async()=>{
                        document.body.replaceChildren();document.body.style.margin='0';
                        const T=await import('/public/vendor/three/three.module.min.js');
                        const {createPrisonLand}=await import('/public/js/prison-world.js');
                        const {PRISON_CELLS,PRISON_ID}=await import('/public/js/prison-config.js');
                        const {buildCollision}=await import('/public/js/environments/environment-collision.js');
                        const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;
                        document.body.append(renderer.domElement);
                        const scene=new T.Scene();scene.background=new T.Color('#b8cbd4');
                        scene.add(new T.HemisphereLight('#fff5df','#718e80',3));
                        const sun=new T.DirectionalLight('#fff0d8',2.3);sun.position.set(90,150,50);scene.add(sun);
                        const root=createPrisonLand({id:PRISON_ID,game:'prison'});scene.add(root);
                        const cell=PRISON_CELLS[0];
                        root.userData.setPrisonDoor(cell.id,false);
                        const closed=buildCollision(root,'auto',[],{buildOctree:false});
                        const closedBars=closed.collisionMeshes.filter(m=>m.userData.prisonCellId===cell.id).length;
                        root.userData.setPrisonDoor(cell.id,true);
                        const open=buildCollision(root,'auto',[],{buildOctree:false});
                        const openBars=open.collisionMeshes.filter(m=>m.userData.prisonCellId===cell.id).length;
                        const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,.1,700);camera.position.set(180,230,230);camera.lookAt(0,0,0);renderer.render(scene,camera);
                        window.prisonGeometry={root,renderer,scene,camera};
                        return {closedBars,openBars,meshes:closed.visibleMeshes.length,cells:PRISON_CELLS.length};
                    }""")
                    assert geometry['cells'] >= 24 and geometry['meshes'] > 100, geometry
                    assert geometry['closedBars'] > 0 and geometry['openBars'] == 0, geometry
                    page.screenshot(path=str(ARTIFACTS / 'prison-facility.png'))
                    assert not errors, errors
                    print('Prison geometry: facility renders, 24 cells, closed bars block collision and open bars clear it.', flush=True)
                    page.goto(base + '/test/fixtures/compact-sports-actions.html')
                    page.add_style_tag(url='/styles.css')
                    page.evaluate("""async()=>{
                        document.body.replaceChildren();document.body.style.margin='0';
                        const {mountPrisonGame,prisonInitialState,prisonAction,prisonView}=await import('/public/js/prison-game.js');
                        const {readPrisonActionPacket}=await import('/public/js/prison-protocol.js');
                        const {PRISON_STATIONS,PRISON_ID}=await import('/public/js/prison-config.js');
                        const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
                        window.prisonNow=1000000;window.prisonState=prisonInitialState(prisonNow);window.prisonPos={...PRISON_STATIONS.find(s=>s.id==='intake').position};window.prisonEnv={id:PRISON_ID,game:'prison'};
                        prisonAction(prisonState,'prison-action',{operation:'status',stationId:'intake'},{playerId:'me',position:prisonPos,now:prisonNow});
                        const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='height:100vh;position:relative';document.body.append(stage);
                        const canvas=document.createElement('canvas');canvas.tabIndex=0;stage.append(canvas);mountGameDisplayFlow(stage);
                        window.prisonSync=()=>prisonUI.update({prison:prisonView(prisonState),serverTime:prisonNow,players:{me:{position:prisonPos}}},'me',prisonEnv);
                        window.prisonUI=mountPrisonGame(stage,{getPosition:()=>prisonPos,onClose:()=>canvas.focus(),command:async(action,fields)=>{
                            prisonNow+=5500;const result=prisonAction(prisonState,action,readPrisonActionPacket(fields),{playerId:'me',position:prisonPos,now:prisonNow});
                            if(!result.ok)throw Error(result.message);prisonSync();return {prison:prisonView(prisonState),result};
                        }});
                        window.prisonMove=id=>{prisonPos={...PRISON_STATIONS.find(s=>s.id===id).position};prisonSync();prisonUI.open(id);};
                        prisonSync();
                    }""")
                    trigger=page.get_by_role('button',name='Open Ironwood prison activities',exact=True)
                    trigger.click()
                    panel=page.locator('#ironwood-prison-panel')
                    assert page.locator('.game-display-flow-views .prison-toggle').count()==1
                    assert panel.is_visible()
                    # A remotely selected activity remains visibly disabled.
                    panel.locator('[data-station="meal"]').click()
                    assert panel.locator('[data-operation="meal"]').is_disabled()
                    page.evaluate("prisonMove('meal')")
                    panel.locator('[data-operation="meal"]').click()
                    assert page.evaluate("prisonState.players.me.completed.includes('meal')")
                    page.evaluate("prisonMove('tv')")
                    panel.locator('[data-operation="tv"]').click()
                    assert page.evaluate("prisonState.players.me.completed.includes('tv')")
                    page.evaluate("prisonMove('radio')")
                    panel.locator('[data-frequency]').fill('91.2')
                    panel.locator('[data-operation="radio"]').click()
                    page.wait_for_function('document.querySelector("[data-message]").textContent.includes("Static")', timeout=10000)
                    panel.locator('[data-frequency]').fill('94.7')
                    panel.locator('[data-operation="radio"]').click()
                    assert page.evaluate("prisonState.players.me.completed.includes('radio')")
                    page.evaluate("prisonMove('arcade')")
                    panel.locator('[data-operation="arcade-start"]').click()
                    for _ in range(5):
                        cue=page.evaluate('prisonState.players.me.round.inputs[prisonState.players.me.round.index]')
                        panel.locator('[data-operation="arcade-input"][data-input="'+cue+'"]').click()
                    assert page.evaluate("prisonState.players.me.completed.includes('arcade')")
                    page.evaluate("prisonMove('gym')")
                    panel.locator('[data-operation="boxing-start"]').click()
                    for _ in range(6):
                        cue=page.evaluate('prisonState.players.me.round.inputs[prisonState.players.me.round.index]')
                        panel.locator('[data-operation="boxing-input"][data-input="'+cue+'"]').click()
                    assert page.evaluate("prisonState.players.me.completed.includes('boxing')")
                    panel.locator('[data-operation="fight"]').click()
                    assert page.evaluate('prisonState.players.me.heat>0 && prisonState.players.me.health<100')
                    page.evaluate("prisonMove('work')")
                    for color in ['orange','white','blue']:
                        panel.locator('[data-operation="work"][data-input="'+color+'"]').click()
                    assert page.evaluate("prisonState.players.me.completed.includes('work')")
                    for width,height in [(390,844),(844,390),(1280,900)]:
                        page.set_viewport_size({'width':width,'height':height})
                        panel.locator('[data-tab="map"]').click()
                        assert page.get_by_role('img',name='Ironwood facility map').is_visible()
                        if width==390:
                            page.screenshot(path=str(ARTIFACTS / 'prison-mobile.png'))
                        box=page.locator('.prison-dialog').bounding_box()
                        assert 0<=box['x'] and box['x']+box['width']<=width+1,box
                        assert 0<=box['y'] and box['y']+box['height']<=height+1,box
                        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                        panel.locator('[data-tab="challenges"]').click()
                        assert panel.locator('.prison-challenges article.complete').count()>=6
                    page.set_viewport_size({'width':1280,'height':900})
                    page.evaluate("prisonMove('intake')")
                    assert panel.locator('[data-view="activities"]').is_visible()
                    page.screenshot(path=str(ARTIFACTS / 'prison-activities.png'))
                    panel.locator('[data-close]').click()
                    assert not panel.is_visible()
                    assert trigger.get_attribute('aria-expanded')=='false'
                    trigger.click()
                    page.keyboard.press('Escape')
                    assert not panel.is_visible()
                    assert trigger.get_attribute('aria-expanded')=='false'
                    page.evaluate('prisonUI.dispose()')
                    assert page.locator('.prison-dialog').count()==0
                    assert not errors,errors
                    print('Prison activity UI: proximity, meals, TV, radio puzzle, arcade, boxing, fights, work, responsive map/challenges and close/focus pass.',flush=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
