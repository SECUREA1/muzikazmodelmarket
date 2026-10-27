"""Real member API, cross-origin model bytes, and Builder preview/placement.

The frontend is deliberately static. Only the hosted API hostname is redirected
to a real, isolated Node fixture; API responses and CORS headers are unchanged.
"""
import asyncio
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
from threading import Thread
import time
from urllib.parse import urlsplit
import zlib
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
HOSTED = 'https://muzikazmodelmarket.onrender.com'


def model_fixture(floor=False):
    binary = struct.pack('<9f6f3H', 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1, 0, 1, 2)
    document = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
                'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'TEXCOORD_0': 1}, 'indices': 2, 'material': 0}]}],
                'buffers': [{'byteLength': len(binary)}],
                'bufferViews': [{'buffer': 0, 'byteLength': 36}, {'buffer': 0, 'byteOffset': 36, 'byteLength': 24}, {'buffer': 0, 'byteOffset': 60, 'byteLength': 6}],
                'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [0, 0, 0], 'max': [2, 2, 0]},
                              {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC2'}, {'bufferView': 2, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'}],
                'materials': [{'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': [1, .5, 0, 1], 'metallicFactor': 0}}]}
    if floor:
        document['nodes'][0].update({'rotation': [-2 ** -.5, 0, 0, 2 ** -.5], 'scale': [10, 10, 10], 'translation': [-10, 0, 10]})
    encoded = json.dumps(document).encode()
    encoded += b' ' * (-len(encoded) % 4)
    padded = binary + b'\0' * (-len(binary) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(padded)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(padded), 0x004E4942) + padded
    document['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binary).decode()
    document['images'] = [{'uri': 'surface.png'}]
    document['textures'] = [{'source': 0}]
    document['materials'][0]['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\0\xff\x80\0\xff')) + chunk(b'IEND', b'')
    return glb, document, png


