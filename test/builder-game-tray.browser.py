"""In-game GLB variants retain their catalog IDs and functions in saved drafts."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.async_api import async_playwright
import asyncio, base64, json, os, struct

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
positions = struct.pack('<9f', -1, 0, 0, 1, 0, 0, 0, 1, 0)
asset = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
         'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
         'buffers': [{'byteLength': len(positions), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(positions).decode()}],
         'bufferViews': [{'buffer': 0, 'byteLength': len(positions)}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [-1, 0, 0], 'max': [1, 1, 0]}]}
model_url = base + '/game-tray.gltf'
tray = [
    {'id': 'glb:repository:tray-seat', 'sourceId': 'tray-seat', 'name': 'Tray seat',
     'modelUrl': model_url, 'economySku': 'repository:tray-seat', 'type': 'props',
     'category': 'props', 'catalogSource': 'glb', 'owned': True,
     'function_data': {'behavior': 'seat', 'seatOffset': [0, .45, 0], 'prompt': 'Rest here'},
     'animationState': {'enabled': False, 'clip': 'Sit'}},
    {'id': 'glb:repository:tray-portal', 'sourceId': 'tray-portal', 'name': 'Tray portal',
     'modelUrl': model_url, 'economySku': 'repository:tray-portal', 'type': 'props',
     'category': 'props', 'catalogSource': 'glb', 'owned': True,
     'function_data': {'behavior': 'door', 'action': 'teleport', 'destination': 'harbor'}},
    {'id': 'sofa', 'type': 'tool', 'toolId': 'brick', 'catalogSource': 'tool'},
    {'id': 'missing-model', 'name': 'Invalid tray entry'}
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                          args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1440, 'height': 1000}, service_workers='block')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.route('https://**/*', lambda route: route.abort())
        await page.route('**/api/**', lambda route: route.fulfill(json={'data': {'models': [], 'assets': [], 'ownedAssets': []}, 'models': [], 'assets': [], 'ownedAssets': []}))
        await page.route('**/game-tray.gltf', lambda route: route.fulfill(json=asset))
        await page.add_init_script('''if (!localStorage.getItem('tray-fixture-ready')) {
            localStorage.setItem('muzikaz.builder.buildTray', %s);
            localStorage.setItem('tray-fixture-ready', '1');
        }''' % json.dumps(json.dumps(tray)))
        await page.goto(base + '/environment-builder.html?from=game')
        await page.wait_for_function('window.MuzikazEnvironmentBuilder && window.MuzikazEnvironmentBuilder.getScene().objects.length === 2')
        await page.wait_for_function('window.MuzikazEnvironmentBuilder.getScene().objects.every(o => window.MuzikazEnvironmentBuilder.getObject3D(o.id)?.userData.builderAssetState === "ready")')
        objects = await page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects')
        seat, portal = objects
        assert seat['modelId'] == tray[0]['id']
        assert portal['modelId'] == tray[1]['id']
        assert seat['asset']['modelUrl'] == model_url
        assert seat['functionalSettings']['behavior'] == 'seat'
        assert seat['functionalSettings']['seatOffset'] == [0, .45, 0]
        assert seat['functionalSettings']['prompt'] == 'Rest here'
        assert seat['animationState']['enabled'] is False
        assert portal['functionalSettings']['destination'] == 'harbor'
        await page.locator('#save-scene').click()
        saved = await page.evaluate('JSON.parse(localStorage.getItem("muzikaz.environmentBuilder.scenes.v2"))')
        assert saved['objects'] == objects
        for item in tray[:2]:
            model = next(model for model in saved['placedModels'] if model['id'] == item['id'])
            assert model['sourceId'] == item['sourceId']
            assert model['economySku'] == item['economySku']
            assert model['function_data'] == item['function_data']
        await page.evaluate('localStorage.removeItem("muzikaz.builder.buildTray")')
        await page.reload()
        await page.wait_for_function('window.MuzikazEnvironmentBuilder && window.MuzikazEnvironmentBuilder.getScene().objects.length === 2')
        restored = await page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects')
        assert restored == objects
        assert not errors, errors
        await browser.close()
    print('In-game GLB tray import, authored functions, variant IDs and draft reload passed.')

try:
    asyncio.run(main())
finally:
    server.shutdown()
