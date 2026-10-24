"""Casino and yacht controls discard obsolete requests when their room resets."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.evaluate('''async()=>{
                document.body.innerHTML='<main class="house-stage"><canvas tabindex="0"></canvas></main>';
                const {mountCasinoUI}=await import('/public/js/casino-ui.js');
                window.walletBalance=100;window.balances=[];window.outcomes=[];window.announcements=[];
                window.proofs=[];window.casinoRequests=[];window.paidPosts=[];window.deferProof=true;
                window.casino=mountCasinoUI({stage:document.querySelector('main'),getEnvironment:()=>({id:'muzikaz-casino'}),getPosition:()=>({x:-32,y:0,z:-15}),onBalance:value=>balances.push(value),onOutcome:(station,result)=>outcomes.push(result),announce:value=>announcements.push(value),request:async(path,options)=>{
                    if(path==='/api/casino/state')return {balance:walletBalance,activeRounds:{},history:[],games:[{id:'slots',minBetMzk:1,maxBetMzk:100}]};
                    if(path==='/api/market/session')return deferProof?new Promise((resolve,reject)=>proofs.push({resolve,reject})):{csrfToken:'proof'};
                    paidPosts.push(JSON.parse(options.body));
                    return new Promise((resolve,reject)=>casinoRequests.push({resolve,reject}));
                }});casino.open();
                window.completedRound=(balance,message)=>({balance,message,round:{id:message,game:'slots',phase:'complete',reels:[1,1,1]}});
            }''')
            page.wait_for_function("document.querySelector('[data-wager]')&&!document.querySelector('[data-wager]').disabled")
            page.locator('[data-wager]').click()
            page.wait_for_function('proofs.length===1')
            assert page.evaluate('''()=>{walletBalance=200;casino.reset();return casino.open();}'''), 'A reset must release the obsolete casino busy lock.'
            page.wait_for_function("document.querySelector('[data-casino-balance]').textContent==='200 MZK'&&!document.querySelector('[data-wager]').disabled")
            page.evaluate('proofs[0].resolve({csrfToken:"old-proof"});deferProof=false')
            page.wait_for_timeout(40)
            assert page.evaluate('paidPosts.length') == 0, 'An obsolete proof request must not issue a paid command after reset.'

            page.locator('[data-wager]').click()
            page.wait_for_function('casinoRequests.length===1')
            assert page.evaluate('''()=>{walletBalance=300;casino.reset();return casino.open();}''')
            page.wait_for_function("document.querySelector('[data-casino-balance]').textContent==='300 MZK'&&!document.querySelector('[data-wager]').disabled")
            page.locator('[data-wager]').click()
            page.wait_for_function('casinoRequests.length===2')
            page.evaluate('casinoRequests[0].resolve(completedRound(1,"Obsolete outcome"))')
            page.wait_for_timeout(40)
            assert page.locator('[data-wager]').is_disabled(), 'An obsolete reply must not unlock a newer casino command.'
            assert page.evaluate('outcomes.length===0&&balances.at(-1)===300'), 'Old room outcomes and balances must not replace the new view.'
            page.evaluate('casinoRequests[1].resolve(completedRound(305,"Current outcome"))')
            page.wait_for_function('outcomes.length===1&&balances.at(-1)===305')
            assert page.locator('[data-wager]').is_enabled()

            # Existing ambiguous-response retries keep their idempotency key.
            page.locator('[data-wager]').click()
            page.wait_for_function('casinoRequests.length===3')
            page.evaluate('casinoRequests[2].reject(Error("Response lost"))')
            page.wait_for_function("document.querySelector('[data-casino-message]').textContent==='Response lost'")
            page.locator('[data-wager]').click()
            page.wait_for_function('casinoRequests.length===4')
            assert page.evaluate('paidPosts[2].requestId===paidPosts[3].requestId'), 'A same-context retry must not charge twice.'
            page.evaluate('casinoRequests[3].resolve(completedRound(310,"Recovered outcome"))')
            page.wait_for_function('outcomes.length===2')
            page.evaluate('casino.dispose()')
            assert not page.evaluate('casino.open()'), 'Disposed casino controls cannot reopen.'

            page.evaluate('''async()=>{
                const [{mountYachtGames},THREE]=await Promise.all([import('/public/js/yacht-games-ui.js'),import('/public/vendor/three/three.module.min.js')]);
                window.yachtRoot={userData:{builderObjectId:'yacht'},updateWorldMatrix(){},worldToLocal(point){return point;}};
                window.yachtRequests=[];window.yachtMessages=[];
                window.yacht=mountYachtGames({THREE,stage:document.querySelector('main'),getRoots:()=>[yachtRoot],getActors:()=>({yacht:{id:'yacht',modelId:'harbor-yacht',active:true,boating:{speed:0}}}),getPosition:()=>new THREE.Vector3(2.4,2.5,8),getVehicleId:()=>null,announce:value=>yachtMessages.push(value),send:()=>new Promise((resolve,reject)=>yachtRequests.push({resolve,reject}))});yacht.open();
            }''')
            shot = page.locator('.yacht-game-panel [data-shoot]')
            shot.click()
            page.wait_for_function('yachtRequests.length===1')
            assert page.evaluate('''()=>{yacht.reset();yachtRoot={...yachtRoot,userData:{builderObjectId:'yacht'}};return yacht.open();}''')
            assert shot.is_enabled(), 'A replacement yacht must not retain the old shot busy lock.'
            shot.click()
            page.wait_for_function('yachtRequests.length===2')
            page.evaluate('yachtRequests[0].reject(Error("Obsolete yacht failure"))')
            page.wait_for_timeout(40)
            assert shot.is_disabled(), 'An obsolete yacht reply must not unlock the new shot.'
            assert page.evaluate('yachtMessages.length') == 0
            page.evaluate('yachtRequests[1].resolve({result:{message:"Current shot"}})')
            page.wait_for_function("!document.querySelector('.yacht-game-panel [data-shoot]').disabled")
            page.evaluate('yacht.dispose()')
            assert not page.evaluate('yacht.open()'), 'Disposed yacht controls cannot reopen.'
            assert not errors, errors
            page.close()
        browser.close()
    print('Casino proof/command reset, stale outcome isolation, idempotent retry and yacht replacement input recovery pass at three viewports.')
finally:
    server.shutdown()
