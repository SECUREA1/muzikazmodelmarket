"""Stockyard inventory uses real pile sources and parked-truck cargo booking."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,740),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/quarry-stockyard-ui.html?environment=surface-mine-quarry&quarryMaterial=sand');page.wait_for_selector('body[data-ready=true]',state='attached')
   panel=page.get_by_role('region',name='Quarry operations',exact=True);panel.wait_for(state='visible');page.wait_for_function("document.querySelector('.quarry-hud').textContent.includes('Booked warehouse')")
   assert panel.get_by_label('Material',exact=True).input_value()=='sand';assert panel.get_by_label('Stockpile source',exact=True).input_value()=='prepared-sand:sand'
   assert 'Loose piles 450.0 m³ · In machines 22.0 m³ · Processing buffers 7.0 m³' in panel.get_by_label('Stockyard inventory totals',exact=True).inner_text()
   panel.get_by_text('Material inventory by location',exact=True).click();sand=panel.get_by_label('Screened garden sand inventory',exact=True);assert 'Ground 80.0 · Machines 14.0' in sand.inner_text();assert 'Buffer 4.0 · Warehouse 9.0 m³' in sand.inner_text()
   panel.get_by_label('Stockpile source',exact=True).select_option('raw-gravel:gravel');assert 'Raw feed must be screened' in panel.inner_text();assert panel.get_by_role('button',name='Take raw feed to the screen',exact=True).is_disabled()
   assert not page.evaluate("commands.some(c=>c.operation==='reserve-stock')")
   panel.get_by_label('Stockpile source',exact=True).select_option('prepared-sand:sand');panel.get_by_label('Material quantity',exact=True).fill('3');panel.get_by_role('button',name='Book stock from the selected pile',exact=True).click()
   page.wait_for_function("ledger.maps[0].stock['quarry:sand']===12&&commands.some(c=>c.operation==='book-stock')")
   reserve=page.evaluate("commands.find(c=>c.operation==='reserve-stock')");assert reserve['patchId']=='prepared-sand';assert reserve['material']=='sand';assert reserve['quantity']==3
   assert 'Ground 77.0 · Machines 14.0' in sand.inner_text();assert 'Buffer 4.0 · Warehouse 12.0 m³' in sand.inner_text();assert panel.get_by_role('button',name='Book cargo from my truck',exact=True).is_disabled()
   page.evaluate('boardTruck(false,true,0)');assert panel.get_by_role('button',name='Book cargo from my truck',exact=True).is_disabled();assert 'X 196 · Z 174' in panel.get_by_label('Truck booking requirements',exact=True).inner_text()
   page.evaluate('boardTruck(true,false,0)');assert panel.get_by_role('button',name='Book cargo from my truck',exact=True).is_disabled()
   page.evaluate('boardTruck(true,true,.5)');assert panel.get_by_role('button',name='Book cargo from my truck',exact=True).is_disabled()
   page.evaluate('boardTruck(true,true,0)');panel.get_by_label('Material quantity',exact=True).fill('2');panel.get_by_role('button',name='Book cargo from my truck',exact=True).click();page.wait_for_function("ledger.maps[0].stock['quarry:sand']===14")
   cargo=page.evaluate("commands.filter(c=>c.operation==='reserve-stock').at(-1)");assert cargo['source']=='vehicle';assert cargo['material']=='sand';assert cargo['quantity']==2
   assert 'Ground 77.0 · Machines 12.0' in sand.inner_text();assert 'Buffer 4.0 · Warehouse 14.0 m³' in sand.inner_text()
   panel.get_by_role('button',name='Hide quarry panel',exact=True).click();assert 'game-panel-collapsed' in panel.get_attribute('class');page.evaluate('refreshStock()');assert 'game-panel-collapsed' in panel.get_attribute('class');panel.get_by_role('button',name='Show quarry panel',exact=True).click()
   panel.get_by_role('button',name='Close',exact=True).click();page.evaluate("window.releaseCount=releases.length;for(let i=0;i<10;i++)refreshStock()");assert page.evaluate('releases.length===releaseCount'),'Closed panels must not release held walking input on snapshots.'
   page.get_by_role('button',name='Quarry operations and deed materials',exact=True).click();panel.wait_for(state='visible');assert not errors,errors
   if width==390:page.screenshot(path='/tmp/quarry-stockyard-ui-mobile.png')
   page.close()
  browser.close();print('Stockyard inventory, typed pile selection, raw-feed restrictions, parked-truck booking, live quantities and persistent Hide/Show passed at 320/390/844/1280 px.')
finally:server.shutdown()
