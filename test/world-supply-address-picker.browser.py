"""Bounded address discovery and reviewed recipient changes in the factory UI."""
import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 950})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/README.md')
            page.set_content('<!doctype html><main id="stage"></main>')
            page.evaluate('''async base => {
              const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js');
              window.addressCalls=[];window.addressGets=[];
              window.addressRows=Array.from({length:510},(_,i)=>({id:'address:city:store-'+i,mapId:'city',mapName:'Receiving city',objectId:'store-'+i,name:'Store '+i,addressLine:i+' Market Road',position:{x:i,y:0,z:2},dropoff:{position:{x:i,y:0,z:2}},owner:{kind:'member',name:'Original receiver'},canOrder:true,revision:'reviewed-v1'}));
              window.addressWorkspace={catalog:[{id:'native:crate',name:'Supply crate',buildAssetId:'crate',priceMzk:10}],worldStock:{'native:crate':1000},factoryStock:{},maps:[{id:'world',name:'World stock',stock:{}},{id:'city',name:'Receiving city',stock:{}}],addresses:addressRows.slice(0,200),addressPage:{mapId:'city',total:510,offset:0,hasMore:true,nextOffset:200},production:[],shipments:[],orders:[],routes:[{id:'gulf-gateway',name:'Sea supply route'}],shippingMaps:[{id:'hormuz-shipping',name:'Hormuz'}],serverTime:Date.now()};
              const inventory={session:async()=>({csrfToken:'address-csrf'}),api:async(path,options)=>{
                if(!options){
                  addressGets.push(path);
                  if(path.includes('/addresses?')){const query=new URL(path,location.href).searchParams;if(query.has('addressId'))return {addresses:structuredClone(addressRows.filter(row=>row.id===query.get('addressId')))};const offset=Number(query.get('offset'))||0;return {addresses:structuredClone(addressRows.slice(offset,offset+200)),total:510,offset,hasMore:offset+200<510,nextOffset:offset+200<510?offset+200:null};}
                  return structuredClone(addressWorkspace);
                }
                const body=JSON.parse(options.body);addressCalls.push({path,body});
                if(path.endsWith('/quote'))return {priceMzk:10,unitPriceMzk:10,buildMs:2000};
                return {id:'address-order',productionId:'address-production',message:'Saved'};
              }};
              window.addressUI=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory});
              addressUI.update({players:{sender:{}}},'sender',{id:'city',name:'Receiving city'});
              addressUI.open();
            }''', base)
            panel = page.locator('#world-supply-panel')
            expect(panel.locator('[data-address] option')).to_have_count(201)
            expect(panel.locator('[data-address-more]')).to_be_visible()
            assert not page.evaluate('addressGets.some(path=>path.includes("/addresses?"))'), 'Workspace polling cannot eagerly load extra address pages.'
            panel.locator('[data-address-more]').click()
            expect(panel.locator('[data-address] option')).to_have_count(401)
            expect(panel.locator('[data-address-more]')).to_be_visible()
            assert page.evaluate('addressGets.filter(path=>path.includes("/addresses?")).length') == 1
            panel.locator('[data-address-more]').click()
            expect(panel.locator('[data-address] option')).to_have_count(501)
            expect(panel.locator('[data-address-more]')).to_be_hidden()
            expect(panel.locator('[data-address-status]')).to_contain_text('Refine your search.')
            assert page.evaluate('addressGets.filter(path=>path.includes("/addresses?")).length') == 2
            assert page.evaluate('addressGets.some(path=>path.includes("offset=200&limit=200"))')
            panel.locator('[data-address]').select_option('address:city:store-200')
            page.evaluate('addressUI.refresh()')
            expect(panel.locator('[data-address]')).to_have_value('address:city:store-200')
            expect(panel.locator('[data-address-detail]')).to_contain_text('Store 200')
            panel.locator('[data-quantity]').fill('1')
            page.evaluate('Object.assign(addressRows[200],{revision:"moved-v2",owner:{kind:"member",name:"New receiver"},position:{x:205,y:0,z:2}})')
            panel.locator('[data-quote]').click()
            expect(panel.locator('[data-status]')).to_contain_text('This delivery address changed.')
            expect(panel.locator('[data-address-detail]')).to_contain_text('New receiver')
            expect(panel.locator('[data-address-order]')).to_be_disabled()
            assert not page.evaluate('addressCalls.some(call=>call.path.endsWith("/quote"))'), 'A changed recipient must be reviewed before repricing.'
            panel.locator('[data-quote]').click()
            expect(panel.locator('[data-address-order]')).to_be_enabled()
            panel.locator('[data-address-order]').click()
            page.wait_for_function('addressCalls.some(call=>call.path.endsWith("/order-address"))')
            order = page.evaluate('addressCalls.find(call=>call.path.endsWith("/order-address")).body')
            assert order['addressId'] == 'address:city:store-200' and order['expectedAddressRevision'] == 'moved-v2'
            panel.locator('[data-source]').select_option('world')
            page.evaluate('Object.assign(addressRows[200],{revision:"resold-v3",owner:{kind:"member",name:"Current receiver"}})')
            panel.locator('[data-dispatch]').click()
            expect(panel.locator('[data-status]')).to_contain_text('This delivery address changed.')
            expect(panel.locator('[data-address-detail]')).to_contain_text('Current receiver')
            assert not page.evaluate('addressCalls.some(call=>call.path.endsWith("/dispatch"))')
            panel.locator('[data-dispatch]').click()
            page.wait_for_function('addressCalls.some(call=>call.path.endsWith("/dispatch"))')
            dispatch = page.evaluate('addressCalls.find(call=>call.path.endsWith("/dispatch")).body')
            assert dispatch['addressId'] == order['addressId'] and dispatch['expectedAddressRevision'] == 'resold-v3'
            page.set_viewport_size({'width': 390, 'height': 844})
            expect(panel.locator('[data-address]')).to_have_value(order['addressId'])
            assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            assert not errors, errors
            print('Factory addresses: explicit 200-item paging, selection retention, changed-recipient review, revision payloads and mobile layout passed.')
        finally:
            browser.close()
finally:
    server.shutdown()
