"""Render the crafted native library, optionally regenerating its SVG thumbnails.

python3 test/native-crafted-collection.browser.py --write-thumbnails
"""
import argparse
import html
import math
import os
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
os.chdir(REPO)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write-thumbnails', action='store_true')
parser.add_argument('--family', action='append', choices=['equipment', 'landscape', 'characters', 'buildings', 'furniture'])
parser.add_argument('--output', type=Path, default=Path('/workspace'))
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)

FAMILIES = [
 ('equipment', 'Equipment & world props', 'equipment-prop-models', 'EQUIPMENT_PROP_MODEL_INFO', 4),
 ('landscape', 'Terrain & nature', 'crafted-landscape-models', 'CRAFTED_LANDSCAPE_MODEL_INFO', 4),
 ('characters', 'Characters & creatures', 'crafted-character-models', 'CRAFTED_CHARACTER_MODEL_INFO', 3),
 ('buildings', 'Buildings & destinations', 'crafted-building-models', 'CRAFTED_BUILDING_MODEL_INFO', 2),
 ('furniture', 'Furniture & garden', 'crafted-furniture-models', 'CRAFTED_FURNITURE_MODEL_INFO', 4),
]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path != '/__crafted_collection__':
            return super().do_GET()
        markup = b'''<!doctype html><html><head><link rel="icon" href="data:,"><style>
        *{box-sizing:border-box}body{margin:0;background:#0b1220;color:#d9e8ef;font-family:Arial,sans-serif}
        header{height:90px;padding:23px 36px;background:#0b1220}header small{display:block;color:#78c8c7;font-size:11px;letter-spacing:3px;margin-bottom:7px}
        h1{margin:0;font-size:26px;letter-spacing:1px;font-weight:500}canvas{display:block}#labels{position:absolute;top:90px;left:0;pointer-events:none}
        .label{position:absolute;text-align:center;font-size:15px;font-weight:500;color:#deebf2;letter-spacing:.2px;text-shadow:0 2px 7px #09131f}
        </style></head><body><header><small>MUZIKAZ / NATIVE COLLECTION</small><h1 id="title"></h1></header><div id="labels"></div></body></html>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(markup)))
        self.end_headers()
        self.wfile.write(markup)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                   args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/__crafted_collection__')
        page.evaluate('''async () => {
          const T = await import('/public/vendor/three/three.module.min.js');
          const {createBuilderModel,updateBuilderModels}=await import('/public/js/builder-models-3d.js');
          const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
          renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
          renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
          renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
          window.shaderErrors=[];
          renderer.debug.onShaderError=(gl,program,vertex,fragment)=>shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].join('\\n'));
          document.querySelector('header').after(renderer.domElement);
          const entries=new Map();
          window.loadFamily=async(moduleName,exportName)=>{
            const info=(await import('/public/js/'+moduleName+'.js'))[exportName];
            for(const [id,[name,description]]of Object.entries(info)){
              const root=createBuilderModel(id);if(!root)throw Error('Missing model '+id);
              const scene=new T.Scene();scene.background=new T.Color(0x0b1725);scene.add(root);
              scene.add(new T.HemisphereLight(0xdbf1ff,0x424653,2.2));
              const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
              const span=Math.max(size.x,size.y,size.z);
              const sun=new T.DirectionalLight(0xffe3c3,3);sun.position.set(span*1.5,span*2,-span*1.6);sun.castShadow=true;
              sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,far:span*10});sun.shadow.bias=-.0003;scene.add(sun);
              const floor=new T.Mesh(new T.CircleGeometry(span*1.1,64),new T.MeshStandardMaterial({color:0x162b3b,roughness:.85}));
              floor.rotation.x=-Math.PI/2;floor.position.set(center.x,-.025,center.z);floor.receiveShadow=true;scene.add(floor);
              const camera=new T.PerspectiveCamera(32,1,.01,400);
              camera.position.copy(center).add(new T.Vector3(.9,.72,-1.6).normalize().multiplyScalar(span*2.45));camera.lookAt(center);
              entries.set(id,{root,scene,camera,name,description});
            }
            return Object.keys(info);
          };
          window.renderCollection=({ids,title,cols,width,height,labels=true})=>{
            const rows=Math.ceil(ids.length/cols),cellW=width/cols,cellH=height/rows;
            document.querySelector('#title').textContent=title;document.querySelector('#labels').innerHTML='';
            renderer.setSize(width,height);renderer.setScissorTest(false);renderer.setClearColor(0x0b1220);renderer.clear();renderer.setScissorTest(true);
            ids.forEach((id,index)=>{
              const {root,scene,camera,name}=entries.get(id),col=index%cols,row=Math.floor(index/cols);
              camera.aspect=cellW/cellH;camera.updateProjectionMatrix();updateBuilderModels(root,1.8);
              renderer.setViewport(col*cellW,height-(row+1)*cellH,cellW,cellH);renderer.setScissor(col*cellW,height-(row+1)*cellH,cellW,cellH);renderer.render(scene,camera);
              if(labels){const label=document.createElement('div');label.className='label';label.textContent=name;Object.assign(label.style,{left:col*cellW+'px',top:(row+1)*cellH-32+'px',width:cellW+'px'});document.querySelector('#labels').append(label);}
            });
            return renderer.domElement.toDataURL('image/png');
          };
          window.assetDescription=id=>({name:entries.get(id).name,description:entries.get(id).description});
          window.releaseFamily=ids=>{
            const resources=new Set();for(const id of ids){const entry=entries.get(id);entry.scene.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of [].concat(n.material||[]))resources.add(m);n.shadow?.map?.dispose();});entries.delete(id);}for(const r of resources)r.dispose();
          };
        }''')
        total = 0
        for slug, title, module_name, export_name, cols in FAMILIES:
            if args.family and slug not in args.family:
                continue
            ids = page.evaluate('([moduleName,exportName])=>loadFamily(moduleName,exportName)', [module_name, export_name])
            total += len(ids)
            if args.write_thumbnails:
                for item_id in ids:
                    data = page.evaluate('(id)=>renderCollection({ids:[id],title:"",cols:1,width:480,height:480,labels:false})', item_id)
                    description = page.evaluate('(id)=>assetDescription(id)', item_id)
                    # The SVG packages the actual native 3D rendering with accessible
                    # text; it is the same artwork the user sees in the live library.
                    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" role="img" aria-labelledby="title desc"><title id="title">{html.escape(description["name"])}</title><desc id="desc">{html.escape(description["description"])}</desc><image width="480" height="480" href="{data}"/></svg>\n'
                    target = REPO / 'public/images/native-upgrades' / f'{item_id}.svg'
                    target.write_text(svg)
            height = math.ceil(len(ids) / cols) * 350
            page.set_viewport_size({'width': 1600, 'height': height + 90})
            page.evaluate('(view)=>renderCollection(view)', {'ids': ids, 'title': title, 'cols': cols, 'width': 1600, 'height': height})
            target = args.output / f'native-{slug}-upgrades.png'
            page.screenshot(path=str(target), full_page=True)
            print(str(target), flush=True)
            page.evaluate('(ids)=>releaseFamily(ids)', ids)
        assert not page.evaluate('shaderErrors'), page.evaluate('shaderErrors')
        assert not errors, errors
        browser.close()
        print(f'Rendered {total} crafted models without shader or browser errors.', flush=True)
finally:
    server.shutdown()
