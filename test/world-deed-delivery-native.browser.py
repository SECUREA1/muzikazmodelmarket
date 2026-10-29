"""Standalone hockey/arcade deed rooms retain their delivery scene metadata."""
import functools
import http.server
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
maps=[{'id':'member-hockey','name':'Deeded hockey room','memberPlot':True,'deedId':'deed-hockey','game':'hockey','hockey':{'enabled':True},'builderScene':{'layout':'hockey-arena','gameplay':{'hockey':{'enabled':True}},'objects':[]}},
      {'id':'member-arcade','name':'Deeded arcade room','memberPlot':True,'deedId':'deed-arcade','game':'arcade','arcade':{'enabled':['billiards']},'builderScene':{'layout':'arcade-park','gameplay':{'arcade':{'enabled':['billiards']}},'objects':[]}}]
requests=[]
def api(route):
    parsed=urlparse(route.request.url)
    if parsed.path=='/api/health': route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
    elif parsed.path=='/api/environments': route.fulfill(json={'success':True,'data':maps})
    elif parsed.path=='/api/world-supply/deliveries':
        map_id=parse_qs(parsed.query)['mapId'][0];requests.append(map_id)
        route.fulfill(json={'success':True,'data':{'serverTime':100000,'mapId':map_id,'dropoffs':[{'id':'drop-'+map_id,'deedId':'deed-'+map_id,'kind':'doorstep','mapId':map_id,'position':{'x':3,'y':0,'z':3}}],'routes':[{'id':'route-'+map_id,'mapId':map_id,'revision':'v1','status':'ready','truckWaypoints':[{'x':0,'y':0,'z':0},{'x':3,'y':0,'z':0}],'courierWaypoints':[{'x':3,'y':0,'z':0},{'x':3,'y':0,'z':3}]}],'vehicles':[{'id':'truck-'+map_id,'mapId':map_id,'phase':'loading','position':{'x':0,'y':0,'z':0},'rotationY':0}],'couriers':[]}})
    else: route.fulfill(status=404,json={'success':False,'message':'Unused native fixture API'})
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':390,'height':844});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('**/api/**',api)
            page.goto(base+'/hockey.html?environment=member-hockey&mode=solo',wait_until='domcontentloaded')
            page.wait_for_function('window.MuzikazHockey?.snapshot().deedDelivery?.dropoffs === 1 && MuzikazHockey.snapshot().deedDelivery.vehicles[0]?.loaded',timeout=45000)
            hockey=page.evaluate('MuzikazHockey.snapshot().deedDelivery')
            assert hockey['mapId']=='member-hockey' and hockey['routes']==1
            page.goto(base+'/arcade.html?environment=member-arcade&mode=solo',wait_until='domcontentloaded')
            page.wait_for_function('window.NeonJunction?.snapshot().deedDelivery?.dropoffs === 1 && NeonJunction.snapshot().deedDelivery.vehicles[0]?.loaded',timeout=45000)
            arcade=page.evaluate('NeonJunction.snapshot().deedDelivery')
            assert arcade['mapId']=='member-arcade' and arcade['routes']==1
            assert 'member-hockey' in requests and 'member-arcade' in requests
            assert not errors,errors
            print('Standalone native deed delivery: hockey and arcade preserve member metadata, request their own projection and render native trucks/dropoffs.')
        finally: browser.close()
finally: server.shutdown()
