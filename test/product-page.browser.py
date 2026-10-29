"""Validate stable product pages, lazy preview actions and clipboard fallback."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import json
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1200, 'height': 900}, service_workers='block')
        page = context.new_page()
        requests, errors = [], []
        page.on('request', lambda request: requests.append((request.method, request.url)))
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""window.productPreviewCalls=[];window.copiedProductLinks=[];Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>copiedProductLinks.push(value)}});""")
        rows = [{'id': 'upgrade:backpack:builder-portal-door', 'sku': 'backpack:builder-portal-door', 'source': 'upgrade', 'name': 'Glowing Portal Door', 'description': 'A machined alloy frame with a flowing violet energy field.', 'buildAssetId': 'portal-door', 'thumbnailUrl': '/public/images/native-upgrades/portal-door.svg', 'priceMzk': 15, 'category': 'Interactive items', 'nativeFunction': 'door', 'dimensions': [1.5, 2.5, .5]}]
        page.route('**/api/health', lambda route: route.fulfill(content_type='application/json', body=json.dumps({'success': True, 'service': 'muzikaz-member-market'})))
        page.route('**/api/market/catalog', lambda route: route.fulfill(content_type='application/json', body=json.dumps({'success': True, 'data': rows})))
        page.route('**/public/js/product-preview.js', lambda route: route.fulfill(content_type='text/javascript', body='export async function openProductPreview(record,options){window.productPreviewCalls.push({id:record.id,mode:options.mode});}'))
        base = f'http://127.0.0.1:{server.server_port}'
        page.goto(base+'/product.html?id=upgrade%3Abackpack%3Abuilder-portal-door')
        page.get_by_role('heading', name='Glowing Portal Door', exact=True).wait_for()
        assert page.title() == 'Glowing Portal Door · MUZIKAZ WORLD'
        assert len([url for method, url in requests if '/api/market/catalog' in url]) == 1
        assert not [url for _, url in requests if '/product-preview.js' in url or '/vendor/three/' in url or url.endswith('.glb')]
        assert page.evaluate('productPreviewCalls.length') == 0
        assert page.locator('[data-product-image]').get_attribute('alt') == 'Glowing Portal Door'
        page.get_by_role('button', name='View in 3D', exact=True).click()
        page.wait_for_function('productPreviewCalls.length===1')
        page.get_by_role('button', name='View in AR', exact=True).click()
        page.wait_for_function('productPreviewCalls.length===2')
        assert page.evaluate('productPreviewCalls.map(value=>value.mode)') == ['3d', 'ar']
        page.get_by_role('button', name='Share product', exact=True).click()
        page.wait_for_function('copiedProductLinks.length===1')
        assert page.evaluate('copiedProductLinks[0]') == base+'/product.html?id=upgrade%3Abackpack%3Abuilder-portal-door'
        expect(page.locator('[data-product-status]')).to_have_text('Product link copied.')
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:null})")
        page.get_by_role('button', name='Share product', exact=True).click()
        page.locator('[data-product-copy-link]').wait_for(state='visible')
        assert page.locator('[data-product-copy-link] input').input_value().startswith(base+'/product.html?id=')
        expect(page.locator('[data-product-status]')).to_have_text('Select and copy this product link.')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.screenshot(path='/workspace/product-details-mobile.png', full_page=True)
        assert not [method for method, url in requests if method != 'GET' and '/api/' in url], 'a product page must not buy or equip an item'
        page.goto(base+'/product.html?id=builder%3Aremoved-listing')
        page.get_by_role('heading', name='Product unavailable', exact=True).wait_for()
        assert page.locator('[data-product-content]').is_hidden()
        assert 'private, unlisted' in page.locator('[data-product-status]').inner_text()
        before = len([url for _, url in requests if '/api/market/catalog' in url])
        page.goto(base+'/product.html')
        page.get_by_role('heading', name='Product unavailable', exact=True).wait_for()
        assert len([url for _, url in requests if '/api/market/catalog' in url]) == before
        assert not errors, errors
        browser.close()
    print('Product pages resolve once, open previews only on action, copy/share stable links, and never buy/equip. Mobile layout fits.')
finally:
    server.shutdown()
