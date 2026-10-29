"""One lazy 3D/AR product preview across every visual source, on desktop and phone."""
import base64
import json
import os
import struct
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
positions = struct.pack('<9f', -.5, 0, 0, .5, 0, 0, 0, 1, 0)
gltf = json.dumps({'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
                   'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
                   'buffers': [{'uri': 'data:application/octet-stream;base64,' + base64.b64encode(positions).decode(), 'byteLength': len(positions)}],
                   'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(positions)}],
                   'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [-.5, 0, 0], 'max': [.5, 1, 0]}]})


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/__product_preview':
            body = b'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body><button id="open">Preview product</button></body>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
records = [
    {'id': 'portal', 'name': 'Glowing portal', 'buildAssetId': 'portal-door'},
    {'id': 'material', 'name': 'Crafted brick', 'materialId': 'brick'},
    {'id': 'tool', 'name': 'Laser', 'toolId': 'laser'},
    {'id': 'generated', 'name': 'Generated bottle', 'generated': True, 'generator': 'bottle'},
    {'id': 'drawing', 'name': 'Saved drawing', 'strokes': [{'tool': 'rectangle', 'points': [{'x': 180, 'y': 160}, {'x': 300, 'y': 280}]}]},
    {'id': 'layout', 'name': 'Hedge maze', 'builderLayoutId': 'hedge-maze'},
    {'id': 'upload', 'name': 'Authenticated upload', 'modelUrl': '/uploads/assets/test-product/content'},
    {'id': 'image', 'name': 'Artwork extrusion', 'renderKind': 'image', 'modelUrl': '/public/images/native-designs/path-tile.svg', 'configuration': {'extruded': True, 'depth': 28}},
    {'id': 'native-map:native-preview-world', 'worldId': 'native-preview-world', 'source': 'native-map', 'name': 'Authored public world'},
    {'id': 'card', 'name': 'Care product', 'description': 'Product information without a geometric model'},
]
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width, height in [(1280, 900), (390, 844)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=width < 760, service_workers='block')
            errors, shader_errors, uploads = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: shader_errors.append(message.text) if message.type == 'error' and ('WebGLProgram' in message.text or 'VALIDATE_STATUS' in message.text) else None)
            page.route('https://**/*', lambda route: route.abort())

            def upload(route):
                uploads.append(route.request.headers)
                route.fulfill(body=gltf, content_type='model/gltf+json')

            page.route('**/uploads/assets/test-product/content', upload)
            world = {'id': 'native-preview-world', 'name': 'Authored public world', 'visibility': 'public', 'source': 'repository', 'proceduralLand': True, 'playable': True,
                     'builderScene': {'version': 3, 'layout': 'market-square', 'mapSize': 40, 'objects': [{'id': 'authored-portal', 'modelId': 'portal-door', 'position': {'x': 4, 'y': 0, 'z': 6}, 'rotation': {'x': 0, 'y': .4, 'z': 0}, 'scale': {'x': 1, 'y': 1, 'z': 1}}]}}
            page.route('**/api/environments/native-preview-world', lambda route: route.fulfill(json={'success': True, 'data': world}))
            page.route('**/api/environments/private-preview-world', lambda route: route.fulfill(json={'success': True, 'data': {**world, 'id': 'private-preview-world', 'visibility': 'private'}}))
            page.goto(f'http://127.0.0.1:{server.server_port}/__product_preview')
            page.evaluate('''() => {
              window.cameraCalls=0;window.stoppedTracks=0;window.draws=0;window.authRequests=[];
              const original=HTMLCanvasElement.prototype.getContext;
              HTMLCanvasElement.prototype.getContext=function(...args){const gl=original.apply(this,args);if(gl&&/webgl/i.test(args[0])&&!gl.__productProbe){gl.__productProbe=true;for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'])if(gl[name]){const draw=gl[name];gl[name]=function(...values){draws++;return draw.apply(this,values);};}}return gl;};
              HTMLMediaElement.prototype.play=async function(){};
              Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{cameraCalls++;const stream=new MediaStream();stream.getTracks=()=>[{stop(){stoppedTracks++;}}];return stream;}}});
              window.MUZIKAZ_API={base:location.origin,url:path=>new URL(path,location.origin).href,fetch:(url,options)=>{authRequests.push({url,credentials:options.credentials});return fetch(url,{...options,headers:{...options.headers,'X-Product-Auth':'fixture'}});}};
            }''')
            idle = page.evaluate("performance.getEntriesByType('resource').filter(r=>/three|builder-models|product-preview.js/.test(r.name)).length")
            assert idle == 0, 'Graphics must stay unloaded before an explicit action'
            for index, record in enumerate(records):
                before = page.evaluate('draws')
                state = page.evaluate('''async record=>{const preview=await import('/public/js/product-preview.js');window.productPreviewModule=preview;return preview.openProductPreview(record,{owner:record.id});}''', record)
                assert state['mode'] == '3d', state
                assert state['id'] == record['id'], state
                assert state['presentation'] == ('product-card' if record['id'] == 'card' else 'actual-model'), state
                page.wait_for_function('(count)=>draws>count', arg=before)
                assert page.locator('.product-preview-dialog[open]').count() == 1
                assert page.locator('.product-preview-stage canvas').count() == 1
                assert page.evaluate('cameraCalls') == 0, 'A 3D preview must not request camera access'
                if record['id'] in ['portal', 'card']:
                    page.screenshot(path=f'/workspace/product-preview-{record["id"]}-{width}.png')
                assert not errors, errors
            assert len(uploads) == 1 and uploads[0].get('x-product-auth') == 'fixture', uploads
            assert page.evaluate('authRequests[0].credentials') == 'include'
            assert page.get_by_text('Product artwork · tabletop preview', exact=True).is_visible()
            page.get_by_role('button', name='Open camera preview', exact=True).click()
            page.wait_for_function("productPreviewModule.getProductPreviewState().mode==='camera-preview'")
            assert page.get_by_role('status').filter(has_text='not world-tracked').is_visible()
            assert page.evaluate('cameraCalls') == 1
            page.get_by_role('button', name='Close preview', exact=True).click()
            page.wait_for_function("productPreviewModule.getProductPreviewState().mode==='closed'")
            assert page.evaluate('stoppedTracks') == 1
            page.evaluate('''async()=>{await import('/public/js/ar-camera-preview.js');const viewer=document.createElement('model-viewer');viewer.setAttribute('src','/uploads/assets/test-product/content');viewer.setAttribute('alt','Legacy AR product');const button=document.createElement('button');button.slot='ar-button';button.textContent='Place legacy product in AR';viewer.append(button);document.body.append(viewer);}''')
            page.get_by_role('button', name='Place legacy product in AR', exact=True).click()
            page.wait_for_function("productPreviewModule.getProductPreviewState().mode==='camera-preview'")
            assert page.evaluate('cameraCalls') == 2
            assert page.get_by_role('status').filter(has_text='not world-tracked').is_visible()
            page.evaluate('MuzikazAR.close()')
            assert page.evaluate('stoppedTracks') == 2
            details = page.evaluate('''async()=>{
              const {previewDescriptor,loadPreviewModel}=await import('/public/js/market-item-preview.js');
              const T=await import('/public/vendor/three/three.module.min.js');
              const canvas=document.createElement('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:false});
              let loaded;
              try{
                loaded=await loadPreviewModel(previewDescriptor({id:'native-map:native-preview-world',worldId:'native-preview-world',source:'native-map',name:'Authored public world'}),{renderer});
                let authored=false;loaded.root.traverse(node=>{if(node.userData.atlasItemId==='authored-portal')authored=true;});
                const answer={worldId:loaded.root.userData.previewWorldId,authored,presentation:loaded.root.userData.previewPresentation};
                loaded.dispose();loaded=null;
                let privateRejected=false;
                try{loaded=await loadPreviewModel(previewDescriptor({id:'native-map:private-preview-world',source:'native-map',worldId:'private-preview-world',name:'Unavailable world'}),{renderer});}catch{privateRejected=true;}
                answer.privateRejected=privateRejected;
                return answer;
              }finally{loaded?.dispose();renderer.dispose();renderer.forceContextLoss();}
            }''')
            assert details == {'worldId': 'native-preview-world', 'authored': True, 'presentation': 'actual-model', 'privateRejected': True}, details
            assert not errors and not shader_errors, {'pageErrors': errors, 'shaderErrors': shader_errors}
            print({'viewport': [width, height], 'visual_sources': len(records), 'private_upload_uses_auth': True,
                   'camera_only_after_click': True, 'capture_released': True, 'pageErrors': errors, 'shaderErrors': shader_errors}, flush=True)
            page.close()
        browser.close()
finally:
    server.shutdown()
