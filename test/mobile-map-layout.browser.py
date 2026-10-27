"""The marker popup stays compact; the main mobile map fills the viewport.

Exercise real styles in both load orders, crowded gameplay HUDs, portrait and
landscape phones, exclusive section views, top-right controls and large 3D maps.
Each selected directory still scrolls down to its last option.
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
        for width, height in [(390, 844), (320, 568), (844, 390)]:
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
                    const T=await import('/public/vendor/three/three.module.min.js');
                    const root=new T.Group();root.add(new T.Mesh(new T.BoxGeometry(256,2,256),new T.MeshBasicMaterial({color:0x286e42})));
                    const shell=document.querySelector('#house-explorer');shell.classList.add('house-explorer-shell');
                    const hud=document.createElement('div');hud.innerHTML='<nav class="game-display-flow-views" style="position:fixed;top:8px;left:12px;width:240px;height:44px"></nav><div class="game-display-flow" style="position:fixed;bottom:120px;left:12px;width:280px;height:180px"></div><aside class="house-control-dock" style="position:fixed;bottom:0;left:0;width:100%;height:110px"></aside>';shell.append(hud);
                    window.mapLayoutCommands=[];
                    window.mapLayout=mountDistrictMap({stage:document.querySelector('.house-stage'),getRoots:()=>[root],fetchAtlas:async()=>({locations:Array.from({length:30},(_,i)=>({mapId:'destination-'+i,name:'Destination '+String(i+1).padStart(2,'0'),deedId:'deed-'+i}))}),command:async(action,fields)=>{mapLayoutCommands.push({action,...fields});return {result:{message:'Arrived'}};}});
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
                mini.get_by_role('button', name='Open map markers', exact=True).tap()
                page.wait_for_timeout(200)
                box = mini.locator('[data-body]').bounding_box()
                assert box and 100 <= box['width'] <= 175 and abs(box['width'] - box['height']) <= 1, (width, height, global_last, box)
                assert mini.locator('header strong').is_hidden()
                assert mini.locator('.live-map-tools').is_hidden()
                assert mini.locator('[data-selected]').is_hidden()
                assert mini.evaluate('node=>node.scrollWidth<=node.clientWidth+1')
                controls = [mini.get_by_role('button', name='Close map markers', exact=True),
                            mini.get_by_role('button', name='Expand full map', exact=True)]
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
                assert r and abs(r['x']) <= 1 and abs(r['y']) <= 1 and abs(r['width']-width) <= 1 and abs(r['height']-height) <= 1, (width, height, r)
                assert 'is-compact' not in (dialog.get_attribute('class') or '')
                close = dialog.get_by_role('button', name='Close', exact=True)
                assert hit_target(close)
                shortcuts = dialog.get_by_role('navigation', name='Browse map sections', exact=True)
                shortcut_names = ['Map', 'Locations', 'Vehicles', 'Quests and mission information', 'Destinations']

                def check_top_shortcuts():
                    assert shortcuts.evaluate('node=>!!node.closest("header")'), 'Map shortcuts must live in the sticky header'
                    nav = shortcuts.bounding_box()
                    header = dialog.locator('header').bounding_box()
                    assert nav and header and abs(nav['x']+nav['width']-header['x']-header['width']) <= 1, (width, nav, header)
                    assert nav['width'] <= min(420, header['width'])+1, (width, nav, header)
                    boxes = []
                    for name in shortcut_names:
                        control = shortcuts.get_by_role('button', name=name, exact=True)
                        assert control.is_enabled(), (width, height, name)
                        assert hit_target(control), (width, height, name, control.bounding_box())
                        box = control.bounding_box()
                        assert box and box['width'] >= 43.99 and box['height'] >= 43.99, (width, height, name, box)
                        assert box['x'] >= 0 and box['x']+box['width'] <= width+1, (width, height, name, box)
                        boxes.append(box)
                    assert max(box['y'] for box in boxes)-min(box['y'] for box in boxes) <= 3, (width, height, boxes)
                    assert all(left['x']+left['width'] <= right['x']+1 for left, right in zip(boxes, boxes[1:])), boxes

                summaries = {
                    'locations': 'Places & activities',
                    'vehicles': 'Boats & aircraft',
                    'quests': 'Quests · objectives, crews & competitions',
                    'destinations': 'Connected destinations',
                }
                section_buttons = dict(zip(['map', 'locations', 'vehicles', 'quests', 'destinations'], shortcut_names))

                def check_selected(section):
                    assert dialog.get_attribute('data-map-section') == section
                    for key, name in section_buttons.items():
                        assert shortcuts.get_by_role('button', name=name, exact=True).get_attribute('aria-pressed') == str(key == section).lower(), (section, name)
                    assert dialog.locator('.local-map-visual').is_visible() == (section == 'map')
                    assert dialog.locator('[data-map-directory]').is_visible() == (section != 'map')
                    for key, summary in summaries.items():
                        target = dialog.locator('summary').filter(has_text=summary).first
                        assert target.is_visible() == (key == section), (section, summary)
                    check_top_shortcuts()

                check_selected('map')
                assert hit_target(dialog.get_by_role('button', name='3D map', exact=True))
                assert hit_target(dialog.get_by_role('button', name='2D plan', exact=True))
                title = dialog.locator('header h2').bounding_box()
                assert title and title['width'] > 150 and title['height'] < 60, (width, title)
                assert dialog.get_by_role('button', name='3D map', exact=True).get_attribute('aria-pressed') == 'true'
                page.wait_for_function("document.querySelector('[data-local-map-3d]').getAttribute('aria-busy')==='false'", timeout=60000)
                canvas = dialog.locator('[data-local-map-3d] canvas')
                assert canvas.is_visible()
                view = dialog.locator('.local-map-3d-viewport').bounding_box()
                assert view and view['height'] >= max(200, height*.5) and view['width'] >= width-24, (width, height, view)
                assert canvas.evaluate('node=>{window.savedMapCanvas=node;return node.width>0&&node.height>0;}')
                # Rotation while the map is already open must use the new
                # viewport, not retain the old companion dimensions.
                page.set_viewport_size({'width':height,'height':width})
                page.wait_for_function("""()=>{const r=document.querySelector('.district-map-dialog').getBoundingClientRect();return Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1;}""")
                assert hit_target(close)
                page.set_viewport_size({'width':width,'height':height})
                page.wait_for_function("""()=>{const r=document.querySelector('.district-map-dialog').getBoundingClientRect();return Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1;}""")
                if not global_last:
                    page.screenshot(path=f'/tmp/mobile-maps-{width}x{height}-directory.png')
                dialog.get_by_role('button', name='2D plan', exact=True).tap()
                assert dialog.locator('[data-local-map-plan]>svg').is_visible()
                dialog.get_by_role('button', name='3D map', exact=True).tap()
                # The buttons switch the displayed content rather than
                # scrolling past other map/directory sections.
                for section in ['locations', 'vehicles', 'quests', 'destinations']:
                    name = section_buttons[section]
                    shortcuts.get_by_role('button', name=name, exact=True).tap()
                    page.wait_for_timeout(100)
                    check_selected(section)
                    target = dialog.locator('summary').filter(has_text=summaries[section]).first
                    assert hit_target(target), (width, height, name, target.bounding_box())
                    if section == 'quests':
                        shortcuts.get_by_role('button', name=name, exact=True).tap()
                        check_selected(section)
                        assert target.evaluate('node=>node.parentElement.open'), 'Repeated Quests selection must keep its content open'
                # Swipe the selected destination view to reach the last option.
                cdp = page.context.new_cdp_session(page)
                for _ in range(3):
                    x, y = width-6, height-60
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
                    for step in range(1,7):
                        cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y-step*min(60,(height-150)/6)}]})
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
                    page.wait_for_timeout(100)
                assert dialog.evaluate('node=>node.scrollTop>100'), 'Touch scrolling did not move the selected directory'
                assert dialog.locator('.local-map-directory-list').evaluate("node=>getComputedStyle(node).overflowY==='visible'")
                dialog.evaluate('node=>node.scrollTop=node.scrollHeight')
                page.wait_for_timeout(100)
                last_option = dialog.get_by_role('link', name='Enter Destination 30', exact=True)
                assert hit_target(last_option), (width, height, last_option.bounding_box())
                assert hit_target(close)
                check_selected('destinations')
                # A new section clears the previous section's search and scroll.
                search = dialog.get_by_role('searchbox', name='Search local map directory', exact=True)
                search.fill('Destination 30')
                assert last_option.is_visible()
                assert dialog.get_by_role('link', name='Enter Destination 01', exact=True).is_hidden()
                shortcuts.get_by_role('button', name='Vehicles', exact=True).tap()
                check_selected('vehicles')
                assert search.input_value() == ''
                shortcuts.get_by_role('button', name='Map', exact=True).tap()
                page.wait_for_function("document.querySelector('.district-map-dialog').scrollTop===0")
                check_selected('map')
                assert hit_target(dialog.get_by_role('button', name='3D map', exact=True))
                assert canvas.is_visible()
                assert canvas.evaluate('node=>node===window.savedMapCanvas'), 'Section switching must retain the live 3D map'
                # Show on map switches back from Locations to the map view.
                shortcuts.get_by_role('button', name='Locations', exact=True).tap()
                place = dialog.locator('[data-map-directory] [data-map-section=locations] [data-map-search-item]').first
                place.evaluate('node=>node.open=true')
                place.get_by_role('button', name='Show on map', exact=True).tap()
                check_selected('map')
                # Preserve the user's map mode through directory navigation.
                dialog.get_by_role('button', name='2D plan', exact=True).tap()
                shortcuts.get_by_role('button', name='Vehicles', exact=True).tap()
                shortcuts.get_by_role('button', name='Map', exact=True).tap()
                check_selected('map')
                assert dialog.get_by_role('button', name='2D plan', exact=True).get_attribute('aria-pressed') == 'true'
                assert dialog.locator('[data-local-map-plan]>svg').is_visible()
                close.tap()
                assert dialog.is_hidden()
                opener.tap()
                page.wait_for_function("document.querySelector('.district-map-dialog').scrollTop===0")
                assert hit_target(close)
                check_selected('map')
                assert dialog.get_by_role('button', name='3D map', exact=True).get_attribute('aria-pressed') == 'true'
                close.tap()
                mini.get_by_role('button', name='Open map markers', exact=True).tap()
                controls[0].tap()
                assert mini.bounding_box()['width'] == 44
                assert hit_target(page.get_by_role('button', name='Background game action'))
                assert not errors, errors
                page.close()
        browser.close()
    print('Full-screen mobile maps pass at 390×844, 320×568 and 844×390: exclusive Map/Locations/Vehicles/Quests/Destinations views, top-right controls, retained map mode, large default 3D view, touch scrolling, Close, reopen and both stylesheet orders.')
finally:
    server.shutdown()
