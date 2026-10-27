"""Render the portable native item collection and validate animated portal shaders."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
from playwright.sync_api import sync_playwright

os.chdir(Path(__file__).resolve().parents[1])
PORTALS = ['portal-door', 'teleport-pad', 'portal-arch', 'portal-ring']
PROPS = ['quest-scroll', 'treasure-crystal', 'healing-potion', 'supply-crate',
         'treasure-chest', 'lever-switch', 'mana-potion', 'crystal-cluster',
         'reinforced-crate', 'relic-chest']


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/__native_asset_designs__':
            markup = b'<!doctype html><html><head><link rel="icon" href="data:,"><style>html,body{margin:0;background:#091321;color:#e3eef7;font-family:Arial,sans-serif}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none}.label{position:absolute;text-align:center;font-size:16px;font-weight:600;letter-spacing:.2px;color:#d6e5ee;text-shadow:0 1px 5px #091321}</style></head><body><div id="labels"></div></body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(markup)))
            self.end_headers()
            self.wfile.write(markup)
        else:
            super().do_GET()


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1400, 'height': 1280}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/__native_asset_designs__')
        page.evaluate('''async (ids) => {
          const T = await import('/public/vendor/three/three.module.min.js');
          const {createBuilderModel, updateBuilderModels} = await import('/public/js/builder-models-3d.js');
          const renderer = new T.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
          renderer.setPixelRatio(1); renderer.outputColorSpace = T.SRGBColorSpace;
          renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
          renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
          window.shaderErrors = [];
          renderer.debug.onShaderError = (gl,program,vertex,fragment) => {
            shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\\n'));
          };
          document.body.prepend(renderer.domElement);
          const entries = new Map();
          for (const id of ids) {
            const root = createBuilderModel(id), scene = new T.Scene();
            if (!root) throw Error('Missing native model: '+id);
            scene.background = new T.Color(0x091321); scene.add(root);
            scene.add(new T.HemisphereLight(0xe4f1ff,0x354c5c,2.6));
            const sun = new T.DirectionalLight(0xffe5c4,3.6);sun.position.set(-4,7,6);sun.castShadow=true;
            sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;
            sun.shadow.camera.top=6;sun.shadow.camera.bottom=-4;sun.shadow.bias=-.0003;scene.add(sun);
            const floor = new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:0x142331,roughness:.8}));
            floor.rotation.x=-Math.PI/2;floor.position.y=-.028;floor.receiveShadow=true;scene.add(floor);
            const bounds = new T.Box3().setFromObject(root), size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
            const span=Math.max(size.x,size.y,size.z),camera=new T.PerspectiveCamera(34,1,.01,100);
            camera.position.copy(center).add(new T.Vector3(.72,.58,-1.6).normalize().multiplyScalar(span*2.35));camera.lookAt(center);
            entries.set(id,{root,scene,camera});
          }
          window.renderDesigns = ({ids,cols,rows,width,height,time}) => {
            renderer.setSize(width,height);renderer.setScissorTest(true);
            const labels=document.querySelector('#labels');labels.innerHTML='';
            const cellW=width/cols,cellH=height/rows;
            ids.forEach((id,index)=>{
              const {root,scene,camera}=entries.get(id),col=index%cols,row=Math.floor(index/cols);
              camera.aspect=cellW/cellH;camera.updateProjectionMatrix();updateBuilderModels(root,time);
              renderer.setViewport(col*cellW,height-(row+1)*cellH,cellW,cellH);
              renderer.setScissor(col*cellW,height-(row+1)*cellH,cellW,cellH);renderer.render(scene,camera);
              const label=document.createElement('div');label.className='label';label.textContent=root.name;
              Object.assign(label.style,{left:col*cellW+'px',top:(row+1)*cellH-30+'px',width:cellW+'px'});labels.append(label);
            });
            return renderer.domElement.toDataURL('image/png');
          };
          window.freezeDesign = id => {entries.get(id).root.userData.animationState={enabled:false,speed:1};};
          window.resumeDesign = id => {entries.get(id).root.userData.animationState={enabled:true,speed:1};};
        }''', PORTALS + PROPS)

        for portal in PORTALS:
            view = {'ids': [portal], 'cols': 1, 'rows': 1, 'width': 500, 'height': 500, 'time': 0}
            first = page.evaluate('(view)=>renderDesigns(view)', view)
            view['time'] = 2.6
            flowing = page.evaluate('(view)=>renderDesigns(view)', view)
            assert first != flowing, f'{portal}: energy shader must change visible pixels over time'
            page.evaluate('(id)=>freezeDesign(id)', portal)
            view['time'] = 9
            frozen = page.evaluate('(view)=>renderDesigns(view)', view)
            assert frozen == flowing, f'{portal}: disabled effects must retain their current visible frame'
            page.evaluate('(id)=>resumeDesign(id)', portal)

        page.evaluate('(view)=>renderDesigns(view)', {
            'ids': PORTALS + PROPS, 'cols': 4, 'rows': 4,
            'width': 1400, 'height': 1280, 'time': 2.4})
        page.screenshot(path='/workspace/native-asset-designs.png')
        page.set_viewport_size({'width': 1600, 'height': 600})
        page.evaluate('(view)=>renderDesigns(view)', {
            'ids': PORTALS, 'cols': 4, 'rows': 1,
            'width': 1600, 'height': 600, 'time': 2.4})
        page.screenshot(path='/workspace/native-portals.png')
        assert not page.evaluate('shaderErrors'), page.evaluate('shaderErrors')
        assert not errors, errors
        browser.close()
    print('Rendered all 14 native models; all four portal shaders visibly animate, freeze correctly, and compile without browser errors.')
    print('/workspace/native-asset-designs.png')
    print('/workspace/native-portals.png')
finally:
    server.shutdown()
