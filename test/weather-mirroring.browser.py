"""Device location -> current forecast -> actual outdoor sky, through the shipped UI."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
import json
import time

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html'
setup = '''async()=>{
    const THREE=await import('/public/vendor/three/three.module.min.js');
    const {createOutdoorScenery}=await import('/public/js/environments/outdoor-scenery.js');
    const {mountWeatherMirroring}=await import('/public/js/weather-mirroring-ui.js');
    document.body.replaceChildren();document.body.style.margin='8px';
    const css=document.createElement('link');css.rel='stylesheet';css.href='/public/assets/game-menus.css';document.head.append(css);
    const scene=new THREE.Scene(),scenery=createOutdoorScenery({scene});scenery.setEnvironment({id:'public-commons'});
    window.fixture={scene,scenery,mirror:mountWeatherMirroring({parent:document.body,onWeather:weather=>scenery.setLocalWeather(weather)})};
}'''
def reach(button, width):
    button.wait_for(state='visible')
    box = button.bounding_box()
    assert box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width, box

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        for width in [320, 390, 1280]:
            context=browser.new_context(viewport={'width':width,'height':844},has_touch=width<760,
                geolocation={'latitude':51.5074,'longitude':-0.1278},permissions=['geolocation'])
            page=context.new_page();errors=[];requests=[];mode={'offline':False,'code':61}
            page.on('pageerror',lambda error:errors.append(str(error)))
            def forecast(route):
                requests.append(route.request.url)
                if mode['offline']:
                    route.fulfill(status=503,body='Offline')
                else:
                    route.fulfill(content_type='application/json',body=json.dumps({'current':{'time':int(time.time()),'weather_code':mode['code'],'temperature_2m':12.4,'wind_speed_10m':14.8}}))
            page.route('https://api.open-meteo.com/**',forecast)
            page.goto(url);page.evaluate(setup)
            allow=page.get_by_role('button',name='Allow weather mirroring',exact=True);reach(allow,width)
            assert not requests,'No location or weather request until Allow is tapped'
            allow.tap() if width<760 else allow.click()
            page.get_by_role('status').filter(has_text='Mirroring your local weather: Rain').wait_for()
            assert '12°C' in page.get_by_role('status').inner_text()
            assert 'latitude=51.51' in requests[-1] and 'longitude=-0.13' in requests[-1]
            assert page.evaluate("fixture.scenery.weather")=='rain'
            assert page.evaluate("fixture.scene.getObjectByName('WEATHER_SKY_SPHERE').material.uniforms.rain.value")==1
            # Permission and the choice survive a reload; no second Allow step.
            page.reload();page.evaluate(setup)
            page.get_by_role('status').filter(has_text='Mirroring your local weather: Rain').wait_for()
            # A moving phone supplies a new location on a manual refresh.
            context.set_geolocation({'latitude':40.7128,'longitude':-74.006})
            mode['code']=73
            page.get_by_role('button',name='Refresh local weather',exact=True).click()
            page.get_by_role('status').filter(has_text='Mirroring your local weather: Snow').wait_for()
            assert 'latitude=40.71' in requests[-1] and 'longitude=-74.01' in requests[-1]
            assert page.evaluate('fixture.scenery.weather')=='snow'
            # A failed forecast provides a useful retry instead of a stuck toggle.
            mode['offline']=True;page.get_by_role('button',name='Refresh local weather',exact=True).click()
            retry=page.get_by_role('button',name='Try weather mirroring again',exact=True);retry.wait_for()
            assert 'Check your connection' in page.get_by_role('status').inner_text()
            mode['offline']=False;retry.click()
            page.get_by_role('status').filter(has_text='Mirroring your local weather: Snow').wait_for()
            stop=page.get_by_role('button',name='Stop weather mirroring',exact=True);reach(stop,width);stop.click()
            assert page.evaluate('fixture.scenery.weather')=='clear'
            page.reload();page.evaluate(setup)
            page.get_by_role('button',name='Allow weather mirroring',exact=True).wait_for()
            assert page.evaluate("localStorage.getItem('muzikazWeatherMirroring')")=='false'
            assert not errors,errors
            context.close()
        # Native geolocation denial must explain how to recover, with no API call.
        context=browser.new_context();page=context.new_page()
        page.goto(url);page.evaluate("localStorage.setItem('muzikazWeatherMirroring','true')");page.evaluate(setup)
        # A saved choice with no permission must still wait for the Allow tap.
        page.get_by_role('button',name='Allow weather mirroring',exact=True).wait_for()
        page.get_by_role('button',name='Allow weather mirroring',exact=True).click()
        page.get_by_role('status').filter(has_text='Location is blocked').wait_for()
        assert page.get_by_role('button',name='Try weather mirroring again',exact=True).is_enabled()
        context.close();browser.close()
    print('Weather mirroring passed at 320/390/1280px: opt in, native geolocation, weather population, moving location, persistence, stop, network retry and permission denial. Forecast responses were mocked.')
finally:
    server.shutdown()
