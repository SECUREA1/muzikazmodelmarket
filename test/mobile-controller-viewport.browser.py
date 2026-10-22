"""Real mobile layout keeps both sticks visible after map focus restores scroll."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
source = Path('public/js/house-explorer-glb.js').read_text()
fit_start = source.index('  function fitTouchGameLayout()')
fit_source = source[fit_start:source.index('  function resize()', fit_start)]
schedule_start = source.index('  let resizeTimer = 0, resizeFrame = 0;')
schedule_source = source[schedule_start:source.index('  renderer.setAnimationLoop', schedule_start)]
style_start = source.index("  const cameraStyle=document.createElement('style');")
style_source = source[style_start:source.index('document.head.append(cameraStyle);', style_start) + len('document.head.append(cameraStyle);')]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width, height in [(390, 844), (320, 568)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.add_style_tag(url='/styles.css')
            page.add_style_tag(url='/public/assets/game-control-dock.css')
            page.evaluate(r'''async ([fitSource,scheduleSource,styleSource]) => {
                document.body.innerHTML='<header class="fixture-header">World navigation</header><main><section class="house-explorer-shell" style="min-height:456px"><div class="house-stage"><canvas></canvas></div><div class="house-control-dock"><div class="house-bottom-controls">Game controls</div><div class="mobile-move-pad mobile-move-pad-glb"><div class="thumbstick-control" data-thumbstick="left"><button class="thumbstick-base" aria-label="Move"><span class="thumbstick-knob"></span></button></div><div class="thumbstick-control" data-thumbstick="right"><button class="thumbstick-base" aria-label="Look and jump"><span class="thumbstick-knob"></span></button></div></div></div></section></main><footer style="height:900px">More world information</footer>';
                const style=document.createElement('style');style.textContent='html,body{margin:0;width:100%;scroll-behavior:auto}.fixture-header{position:relative;height:246px;padding:0;box-sizing:border-box}main{padding:0;margin:0}.house-explorer-shell{display:flex;flex-direction:column;width:100%;margin:0;gap:0}.house-stage{position:relative;flex:1 1 0;min-height:0!important;width:100%;overflow:hidden}.house-stage>canvas{width:100%;height:100%;display:block}.house-control-dock{flex:0 0 auto;width:100%}.house-bottom-controls{height:58px;box-sizing:border-box}.mobile-move-pad{display:grid;grid-template-columns:1fr 1fr;justify-items:center}.thumbstick-base{width:80px;height:80px}.district-map-toggle{position:absolute;top:8px;left:8px}';document.head.append(style);
                const stage=document.querySelector('.house-stage'),gameplayStarted=true;
                window.layoutResizeCount=0;
                new Function('stage','gameplayStarted',styleSource+'\n'+fitSource+'\nfunction resize(){layoutResizeCount++;fitTouchGameLayout();}\n'+scheduleSource)(stage,gameplayStarted);
                const {mountDistrictMap}=await import('/public/js/district-map.js');
                const map=mountDistrictMap({stage,fetchAtlas:async()=>({locations:[]}),command:async()=>({result:{message:'Arrived'}})});
                map.update({id:'mobile-layout',name:'Mobile layout',builderScene:{mapSize:256,objects:[]}});
                map.updateLive({players:{me:{id:'me',position:{x:0,y:0,z:0}}},actors:{}},'me');
            }''', [fit_source, schedule_source, style_source])
            page.wait_for_timeout(350)
            page.evaluate('window.scrollTo(0,246)')
            page.wait_for_timeout(250)
            old_height = page.locator('.house-explorer-shell').bounding_box()['height']
            page.locator('.district-map-toggle').tap()
            assert page.locator('.district-map-dialog').is_visible(), (width, height, 'map did not open', errors)
            # Simulate the browser restoring the document position while its
            # modal owns focus. Closing restores focus to the corner map button.
            page.evaluate('window.scrollTo(0,0)')
            page.wait_for_timeout(250)
            page.locator('.district-map-dialog').get_by_role('button', name='Close', exact=True).tap()
            page.wait_for_timeout(250)
            assert abs(page.evaluate('scrollY')) < 1, 'Layout must not force the user away from navigation.'
            new_height = page.locator('.house-explorer-shell').bounding_box()['height']
            assert new_height < old_height - 100, (width, height, old_height, new_height)
            assert new_height <= height - 246 - 12 + 1, (width, height, new_height)
            for label in ['Move', 'Look and jump']:
                control = page.get_by_role('button', name=label, exact=True)
                box = control.bounding_box()
                assert box and box['y'] >= 0 and box['y'] + box['height'] <= height, (width, height, label, box)
                assert control.evaluate('(node)=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node===hit||node.contains(hit);}')
            count = page.evaluate('layoutResizeCount')
            page.evaluate("()=>{for(let i=0;i<20;i++)window.visualViewport.dispatchEvent(new Event('scroll'));}")
            page.wait_for_timeout(220)
            assert 1 <= page.evaluate('layoutResizeCount') - count <= 3, 'Viewport scroll work must be coalesced.'
            count = page.evaluate('layoutResizeCount')
            page.wait_for_timeout(350)
            assert page.evaluate('layoutResizeCount') == count, 'Layout must settle without resize feedback.'
            assert not errors, errors
            page.close()
        browser.close()
    print('Mobile map close preserves document navigation, fits both sticks at 390×844 and 320×568, and coalesces viewport scroll without resize feedback.')
finally:
    server.shutdown()
