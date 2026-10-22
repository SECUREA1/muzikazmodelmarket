"""Repeated actual map renderers release resources without retaining game meshes."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/map-resource-lifecycle.html':
            body = b'<!doctype html><style>body{margin:0}.local-map-3d-viewport{position:relative;width:300px;height:220px}.local-map-3d-viewport canvas{width:100%;height:100%}.local-map-3d-tags{position:absolute;inset:0;pointer-events:none}</style><main id="game"></main><section id="map"></section>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 700, 'height': 700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/map-resource-lifecycle.html')
        page.evaluate('''async()=>{
            const THREE=await import('/public/vendor/three/three.module.min.js');
            const {mountLocalMap3D}=await import('/public/js/local-map-3d.js');
            window.THREE=THREE;window.mountMap=mountLocalMap3D;
            const geometry=new THREE.BoxGeometry(2,2,2),texture=new THREE.DataTexture(new Uint8Array([220,80,40,255]),1,1);texture.needsUpdate=true;
            const material=new THREE.MeshBasicMaterial({map:texture}),secondMaterial=new THREE.MeshBasicMaterial({color:0x7fe0b0,map:texture});
            window.sourceResources={geometry,material,secondMaterial,texture};window.sourceDisposals={geometry:0,material:0,secondMaterial:0,texture:0};
            for(const [name,resource]of Object.entries(sourceResources))resource.addEventListener('dispose',()=>sourceDisposals[name]++);
            const scene=new THREE.Scene();window.sourceRoot=new THREE.Group();scene.add(sourceRoot);
            const mesh=new THREE.Mesh(geometry,material);mesh.position.x=-2;sourceRoot.add(mesh);
            const multi=new THREE.Mesh(geometry,[material,secondMaterial]);multi.position.x=2;sourceRoot.add(multi);
            window.instances=new THREE.InstancedMesh(geometry,material,2);instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,0,-3));instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(0,0,3));instances.setColorAt(0,new THREE.Color(0xffffff));instances.setColorAt(1,new THREE.Color(0xaaffaa));sourceRoot.add(instances);
            const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(300,220);document.querySelector('#game').append(renderer.domElement);
            const camera=new THREE.PerspectiveCamera(45,300/220,.1,100);camera.position.set(0,8,14);camera.lookAt(0,0,0);
            window.gameRenderer=renderer;window.drawGame=()=>{renderer.render(scene,camera);return {calls:renderer.info.render.calls,lost:renderer.getContext().isContextLost(),error:renderer.getContext().getError()};};
            window.listenerCounts=()=>Object.fromEntries(Object.entries(sourceResources).map(([name,resource])=>[name,resource._listeners?.dispose?.length||0]));
            drawGame();window.originalListeners=listenerCounts();window.mapCycles=[];
        }''')
        baseline = page.evaluate('originalListeners')
        for cycle in range(12):
            page.evaluate('''async cycle=>{
                window.currentMap=await mountMap(document.querySelector('#map'),{
                    environment:{id:'resource-test',name:'Resource test',spawn:{x:0,y:0,z:0},builderScene:{mapSize:50,objects:[]}},
                    getRoots:()=>[sourceRoot],getTags:()=>[],refreshInterval:0
                });
                window.mapContext=currentMap.renderer.getContext();
            }''', cycle)
            page.wait_for_function('currentMap.renderer.info.render.calls>0')
            page.evaluate('window.initialMapPrograms=currentMap.renderer.info.programs.slice()')
            for rebuild in range(3):
                page.evaluate('''()=>{currentMap.refresh();currentMap.renderer.info.reset();}''')
                page.wait_for_function('currentMap.renderer.info.render.calls>0')
                assert page.evaluate('currentMap.renderer.info.memory.geometries') == 1
                assert page.evaluate('currentMap.renderer.info.memory.textures') == 1
                assert page.evaluate('currentMap.renderer.info.programs.length===initialMapPrograms.length&&currentMap.renderer.info.programs.every(program=>initialMapPrograms.includes(program))'), 'Unchanged source materials must retain compiled map programs through rebuilds.'
                counts = page.evaluate('listenerCounts()')
                assert counts == baseline, (cycle, rebuild, 'Map renderer attached to game-owned resources', baseline, counts)
            page.evaluate('''cycle=>{
                window.closedMap=currentMap;
                currentMap.dispose();currentMap.dispose();
                instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(0,0,3+cycle*.05));instances.instanceMatrix.needsUpdate=true;
                sourceRoot.rotation.y=cycle*.04;
            }''', cycle)
            page.wait_for_function('mapContext.isContextLost()')
            assert page.locator('#map canvas').count() == 0
            assert page.evaluate('listenerCounts()') == baseline, (cycle, 'Closed map retained game resource callbacks')
            assert page.evaluate('sourceDisposals') == {'geometry': 0, 'material': 0, 'secondMaterial': 0, 'texture': 0}
            assert page.evaluate('closedMap.renderer.info.memory.geometries') == 0
            assert page.evaluate('closedMap.renderer.info.memory.textures') == 0
            game = page.evaluate('drawGame()')
            assert game['calls'] > 0 and not game['lost'] and game['error'] == 0, (cycle, game)
        shader = page.evaluate('''async()=>{
            const {mirrorMapMeshes}=await import('/public/js/local-map-3d.js');
            const material=new THREE.ShaderMaterial({uniforms:{amount:{value:.2}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float amount;void main(){gl_FragColor=vec4(amount,0.,0.,1.);}'});
            const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
            const mirror=mirrorMapMeshes([root]),scene=new THREE.Scene();scene.add(mirror.group);
            const camera=new THREE.PerspectiveCamera(45,300/220,.1,10);camera.position.z=3;
            const read=()=>{gameRenderer.render(scene,camera);const gl=gameRenderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(150,110,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0];};
            mirror.update();const before=read(),uniforms=mirror.group.children[0].material.uniforms;
            material.uniforms.amount.value=.9;const changed=mirror.update(),after=read();
            const result={before,after,changed,stable:uniforms===mirror.group.children[0].material.uniforms};
            mirror.dispose();return result;
        }''')
        assert shader['stable'] and shader['changed'] and shader['before'] < 100 and shader['after'] > 200, ('Live shader uniforms stopped reaching the actual renderer.', shader)
        color = page.evaluate('''async()=>{
            const {mirrorMapMeshes}=await import('/public/js/local-map-3d.js');
            const material=new THREE.MeshBasicMaterial({color:new THREE.Color(.2,0,0),toneMapped:false}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
            const mirror=mirrorMapMeshes([root]),scene=new THREE.Scene();scene.add(mirror.group);
            const camera=new THREE.PerspectiveCamera(45,300/220,.1,10);camera.position.z=3;
            const output=gameRenderer.outputColorSpace;gameRenderer.outputColorSpace=THREE.LinearSRGBColorSpace;
            const read=()=>{gameRenderer.render(scene,camera);const gl=gameRenderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(150,110,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0];};
            mirror.update();const before=read(),programs=gameRenderer.info.programs.slice(),version=material.version;
            material.color.setRGB(.9,0,0);const changed=mirror.update(),after=read();
            const result={before,after,changed,sameVersion:version===material.version,samePrograms:programs.length===gameRenderer.info.programs.length&&programs.every(program=>gameRenderer.info.programs.includes(program))};
            mirror.dispose();gameRenderer.outputColorSpace=output;return result;
        }''')
        assert color['sameVersion'] and color['samePrograms'] and color['changed'] and color['before'] < 100 and color['after'] > 200, ('Live material colors stopped reaching the GPU without needsUpdate.', color)
        assert not errors, errors
        page.evaluate('gameRenderer.dispose();gameRenderer.forceContextLoss()')
        browser.close()
    print('Twelve actual 3D-map open/close cycles with three rebuilds each retain no game listeners; map GPU resources release, game rendering survives, and live material colors/shader uniforms reach the GPU.')
finally:
    server.shutdown()
    server.server_close()
