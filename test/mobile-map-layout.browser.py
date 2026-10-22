"""Mobile maps remain compact with the storefront's real responsive styles.

The global mobile button width previously squeezed LOCAL · LIVE and North into
one-character columns. Test both stylesheet orders, touch targets, the detailed
directory and its 2D/3D view at iPhone and small-phone viewport sizes.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def hit_target(control):
    return control.evaluate('''node => {
        const r=node.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return hit===node||node.contains(hit);
    }''')


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width, height in [(390, 844), (320, 568)]:
            for global_last in [False, True]:
                page = browser.new_page(viewport={'width': width, 'height': height},
                                        is_mobile=True, has_touch=True)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
                page.wait_for_selector('body[data-ready=true]')
                if not global_last:
                    page.add_style_tag(url='/styles.css')
                page.evaluate('''async () => {
                    document.body.className='model-explorer-page';
                    document.body.innerHTML='<main><section id="house-explorer" class="house-explorer"><div class="house-stage" id="map-layout-stage"><button data-game-action aria-label="Background game action">Play</button></div></section></main>';
                    const style=document.createElement('style');
                    style.textContent='html,body{margin:0}main{padding:0}#house-explorer{padding:0 10px}#map-layout-stage{height:360px!important;min-height:0!important;max-height:none!important;width:100%;position:relative;overflow:hidden}#map-layout-stage>[data-game-action]{position:absolute;left:12px;bottom:12px;width:80px;min-height:44px}';
                    document.head.append(style);
                    const {mountDistrictMap}=await import('/public/js/district-map.js');
                    const {airportWorld}=await import('/airport-world.mjs');
                    window.mapLayoutCommands=[];
                    window.mapLayout=mountDistrictMap({stage:document.querySelector('.house-stage'),fetchAtlas:async()=>({locations:[]}),command:async(action,fields)=>{mapLayoutCommands.push({action,...fields});return {result:{message:'Arrived'}};}});
                    mapLayout.update(airportWorld());
                    mapLayout.updateLive({players:{self:{id:'self',position:{x:0,y:.02,z:0}}},actors:{}},'self');
                    await Promise.all([...document.querySelectorAll('link[href*="map.css"]')].map(link=>link.sheet?null:new Promise((resolve,reject)=>{link.addEventListener('load',resolve,{once:true});link.addEventListener('error',reject,{once:true});})));
                    mapLayout.setReady?.(true);
                    window.mapLayoutKeys=[];
                    window.addEventListener('keydown',event=>mapLayoutKeys.push(event.key));
                }''')
                if global_last:
                    page.add_style_tag(url='/styles.css')
                page.locator('.district-map-toggle').evaluate("node=>{node.style.position='absolute';node.style.left='12px';node.style.top='12px';}")
                mini = page.locator('.live-local-map')
                mini.get_by_role('button', name='Expand local map', exact=True).tap()
                page.wait_for_timeout(200)
                box = mini.bounding_box()
                assert box and 100 <= box['width'] <= 175 and abs(box['width'] - box['height']) <= 1, (width, height, global_last, box)
                assert mini.locator('header strong').is_hidden()
                assert mini.locator('.live-map-tools').is_hidden()
                assert mini.locator('[data-selected]').is_hidden()
                assert mini.evaluate('node=>node.scrollWidth<=node.clientWidth+1')
                controls = [mini.get_by_role('button', name='Collapse local map', exact=True),
                            mini.get_by_role('button', name='Expand local map and quests', exact=True)]
                for control in controls:
                    r = control.bounding_box()
                    assert r and r['width'] >= 30 and r['height'] >= 30 and r['width'] <= 44, (width, r)
                    assert hit_target(control), (width, control.get_attribute('aria-label'))
                assert hit_target(page.get_by_role('button', name='Background game action'))
                controls[0].focus()
                page.keyboard.press('w')
                assert page.evaluate("mapLayoutKeys.includes('w')"), 'Map focus swallowed walking input.'
                if not global_last:
                    page.screenshot(path=f'/tmp/mobile-maps-{width}x{height}-local.png')

                opener = page.get_by_role('button', name='Local map and land deeds', exact=True)
                assert hit_target(opener)
                opener.tap()
                dialog = page.get_by_role('dialog', name='Local map and land deeds', exact=True)
                page.wait_for_function("document.querySelector('.local-map-status').textContent.includes('recorded deeds')")
                assert dialog.evaluate('node=>node.scrollWidth<=node.clientWidth+1')
                r = dialog.bounding_box()
                assert r and r['x'] >= 0 and r['y'] >= 0 and r['x'] + r['width'] <= width and r['y'] + r['height'] <= height, (width, height, r)
                close = dialog.get_by_role('button', name='Close', exact=True)
                assert hit_target(close)
                assert hit_target(dialog.get_by_role('button', name='3D map', exact=True))
                assert hit_target(dialog.get_by_role('button', name='2D plan', exact=True))
                title = dialog.locator('header h2').bounding_box()
                assert title and title['width'] > 150 and title['height'] < 60, (width, title)
                if not global_last:
                    page.screenshot(path=f'/tmp/mobile-maps-{width}x{height}-directory.png')
                    dialog.get_by_role('button', name='3D map', exact=True).tap()
                    page.wait_for_function("document.querySelector('[data-local-map-3d]').getAttribute('aria-busy')==='false'", timeout=60000)
                    assert dialog.locator('[data-local-map-3d] canvas').is_visible()
                    view = dialog.locator('.local-map-3d-viewport').bounding_box()
                    assert view and view['height'] >= 70 and view['x'] + view['width'] <= width, (width, view)
                    dialog.get_by_role('button', name='2D plan', exact=True).tap()
                # The directory scrolls independently; the sticky close control
                # must remain reachable after touch users browse its last group.
                dialog.evaluate('node=>node.scrollTop=node.scrollHeight')
                page.wait_for_timeout(100)
                assert hit_target(close)
                close.tap()
                assert dialog.is_hidden()
                controls[0].tap()
                assert mini.bounding_box()['width'] == 44
                assert hit_target(page.get_by_role('button', name='Background game action'))
                assert not errors, errors
                page.close()
        browser.close()
    print('Compact and detailed mobile maps fit 390×844 and 320×568 with either global stylesheet order; touch targets, focus, directory scrolling and 2D/3D views pass.')
finally:
    server.shutdown()
