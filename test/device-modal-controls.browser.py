"""Direct device/deed modals neutralize holds and return gameplay focus."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':390, 'height':844})
        page.set_default_timeout(6000)
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.evaluate('''async()=>{
            document.body.innerHTML='<main class="house-stage"><canvas tabindex="0" aria-label="Game world"></canvas><button id="open-device">Use device</button></main>';
            window.releases=[];window.held=new Set(['w','fire']);document.addEventListener('muzikaz:release-game-input',event=>{releases.push(event.detail.reason);held.clear();});
            window.THREE=await import('/public/vendor/three/three.module.min.js');
            const {mountInteractiveDevices}=await import('/public/js/interactive-device-ui.js');
            window.deviceSend=async()=>({});window.deviceUpload=async()=>({});window.messages=[];window.commands=[];
            window.devices=mountInteractiveDevices({THREE,stage:document.querySelector('main'),getRoots:()=>[],getPosition:()=>({x:0,y:0,z:0}),send:(...args)=>{commands.push(args);return deviceSend(...args);},market(){},upload:(...args)=>deviceUpload(...args),announce:message=>messages.push(message)});
            window.deviceState={serverTime:1000,players:{me:{}},actors:{notice:{active:true,position:{x:0,y:0,z:0}},notice2:{active:true,position:{x:1,y:0,z:0}},screen:{active:true,position:{x:2,y:0,z:0}}},devices:{notice:{kind:'board',name:'Community Noticeboard',text:'Shared notice',author:'Guide',revision:1},notice2:{kind:'board',name:'Community Noticeboard',text:'Second notice',author:'Guide',revision:1},screen:{kind:'video',name:'Community Video Player',revision:1}}};
            devices.snapshot(deviceState,'me');
            document.querySelector('#open-device').onclick=()=>devices.openDemo('community-noticeboard');
        }''')
        page.get_by_role('button',name='Use device',exact=True).click()
        page.locator('.interactive-device-dialog').wait_for(state='visible')
        assert page.evaluate('releases') == ['device-panel-open']
        assert page.evaluate('held.size') == 0
        page.get_by_role('button',name='Try local demo',exact=True).click()
        draft=page.get_by_label('Local notice preview',exact=True)
        draft.fill('A local draft')
        draft.evaluate('node=>node.setSelectionRange(2,7)')
        page.evaluate("for(let index=0;index<12;index++)devices.snapshot(deviceState,'me')")
        assert draft.evaluate('node=>document.activeElement===node&&node.value==="A local draft"&&node.selectionStart===2&&node.selectionEnd===7')
        assert page.evaluate('releases.length') == 1, 'Snapshots must not neutralize fresh input.'
        page.get_by_role('button',name='Back to scene',exact=True).click()
        page.wait_for_function('document.activeElement?.matches("main>canvas")')
        assert page.evaluate('releases') == ['device-panel-open','device-panel-close']

        page.evaluate("devices.open('notice','board')")
        page.locator('.interactive-device-dialog').wait_for(state='visible')
        page.evaluate("devices.open('notice','board')")
        page.wait_for_timeout(30)
        assert page.evaluate('releases.length') == 3, 'A live machine refresh must not repeat open/close releases.'
        page.evaluate('''()=>{
            window.other=document.createElement('dialog');other.innerHTML='<input aria-label="New modal input">';document.body.append(other);
            document.querySelector('.interactive-device-dialog').close();other.showModal();other.querySelector('input').focus();
        }''')
        page.wait_for_timeout(30)
        assert page.get_by_label('New modal input',exact=True).evaluate('node=>node===document.activeElement'), 'A closing device must not take focus from a replacement modal.'
        assert page.evaluate('releases.length') == 4
        page.evaluate('other.close();other.remove();document.querySelector("#open-device").focus();devices.open("notice","board")')
        page.get_by_role('button',name='Write a notice',exact=True).click()
        page.evaluate('()=>{deviceSend=()=>new Promise(resolve=>window.resolveOldDevice=resolve);}')
        page.get_by_role('button',name='Post to this space',exact=True).click()
        page.evaluate('''()=>{
            devices.reset();window.resetKeptFocus=document.activeElement.id==='open-device';
            devices.snapshot(deviceState,'me');devices.open('notice','board');
        }''')
        assert page.evaluate('resetKeptFocus'), 'A connection/world reset must not force focus into a stopped scene.'
        page.wait_for_timeout(30)
        page.get_by_role('button',name='Write a notice',exact=True).click()
        page.evaluate('()=>{deviceSend=()=>new Promise(resolve=>window.resolveNewDevice=resolve);}')
        post=page.get_by_role('button',name='Post to this space',exact=True)
        post.click()
        page.evaluate('resolveOldDevice(false)')
        page.wait_for_timeout(30)
        assert post.is_disabled(), 'An old device request must not unlock a replacement request.'
        assert page.evaluate('messages') == [], 'An obsolete failure must not publish into the new world.'
        page.evaluate('resolveNewDevice({})')
        page.wait_for_function('!document.querySelector(".machine-page:not([hidden]) button").disabled')
        page.evaluate('()=>{deviceSend=()=>new Promise(resolve=>window.resolveReplacedDevice=resolve);}')
        post.click()
        page.evaluate("devices.open('notice2','board')")
        page.get_by_role('button',name='Write a notice',exact=True).click()
        page.evaluate('()=>{deviceSend=()=>new Promise(resolve=>window.resolveReplacementDevice=resolve);}')
        post.click()
        page.evaluate('resolveReplacedDevice(false)')
        page.wait_for_timeout(30)
        assert post.is_disabled(), 'Replacing the active machine must clear the old busy owner without letting it unlock the new one.'
        page.evaluate('resolveReplacementDevice({})')
        page.wait_for_function('!document.querySelector(".machine-page:not([hidden]) button").disabled')

        page.evaluate("devices.open('screen','video')")
        page.get_by_role('button',name='Upload media',exact=True).click()
        page.locator('.machine-page input[type=file]').set_input_files({'name':'clip.mp4','mimeType':'video/mp4','buffer':b'local fixture'})
        page.evaluate('()=>{deviceUpload=()=>new Promise(resolve=>window.resolveUpload=resolve);window.beforeUploadCommands=commands.length;}')
        page.get_by_role('button',name='Upload & share',exact=True).click()
        page.evaluate("devices.reset();devices.snapshot(deviceState,'me');devices.open('notice','board')")
        page.get_by_role('button',name='Write a notice',exact=True).click()
        page.get_by_label('Community notice',exact=True).fill('New machine draft')
        page.evaluate("resolveUpload({url:'https://example.com/clip.mp4'})")
        page.wait_for_timeout(30)
        assert page.evaluate('commands.length===beforeUploadCommands'), 'An old upload must not enqueue media into a replacement machine.'
        assert page.get_by_label('Community notice',exact=True).input_value() == 'New machine draft'
        page.evaluate('devices.dispose()')

        page.evaluate('''async()=>{
            window.claims=[];window.landProof=async()=>({csrfToken:'proof'});window.landClaim=async()=>({playUrl:'/model-explorer.html?environment=owned'});
            window.MUZIKAZ_API={fetch:async(path,options={})=>{let data;if(path==='/api/market/session')data=await landProof();else if(path==='/api/land/claims'){claims.push(JSON.parse(options.body));data=await landClaim();}else data={id:path.split('/').at(-1),name:'Test lot',size:20,priceMzk:5000,priceUsd:50,mapId:'garden',position:{x:0,y:0,z:0},claimed:false,visitUrl:'/model-explorer.html'};return {ok:true,json:async()=>({data})};}};
            const {mountLandSale}=await import('/public/js/land-sale-ui.js');window.land=mountLandSale(document.querySelector('main'));document.querySelector('main>canvas').focus();held.add('w');await land.open('test-lot');
        }''')
        assert page.evaluate('held.size') == 0
        assert page.evaluate('releases.at(-1)') == 'land-panel-open'
        page.keyboard.press('Escape')
        page.wait_for_function('document.activeElement?.matches("main>canvas")')
        assert page.evaluate('releases.at(-1)') == 'land-panel-close'
        page.evaluate("()=>{land.open('old-lot');landProof=()=>new Promise(resolve=>window.resolveOldProof=resolve);}")
        buy=page.get_by_role('button',name='Buy deed · 5,000 MZK',exact=True)
        buy.click()
        page.keyboard.press('Escape')
        page.evaluate("()=>{land.open('new-lot');landProof=()=>new Promise(resolve=>window.resolveNewProof=resolve);landClaim=()=>new Promise(resolve=>window.resolveClaim=resolve);}")
        buy.click()
        page.evaluate("resolveOldProof({csrfToken:'old-proof'})")
        page.wait_for_timeout(30)
        assert buy.is_disabled() and page.evaluate('claims.length') == 0, 'An obsolete proof must neither purchase nor unlock a replacement purchase.'
        page.evaluate("resolveNewProof({csrfToken:'new-proof'})")
        page.wait_for_function('claims.length===1')
        assert buy.is_disabled()
        assert page.evaluate("claims[0].worldId==='new-lot'")
        page.evaluate("resolveClaim({playUrl:'/model-explorer.html?environment=owned'})")
        page.get_by_role('link',name='Enter your deeded plot',exact=True).wait_for()
        page.keyboard.press('Escape')
        page.evaluate("()=>{document.querySelector('#open-device').focus();land.open('reset-lot');landProof=()=>new Promise(resolve=>window.resolveResetProof=resolve);}")
        buy.click()
        page.evaluate('land.reset()')
        assert page.get_by_role('dialog',name='Review land deed',exact=True).is_hidden()
        assert page.evaluate("document.activeElement.id==='open-device'")
        page.evaluate("resolveResetProof({csrfToken:'obsolete'})")
        page.wait_for_timeout(30)
        assert page.evaluate('claims.length') == 1, 'Teardown must cancel a purchase still waiting for its proof.'
        page.evaluate('land.dispose()')
        assert not errors,errors
        browser.close()
    print('Device demo/live modal release, stable drafts/snapshots, close focus, replacement modal priority and deed Escape recovery pass.')
finally:
    server.shutdown()
