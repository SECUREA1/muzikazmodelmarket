"""Real map widgets wait for CSS/gameplay and discard previous-world work.

Hold each actual stylesheet independently, then exercise the actual 2D/3D map
against a small shared THREE mesh. No server room or generated world is needed.
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
            body = b'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#182534}.house-stage{position:relative;width:100%;height:600px}.district-map-toggle{position:absolute;left:12px;top:12px}</style><main class="house-stage"><canvas tabindex="0"></canvas></main>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


async def assert_unavailable(page):
    assert await page.locator('.district-map-toggle').is_hidden()
    assert await page.locator('.district-map-toggle').is_disabled()
    assert await page.locator('.live-local-map').is_hidden()
    result = await page.evaluate('''() => {
        const canvas=document.querySelector('.house-stage>canvas');canvas.focus();
        map.button.focus();map.button.click();
        const mini=document.querySelector('.live-local-map [data-collapse]');mini.focus();
        return {focused:document.activeElement===canvas,open:map.dialog.open};
    }''')
    assert result == {'focused': True, 'open': False}, result


async def open_map(page):
    index = await page.evaluate('atlasRequests.length')
    await page.locator('.district-map-toggle').click()
    await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=index)
    return index


async def close_map(page):
    await page.locator('.district-map-dialog>header').get_by_role('button', name='Close', exact=True).click()
    await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')


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
            const world=(id,name,place)=>({id,name,spawn:{x:-25,y:0,z:-25},builderScene:{mapSize:100,objects:[],layoutMeta:{locations:[{id:place.toLowerCase().replaceAll(' ','-'),name:place,x:15,y:0,z:15,width:12,depth:12}]}}});
            window.oldWorld=world('old-map','Old map','Basketball Court');
            window.nextWorld=world('next-map','Next map','Next garden');
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
        await assert_unavailable(page)
        gates['district-map.css'].set()
        await page.wait_for_function('!![...document.querySelectorAll("link")].find(link=>link.href.includes("district-map.css")).sheet')
        await assert_unavailable(page)
        gates['local-live-map.css'].set()
        await page.locator('.district-map-toggle').wait_for(state='visible')
        mini = page.locator('.live-local-map')
        assert await mini.is_visible() and 'is-collapsed' in await mini.get_attribute('class')
        assert await mini.locator('[data-body]').is_hidden()
        assert (await mini.bounding_box())['width'] == 44
        assert await page.locator('.district-map-toggle').is_enabled()

        # The mini's ordinary expand action must open a 2D map without treating
        # its click event as a location or silently opening quest information.
        await mini.locator('[data-collapse]').click()
        pending = await page.evaluate('atlasRequests.length')
        await mini.locator('[data-expand]').click()
        await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=pending)
        assert await page.locator('.local-map-quest-toggle').get_attribute('aria-expanded') == 'false'
        await resolve_atlas(page, pending)
        await close_map(page)

        # Selecting a real mini-map pin carries its location into the full map.
        pending = await page.evaluate('atlasRequests.length')
        await mini.get_by_role('button', name='Basketball Court', exact=True).click()
        await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=pending)
        assert 'Basketball Court' in await page.locator('.local-map-selected h3').inner_text()
        assert await page.get_by_role('button', name='Go to Basketball Court', exact=True).is_visible()
        assert await page.locator('.local-map-quest-toggle').get_attribute('aria-expanded') == 'false'
        assert await page.get_by_role('button', name='2D plan', exact=True).get_attribute('aria-pressed') == 'true'
        await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        x, z, width, height = map(float, (await page.locator('[data-local-map-plan]>svg').get_attribute('viewBox')).split())
        assert abs(z + height / 2 - 15) < .01, (x, z, width, height)
        await resolve_atlas(page, pending)

        # A gameplay transition closes the native modal and returns focus to the
        # game canvas. Making gameplay ready restores compact controls.
        await page.evaluate('map.setReady(false)')
        await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')
        await assert_unavailable(page)
        await page.evaluate('map.setReady(true)')
        await page.locator('.district-map-toggle').wait_for(state='visible')
        assert 'is-collapsed' in await mini.get_attribute('class')

        pending = await open_map(page)
        await resolve_atlas(page, pending)
        await page.get_by_role('button', name='3D map', exact=True).click()
        await page.locator('.local-map-3d-viewport canvas').wait_for(state='visible')
        await page.evaluate('''()=>{
            window.previousMapCanvas=document.querySelector('.local-map-3d-viewport canvas');
            window.previousMapContext=previousMapCanvas.getContext('webgl2');
        }''')
        assert await page.evaluate('!!previousMapContext&&!previousMapContext.isContextLost()')
        await page.evaluate('map.setReady(false)')
        await page.wait_for_function('!map.dialog.open&&!previousMapCanvas.isConnected&&previousMapContext.isContextLost()')
        assert await page.evaluate('sourceDisposals') == {'geometry': 0, 'material': 0}
        assert await page.evaluate('sourceMesh.parent===sourceRoot&&sourceMesh.geometry.attributes.position.count>0')
        await assert_unavailable(page)

        # A mini pin also selects the 2D location after the previous visit used
        # the 3D view; it must not reopen a quest panel or an unrelated camera.
        await page.evaluate('map.setReady(true)')
        await mini.locator('[data-collapse]').click()
        pending = await page.evaluate('atlasRequests.length')
        await mini.get_by_role('button', name='Basketball Court', exact=True).click()
        await page.wait_for_function('(count)=>map.dialog.open&&atlasRequests.length===count+1', arg=pending)
        assert await page.get_by_role('button', name='2D plan', exact=True).get_attribute('aria-pressed') == 'true'
        assert 'Basketball Court' in await page.locator('.local-map-selected h3').inner_text()
        assert await page.locator('.local-map-quest-toggle').get_attribute('aria-expanded') == 'false'
        await page.evaluate('map.setReady(false)')
        await page.wait_for_function('!map.dialog.open&&map.button.getAttribute("aria-expanded")==="false"')
        await resolve_atlas(page, pending)

        # Old live players disappear immediately when a new environment arrives.
        await page.evaluate('map.setReady(true)')
        await mini.locator('[data-collapse]').click()
        await page.evaluate('''()=>map.updateLive({players:{self:{id:'self',position:{x:-25,y:0,z:-25}},guest:{id:'guest',username:'Old guest',position:{x:0,y:0,z:0}}},actors:{}},'self')''')
        await mini.get_by_role('button', name='Old guest', exact=True).wait_for(state='visible')
        await page.evaluate('map.update(nextWorld)')
        assert await mini.get_by_role('button', name='Old guest', exact=True).count() == 0
        assert await mini.get_by_role('button', name='Next garden', exact=True).count() == 1

        # A delayed directory reply from the previous world may neither reopen a
        # closed map nor append destinations to a subsequently opened world.
        await page.evaluate('map.update(oldWorld)')
        stale_closed = await open_map(page)
        await page.evaluate('map.setReady(false)')
        await page.wait_for_function('!map.dialog.open')
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
        assert await page.evaluate('mapCommands') == []
        assert not errors, errors
        await page.evaluate('map.dispose()')
        assert await page.locator('.live-local-map,.district-map-toggle,.district-map-dialog').count() == 0
        assert await page.evaluate('sourceDisposals') == {'geometry': 0, 'material': 0}
        await browser.close()


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    asyncio.run(run(f'http://127.0.0.1:{server.server_port}'))
    print('Map CSS/gameplay readiness, selected mini pins, 2D/3D teardown and stale-world responses pass in Chromium.')
finally:
    server.shutdown()
    server.server_close()
