"""Verify real Web Audio for queued map guides, travel, mute and replay.

The fixture returns repository-generated voice WAVs for /api/speech. The guide,
voice queue, decoder, gain nodes and browser audio clock use production code.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

root = Path(__file__).resolve().parents[1]
os.chdir(root)
requests = []
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        if self.path != '/api/speech': self.send_error(404); return
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        requests.append(payload)
        data = (root/'public/audio/voices'/f"{payload['voice']}-preview.wav").read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'audio/wav')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try: self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
        page.evaluate('''async()=>{
          const {createNeuralCharacterSpeech,GameSpeechUtterance}=await import('/public/js/neural-character-speech.js');
          const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
          const {createGameplayAnnouncements}=await import('/public/js/gameplay-announcements.js');
          const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;
          const createGain=context.createGain.bind(context);
          context.createGain=()=>{const node=createGain(),connect=node.connect.bind(node);node.connect=target=>{connect(target);if(target===context.destination)connect(analyser);};return node;};
          window.guideContext=context;
          window.speech=createNeuralCharacterSpeech({audioFactory:()=>context,nativeSpeech:{getVoices:()=>[],resume(){},speak(){throw Error('A guide must use generated speech');}},NativeUtterance:null});
          window.voice=createQuestConversationVoice({speech,Utterance:GameSpeechUtterance});
          window.guides=createGameplayAnnouncements({voice});
          window.snapshot={serverTime:100000,players:{p:{health:100,position:{x:0,y:0,z:0},quests:{}}},actors:{}};
          window.arrive=(id,name,extra={})=>guides.update(snapshot,'p',{id,name,...extra});
          window.peak=async(ms=350)=>{const data=new Float32Array(analyser.fftSize);let maximum=0;const until=performance.now()+ms;while(performance.now()<until){analyser.getFloatTimeDomainData(data);for(const n of data)maximum=Math.max(maximum,Math.abs(n));await new Promise(r=>setTimeout(r,20));}return maximum;};
          const start=document.createElement('button');start.textContent='Enter world';start.onclick=()=>guides.unlock();document.body.append(start);
          arrive('commons','Public Commons');
        }''')
        assert page.evaluate('voice.state.pending') == 1
        assert requests == [], 'An introduction must wait for a browser gesture'
        page.get_by_role('button', name='Enter world', exact=True).click()
        page.wait_for_function('speech.speaking || speech.lastError')
        assert page.evaluate('speech.speaking'), page.evaluate('speech.lastError')
        first_peak = page.evaluate('peak()')
        assert first_peak > .0001, first_peak
        assert 'Public Commons' in requests[0]['text']
        first_guide_requests = len(requests)
        page.evaluate("arrive('commons','Public Commons')")
        assert len(requests) == first_guide_requests, 'Unchanged snapshots repeated the map guide'
        page.evaluate("arrive('airport','MUZIKAZ Airport',{airport:{enabled:true}})")
        page.wait_for_function("speech.speaking && speech.status.startsWith('Playing')")
        page.wait_for_function("voice.state.speaking && !speech.pending")
        assert len(requests) > first_guide_requests
        assert 'MUZIKAZ Airport' in requests[first_guide_requests]['text']
        travel_peak = page.evaluate('peak()')
        assert travel_peak > .0001, travel_peak
        page.evaluate('voice.setMuted(true)')
        page.wait_for_timeout(180)
        assert not page.evaluate('speech.speaking || speech.pending')
        assert page.evaluate('peak(150)') < .00001
        page.evaluate('voice.setMuted(false);voice.replay()')
        page.wait_for_function('speech.speaking || speech.lastError')
        assert page.evaluate('speech.speaking'), page.evaluate('speech.lastError')
        replay_peak = page.evaluate('peak()')
        assert replay_peak > .0001, replay_peak
        page.evaluate('voice.dispose();speech.dispose()')
        page.wait_for_function("guideContext.state==='closed'")
        assert not errors, errors
        print(json.dumps({'queuedUntilGesture': True, 'mapTravelSpoke': True, 'muteAndReplay': True,
                          'firstPeak': first_peak, 'travelPeak': travel_peak, 'replayPeak': replay_peak,
                          'generatedRequests': len(requests)}))
        browser.close()
finally:
    server.shutdown()
