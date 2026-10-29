"""Inspect native and GLTF assets in the item panel before placing them."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import base64
import json
import os
import struct

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
vertices = struct.pack('<9f', -1, -1, 0, 1, -1, 0, 0, 1.5, 0)
asset = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
         'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'material': 0}]}],
         'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [1, .12, .4, 1]}, 'doubleSided': True}],
         'buffers': [{'byteLength': len(vertices), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(vertices).decode()}],
         'bufferViews': [{'buffer': 0, 'byteLength': len(vertices)}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [-1, -1, 0], 'max': [1, 1.5, 0]}]}
model = {'id': 'panel-gltf', 'name': 'Panel GLTF fixture', 'type': 'prop', 'category': 'props',
         'modelUrl': base + '/panel-preview.gltf', 'color': '#ff3377', 'targetHeight': 2}
image_model = {'id': 'panel-image', 'name': 'Panel artwork fixture', 'type': 'prop', 'category': 'props',
               'renderKind': 'image', 'imageUrl': base + '/panel-artwork.svg',
               'configuration': {'extruded': True, 'depth': .2, 'pixelSize': 8}}
artwork = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="8" y="8" width="48" height="48" fill="#ee2244"/><rect x="24" y="24" width="16" height="16" fill="#22ddaa"/></svg>'

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                     args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width, height in ((1440, 900), (390, 844), (844, 390)):
            context = browser.new_context(viewport={'width': width, 'height': height},
                                          device_scale_factor=2,
                                          service_workers='block', has_touch=width <= 760)
            page = context.new_page()
            errors, bad = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: bad.append([response.status, response.url]) if response.status >= 400 else None)
            page.route('https://**/*', lambda route: route.abort())
            page.route('**/api/**', lambda route: route.fulfill(json={'success': True, 'data': {'models': [], 'assets': [], 'ownedAssets': []}, 'models': [], 'assets': [], 'ownedAssets': []}))
            page.route('**/panel-preview.gltf', lambda route: route.fulfill(json=asset))
            page.route('**/panel-artwork.svg', lambda route: route.fulfill(body=artwork, content_type='image/svg+xml'))
            page.add_init_script('''localStorage.setItem('muzikaz.environmentBuilder.customItems.v1','{}');
              localStorage.setItem('muzikaz.builder.catalog.v1','[]');
              localStorage.setItem('muzikaz.environmentBuilder.localMaps.v1','null');
              localStorage.setItem('muzikaz.builder.buildTray','{}');
              localStorage.setItem('muzikaz.environmentBuilder.scenes.v2','[]');
              localStorage.setItem("muzikaz.environmentBuilder.onlineModels.v1", ''' + json.dumps(json.dumps([None, {'id': 'broken'}, model, image_model])) + ')')
            page.add_init_script("""const nativeRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='animate'?setTimeout(()=>callback(performance.now()),150):nativeRAF(callback);
              window.builderContexts=new Set();const nativeContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const context=nativeContext.call(this,type,...args);if(context&&/^webgl/.test(type))builderContexts.add(this);return context;};""")
            page.goto(base + '/environment-builder.html')
            page.wait_for_function('window.MuzikazEnvironmentBuilder && document.body.classList.contains("builder-paged-workspace")')

            def preview(item_id, search):
                if width <= 760 and not page.locator('body').evaluate('body=>body.classList.contains("builder-library-open")'):
                    page.locator('#touch-open-library').click()
                page.get_by_label('Item panel screen', exact=True).select_option('items')
                page.locator('#library-search').fill(search)
                page.locator('[data-preview-model="' + item_id + '"]').click()
                page.wait_for_function('id=>document.querySelector("#builder-item-preview canvas")?.dataset.modelId===id', arg=item_id)
                assert page.locator('#builder-item-preview').get_attribute('data-preview-state') == 'ready'
                assert page.evaluate('MuzikazEnvironmentBuilder.getScene().objects.length') == 0
                assert page.locator('#builder-item-preview canvas').is_visible()
                assert page.locator('[data-preview-place]').is_visible()
                assert page.locator('[data-preview-drag]').is_visible()
                assert page.evaluate('builderContexts.size') == 1, 'Preview must share the map WebGL renderer.'
                assert page.locator('#builder-item-preview canvas').evaluate('canvas=>{const p=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;let filled=0;for(let i=4;i<p.length;i+=4)if(p[i]!==p[0]||p[i+1]!==p[1]||p[i+2]!==p[2])filled++;return filled>200;}'), 'The panel must contain rendered geometry, not an empty frame.'
                if item_id != 'campfire':
                    bounds = page.locator('#builder-item-preview canvas').evaluate('''canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(p[i]!==p[0]||p[i+1]!==p[1]||p[i+2]!==p[2]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}return {minX,minY,maxX,maxY,width:canvas.width,height:canvas.height};}''')
                    assert bounds['minX'] > 2 and bounds['minY'] > 2 and bounds['maxX'] < bounds['width']-3 and bounds['maxY'] < bounds['height']-3, bounds
                    assert abs((bounds['minX']+bounds['maxX'])/2-bounds['width']/2) < bounds['width']*.2, bounds
                    assert abs((bounds['minY']+bounds['maxY'])/2-bounds['height']/2) < bounds['height']*.2, bounds
                before = page.locator('#builder-item-preview canvas').evaluate('canvas=>canvas.toDataURL()')
                page.locator('[data-preview-right]').click()
                assert page.locator('#builder-item-preview canvas').evaluate('canvas=>canvas.toDataURL()') != before
                assert page.evaluate('MuzikazEnvironmentBuilder.getScene().objects.length') == 0

            preview('campfire', 'campfire')
            page.locator('[data-preview-back]').click()
            preview('panel-image', 'Panel artwork fixture')
            page.locator('[data-preview-back]').click()
            preview('panel-gltf', 'Panel GLTF fixture')
            page.locator('[data-preview-place]').click()
            page.wait_for_function('!document.querySelector("#touch-place-center").disabled')
            page.locator('#touch-place-center').click()
            page.wait_for_function('MuzikazEnvironmentBuilder.getScene().objects.length===1')
            placed = page.evaluate('MuzikazEnvironmentBuilder.getScene().objects[0]')
            assert placed['modelId'] == 'panel-gltf'
            assert not errors, errors
            assert not bad, bad
            print(json.dumps({'viewport': [width, height], 'nativeAndGltfPreviewBeforeDrop': True,
                              'retinaArtworkPreview': True,
                              'placement': placed['modelId'], 'apiErrors': bad, 'pageErrors': errors}), flush=True)
            context.close()
        browser.close()
finally:
    server.shutdown()
