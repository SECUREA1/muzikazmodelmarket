"""Live factory prototypes, mobile layout, and retry-safe save/registration."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        try:
            for mobile in [False,True]:
                context=browser.new_context(viewport={'width':390 if mobile else 1200,'height':844 if mobile else 1000},has_touch=mobile)
                page=context.new_page()
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(base+'/README.md')
                page.set_content('<!doctype html><html><head><style>body{margin:0;background:#081821;color:#eee}main{padding:12px;max-width:1100px;margin:auto}</style></head><body><main id="designer"></main></body></html>')
                page.evaluate('''async base=>{
                  const {mountWorldFactoryDesigner}=await import(base+'/public/js/world-factory-designer.js');
                  window.savedCalls=[];window.registerCalls=[];window.records={};window.transportFailure=true;window.registrationFailure=true;
                  const inventory={session:async()=>({csrfToken:'fixture-csrf'}),api:async(path,options)=>{
                    if(path==='/api/wallet/state')return {items:[{id:'owned-phone',name:'Owned phone',modelUrl:base+'/public/models/props/HOLOPHONE_SILVER.glb'},{id:'earned',name:'Earned model',modelUrl:'/earned.glb',earnedOnly:true},{id:'injected',modelUrl:'javascript:bad.glb'}]};
                    const body=JSON.parse(options.body);savedCalls.push({path,body,csrf:options.headers['X-CSRF-Token']});
                    records[body.requestId] ||= {...body,id:'saved-'+Object.keys(records).length,type:'custom-item'};
                    if(transportFailure){transportFailure=false;throw Error('Connection lost after save');}
                    return structuredClone(records[body.requestId]);
                  }};
                  window.workshop=mountWorldFactoryDesigner(document.querySelector('#designer'),{inventory,onSaved:async item=>{registerCalls.push(item);if(registrationFailure){registrationFailure=false;throw Error('Registration unavailable');}}});
                }''',base)
                page.locator('[data-factory-workshop] summary').click()
                page.wait_for_function('document.querySelector("[data-design-source]").options.length===2')
                page.locator('[data-design-save]').click()
                assert 'silhouette' in page.locator('[data-design-status]').inner_text()
                assert page.evaluate('savedCalls.length')==0
                page.locator('[data-design-shape=heart]').click()
                page.locator('[data-design-name]').fill('Harbor heart')
                page.locator('[data-design-depth]').fill('43')
                page.locator('[data-design-behavior]').select_option('pickup')
                page.wait_for_function('document.querySelector("[data-design-preview]").dataset.ready==="true"')
                assert page.locator('[data-design-preview] canvas').count()==1
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Workshop must fit phone width'
                page.locator('[data-design-save]').click()
                page.wait_for_function('document.querySelector("[data-design-status]").textContent.includes("Connection lost")')
                page.locator('[data-design-save]').click()
                page.wait_for_function('document.querySelector("[data-design-status]").textContent.includes("Registration unavailable")')
                assert 'prototype is saved' in page.locator('[data-design-status]').inner_text()
                assert page.locator('[data-design-save]').inner_text()=='Retry blueprint registration'
                page.locator('[data-design-save]').click()
                page.wait_for_function('document.querySelector("[data-design-status]").textContent.includes("Blueprint selected")')
                calls=page.evaluate('savedCalls')
                assert len(calls)==2 and calls[0]['body']['requestId']==calls[1]['body']['requestId']
                assert calls[0]['csrf']=='fixture-csrf'
                drawing=calls[0]['body']
                assert drawing['name']=='Harbor heart' and drawing['format']=='svg'
                assert drawing['thumbnailUrl'].startswith('data:image/png;base64,')
                assert drawing['configuration']['depth']==43 and drawing['configuration']['behavior']=='pickup'
                assert len(drawing['configuration']['collisionMask'])==256
                assert any(drawing['configuration']['collisionMask'])
                assert page.evaluate('registerCalls.length')==2 and page.evaluate('Object.keys(records).length')==1
                page.locator('[data-design-source]').select_option('owned-phone')
                assert not page.locator('[data-design-drawing]').is_visible()
                assert page.locator('[data-design-scale]').is_visible()
                page.locator('[data-design-scale]').fill('1.7')
                page.locator('[data-design-orientation]').fill('35')
                page.wait_for_function('document.querySelector("[data-design-preview]").dataset.ready==="true"')
                assert page.locator('[data-design-preview] canvas').count()==1
                page.locator('[data-design-save]').click()
                page.wait_for_function('savedCalls.length===3&&!document.querySelector("[data-design-save]").disabled')
                model=page.evaluate('savedCalls[2].body')
                assert model['format']=='glb' and model['modelUrl'].endswith('/public/models/props/HOLOPHONE_SILVER.glb')
                assert model['configuration']['scale']==1.7 and model['configuration']['orientation']==35
                assert model['requestId']!=drawing['requestId']
                page.evaluate('workshop.dispose()')
                assert page.locator('#designer canvas').count()==0
                assert not errors, errors
                print(('Mobile' if mobile else 'Desktop')+' factory designer passed: live preview, owned GLB, exact PNG, retry-safe save/registration, disposal')
                context.close()
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
