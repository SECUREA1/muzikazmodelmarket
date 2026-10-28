#!/usr/bin/env python3
"""Render every canonical native item through its actual gameplay factory.

python3 scripts/render-native-designs.py
python3 scripts/render-native-designs.py --only-missing
python3 scripts/render-native-designs.py --ids studio-desk,material:wood

Thumbnails are accessible SVG wrappers containing their rendered PNG artwork.
Category sheets and an overview are exported to /workspace by default.
"""
import argparse
import html
import json
import math
import os
import re
from collections import defaultdict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
os.chdir(REPO)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ids', help='Comma-separated canonical native IDs')
parser.add_argument('--only-missing', action='store_true')
parser.add_argument('--output', type=Path, default=Path('/workspace'))
parser.add_argument('--size', type=int, default=320)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
selected = set(args.ids.split(',')) if args.ids else None


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path != '/__native_design_export__':
            return super().do_GET()
        markup = b'''<!doctype html><html><head><link rel="icon" href="data:,"><style>
        *{box-sizing:border-box;overflow-anchor:none}html,body{scroll-behavior:auto}body{margin:0;background:#0b1321;color:#e1edf1;font-family:Arial,sans-serif}
        header{padding:24px 32px 20px;height:104px}header small{display:block;font-size:11px;letter-spacing:3px;color:#75c3c9;margin-bottom:8px}
        h1{font-size:26px;font-weight:500;margin:0}canvas{display:block}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#132333}
        article{background:#0b1725;min-width:0;padding:12px 8px 14px;text-align:center}article img{display:block;width:100%;height:250px;object-fit:contain}
        article strong{display:block;font-size:14px;line-height:1.25;font-weight:500;color:#dfebf0;min-height:35px}article small{display:block;font-size:10px;color:#75a3b2;margin-top:5px}
        </style></head><body><header><small>MUZIKAZ / CRAFTED NATIVE SYSTEM</small><h1 id="title">Native design export</h1></header><div class="grid" id="gallery"></div></body></html>'''
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
        page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
        errors = []
        current = ['initialization']
        page.on('pageerror', lambda error: errors.append({'id': current[0], 'error': str(error)}))
        page.on('console', lambda message: errors.append({'id': current[0], 'error': message.text}) if message.type == 'error' else None)
        page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('http://127.0.0.1:', 'data:', 'blob:')) else route.abort())
        page.goto(f'http://127.0.0.1:{server.server_port}/__native_design_export__')
        catalog = page.evaluate('''async(size)=>{
          const T=await import('/public/vendor/three/three.module.min.js');
          const {NATIVE_BUILDER_ITEMS}=await import('/public/js/native-builder-items.js');
          const {createBuilderModel,updateBuilderModels}=await import('/public/js/builder-models-3d.js');
          const {HELD_TOOL_DESIGN_IDS,createHeldToolModel}=await import('/public/js/held-tool-design-finish.js');
          const {NATIVE_TEMPLATE_LAYOUT_IDS}=await import('/public/js/environments/native-world-design-finish.js');
          const {createBuilderLand}=await import('/public/js/environments/builder-land.js');
          const {applySportsSurfaces}=await import('/public/js/sports-surfaces.js');
          const {nativeDesignThumbnail}=await import('/public/js/native-design-profile.js');
          const {VEHICLE_DESIGN_IDS}=await import('/public/js/vehicle-design-profile.js');
          const {MOUNTAIN_PREVIEW_IDS}=await import('/public/js/mountain-design-profile.js');
          const {RANGED_WEAPONS}=await import('/public/js/game-weapons.js');
          const {UTILITY_TOOLS}=await import('/public/js/game-utilities.js');
          const {LAYOUT_SCENES}=await import('/public/js/builder-layout-scenes.js');
          const basicToolNames={laser:'Starter Laser',bat:'Basic Bat',spray:'Paint Gun',brick:'Building Kit',flamethrower:'Flash Igniter',taser:'Taser',toxin:'Toxins Thrower',dynamite:'Dynamite',jetpack:'Jetpack'};
          const readable=id=>id.replaceAll('-',' ').replace(/\\b\\w/g,value=>value.toUpperCase());
          const allItems=new Map(Object.values(NATIVE_BUILDER_ITEMS).map(item=>[item.id,{...item,thumbnailUrl:item.visualDesign?.thumbnailUrl}]));
          const vehicleIds=new Set(VEHICLE_DESIGN_IDS);
          const mountainIds=new Set(MOUNTAIN_PREVIEW_IDS);
          for(const id of HELD_TOOL_DESIGN_IDS){const config=RANGED_WEAPONS[id]||UTILITY_TOOLS[id]||{};allItems.set('tool:'+id,{id:'tool:'+id,name:config.label||basicToolNames[id]||readable(id),description:config.description||'Detailed native '+(basicToolNames[id]||readable(id))+' with crafted casing, grip and fittings.',category:'held-tools',thumbnailUrl:nativeDesignThumbnail('tool:'+id)});}
          for(const layout of NATIVE_TEMPLATE_LAYOUT_IDS){const spec=LAYOUT_SCENES['scene-'+layout];allItems.set('layout:'+layout,{id:'layout:'+layout,name:spec?.name||readable(layout),description:spec?.description||'Native '+readable(layout)+' map template with crafted architectural and material surfaces.',category:'map-templates',thumbnailUrl:nativeDesignThumbnail('layout:'+layout)});}
          const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
          renderer.setPixelRatio(1);renderer.setSize(size,size);renderer.outputColorSpace=T.SRGBColorSpace;
          renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
          renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
          renderer.domElement.style.display='none';document.body.append(renderer.domElement);
          window.nativeShaderErrors=[];
          renderer.debug.onShaderError=(gl,program,vertex,fragment)=>nativeShaderErrors.push({id:window.currentNativeId,error:[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].join('\\n')});
          window.renderNative=async id=>{
            window.currentNativeId=id;const item=allItems.get(id),root=id.startsWith('tool:')?createHeldToolModel(T,id.slice(5)):id.startsWith('layout:')?createBuilderLand({id:'native-template-'+id.slice(7),source:'repository',builderScene:{layout:id.slice(7),mapSize:40}}):createBuilderModel(id);
            if(!root)throw Error('Native item has no model: '+id);
            if(id.startsWith('layout:')){let sports=false;root.traverse(node=>{if(node.userData.sportsSurface)sports=true;});if(sports)await applySportsSurfaces(root,{maxResolution:512});}
            let meshCount=0,triangleCount=0;root.traverse(node=>{if(node.isMesh&&node.visible!==false){meshCount++;triangleCount+=(node.geometry?.index?.count||node.geometry?.attributes.position?.count||0)/3*(node.isInstancedMesh?node.count:1);}});
            if(!meshCount)throw Error('Native model has no drawable meshes: '+id);
            updateBuilderModels(root,1.75);root.updateMatrixWorld(true);
            const runtimeBounds=new T.Box3().setFromObject(root,true),runtimeSpan=Math.max(...runtimeBounds.getSize(new T.Vector3()));
            // The native clown-car assembly includes its interaction court and
            // tall attraction sign. Preview the actual car in that same factory
            // hierarchy, preserving the full assembly's stats and cleanup.
            const previewSubject=id==='funhouse-clown-car'?(root.getObjectByName('FUNHOUSE_TINY_CLOWN_CAR')||root):root;
            if(previewSubject!==root){
              const shown=new Set();previewSubject.traverse(node=>shown.add(node));
              for(let node=previewSubject;node;node=node.parent)shown.add(node);
              root.traverse(node=>{if(!shown.has(node))node.visible=false;});
            }
            const bounds=previewSubject===root?runtimeBounds:new T.Box3().setFromObject(previewSubject,true),spanVector=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),span=Math.max(...spanVector);
            if(!Number.isFinite(span)||span<=0)throw Error('Invalid native model bounds: '+id);
            const scene=new T.Scene();scene.background=new T.Color(0x0b1725);scene.add(root);
            scene.add(new T.HemisphereLight(0xe0f3ff,0x384f57,2.35));
            const key=new T.DirectionalLight(0xffe4c8,3.4);key.position.copy(center).add(new T.Vector3(span*2,span*3,-span*2));
            key.target.position.copy(center);scene.add(key,key.target);
            key.castShadow=span<25&&meshCount<250;key.shadow.mapSize.set(256,256);key.shadow.bias=-.0003;
            Object.assign(key.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:.01,far:span*10});
            const rim=new T.DirectionalLight(0x9bd6ef,1.6);rim.position.copy(center).add(new T.Vector3(-span,span*.6,span));scene.add(rim);
            const floorY=bounds.min.y-Math.max(.002,span*.004),floor=new T.Mesh(new T.CircleGeometry(span*.85,48),new T.MeshStandardMaterial({color:0x192d3c,roughness:.9}));
            floor.rotation.x=-Math.PI/2;floor.position.set(center.x,floorY,center.z);floor.receiveShadow=true;
            if(!root.userData.watercraft&&!root.userData.waterline)scene.add(floor);
            const camera=new T.PerspectiveCamera(37,1,Math.max(.001,span/10000),span*15);
            camera.position.copy(center).add(new T.Vector3(.9,.8,-1.4).normalize().multiplyScalar(span*2.25));camera.lookAt(center);
            renderer.render(scene,camera);
            const data=renderer.domElement.toDataURL('image/png');
            const stats={id,name:item.name,description:item.description||item.name,category:item.category||'props',thumbnailUrl:item.thumbnailUrl,meshCount,triangleCount,span:runtimeSpan,finish:root.userData.nativeDesign||root.userData.heldToolDesign||root.userData.nativeWorldDesign,...(root.userData.vehicleDesign?{vehicleDesign:root.userData.vehicleDesign}:{}),...(root.userData.mountainDesign?{mountainDesign:root.userData.mountainDesign}:{}),...(root.userData.mountainTerrainDesign?{mountainTerrainDesign:root.userData.mountainTerrainDesign}:{}),...(previewSubject!==root?{previewSubject:previewSubject.name,previewSpan:span}:{})};
            const resources=new Set();scene.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const m of [].concat(node.material||[])){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}node.shadow?.map?.dispose();});
            if(!floor.parent){floor.geometry.dispose();floor.material.dispose();}
            for(const resource of resources)resource.dispose();renderer.renderLists.dispose();scene.clear();
            return {data,stats};
          };
          window.showNativeSheet=async(title,items)=>{
            document.querySelector('#title').textContent=title;const gallery=document.querySelector('#gallery');gallery.innerHTML='';
            for(const item of items){const card=document.createElement('article'),img=document.createElement('img'),name=document.createElement('strong'),id=document.createElement('small');img.src=item.thumbnailUrl;img.alt=item.name;name.textContent=item.name;id.textContent=item.id;card.append(img,name,id);gallery.append(card);}
            await Promise.all([...gallery.querySelectorAll('img')].map(img=>img.decode()));
            window.scrollTo(0,0);
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            window.scrollTo(0,0);
          };
          return [...allItems.values()].map(item=>({id:item.id,name:item.name,description:item.description||item.name,category:item.category||'props',thumbnailUrl:item.thumbnailUrl,vehicleOrder:vehicleIds.has(item.id)?VEHICLE_DESIGN_IDS.indexOf(item.id):null,mountainOrder:mountainIds.has(item.id)?MOUNTAIN_PREVIEW_IDS.indexOf(item.id):null}));
        }''', args.size)
        if selected:
            unknown = selected - {item['id'] for item in catalog}
            if unknown:
                raise RuntimeError(f'Unknown native IDs: {sorted(unknown)}')
        rendered = []
        failures = []
        for index, item in enumerate(catalog, 1):
            if selected and item['id'] not in selected:
                continue
            target = REPO / item['thumbnailUrl'].lstrip('/')
            if args.only_missing and target.exists():
                continue
            current[0] = item['id']
            try:
                result = page.evaluate('(id)=>renderNative(id)', item['id'])
                target.parent.mkdir(parents=True, exist_ok=True)
                stats = result['stats']
                svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {args.size} {args.size}" role="img" aria-labelledby="title desc"><title id="title">{html.escape(item["name"])}</title><desc id="desc">{html.escape(item["description"])}</desc><image width="{args.size}" height="{args.size}" href="{result["data"]}"/></svg>\n'
                target.write_text(svg)
                rendered.append(stats)
            except Exception as error:
                failures.append({'id': item['id'], 'error': str(error)})
                print(f'FAILED {item["id"]}: {str(error).splitlines()[0]}', flush=True)
            if len(rendered) and len(rendered) % 20 == 0:
                print(f'Rendered {len(rendered)} items; catalog position {index}/{len(catalog)}: {item["id"]}', flush=True)
        current[0] = 'contact sheets'
        groups = defaultdict(list)
        available = []
        for item in catalog:
            if (REPO / item['thumbnailUrl'].lstrip('/')).exists():
                groups[item['category']].append(item)
                available.append(item)
        for category, items in groups.items():
            slug = re.sub(r'[^a-z0-9_-]+', '-', category.lower())
            for start in range(0, len(items), 16):
                subset = items[start:start + 16]
                title = f'{category.replace("-", " ").title()} / {start + 1}–{start + len(subset)} of {len(items)}'
                page.set_viewport_size({'width': 1440, 'height': 104 + math.ceil(len(subset) / 4) * 330})
                page.evaluate('([title,items])=>showNativeSheet(title,items)', [title, subset])
                page.set_viewport_size({'width': 1440, 'height': page.evaluate('document.documentElement.scrollHeight')})
                page.evaluate('window.scrollTo(0,0)')
                page.screenshot(path=str(args.output / f'native-design-{slug}-{start // 16 + 1}.png'))
        representatives = ['grand-tourer', 'harbor-yacht', 'diamond-da40', 'studio-desk', 'radio-console', 'fitness-treadmill', 'funhouse-ferris-wheel', 'factory-assembly-bench', 'tool:pulse-rifle', 'tool:jetpack', 'layout:market-square', 'layout:skyport', 'material:wood', 'material:metal', 'world-resident', 'portal-door']
        by_id = {item['id']: item for item in available}
        overview = [by_id[id] for id in representatives if id in by_id]
        # The catalog can grow without editing this script. Fill missing overview
        # slots from as-yet-unrepresented native categories.
        used = {item['id'] for item in overview}
        seen_categories = {item['category'] for item in overview}
        for item in available:
            if len(overview) >= 16:
                break
            if item['id'] not in used and item['category'] not in seen_categories:
                overview.append(item)
                seen_categories.add(item['category'])
        page.set_viewport_size({'width': 1440, 'height': 104 + math.ceil(len(overview) / 4) * 330})
        page.evaluate('([title,items])=>showNativeSheet(title,items)', ['Every native family / crafted system', overview])
        page.set_viewport_size({'width': 1440, 'height': page.evaluate('document.documentElement.scrollHeight')})
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(args.output / 'native-design-overview.png'))
        fleet = sorted((item for item in available if item['vehicleOrder'] is not None), key=lambda item: item['vehicleOrder'])
        if fleet:
            page.set_viewport_size({'width': 1440, 'height': 104 + math.ceil(len(fleet) / 4) * 330})
            page.evaluate('([title,items])=>showNativeSheet(title,items)', [f'Vehicles / {len(fleet)} crafted native designs', fleet])
            page.set_viewport_size({'width': 1440, 'height': page.evaluate('document.documentElement.scrollHeight')})
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(args.output / 'vehicle-design-overview.png'))
        mountains = sorted((item for item in available if item['mountainOrder'] is not None), key=lambda item: item['mountainOrder'])
        if mountains:
            page.set_viewport_size({'width': 1440, 'height': 104 + math.ceil(len(mountains) / 4) * 330})
            page.evaluate('([title,items])=>showNativeSheet(title,items)', [f'Mountains / {len(mountains)} crafted native designs', mountains])
            page.set_viewport_size({'width': 1440, 'height': page.evaluate('document.documentElement.scrollHeight')})
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(args.output / 'mountain-design-overview.png'))
        shader_errors = page.evaluate('nativeShaderErrors')
        report_path = args.output / 'native-design-render-report.json'
        previous = json.loads(report_path.read_text()) if report_path.exists() else {}
        verified = {item['id']: item for item in previous.get('items', [])}
        verified.update({item['id']: item for item in rendered})
        mountain_ids = {item['id'] for item in catalog if item['mountainOrder'] is not None}
        report = {'catalogCount': len(catalog), 'renderedCount': len(rendered), 'verifiedCount': len(verified), 'availableThumbnails': len(available), 'vehicleDesignCount': sum(bool(item.get('vehicleDesign')) for item in verified.values()), 'mountainDesignCount': sum(bool(item.get('mountainDesign')) for item in verified.values()), 'mountainPreviewCount': len(mountain_ids & verified.keys()), 'selectedIds': sorted(selected) if selected else None, 'items': list(verified.values()), 'failures': failures, 'shaderErrors': shader_errors, 'browserErrors': errors}
        report_path.write_text(json.dumps(report, indent=2) + '\n')
        browser.close()
        print(f'Native export: {len(rendered)} rendered, {len(available)}/{len(catalog)} thumbnails, {len(failures)} failures, {len(shader_errors)} shader errors, {len(errors)} browser errors.', flush=True)
        if failures or shader_errors or errors:
            raise RuntimeError('Native export failed; see native-design-render-report.json')
finally:
    server.shutdown()
