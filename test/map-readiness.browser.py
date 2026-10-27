"""Real map widgets wait for CSS/gameplay and discard previous-world work.

Hold each actual stylesheet independently, then exercise the actual 2D/3D map
against a small shared THREE mesh. Mobile maps fill the viewport even when
vehicle controls grow. No server room or generated world is needed.
"""
import asyncio
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == '/map-readiness-test.html':
            body = b'''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/assets/game-control-dock.css"><style>
            body{margin:0;background:#182534}.house-stage{position:relative;width:100%;height:600px}
            .district-map-toggle{position:absolute;left:150px;top:12px}
            .game-display-flow-views{position:fixed;top:8px;left:12px;right:28px;height:44px;display:flex;justify-content:space-between;z-index:27;pointer-events:none}.game-display-flow-views>*{pointer-events:auto}.game-display-flow-views button{height:44px}.transport-activity{position:static!important}.transport-radio-toggle{width:44px;padding:0}
            .game-display-flow{position:fixed;left:20px;bottom:128px;width:300px;display:flex;flex-direction:column}
            #game-fire{width:80px;height:44px;flex:0 0 44px}.airport-flight-controls{position:relative;height:306px;flex:0 0 306px}.airport-flight-controls[hidden]{display:none}
            #flight-cannon{position:absolute;left:125px;top:100px;width:44px;height:44px}
            .house-control-dock{position:fixed;inset:auto 0 0;height:110px}#game-pad{width:80px;height:60px;margin:20px}
            </style><section class="house-explorer-shell"><main class="house-stage"><canvas tabindex="0"></canvas>
            <nav class="game-display-flow-views"><button id="game-camera">Camera</button><section class="transport-activity"><button class="transport-radio-toggle" aria-label="Crew radio">Radio</button><div class="transport-radio-panel" hidden></div></section></nav>
            <div class="game-display-flow"><section class="airport-flight-controls" hidden><button id="flight-cannon">Aircraft cannon</button></section><button id="game-fire">Fire</button></div>
            </main><aside class="house-control-dock"><button id="game-pad">Game pad</button></aside></section>'''
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


async def assert_available(page):
    assert await page.locator('.district-map-toggle').is_visible()
    assert await page.locator('.district-map-toggle').is_enabled()
    assert await page.locator('.live-local-map').is_visible()


async def open_map(page):
    index = await page.evaluate('atlasRequests.length')
    await page.locator('.district-map-toggle').click()
    await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=index)
    assert await page.locator('.district-map-dialog').get_attribute('data-map-section') == 'map'
    assert await page.locator('[data-map-directory]').is_hidden()
    return index


async def close_map(page):
    await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).click()
    await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')


async def assert_full_viewport_map(page):
    await page.wait_for_function('''()=>{
        const bounds=map.dialog.getBoundingClientRect(),viewport=visualViewport;
        return Math.abs(bounds.left-(viewport?.offsetLeft||0))<=1&&
            Math.abs(bounds.top-(viewport?.offsetTop||0))<=1&&
            Math.abs(bounds.width-(viewport?.width||innerWidth))<=1&&
            Math.abs(bounds.height-(viewport?.height||innerHeight))<=1;
    }''')
    assert 'is-compact' not in await page.locator('.district-map-dialog').get_attribute('class')
    assert await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).evaluate('''node=>{
        const rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        return hit===node||node.contains(hit);
    }''')


async def assert_mini_toggle_uncovered(page):
    await page.wait_for_function('''()=>{
        const shell=document.querySelector('.live-local-map'),toggle=shell.querySelector(shell.classList.contains('is-collapsed')?'[data-collapse]':'[data-popup-close]'),rect=toggle.getBoundingClientRect();
        const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        return toggle===hit||toggle.contains(hit);
    }''', timeout=3000)


async def resolve_atlas(page, index, name=None):
    await page.evaluate('''({index,name})=>atlasRequests[index]({locations:name?[{
        name,mapId:name.replaceAll(' ','-'),districtId:'next-map',deedId:name
    }]:[]})''', {'index': index, 'name': name})


