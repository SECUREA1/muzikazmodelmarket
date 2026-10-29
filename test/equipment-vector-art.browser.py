#!/usr/bin/env python3
"""Decode every equipment vector at catalog and phone sizes; export contact sheets."""
import json
import os
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
os.chdir(REPO)
DESIGNS = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {EQUIPMENT_VECTOR_DESIGNS} from './scripts/build-equipment-vector-art.mjs';console.log(JSON.stringify(EQUIPMENT_VECTOR_DESIGNS))"
], text=True))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path != '/__equipment_vectors__':
            return super().do_GET()
        markup = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>
        *{box-sizing:border-box}body{margin:0;padding:28px;background:#09121f;color:#e3eef4;font-family:system-ui,sans-serif}
        h1{font-size:29px;letter-spacing:-.6px;font-weight:550;margin:0 0 8px}header p{color:#8faabb;font-size:13px;margin:0 0 24px}
        main{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}figure{margin:0;min-width:0}img{width:100%;height:auto;display:block;border-radius:15px}
        figcaption{font-size:10px;letter-spacing:.5px;color:#809bad;padding:8px 2px 14px;overflow-wrap:anywhere}
        @media(max-width:600px){body{padding:15px}h1{font-size:24px}main{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
        </style></head><body><header><h1>MUZIKAZ / equipment</h1><p>Clean vector silhouettes · luminous inlays · static, lightweight artwork</p></header><main></main></body></html>'''.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(markup)))
        self.end_headers()
        self.wfile.write(markup)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1280, 'height': 1000}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/__equipment_vectors__')
        report = page.evaluate('''async designs=>{
          const main=document.querySelector('main'),results=[];
          for(const design of designs){
            const card=document.createElement('figure'),image=document.createElement('img'),label=document.createElement('figcaption');
            image.src='/'+design.path;image.alt=design.name;label.textContent=design.id;card.append(image,label);main.append(card);
            await image.decode();
            if(image.naturalWidth!==320||image.naturalHeight!==320)throw Error(design.id+' intrinsic image dimensions');
            const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
            const pixels=ctx.getImageData(0,0,320,320).data,colors=new Set();
            for(let i=0;i<pixels.length;i+=16)colors.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));
            if(colors.size<500)throw Error(design.id+' artwork is blank or missing color detail: '+colors.size);
            results.push({id:design.id,colors:colors.size,width:image.naturalWidth,height:image.naturalHeight});
          }
          return results;
        }''', DESIGNS)
        page.screenshot(path='/workspace/equipment-vector-art-contact-sheet.png', full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path='/workspace/equipment-vector-art-mobile.png', full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'phone layout overflows'
        assert not errors, errors
        Path('/workspace/equipment-vector-art-browser.json').write_text(json.dumps({'items': report, 'errors': errors}, indent=2))
        # Exercise production catalog markup before its canonical image hydration.
        # Merely decoding the source SVG would not prove its nested image appears
        # in the actual inline SVG toolPreviewArt returns to marketItemPreview.
        page.set_viewport_size({'width': 1100, 'height': 900})
        page.evaluate('''async()=>{
          const {marketItemPreview}=await import('/public/js/market-item-preview.js');
          const main=document.querySelector('main');main.style.gridTemplateColumns='repeat(2,320px)';main.innerHTML='';
          const container=document.createElement('div');container.innerHTML=marketItemPreview({name:'Laser',toolId:'laser'})+marketItemPreview({name:'Rail Cannon',toolId:'rail-cannon'});
          const ready=[...container.querySelectorAll('svg image')].map(image=>new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('inline tool art failed to load')),{once:true});}));
          const style=document.createElement('style');style.textContent='.market-item-preview>svg{display:block;width:320px;height:320px}.market-item-preview{width:320px;margin:0}';document.head.append(style);
          main.append(...container.children);await Promise.all(ready);
        }''')
        page.locator('.market-item-preview').first.screenshot(path='/workspace/equipment-inline-catalog.png')
        with Image.open('/workspace/equipment-inline-catalog.png').convert('RGB') as shot:
            pixels=shot.load()
            colored=sum(1 for y in range(320) for x in range(320) for red,green,blue in [pixels[x,y]] if red>140 and red>green*1.25 and red>blue*1.08)
            assert colored>30, f'inline laser vector did not render its luminous receiver: {colored}'
        page.evaluate('''async()=>{const {hydrateMarketPreviews}=await import('/public/js/market-item-preview.js');hydrateMarketPreviews(document.querySelector('main'));}''')
        page.wait_for_function('document.querySelectorAll(".market-item-preview>img").length===2')
        for image in page.locator('.market-item-preview>img').all():
            image.evaluate('(image)=>image.decode()')
            assert '?art=equipment-vector-v1' in image.get_attribute('src')
        assert not errors, errors
        browser.close()
        print(f'PASS all {len(report)} equipment SVGs decode with real vector detail at320px; inline catalog render and fingerprinted image hydration verified; desktop and390px phone sheets exported.')
finally:
    server.shutdown()
