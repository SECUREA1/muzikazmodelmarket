"""Native map guides use the gesture-unlocked audio output after playable entry."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import io, json, math, os, struct, wave

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
stream=io.BytesIO()
with wave.open(stream,'wb') as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000)
    wav.writeframes(b''.join(struct.pack('<h',int(math.sin(i*2*math.pi*220/24000)*1000)) for i in range(6000)))
wave_bytes=stream.getvalue()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        for name,path,ready,start in [
            ('Hockey','hockey.html?mode=solo','window.MuzikazHockey&&MuzikazHockey.snapshot().ready','#start'),
            ('Arcade','arcade.html?environment=neon-junction&mode=solo','window.NeonJunction&&NeonJunction.ready','#camera-toggle'),
            ('Island','tropical-island.html','window.islandAdventure&&islandAdventure.ready','#start-button')
        ]:
            page=browser.new_page(viewport={'width':1100,'height':780});errors=[];spoken=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.add_init_script('''window.voiceStarts=[];window.voiceEnds=0;const original=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const source=original.call(this),start=source.start;source.start=(...args)=>{window.voiceStarts.push(this.state);return start.apply(source,args);};source.addEventListener('ended',()=>window.voiceEnds++);return source;};''')
            def api(route):
                url=route.request.url.split('?')[0]
                if url.endswith('/api/health'):route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
                elif url.endswith('/api/player/settings'):route.fulfill(json={'data':{'settings':{}}})
                elif url.endswith('/api/speech'):
                    spoken.append(route.request.post_data_json['text']);route.fulfill(status=200,content_type='audio/wav',body=wave_bytes)
                elif url.endswith('/api/environments'):
                    route.fulfill(json={'success':True,'data':json.loads(Path('public/models/environments/environments.json').read_text())})
                else:route.fulfill(status=404,json={'error':'Offline fixture'})
            page.route('**/api/**',api)
            page.goto(f'http://127.0.0.1:{server.server_port}/'+path,wait_until='domcontentloaded')
            page.wait_for_function(ready,timeout=60000)
            assert not spoken,(name,'guide spoke before control gesture')
            page.locator(start).click()
            try: page.wait_for_function('voiceEnds>=1',timeout=15000)
            except Exception:
                print(name, {'errors':errors,'spoken':spoken,'audio':page.evaluate('async()=>({starts:voiceStarts,ends:voiceEnds,status:document.querySelector("#status")?.textContent,controls:document.querySelector(".native-world-guide-audio")?.textContent,voice:(await import("/public/js/quest-conversation-voice.js")).questConversationVoice().state,speech:(await import("/public/js/neural-character-speech.js")).gameSpeech().state,snapshot:window.MuzikazHockey?.snapshot()})')},flush=True)
                raise
            assert page.evaluate('voiceStarts')==['running'],(name,page.evaluate('voiceStarts'))
            assert len(spoken)==1,(name,spoken)
            assert 'Welcome to' in spoken[0],(name,spoken)
            page.keyboard.press('w');page.keyboard.press('w')
            page.wait_for_timeout(200)
            assert len(spoken)==1,(name,'movement repeated introduction')
            assert not errors,(name,errors)
            page.close()
        browser.close()
    print('Hockey, arcade and island guides wait for readiness and gesture, decode WAV into a running AudioContext, complete playback and avoid repeated input announcements.')
finally:server.shutdown()