async def run(base):
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                          args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        errors, requested = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        gates = {name: asyncio.Event() for name in ['district-map.css', 'local-live-map.css']}
        both_requested = asyncio.Event()

        async def hold_styles(route):
            name = urlparse(route.request.url).path.rsplit('/', 1)[-1]
            if name not in gates:
                await route.continue_()
                return
            requested.append(route.request.url)
            if len(requested) == 2:
                both_requested.set()
            await gates[name].wait()
            await route.continue_()

        await page.route('**/public/assets/*.css*', hold_styles)
        await page.goto(base + '/map-readiness-test.html')
        await page.evaluate('''async()=>{
            const THREE=await import('/public/vendor/three/three.module.min.js');
            const {mountDistrictMap}=await import('/public/js/district-map.js');
            const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
            const world=(id,name,place)=>({id,name,spawn:{x:-25,y:0,z:-25},builderScene:{mapSize:100,objects:[],layoutMeta:{locations:[{id:place.toLowerCase().replaceAll(' ','-'),name:place,x:15,y:0,z:15,width:12,depth:12}]}}});
            window.oldWorld=world('old-map','Old map','Basketball Court');
            oldWorld.airport={enabled:true,runways:[{id:'test-runway',name:'Test runway',x:5,z:5,width:10,length:40}]};
            window.nextWorld=world('next-map','Next map','Next garden');
            window.gameplayOverlayOpen=gameplayOverlayOpen;window.gameClicks=[];window.mapKeys=[];window.mapBlurEvents=0;
            document.querySelector('#game-pad').onclick=()=>gameClicks.push('pad');document.querySelector('#game-fire').onclick=()=>gameClicks.push('fire');
            document.querySelector('#flight-cannon').onclick=()=>gameClicks.push('cannon');document.querySelector('#game-camera').onclick=()=>gameClicks.push('camera');
            window.addEventListener('blur',()=>mapBlurEvents++);
            window.addEventListener('keydown',event=>{if(!gameplayOverlayOpen()&&!event.target.matches('input,textarea,select')){mapKeys.push(event.key);if(event.key===' ')event.preventDefault();}});
            window.sourceDisposals={geometry:0,material:0};
            const geometry=new THREE.BoxGeometry(50,1,50),material=new THREE.MeshStandardMaterial({color:0x62865b});
            geometry.addEventListener('dispose',()=>sourceDisposals.geometry++);
            material.addEventListener('dispose',()=>sourceDisposals.material++);
            window.sourceMesh=new THREE.Mesh(geometry,material);
            window.sourceRoot=new THREE.Group();sourceRoot.add(sourceMesh);
            window.atlasRequests=[];window.mapCommands=[];
            window.map=mountDistrictMap({stage:document.querySelector('.house-stage'),getRoots:()=>[sourceRoot],
                fetchAtlas:()=>new Promise(resolve=>atlasRequests.push(resolve)),
                command:async(action,fields)=>{mapCommands.push({action,fields});return {result:{message:'Arrived'}};}});
            map.setReady(false);map.update(oldWorld);map.setReady(true);
        }''')
        await page.wait_for_function('()=>[...document.querySelectorAll("link")].filter(link=>link.href.includes("map.css")).length===2')
        # Stylesheet requests must be cache-versioned and neither control may leak
        # its initial inline layout while either request is outstanding.
        await asyncio.wait_for(both_requested.wait(), timeout=10)
        assert len(requested) == 2 and all(parse_qs(urlparse(url).query).get('v') for url in requested), requested
        await assert_available(page)
        gates['district-map.css'].set()
        await page.wait_for_function('!![...document.querySelectorAll("link")].find(link=>link.href.includes("district-map.css")).sheet')
        await assert_available(page)
        gates['local-live-map.css'].set()
        await page.locator('.district-map-toggle').wait_for(state='visible')
        mini = page.locator('.live-local-map')
        assert await mini.is_visible() and 'is-collapsed' in await mini.get_attribute('class')
        assert await mini.locator('[data-body]').is_hidden()
        assert (await mini.bounding_box())['width'] == 44
        assert await page.locator('.district-map-toggle').is_enabled()
        # A page-fullscreen shell sits above the rest of the page. The companion
        # map must live inside that host rather than underneath it on body.
        await page.evaluate('''()=>Object.assign(document.querySelector('.house-explorer-shell').style,{position:'fixed',inset:'0',zIndex:'2147483000',isolation:'isolate',background:'#182534'})''')

        # The mini's ordinary expand action opens the mobile 3D map without treating
        # its click event as a location or silently opening quest information.
        # The real crew radio lives above the mini in the top toolbar. Both mini
        # states must move below that button and accept an ordinary touch tap.
        await assert_mini_toggle_uncovered(page)
        await mini.locator('[data-collapse]').tap()
        assert 'is-collapsed' not in await mini.get_attribute('class')
        await assert_mini_toggle_uncovered(page)
        await mini.locator('[data-popup-close]').tap()
        assert 'is-collapsed' in await mini.get_attribute('class')
        await assert_mini_toggle_uncovered(page)
        await mini.locator('[data-collapse]').tap()
        assert 'is-collapsed' not in await mini.get_attribute('class')
        await assert_mini_toggle_uncovered(page)
        pending = await page.evaluate('atlasRequests.length')
        await mini.locator('[data-expand]').click()
        await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=pending)
        assert await page.locator('.district-map-dialog').evaluate('node=>node.parentElement===document.querySelector(".house-explorer-shell")')
        assert await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node||node.contains(hit)}''')
        assert await page.locator('.local-map-quest-toggle').get_attribute('aria-expanded') == 'false'
        assert await page.get_by_role('button', name='3D map', exact=True).get_attribute('aria-pressed') == 'true'
        assert await page.locator('.district-map-dialog').get_attribute('data-map-section') == 'map'
        assert await page.locator('[data-map-directory]').is_hidden()
        await assert_full_viewport_map(page)
        await resolve_atlas(page, pending)
        await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).focus()
        await page.keyboard.press('Space')
        await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')
        assert await page.evaluate('mapKeys.splice(0)') == [], 'Focused map buttons retain native Space activation without jumping.'

        # A marker stays in its popup until expanded, carrying its selection into
        # the full mobile map. Switch to 2D only for its coordinate assertion.
        await mini.locator('[data-collapse]').click()
        pending = await page.evaluate('atlasRequests.length')
        await mini.get_by_role('button', name='Basketball Court', exact=True).click()
        assert not await page.locator('.district-map-dialog').evaluate('node=>node.open')
        await mini.locator('[data-expand]').click()
        await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=pending)
        assert 'Basketball Court' in await page.locator('.local-map-selected h3').inner_text()
        assert await page.get_by_role('button', name='Go to Basketball Court', exact=True).is_visible()
        assert await page.locator('.local-map-quest-toggle').get_attribute('aria-expanded') == 'false'
        assert await page.get_by_role('button', name='3D map', exact=True).get_attribute('aria-pressed') == 'true'
        await page.get_by_role('button', name='2D plan', exact=True).click()
        await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        x, z, width, height = map(float, (await page.locator('[data-local-map-plan]>svg').get_attribute('viewBox')).split())
        assert x <= 15 <= x + width and z <= 15 <= z + height, (x, z, width, height)
        await resolve_atlas(page, pending)

        # Fullscreen mobile browsing leaves keyboard handling nonmodal while
        # covering the gameplay controls with the complete map and directory.
        assert not await page.locator('.district-map-dialog').evaluate('node=>node.matches(":modal")')
        assert not await page.evaluate('gameplayOverlayOpen()')
        await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).focus()
        await page.keyboard.press('w')
        assert await page.evaluate('mapKeys.splice(0)') == ['w'], 'Focused map buttons still allow walking keys.'
        assert await page.evaluate('mapBlurEvents') == 0
        await assert_full_viewport_map(page)

        # Expanding the live aircraft panel must no longer shrink the mobile
        # map into a small companion window. Close remains reachable after
        # scrolling to all directory options.
        await page.locator('.airport-flight-controls').evaluate('node=>node.hidden=false')
        await page.wait_for_timeout(100)
        await assert_full_viewport_map(page)
        await page.locator('.district-map-dialog').evaluate('node=>node.scrollTop=node.scrollHeight')
        await assert_full_viewport_map(page)
        await page.locator('.airport-flight-controls').evaluate('node=>node.hidden=true')
        await page.locator('.district-map-dialog').evaluate('node=>node.scrollTop=0')
        await assert_full_viewport_map(page)

        # A transient link interruption preserves the full map and its closed
        # marker popup. Server travel waits for the live connection without closing UI.
        await page.evaluate('map.setReady(false)')
        assert await page.locator('.district-map-dialog').evaluate('node=>node.open')
        assert await page.locator('.district-map-toggle').is_enabled()
        assert await mini.is_visible() and 'is-collapsed' in await mini.get_attribute('class')
        await page.get_by_role('button', name='Go to Basketball Court', exact=True).click()
        assert await page.evaluate('mapCommands.length') == 1
        await page.evaluate('map.setReady(true)')
        await page.get_by_role('button', name='Go to Basketball Court', exact=True).focus()
        await page.keyboard.press('Enter')
        await page.wait_for_function('mapCommands.length===2')
        assert await page.evaluate('mapKeys.splice(0)') == [], 'Native map Enter activation must not leak to gameplay.'
        assert await page.locator('.district-map-dialog').evaluate('node=>node.open')
        assert await page.locator('.local-map-status').inner_text() == 'Arrived'

        # Automatic routes also wait for readiness and stay open after success.
        await page.evaluate('''()=>map.updateLive({players:{self:{id:'self',vehicleId:'plane',position:{x:0,y:0,z:0}}},actors:{plane:{id:'plane',modelId:'piper-cub',position:{x:0,y:0,z:0}}}},'self')''')
        await page.get_by_role('navigation', name='Browse map sections', exact=True).get_by_role('button', name='Vehicles', exact=True).click()
        route = page.get_by_role('button', name='Fly to Test runway', exact=True)
        await route.wait_for(state='attached')
        assert await page.locator('.district-map-dialog').get_attribute('data-map-section') == 'vehicles'
        assert await page.locator('.local-map-visual').is_hidden()
        await page.evaluate('map.setReady(false)')
        await route.click()
        assert await page.evaluate('mapCommands.length') == 3
        await page.evaluate('map.setReady(true)')
        await route.click()
        await page.wait_for_function('mapCommands.length===4')
        assert await page.locator('.district-map-dialog').evaluate('node=>node.open')

        await page.get_by_role('navigation', name='Browse map sections', exact=True).get_by_role('button', name='Map', exact=True).click()
        assert await page.locator('[data-map-directory]').is_hidden()
        await page.get_by_role('button', name='3D map', exact=True).click()
        await page.locator('.local-map-3d-viewport canvas').wait_for(state='visible')
        await page.evaluate('''()=>{
            window.previousMapCanvas=document.querySelector('.local-map-3d-viewport canvas');
            window.previousMapContext=previousMapCanvas.getContext('webgl2');
        }''')
        assert await page.evaluate('!!previousMapContext&&!previousMapContext.isContextLost()')
        await page.evaluate('map.setReady(false)')
        await page.wait_for_timeout(50)
        assert await page.evaluate('map.dialog.open&&previousMapCanvas.isConnected&&!previousMapContext.isContextLost()')
        assert 'is-collapsed' in await mini.get_attribute('class')
        await assert_full_viewport_map(page)
        await page.evaluate('map.setReady(true)')
        assert await page.evaluate('document.querySelector(".local-map-3d-viewport canvas")===previousMapCanvas')

        # Actual world replacement closes the old view and disposes its map
        # graphics, while keeping gameplay geometry and materials untouched.
        await page.evaluate('map.setReady(false);map.update(nextWorld)')
        await page.wait_for_function('!map.dialog.open&&!previousMapCanvas.isConnected&&previousMapContext.isContextLost()')
        assert await page.evaluate('sourceDisposals') == {'geometry': 0, 'material': 0}
        assert await page.evaluate('sourceMesh.parent===sourceRoot&&sourceMesh.geometry.attributes.position.count>0')
        await assert_available(page)

        # Expanding a selected mini pin restores the mobile 3D view after the
        # previous visit; it must not reopen quest information.
        await page.evaluate('map.update(oldWorld);map.setReady(true)')
        await mini.locator('[data-collapse]').click()
        pending = await page.evaluate('atlasRequests.length')
        await mini.get_by_role('button', name='Basketball Court', exact=True).click()
        await mini.locator('[data-expand]').click()
        await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=pending)
        assert await page.get_by_role('button', name='3D map', exact=True).get_attribute('aria-pressed') == 'true'
        assert 'Basketball Court' in await page.locator('.local-map-selected h3').inner_text()
        assert await page.locator('.local-map-quest-toggle').get_attribute('aria-expanded') == 'false'
        await resolve_atlas(page, pending)
        await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).focus()
        await page.keyboard.press('Escape')
        await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')

        # Old live players disappear immediately when a new environment arrives.
        await page.evaluate('''()=>map.updateLive({players:{self:{id:'self',position:{x:-25,y:0,z:-25}},guest:{id:'guest',username:'Old guest',position:{x:0,y:0,z:0}}},actors:{}},'self')''')
        await mini.locator('[data-collapse]').click()
        await mini.get_by_role('button', name='Old guest', exact=True).wait_for(state='visible')
        await page.evaluate('map.update(nextWorld)')
        assert await mini.get_by_role('button', name='Old guest', exact=True).count() == 0
        assert 'is-collapsed' in await mini.get_attribute('class')
        await mini.locator('[data-collapse]').click()
        assert await mini.get_by_role('button', name='Next garden', exact=True).count() == 1

        # A delayed directory reply from the previous world may neither reopen a
        # closed map nor append destinations to a subsequently opened world.
        await page.evaluate('map.update(oldWorld)')
        stale_closed = await open_map(page)
        await close_map(page)
        await resolve_atlas(page, stale_closed, 'Stale closed-world deed')
        await page.wait_for_timeout(50)
        assert not await page.locator('.district-map-dialog').evaluate('node=>node.open')
        assert await page.locator('.district-map-dialog').get_by_text('Stale closed-world deed', exact=True).count() == 0
        await page.evaluate('map.setReady(true)')
        stale_open = await open_map(page)
        await page.evaluate('''()=>{map.setReady(false);map.update(nextWorld);map.setReady(true);}''')
        await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')
        current = await open_map(page)
        await resolve_atlas(page, stale_open, 'Stale previous-world deed')
        await page.wait_for_timeout(50)
        assert await page.locator('.district-map-dialog>header h2').inner_text() == 'Next map'
        assert await page.locator('.local-map-status').inner_text() == 'Loading the live land directory…'
        assert await page.locator('.district-map-dialog').get_by_text('Stale previous-world deed', exact=True).count() == 0
        await resolve_atlas(page, current, 'Current world deed')
        await page.locator('.district-map-dialog').get_by_text('Current world deed', exact=True).wait_for(state='attached')
        assert await page.locator('.local-map-status').inner_text() == '1 recorded deeds · 1 connected destinations'
        await page.get_by_role('navigation', name='Browse map sections', exact=True).get_by_role('button', name='Destinations', exact=True).click()
        assert await page.locator('.district-map-dialog').get_attribute('data-map-section') == 'destinations'
        assert await page.locator('.district-map-dialog').get_by_text('Current world deed', exact=True).is_visible()
        assert await page.locator('.local-map-visual').is_hidden()
        assert await page.evaluate('mapCommands.map(command=>command.action)') == ['map-access', 'map-access', 'vehicle-navigate', 'vehicle-navigate']
        assert not errors, errors
        await page.evaluate('map.dispose()')
        assert await page.locator('.live-local-map,.district-map-toggle,.district-map-dialog').count() == 0
        assert await page.evaluate('sourceDisposals') == {'geometry': 0, 'material': 0}
        await browser.close()


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    asyncio.run(run(f'http://127.0.0.1:{server.server_port}'))
    print('Full mobile maps preserve viewport bounds, sticky Close and 2D/3D views through vehicle-panel growth and link interruptions; CSS-independent browsing, travel, world teardown and stale replies pass.')
finally:
    server.shutdown()
    server.server_close()
