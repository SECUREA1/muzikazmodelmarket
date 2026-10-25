from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import base64
import os
import struct

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 960, 'height': 900})
        vertices = struct.pack('<9f', -1, -1, 0, 1, -1, 0, 0, 1, 0)
        gltf = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
                'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
                'buffers': [{'byteLength': len(vertices), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(vertices).decode()}],
                'bufferViews': [{'buffer': 0, 'byteLength': len(vertices)}],
                'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [-1, -1, 0], 'max': [1, 1, 0]}]}
        requests = []
        page.route('**/preview-authored.gltf', lambda route: (requests.append(route.request.url), route.fulfill(json=gltf)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
        page.evaluate('''async () => {
            document.body.innerHTML = '<main style="display:flex;gap:8px" id="previews"></main>';
            window.previewAPI=await import('/public/js/market-item-preview.js');
            const {marketItemPreview, hydrateMarketPreviews}=previewAPI;
            const {mountMarketPreviewTuner} = await import('/public/js/market-preview-tuner.js');
            const image = '/public/images/vehicles/grand-tourer.svg';
            window.records = [
                {name:'Native sofa',buildAssetId:'sofa',modelUrl:'/unused-reference.glb',image},
                {name:'Authored GLB',modelUrl:'/preview-authored.gltf',image,targetHeight:2},
                {name:'Wood material',materialId:'wood',buildAssetId:'material:wood',image},
                {name:'Unavailable model',buildAssetId:'missing-native',image},
                {name:'Existing artwork',image}
            ];
            const root = document.querySelector('#previews');
            root.innerHTML = records.map((record,index) => `<article data-index="${index}">${marketItemPreview(record,{preferModel:index<4})}</article>`).join('');
            hydrateMarketPreviews(root);
            window.tuner = mountMarketPreviewTuner(root.querySelector('[data-index="1"]'), records[1]);
        }''')
        for index in range(3):
            page.wait_for_function('''index => {
                const img=document.querySelector(`[data-index="${index}"] .market-item-preview img`);
                return img && img.src.startsWith('data:image/png') && img.alt.endsWith(' · 3D preview');
            }''', arg=index, timeout=25000)
        assert requests, 'Authored GLB must be fetched even when artwork exists'
        page.wait_for_function('document.querySelector(\'[data-index="3"] figcaption\').textContent.includes("artwork (3D preview unavailable)")')
        page.wait_for_function('document.querySelector(\'[data-index="4"] figcaption\').textContent.endsWith(" · item artwork")')
        page.locator('.market-preview-tuning summary').click()
        page.wait_for_selector('canvas[aria-label="Authored GLB interactive 3D preview"]', timeout=20000)
        page.get_by_label('Preview rotation', exact=True).fill('45')
        assert page.get_by_label('Preview rotation', exact=True).input_value() == '45'
        page.evaluate('tuner.dispose()')
        assert page.locator('canvas').count() == 0
        blocked = []
        page.route('**/stalled-preview-*.gltf', lambda route: blocked.append(route))
        page.evaluate('''() => {
            window.IntersectionObserver = undefined;
            const {marketItemPreview, hydrateMarketPreviews}=previewAPI;
            const old = document.createElement('section'); old.id = 'old-preview-page'; document.body.append(old);
            old.innerHTML = Array.from({length:6},(_,index)=>marketItemPreview({name:'Stalled '+index,modelUrl:`/stalled-preview-${index}.gltf`},{preferModel:true})).join('');
            hydrateMarketPreviews(old);
        }''')
        page.wait_for_function('document.querySelector("#old-preview-page [data-preview-mounted]") !== null')
        # Let the first GLB start, while the remaining five requests are queued.
        page.wait_for_timeout(150)
        assert len(blocked) == 1
        with page.expect_request('**/stalled-preview-6.gltf'):
            page.evaluate('''() => {
                const {marketItemPreview,hydrateMarketPreviews}=previewAPI;
                const pending=document.createElement('section');pending.dataset.buildInspector='';pending.id='previous-inspector';document.body.append(pending);
                pending.innerHTML=marketItemPreview({name:'Stalled selection',modelUrl:'/stalled-preview-6.gltf'},{preferModel:true});
                hydrateMarketPreviews(pending);
            }''')
        page.evaluate('''() => {
            const {marketItemPreview,hydrateMarketPreviews,releaseMarketPreviews}=previewAPI;
            const old=document.querySelector('#old-preview-page'); releaseMarketPreviews(old); old.hidden=true;
            const pending=document.querySelector('#previous-inspector');releaseMarketPreviews(pending);pending.remove();
            const next=document.createElement('section'); next.dataset.buildInspector=''; next.id='new-inspector'; document.body.append(next);
            next.innerHTML=marketItemPreview({name:'Current tower',buildAssetId:'stone-tower'},{preferModel:true});
            hydrateMarketPreviews(next);
        }''')
        page.wait_for_function('document.querySelector("#new-inspector img")?.src.startsWith("data:image/png")', timeout=5000)
        assert len(blocked) == 2, 'Inspector must render without waiting for a stalled thumbnail or selection'
        for route in blocked:
            route.fulfill(json=gltf)
        page.wait_for_timeout(250)
        assert len(blocked) == 2, 'Released hidden-page GLBs must not begin loading'
        assert page.locator('#old-preview-page img').count() == 0, 'Released consumers must ignore late results'
        browser.close()
    print('Real native, GLB and material previews, artwork fallback, live tuning, inspector priority and stale queued-preview cancellation passed.')
finally:
    server.shutdown()
