"""Native map guides use the gesture-unlocked audio output after playable entry."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os
from urllib.parse import urlsplit

os.chdir(Path(__file__).resolve().parents[1])
recorded_text={clip['url']:clip['text'] for clip in json.loads(Path('public/audio/voices/world/manifest.json').read_text())['clips']}
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        for name,path,ready,start in [
            ('Hockey','hockey.html?mode=solo','window.MuzikazHockey&&MuzikazHockey.snapshot().ready','#start'),
            ('Arcade','arcade.html?environment=neon-junction&mode=solo','window.NeonJunction&&NeonJunction.ready','#camera-toggle')
        ]:
            page=browser.new_page(viewport={'width':1100,'height':780});errors=[];spoken=[];recordings=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('request',lambda request:recordings.append(urlsplit(request.url).path) if urlsplit(request.url).path.startswith('/public/audio/voices/world/') else None)
            page.add_init_script('''window.voiceStarts=[];window.voiceEnds=0;const original=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const source=original.call(this),start=source.start;source.start=(...args)=>{window.voiceStarts.push(this.state);return start.apply(source,args);};source.addEventListener('ended',()=>window.voiceEnds++);return source;};''')
            def api(route):
                url=route.request.url.split('?')[0]
                if url.endswith('/api/health'):route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
                elif url.endswith('/api/player/settings'):route.fulfill(json={'data':{'settings':{}}})
                elif url.endswith('/api/speech'):
                    spoken.append(route.request.post_data_json['text']);route.fulfill(status=503,json={'code':'SPEECH_UNAVAILABLE','message':'Synthesis is offline in this recording check.'})
                elif url.endswith('/api/environments'):
                    route.fulfill(json={'success':True,'data':json.loads(Path('public/models/environments/environments.json').read_text())})
                else:route.fulfill(status=404,json={'error':'Offline fixture'})
            page.route('**/api/**',api)
            page.goto(f'http://127.0.0.1:{server.server_port}/'+path,wait_until='domcontentloaded')
            page.wait_for_function(ready,timeout=60000)
            assert not spoken and not recordings,(name,'guide spoke before control gesture')
            page.evaluate('async()=>{window.nativeTestSpeech=(await import("/public/js/neural-character-speech.js")).gameSpeech();}')
            page.locator(start).click()
            try: page.wait_for_function('voiceEnds>=1&&!nativeTestSpeech.speaking&&!nativeTestSpeech.pending',timeout=60000)
            except Exception:
                print(name, {'errors':errors,'spoken':spoken,'audio':page.evaluate('async()=>({starts:voiceStarts,ends:voiceEnds,status:document.querySelector("#status")?.textContent,controls:document.querySelector(".native-world-guide-audio")?.textContent,voice:(await import("/public/js/quest-conversation-voice.js")).questConversationVoice().state,speech:(await import("/public/js/neural-character-speech.js")).gameSpeech().state,snapshot:window.MuzikazHockey?.snapshot()})')},flush=True)
                raise
            starts=page.evaluate('voiceStarts')
            assert starts and all(state=='running' for state in starts),(name,starts)
            sentences=[recorded_text[url] for url in recordings]+spoken
            assert len(starts)==len(sentences),(name,starts,sentences)
            assert sum(text.startswith('Welcome to') for text in sentences)==1,(name,sentences)
            assert sentences and sentences[0].startswith('Welcome to'),(name,sentences)
            assert recordings and not spoken,(name,'Authored guide unexpectedly needed live synthesis',spoken)
            guide_requests=len(recordings)
            page.keyboard.press('w');page.keyboard.press('w')
            page.wait_for_timeout(200)
            assert len(recordings)==guide_requests,(name,'movement repeated introduction')
            assert not errors,(name,errors)
            page.close()
        browser.close()
    print('Hockey and arcade guides wait for readiness and gesture, decode each packaged neural sentence into a running AudioContext, complete playback and avoid repeated input announcements. Island entry uses the shared explorer.')
finally:server.shutdown()
