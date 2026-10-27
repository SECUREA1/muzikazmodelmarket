"""Clown sound controls preserve gameplay, captions and global audio preferences."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width in [900, 390]:
            page = browser.new_page(viewport={'width': width, 'height': 850}, has_touch=width == 390)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/clown-funhouse-ui.html')
            page.wait_for_function('window.ready')
            page.evaluate("setup('welcome');publish(1)")
            page.evaluate("(()=>{const toolbar=document.createElement('div');toolbar.className='game-display-flow-views';toolbar.style.cssText='position:absolute;top:8px;right:8px;z-index:27';toolbar.innerHTML='<button aria-label=\"Open map markers\" style=\"width:44px;height:44px\">Map</button>';document.querySelector('main').append(toolbar);})()")
            assert page.get_by_role('button',name='Clown audio settings',exact=True).evaluate('(node)=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;}'), 'the sound entry must stay clear of the global view toolbar'
            page.get_by_role('button', name='Clown audio settings', exact=True).click()
            booth = page.locator('.funhouse-audio-popover')
            booth.wait_for(state='visible')
            assert booth.evaluate('(node)=>{const a=document.querySelector(\".funhouse-audio-toggle\").getBoundingClientRect(),b=node.getBoundingClientRect();return b.bottom<a.top && b.top>=64;}'), 'the popup must leave its sound entry reachable'
            assert not page.evaluate('ui.visible()'), 'audio settings must remain a companion to the playable scene'
            assert booth.get_attribute('data-gameplay-blocking') == 'false'
            assert booth.locator('[data-funhouse-audio-output="music"]').inner_text() == '35%'
            assert booth.evaluate('(node)=>{const r=node.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;}')
            booth.locator('[data-funhouse-audio-volume="music"]').evaluate("node=>{node.value='55';node.dispatchEvent(new Event('input',{bubbles:true}));}")
            assert page.evaluate('audioSettings.musicVolume===55 && audioChanges.at(-1).musicVolume===55')
            booth.locator('[data-funhouse-audio-mute="music"]').click()
            assert booth.locator('[data-funhouse-audio-mute="music"]').get_attribute('aria-pressed') == 'true'
            assert booth.locator('[data-funhouse-audio-preview]').is_disabled()
            booth.locator('[data-funhouse-audio-mute="music"]').click()
            booth.locator('[data-funhouse-audio-preview]').click()
            assert page.evaluate('musicPreviews') == 1

            page.evaluate("ui.receiveAudioCaption({id:'joke',speaker:'The Ringmaster',text:'<b>Your shadow arrived early.</b>',expiresAt:fixtureNow+6000})")
            caption = page.locator('.funhouse-audio-caption')
            assert caption.is_visible()
            assert caption.locator('span').inner_text() == '<b>Your shadow arrived early.</b>'
            assert caption.locator('b').count() == 0, 'caption content must stay literal text'
            booth.locator('[data-funhouse-audio-replay]').click()
            assert page.evaluate('audioReplays') == 1
            booth.locator('[data-funhouse-audio-mute="voice"]').click()
            assert booth.locator('[data-funhouse-audio-replay]').is_disabled()
            booth.locator('[data-funhouse-audio-replay]').dispatch_event('click')
            assert page.evaluate('audioReplays') == 1, 'a muted replay may not bypass the controller through a synthetic click'
            booth.locator('[data-funhouse-audio-mute="voice"]').click()

            page.evaluate('audioPreferences={dialogueMuted:true};ui.update()')
            assert booth.locator('[data-funhouse-audio-replay]').is_disabled()
            assert booth.locator('[data-funhouse-audio-preview]').is_enabled()
            page.evaluate('audioPreferences={effectsMuted:true};ui.update()')
            assert booth.locator('[data-funhouse-audio-replay]').is_enabled()
            assert booth.locator('[data-funhouse-audio-preview]').is_disabled()
            page.evaluate('audioPreferences={masterMuted:true};ui.update()')
            assert 'All game audio is muted' in booth.locator('[data-funhouse-audio-notice]').inner_text()
            assert booth.locator('[data-funhouse-audio-replay]').is_disabled()
            assert booth.locator('[data-funhouse-audio-preview]').is_disabled()
            assert caption.is_visible(), 'captions remain readable when all audio is muted'
            page.evaluate('audioPreferences={};fixtureNow+=6001;ui.update()')
            assert caption.is_hidden()
            assert booth.locator('[data-funhouse-audio-replay]').is_enabled(), 'an expired subtitle does not remove the last-line replay'
            page.keyboard.press('Escape')
            assert booth.is_hidden()

            page.keyboard.press('e')
            panel = page.locator('.funhouse-dialog[open] #clown-funhouse-panel')
            panel.locator('[data-funhouse-audio-details] summary').click()
            assert panel.locator('[data-funhouse-audio-volume="music"]').input_value() == '55'
            assert 'Your shadow arrived early.' in panel.locator('[data-funhouse-audio-last-line]').inner_text()
            assert page.evaluate('commands.length') == 0, 'mix changes never create gameplay or wallet commands'
            page.evaluate("ui.receiveAudioCaption({speaker:'Driver',text:'Honk if you are haunted!',expiresAt:fixtureNow+6000});immersive=true;ui.update()")
            assert booth.is_hidden() and caption.is_hidden(), 'immersive views use their own scene controls and captions'
            page.evaluate("immersive=false;environment={id:'another-world'};ui.update()")
            assert caption.is_hidden() and page.locator('[data-funhouse-audio-open]').is_hidden()
            page.evaluate('ui.dispose()')
            assert page.locator('.funhouse-audio-popover,.funhouse-audio-caption').count() == 0
            assert not errors, errors
            page.close()
        browser.close()
        print('Clown audio controls: independent mix, global mute priority, literal captions, replay, preview, immersive/travel cleanup and mobile fit pass.')
finally:
    server.shutdown()
    server.server_close()
