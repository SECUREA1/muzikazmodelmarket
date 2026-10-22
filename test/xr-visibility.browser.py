"""Unsupported or pending WebXR controls cannot cover ordinary game buttons."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/xr-visibility-test.html':
            body = b'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.house-stage{height:844px;width:390px}#ordinary-game-control{position:fixed;top:12px;left:18px;min-width:44px;width:44px;height:44px;padding:0}</style><main class="house-stage"></main>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


def mount(page, capability):
    page.evaluate('''async capability=>{
        const stage=document.querySelector('main');stage.innerHTML='<button id="ordinary-game-control" aria-label="Ordinary game control">Map</button>';
        window.gameClicks=0;stage.querySelector('button').onclick=()=>gameClicks++;
        window.xrCalls={entered:0,requested:0,exited:0};
        const listeners=new Map();let currentSession=null;
        const session={requestReferenceSpace:async()=>({}),end:async()=>{
            renderer.xr.isPresenting=false;for(const run of listeners.get('sessionend')||[])run();
        }};
        const navigatorXR=capability==='absent'?undefined:{
            isSessionSupported:()=>new Promise((resolve,reject)=>{window.finishXRSupport=resolve;window.rejectXRSupport=reject;}),
            requestSession:async()=>{xrCalls.requested++;return session;}
        };
        Object.defineProperty(navigator,'xr',{configurable:true,value:navigatorXR});
        const THREE=await import('/public/vendor/three/three.module.min.js');
        const {mountXRGameControls}=await import('/public/js/xr-game-controls.js');
        const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),controllers=[new THREE.Group(),new THREE.Group()];
        const renderer={xr:{isPresenting:false,setReferenceSpaceType(){},getController:index=>controllers[index],
            addEventListener:(name,run)=>listeners.set(name,[...(listeners.get(name)||[]),run]),
            setSession:async value=>{currentSession=value;renderer.xr.isPresenting=true;for(const run of listeners.get('sessionstart')||[])run();},
            getSession:()=>currentSession}};
        window.xrControls=mountXRGameControls({renderer,scene,camera,parent:stage,onEnter:()=>xrCalls.entered++,onExit:()=>xrCalls.exited++});
    }''', capability)


def assert_not_covering(page, label):
    button, help = page.locator('.xr-enter-button'), page.locator('.xr-controls-help')
    assert button.is_hidden() and help.is_hidden(), label
    assert button.is_disabled(), label
    state = page.evaluate('''()=>{
        const button=document.querySelector('.xr-enter-button'),ordinary=document.querySelector('#ordinary-game-control'),r=ordinary.getBoundingClientRect();
        ordinary.focus();button.focus();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {focused:document.activeElement===ordinary,hit:hit===ordinary||ordinary.contains(hit),width:button.getBoundingClientRect().width};
    }''')
    assert state == {'focused': True, 'hit': True, 'width': 0}, (label, state)
    page.get_by_role('button', name='Ordinary game control', exact=True).tap()
    assert page.evaluate('gameClicks') == 1, label


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for global_last in [False, True]:
            page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/xr-visibility-test.html')
            styles = ['/styles.css', '/public/assets/rad-tox-controller.css']
            for url in reversed(styles) if global_last else styles:
                page.add_style_tag(url=url)

            mount(page, 'pending')
            assert_not_covering(page, 'Support check pending')
            mount(page, 'unsupported')
            page.evaluate('finishXRSupport(false)')
            page.wait_for_function('document.querySelector(".xr-enter-button").textContent==="VR headset unavailable"')
            assert_not_covering(page, 'Headset unsupported')
            mount(page, 'rejected')
            page.evaluate('rejectXRSupport(new Error("Capability check unavailable"))')
            page.wait_for_function('document.querySelector(".xr-enter-button").textContent==="VR unavailable"')
            assert_not_covering(page, 'Support check rejected')
            mount(page, 'absent')
            assert_not_covering(page, 'WebXR absent')

            mount(page, 'supported')
            page.evaluate('finishXRSupport(true)')
            button = page.get_by_role('button', name='Enter VR', exact=True)
            button.wait_for(state='visible')
            assert button.is_enabled() and page.locator('.xr-controls-help').is_visible()
            button.tap()
            page.get_by_role('button', name='Exit VR', exact=True).wait_for(state='visible')
            assert page.evaluate('xrControls.presenting&&xrCalls.entered===1&&xrCalls.requested===1')
            page.get_by_role('button', name='Exit VR', exact=True).tap()
            page.get_by_role('button', name='Enter VR', exact=True).wait_for(state='visible')
            assert page.evaluate('!xrControls.presenting&&xrCalls.exited===1')
            assert not errors, errors
            page.close()
        browser.close()
    print('Pending, absent, unsupported and rejected XR controls stay hidden and do not intercept gameplay; supported VR enter/exit works in either stylesheet order.')
finally:
    server.shutdown()
    server.server_close()