async def main():
    os.chdir(ROOT)
    glb, gltf, png = model_fixture()
    class Frontend(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/api/health':
                # Force early model-module evaluation before API discovery.
                time.sleep(.4)
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(b'<html>Static frontend</html>')
            elif path == '/public/models/browser-fixture.glb':
                self.send_response(200)
                self.send_header('Content-Type', 'model/gltf-binary')
                self.end_headers()
                self.wfile.write(glb)
            else:
                super().do_GET()
        def copyfile(self, *args):
            try:
                super().copyfile(*args)
            except (BrokenPipeError, ConnectionResetError):
                pass
    frontend = ThreadingHTTPServer(('127.0.0.1', 0), partial(Frontend, directory=str(ROOT)))
    Thread(target=frontend.serve_forever, daemon=True).start()
    front = f'http://127.0.0.1:{frontend.server_port}'
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    try:
        with tempfile.TemporaryDirectory(prefix='members-model-browser-') as temporary:
            data = Path(temporary)
            for name in ['models', 'assets', 'avatars', 'environments']:
                (data / name).mkdir()
            (data / 'models/probe.glb').write_bytes(glb)
            (data / 'environments/floor.glb').write_bytes(model_fixture(floor=True)[0])
            (data / 'environments.json').write_text(json.dumps([{
                'id': 'browser-uploaded-floor', 'name': 'Uploaded model game', 'source': 'uploaded', 'visibility': 'public',
                'storedFilename': 'floor.glb', 'modelUrl': '/uploads/environments/floor.glb', 'scale': 1,
                'spawn': {'x': -2, 'y': 1, 'z': 2, 'rotationY': 0}, 'collisionMode': 'mesh'}]))
            (data / 'assets/probe.gltf').write_text(json.dumps(gltf))
            (data / 'assets/surface.png').write_bytes(png)
            (data / 'published-models.json').write_text(json.dumps([
                {'id': 'split-glb', 'name': 'Legacy uploaded GLB', 'status': 'published', 'visibility': 'public', 'modelUrl': '/uploads/models/probe.glb'},
                {'id': 'split-gltf', 'name': 'Textured uploaded glTF', 'status': 'published', 'visibility': 'public', 'modelUrl': '/uploads/assets/probe.gltf'}]))
            (data / 'asset-library.json').write_text(json.dumps([
                {'id': name, 'storedFilename': name, 'status': 'published', 'visibility': 'public', 'publicUrl': '/uploads/assets/' + name}
                for name in ['probe.gltf', 'surface.png']]))
            environment = {**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': temporary,
                           'MUZIKAZ_USER_DATABASE_FILE': str(data / 'users.json'), 'MUZIKAZ_ACCOUNTS_FILE': str(data / 'accounts.json'),
                           'MUZIKAZ_PAYMENT_ORDERS_FILE': str(data / 'orders.json'), 'UPLOAD_STORAGE_PATH': str(data / 'models'),
                           'MUZIKAZ_ASSET_UPLOAD_DIR': str(data / 'assets'), 'MUZIKAZ_AVATAR_UPLOAD_DIR': str(data / 'avatars'),
                           'MUZIKAZ_ENVIRONMENT_UPLOAD_DIR': str(data / 'environments'), 'MUZIKAZ_CORS_ORIGINS': front}
            with (data / 'server.log').open('w') as log:
                server = subprocess.Popen(['node', 'server.mjs'], env=environment, stdout=log, stderr=log)
                try:
                    async with async_playwright() as p:
                        request = await p.request.new_context()
                        for _ in range(100):
                            try:
                                if (await request.get(base + '/api/health', timeout=1000)).ok:
                                    break
                            except Exception:
                                await asyncio.sleep(.1)
                        else:
                            raise AssertionError((data / 'server.log').read_text()[-2500:])
                        await request.dispose()
                        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                        context = await browser.new_context(viewport={'width': 1200, 'height': 850}, device_scale_factor=.5, service_workers='block')
                        page = await context.new_page()
                        errors, failures, requests, model_requests = [], [], [], []
                        audit = {'enabled': False}
                        starts = {}
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('request', lambda req: starts.update({req: audit['enabled']}))
                        def response_received(response):
                            path = urlsplit(response.url).path
                            if starts.get(response.request) and '/api/' in path:
                                requests.append({'path': path, 'method': response.request.method, 'status': response.status})
                                if response.status >= 400:
                                    failures.append(requests[-1])
                            if '/uploads/' in path:
                                model_requests.append({'path': path, 'status': response.status})
                        page.on('response', response_received)
                        await page.route('https://**/*', lambda route: route.abort())
                        async def proxy(route):
                            target = base + route.request.url[len(HOSTED):]
                            response = await route.fetch(url=target, timeout=30000)
                            await route.fulfill(response=response)
                        await page.route(HOSTED + '/**', proxy)
                        await page.add_init_script("document.addEventListener('DOMContentLoaded',()=>{window.earlyModelApi=import('/public/js/model-api.js');window.earlyModelApi.catch(()=>{});},{once:true});")
                        await page.goto(front + '/members.html', wait_until='domcontentloaded')
                        await page.wait_for_function("document.documentElement.getAttribute('data-api-connected')==='true'")
                        assert await page.evaluate('MUZIKAZ_API.base') == HOSTED
                        # A quota failure must not discard a successful member login.
                        await page.evaluate("""() => {const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='muzikazAccountSessionToken')throw new DOMException('Fixture quota','QuotaExceededError');return original.call(this,key,value);};}""")
                        await page.locator('#bottle-login-form [name=username]').fill('BrowserMember')
                        await page.locator('#bottle-login-form [name=password]').fill('browser-member-fixture-password')
                        await page.locator('#bottle-login-form button[type=submit]').click()
                        await page.wait_for_function("!!MUZIKAZ_API.getSessionToken()&&document.querySelector('#member-locked-content')?.dataset.locked==='false'", timeout=30000)
                        await context.clear_cookies()
                        audit['enabled'] = True
                        result = await page.evaluate("""async () => {
                          const api=MUZIKAZ_API;
                          const read=async response=>{const value=await api.readJson(response);if(!response.ok||value.success===false)throw Error(value.message||'API failed');return value.data;};
                          const session=await read(await api.fetch('/api/market/session'));
                          if(session.account.username!=='BrowserMember')throw Error('Wrong member');
                          const headers=new Headers({'Content-Type':'application/json','X-CSRF-Token':session.csrfToken});
                          await read(await api.fetch('/api/player/settings',{method:'PUT',headers,body:JSON.stringify({settings:{effectsVolume:42}})}));
                          const settings=await read(await api.fetch('/api/player/settings'));
                          const backpack=await read(await api.fetch('/api/backpack'));
                          const models=await window.earlyModelApi;
                          const records=await models.fetchPublishedModels();
                          const {createGameModelLoader}=await import('/public/js/game-model-loader.js');
                          const loader=createGameModelLoader(),loaded=[];
                          for(const record of records){
                            const detail=await models.fetchPublishedModel(record.id);
                            if(detail.modelUrl!==record.modelUrl)throw Error('Model detail mismatch');
                            const model=await loader.loadAsync(record.modelUrl);let meshes=0,textures=0;
                            model.scene.traverse(node=>{if(node.isMesh){meshes++;if(node.material?.map?.isTexture)textures++;}});
                            loaded.push({id:record.id,meshes,textures});
                          }
                          const repository=await loader.loadAsync('/public/models/browser-fixture.glb');let repositoryMeshes=0;repository.scene.traverse(node=>{if(node.isMesh)repositoryMeshes++;});
                          loader.dispose?.();
                          return {username:session.account.username,effectsVolume:settings.settings.effectsVolume,hasBackpack:!!backpack.accountId,loaded,repositoryMeshes};
                        }""")
                        assert result['effectsVolume'] == 42 and result['hasBackpack'], result
                        assert len(result['loaded']) == 2 and all(model['meshes'] == 1 for model in result['loaded']), result
                        assert next(model for model in result['loaded'] if model['id'] == 'split-gltf')['textures'] == 1, result
                        assert result['repositoryMeshes'] == 1, result
                        await page.goto(front + '/environment-builder.html', wait_until='domcontentloaded')
                        await page.wait_for_function("window.MuzikazEnvironmentBuilder&&document.querySelectorAll('[data-preview-model]').length>20", timeout=60000)
                        await page.get_by_label('Item panel screen', exact=True).select_option('items')
                        await page.locator('#library-search').fill('campfire')
                        await page.locator('[data-preview-model=campfire]').click()
                        await page.wait_for_function("document.querySelector('#builder-item-preview')?.dataset.previewState==='ready'", timeout=30000)
                        assert await page.evaluate('MuzikazEnvironmentBuilder.getScene().objects.length') == 0
                        await page.locator('#builder-item-preview [data-preview-place]').click()
                        canvas = page.locator('#land-canvas canvas')
                        box = await canvas.bounding_box()
                        await canvas.click(position={'x': box['width'] * .5, 'y': box['height'] * .6})
                        await page.wait_for_function('MuzikazEnvironmentBuilder.getScene().objects.length===1')
                        assert await page.evaluate("MuzikazEnvironmentBuilder.getScene().objects[0].modelId") == 'campfire'
                        await page.set_viewport_size({'width': 390, 'height': 844})
                        solo_requests_start = len(requests)
                        await page.goto(front + '/model-explorer.html?environment=browser-uploaded-floor&mode=solo&autoplay=1', wait_until='domcontentloaded')
                        await page.wait_for_function("() => {const state=window.MuzikazHouseExplorer?.snapshot();return state?.gameplayStarted&&state.controlsReady&&state.roomId==='browser-uploaded-floor'&&state.player.collisionReady;}", timeout=90000)
                        assert any(item['path'] == '/uploads/environments/floor.glb' and item['status'] == 200 for item in model_requests), model_requests
                        assert not any(item['path'].endswith('/presence') and item['method'] == 'POST' for item in requests[solo_requests_start:]), 'Solo play must not publish multiplayer presence'
                        # Exercise a genuine live SSE connection on the integrated
                        # server too; route.fulfill cannot proxy an open stream.
                        member_token = await page.evaluate('MUZIKAZ_API.getSessionToken()')
                        await context.add_init_script('if(location.origin===' + json.dumps(base) + '){sessionStorage.setItem("muzikazAccountSessionToken",' + json.dumps(member_token) + ');}')
                        multiplayer_requests_start = len(requests)
                        await page.goto(base + '/model-explorer.html?environment=browser-uploaded-floor&mode=multiplayer&autoplay=1', wait_until='domcontentloaded')
                        await page.wait_for_function("() => {const state=window.MuzikazHouseExplorer?.snapshot();return state?.gameplayStarted&&state.controlsReady&&state.serverReady&&state.roomId==='browser-uploaded-floor';}", timeout=90000)
                        for _ in range(100):
                            current = requests[multiplayer_requests_start:]
                            presence_ready = any(item['path'].endswith('/presence') and item['method'] == 'POST' and item['status'] == 200 for item in current)
                            events_ready = any(item['path'].endswith('/events') and item['status'] == 200 for item in current)
                            if presence_ready and events_ready:
                                break
                            await page.wait_for_timeout(100)
                        else:
                            raise AssertionError({'message': 'The ready multiplayer room did not connect presence/events', 'requests': current, 'pageErrors': errors})
                        assert any(item['path'].endswith('/events') and item['status'] == 200 for item in requests[multiplayer_requests_start:]), 'Multiplayer event stream did not connect'
                        assert not failures, failures
                        assert not errors, errors
                        result.update({'apiRequests': len(requests), 'apiErrors': failures, 'pageErrors': errors, 'previewBeforePlacement': True, 'placedItems': 1, 'uploadedModelGameReady': True, 'multiplayerReady': True})
                        Path('/tmp/members-model-loading-browser-results.json').write_text(json.dumps(result, indent=2))
                        print(json.dumps(result), flush=True)
                        await browser.close()
                finally:
                    server.terminate()
                    try:
                        server.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait()
    finally:
        frontend.shutdown()


asyncio.run(main())
