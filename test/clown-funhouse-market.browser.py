"""Funhouse map/item listings, real procedural previews and component checkout.

Run after npm run build. The public catalog remains browsable while signed out;
the purchase below uses the same authenticated account/CSRF flow as a player.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS = ROOT.parent / 'scratch'
ARTIFACTS.mkdir(exist_ok=True)
WORLD = 'muzikaz-clown-funhouse'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='funhouse-market-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
                    for _ in range(140):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-2000:])
                    catalog = context.request.get(base + '/api/market/catalog').json()['data']
                    offers = [item for item in catalog if item.get('source') == 'upgrade' and item.get('buildAssetId', '').startswith('funhouse-')]
                    assert len(offers) == 28
                    template = next(item for item in catalog if item.get('source') == 'native-map' and item.get('worldId') == WORLD)
                    assert len(template['components']) == 28 and not template['geometryOnly']
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())

                    def browse(path):
                        page.goto(base + path, wait_until='domcontentloaded', timeout=60000)
                        if path == '/model-market.html':
                            page.locator('[data-market-toggle="marketplace-preview"]').click()
                        root = page.locator('[data-shared-market-catalog]')
                        page.wait_for_function('document.querySelector("[data-catalog-status]")?.textContent.includes("available items")', timeout=30000)
                        if not root.locator('.market-filter-menu').evaluate('(menu)=>menu.open'):
                            root.locator('.market-filter-menu>summary').click()
                        root.locator('[data-catalog-source]').select_option('upgrade')
                        root.locator('[data-catalog-category]').select_option('funhouse')
                        assert root.locator('.market-workspace-item').count() == 28
                        assert len(context.request.get(base + '/api/market/catalog').json()['data']) == len(catalog)
                        return root

                    # Both user-facing lists expose all items before login.
                    root = browse('/model-market.html')
                    for model_id in ['funhouse-ringmaster-avatar', 'funhouse-propeller-hat', 'funhouse-clown-car']:
                        item = next(item for item in offers if item['buildAssetId'] == model_id)
                        root.locator('[data-catalog-search]').fill(item['name'])
                        assert root.locator('.market-workspace-item').count() == 1
                        selected = root.locator('.is-market-selected')
                        selected.locator('.market-preview-tuning summary').click()
                        selected.get_by_label(item['name'] + ' interactive 3D preview', exact=True).wait_for(timeout=30000)
                        selected.get_by_label('Preview rotation', exact=True).evaluate('(input)=>{input.value="45";input.dispatchEvent(new Event("input",{bubbles:true}));}')
                        assert context.request.get(base + '/api/wallet/state').status == 401, 'a model preview never grants ownership or an account'
                    root = browse('/builder-market.html')
                    root.locator('[data-catalog-source]').select_option('native-map')
                    root.locator('[data-catalog-search]').fill('Midnight Laughs Funhouse')
                    assert root.locator('.market-workspace-item').count() == 1
                    selected = root.locator('.is-market-selected')
                    assert WORLD in selected.get_by_role('link', name='Visit map', exact=True).get_attribute('href')
                    selected.get_by_text('Map items and functions', exact=True).click()
                    assert selected.locator('[data-catalog-sku]').count() == 28
                    assert 'Included with:' in selected.text_content()
                    assert 'parts supplied inside attractions' in selected.text_content()
                    print('Game Market and Builder Market: all 28 funhouse items, real character/costume/car previews, and itemized map listing pass.', flush=True)

                    login = context.request.post(base + '/api/access/free-play', data={'username': 'FunMarketBrowser', 'password': 'funhouse-market-browser-password'})
                    assert login.ok, login.text()
                    before = context.request.get(base + '/api/economy').json()['data']['balance']
                    # Start from the map's item breakdown to exercise exact-SKU routing.
                    page.reload(wait_until='domcontentloaded')
                    page.wait_for_function('document.querySelector("[data-catalog-status]")?.textContent.includes("available items")', timeout=30000)
                    root = page.locator('[data-shared-market-catalog]')
                    root.locator('[data-catalog-source]').select_option('native-map')
                    root.locator('[data-catalog-search]').fill('Midnight Laughs Funhouse')
                    selected = root.locator('.is-market-selected')
                    selected.get_by_text('Map items and functions', exact=True).click()
                    selected.locator('[data-catalog-sku="native:funhouse-propeller-hat"]').click()
                    dialog = page.locator('#shared-catalog-market[open]')
                    dialog.locator('[data-market-body] .is-market-selected h3').filter(has_text='Crazy Propeller Clown Hat').wait_for(timeout=30000)
                    assert dialog.locator('.market-workspace-item').count() == 1
                    hat = next(item for item in offers if item['buildAssetId'] == 'funhouse-propeller-hat')
                    with page.expect_response(lambda response: response.url.endswith('/api/economy/buy') and response.request.method == 'POST') as sale:
                        dialog.locator('.is-market-selected [data-market-upgrade]').filter(has_text='Buy').click()
                    response = sale.value
                    assert response.ok, response.text()
                    assert json.loads(response.request.post_data)['sku'] == hat['sku']
                    dialog.get_by_role('button', name='Owned', exact=True).wait_for(timeout=30000)
                    economy = context.request.get(base + '/api/economy').json()['data']
                    assert economy['balance'] == before - hat['priceMzk']
                    owned = [item for item in economy['ownedAssets'] if item.get('economySku') == hat['sku']]
                    assert len(owned) == 1 and owned[0]['function_data']['funhouseCostume'] == 'hat'
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-market-checkout.png'), timeout=20000)
                    page.set_viewport_size({'width': 390, 'height': 844})
                    bounds = dialog.bounding_box()
                    assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 391, bounds
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-market-mobile.png'), timeout=20000)
                    assert not errors, errors
                    print('Funhouse map component checkout: exact canonical SKU purchased once, debited correctly, delivered to Backpack; desktop/mobile dialog and zero JS errors pass.', flush=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
