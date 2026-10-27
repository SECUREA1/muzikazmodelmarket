"""The real Builder lists and materializes the editable carnival template."""
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 900}, has_touch=True, service_workers='block')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        page.route('https://**/*', lambda route: route.abort())
        def api(route):
            if route.request.url.endswith('/api/health'):
                route.fulfill(json={'success': True, 'service': 'muzikaz-member-market'})
            elif route.request.url.endswith('/api/market/session'):
                route.fulfill(json={'data': {'account': {'accountId': 'carnival-builder', 'username': 'Builder'}, 'csrfToken': 'test-csrf'}})
            else:
                route.fulfill(json={'data': {'models': [], 'assets': [], 'ownedAssets': []}, 'models': [], 'assets': [], 'ownedAssets': []})
        page.route('**/api/**', api)
        # This verifies the actual DOM controls and built Object3Ds. Pausing the
        # preview render loop keeps software WebGL from starving those controls.
        page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?0:raf(cb)")
        page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
        page.wait_for_function("window.MuzikazEnvironmentBuilder && document.querySelector('#layout-select option[value=repository-muzikaz-clown-funhouse]')", timeout=30000)

        def scene():
            return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
        def choose(screen):
            page.get_by_label('Item panel screen', exact=True).select_option(screen)
        def reveal(selector):
            for _ in range(30):
                if page.locator(selector).is_visible():
                    return page.locator(selector)
                page.locator('#library-panel .builder-panel-pagination').get_by_role('button', name='Next', exact=True).click()
            raise AssertionError(selector)
        def check_carnival(repository=False):
            page.wait_for_function("window.MuzikazEnvironmentBuilder.getScene().sourceFunhouse?.editableItems && window.MuzikazEnvironmentBuilder.getScene().objects.length===154", timeout=30000)
            page.wait_for_function("window.MuzikazEnvironmentBuilder.getObject3D('carnival-house')?.userData.funhouseModel && window.MuzikazEnvironmentBuilder.getObject3D('carnival-gallery')?.userData.funhouseModel", timeout=30000)
            saved = scene()
            assert saved['sourceLayout'] == 'clown-funhouse'
            assert saved['layoutMeta']['funhouse']['editableItems']
            assert len({item['id'] for item in saved['objects']}) == 154
            assert len([item for item in saved['objects'] if item['functionalSettings'].get('funhouseStation')]) == 9
            assert not any(item['modelId'] in ['funhouse-water-gun', 'funhouse-clown-target', 'funhouse-propeller-hat', 'funhouse-clown-shoes', 'funhouse-midway-floor', 'funhouse-ringmaster-avatar'] for item in saved['objects'])
            assert page.evaluate("window.MuzikazEnvironmentBuilder.getObject3D('carnival-house').getObjectByName('FUNHOUSE_GIANT_CLOWN_FACADE')!==undefined")
            if repository:
                assert saved['baseEnvironment']['id'] == 'muzikaz-clown-funhouse'
                assert saved['baseEnvironment']['builderScene']['layoutMeta']['funhouse']['editableItems']
            return saved

        choose('maps')
        control = reveal('select[aria-label="Large world map"]')
        assert control.locator('option[value="clown-funhouse"]').count() == 1
        assert control.locator('option[value="repository-muzikaz-clown-funhouse"]').count() == 1
        control.select_option('clown-funhouse')
        check_carnival()
        print('Builder dedicated funhouse template: 154 real editable assemblies, nine attractions.', flush=True)

        choose('maps')
        reveal('select[aria-label="Large world map"]').select_option('repository-muzikaz-clown-funhouse')
        check_carnival(repository=True)
        choose('games')
        reveal('[data-builder-screen=games] button:has-text("Save draft")').click()
        page.reload()
        page.wait_for_function('window.MuzikazEnvironmentBuilder', timeout=30000)
        check_carnival(repository=True)
        assert not errors, errors
        print('Builder repository funhouse copy and save/reload: passed without duplicate nested props.', flush=True)
        browser.close()
finally:
    server.shutdown()
