"""Store and public product links discover addresses only on explicit use."""
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
addresses=[{'id':'address:town:shop-one','mapId':'town','mapName':'Crew Plaza','objectId':'shop-one','kind':'store','name':'First store','addressLine':'10 Market Street','owner':{'name':'Public world facility','kind':'public'},'canOrder':True,'dropoff':{'position':{'x':10,'y':0,'z':8}}},{'id':'address:town:shop-two','mapId':'town','mapName':'Crew Plaza','objectId':'shop-two','kind':'store','name':'Maya’s store <North>','addressLine':'12 Market Street','owner':{'name':'Maya','kind':'member'},'canOrder':True,'dropoff':{'position':{'x':12,'y':0,'z':8}}}]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':1100,'height':900});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/README.md');page.set_content('<main id="address"></main>')
            page.evaluate('''async({base,addresses})=>{
              const {mountStoreAddressUI}=await import(base+'/public/js/store-address-ui.js');
              window.addressRequests=[];window.addressRows=addresses;
              window.addressUI=mountStoreAddressUI(document.querySelector('#address'),{inventory:{api:async path=>{addressRequests.push(path);return {mapId:'town',addresses:structuredClone(addressRows)};}},getEnvironment:()=>({id:'town',name:'Crew Plaza'})});
            }''',{'base':base,'addresses':addresses})
            assert page.evaluate('addressRequests.length')==0
            page.evaluate("addressUI.prepare({mapId:'town',storeObjectId:'shop-two'})")
            assert page.evaluate('addressRequests.length')==0
            page.evaluate("addressUI.open({mapId:'town',storeObjectId:'shop-two'})")
            expect(page.locator('[data-store-address-select]')).to_have_value('address:town:shop-two')
            expect(page.locator('[data-store-address-facts]')).to_contain_text('12 Market Street')
            expect(page.locator('[data-store-address-facts]')).to_contain_text('Maya')
            assert page.locator('[data-store-address-facts] North').count()==0
            link=page.locator('[data-store-address-order]');expect(link).to_have_text('Ship supplies to this store')
            assert 'supplyAddress=address%3Atown%3Ashop-two' in link.get_attribute('href')
            assert page.evaluate('addressRequests')==['/api/world-supply/addresses?mapId=town']
            page.evaluate("addressRows[1].owner.name='New current holder';addressRows[1].dropoff.position.x=22")
            page.locator('[data-store-address-refresh]').click()
            expect(page.locator('[data-store-address-facts]')).to_contain_text('New current holder')
            expect(page.locator('[data-store-address-facts]')).to_contain_text('22.0, 0.0, 8.0')
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('#address').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            page.evaluate('addressUI.close()');count=page.evaluate('addressRequests.length');page.wait_for_timeout(150)
            assert page.evaluate('addressRequests.length')==count
            page.evaluate('addressUI.dispose()')

            page.evaluate('''async base=>{
              const {mountStoreAddressUI}=await import(base+'/public/js/store-address-ui.js');
              window.pagedAddressCalls=[];window.pagedAddresses=Array.from({length:510},(_,i)=>({id:'address:town:shop-'+i,mapId:'town',mapName:'Crew Plaza',objectId:'shop-'+i,name:'Store '+i,addressLine:i+' Delivery Way',kind:'store',owner:{name:'Recipient '+i,kind:'member'},canOrder:true}));
              const api=async path=>{
                pagedAddressCalls.push(path);const params=new URL(path,base).searchParams,id=params.get('addressId');
                if(id)return {mapId:'town',addresses:pagedAddresses.filter(address=>address.id===id),total:1,offset:0,hasMore:false,nextOffset:null};
                const offset=Number(params.get('offset')||0),page=pagedAddresses.slice(offset,offset+200),end=offset+page.length;
                return {mapId:'town',addresses:page,total:pagedAddresses.length,offset,hasMore:end<pagedAddresses.length,nextOffset:end<pagedAddresses.length?end:null};
              };
              window.pagedAddressUI=mountStoreAddressUI(document.querySelector('#address'),{inventory:{api},getEnvironment:()=>({id:'town',name:'Crew Plaza'})});
              pagedAddressUI.open({mapId:'town',storeObjectId:'shop-509'});
            }''',base)
            expect(page.locator('#address [data-store-address-select]')).to_have_value('address:town:shop-509')
            expect(page.locator('#address [data-store-address-facts]')).to_contain_text('Recipient 509')
            assert page.evaluate('pagedAddressCalls.length')==2,'Only the first page and exact looked-at address are requested.'
            page.wait_for_timeout(150);assert page.evaluate('pagedAddressCalls.length')==2
            expect(page.locator('#address [data-store-address-count]')).to_contain_text('201 of 510 addresses loaded')
            page.locator('#address [data-store-address-more]').click()
            expect(page.locator('#address [data-store-address-count]')).to_contain_text('401 of 510 addresses loaded')
            assert page.evaluate('pagedAddressCalls.at(-1)')=='/api/world-supply/addresses?mapId=town&offset=200&limit=200'
            expect(page.locator('#address [data-store-address-select]')).to_have_value('address:town:shop-509')
            page.locator('#address [data-store-address-more]').click()
            expect(page.locator('#address [data-store-address-more]')).to_be_hidden()
            page.locator('#address [data-store-address-search]').fill('Store 508')
            page.locator('#address [data-store-address-select]').select_option('address:town:shop-508')
            assert 'supplyAddress=address%3Atown%3Ashop-508' in page.locator('#address [data-store-address-order]').get_attribute('href')
            assert page.evaluate('pagedAddressCalls.length')==4
            page.locator('#address [data-store-address-refresh]').click()
            expect(page.locator('#address [data-store-address-select]')).to_have_value('address:town:shop-508')
            expect(page.locator('#address [data-store-address-facts]')).to_contain_text('Recipient 508')
            assert page.evaluate('pagedAddressCalls.length')==6,'Refreshing preserves the player’s chosen off-page recipient without scanning every page.'
            assert page.locator('#address').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            page.evaluate('pagedAddressUI.dispose()')

            page.evaluate('''async({base,addresses})=>{
              const [{createGameMarketplace},{SharedGameInventory}]=await Promise.all([import(base+'/public/js/in-game-market.js'),import(base+'/public/js/shared-game-inventory.js')]);
              window.marketAddressRequests=[];window.MUZIKAZ_API={fetch:async path=>{
                marketAddressRequests.push(path);let data;
                if(path==='/api/market/session')data={owner_id:'account:sender',account:{accountId:'sender'},csrfToken:'token'};
                else if(path.startsWith('/api/economy'))data={balance:1000,items:[]};
                else if(path==='/api/wallet/state')data={tokens:{MZK:1000},items:[]};
                else if(path.startsWith('/api/world-supply/addresses'))data={mapId:'town',addresses};
                else throw Error('Unexpected market request '+path);
                return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
              }};
              window.addressMarket=createGameMarketplace({inventory:new SharedGameInventory({getMapId:()=> 'town'}),getEnvironment:()=>({id:'town',name:'Crew Plaza'})});
              addressMarket.open('upgrades',{storeObjectId:'shop-two',mapId:'town'});
            }''',{'base':base,'addresses':addresses})
            market=page.locator('#game-market-popup')
            expect(market.locator('[data-store-address-select]')).to_have_value('address:town:shop-two')
            expect(market.locator('[data-store-address-facts]')).to_contain_text('Maya')
            assert page.evaluate('marketAddressRequests.filter(path=>path.startsWith("/api/world-supply/addresses")).length')==1
            page.evaluate('addressMarket.close()')
            count=page.evaluate('marketAddressRequests.length');page.wait_for_timeout(150)
            assert page.evaluate('marketAddressRequests.length')==count

            product={'id':'upgrade:native:chair','source':'upgrade','sku':'native:chair','name':'A real factory chair','priceMzk':25,'factoryProducible':True,'factoryItemId':'native:chair'}
            requests=[]
            def api(route):
                url=route.request.url;requests.append((route.request.method,url))
                if '/api/market/catalog' in url: payload=[product]
                elif '/api/environments' in url: payload=[{'id':'town','name':'Crew Plaza','visibility':'public','playable':True}]
                elif '/api/world-supply/addresses' in url: payload={'mapId':'town','addresses':addresses}
                elif '/api/health' in url:
                    route.fulfill(json={'success':True,'service':'muzikaz-member-market'});return
                else:
                    route.fulfill(status=401,json={'success':False,'message':'Guest browser fixture'});return
                route.fulfill(json={'success':True,'data':payload})
            page.route('**/api/**',api)
            page.goto(base+'/product.html?id=upgrade%3Anative%3Achair',wait_until='domcontentloaded')
            expect(page.locator('[data-product-title]')).to_have_text(product['name'])
            assert not [url for _,url in requests if '/api/world-supply/addresses' in url or '/api/environments' in url]
            page.locator('[data-product-supply] summary').click()
            expect(page.locator('[data-store-address-map] option[value="town"]')).to_have_count(1)
            assert not [url for _,url in requests if '/api/world-supply/addresses' in url]
            page.locator('[data-store-address-map]').select_option('town')
            expect(page.locator('[data-store-address-select] option[value="address:town:shop-two"]')).to_have_count(1)
            page.locator('[data-store-address-select]').select_option('address:town:shop-two')
            href=page.locator('[data-store-address-order]').get_attribute('href')
            assert 'supplyAddress=address%3Atown%3Ashop-two' in href and 'supplyItem=native%3Achair' in href
            assert not [row for row in requests if row[0]!='GET'],requests
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors,errors
            print('Store/public-product address entrypoints: lazy discovery, current recipient, exact building/product links and phone layout passed.')
        finally: browser.close()
finally: server.shutdown()
