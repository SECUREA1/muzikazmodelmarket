import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const transportSource=await readFile(new URL('../public/js/api-connection.js',import.meta.url),'utf8');
const pageSource=await readFile(new URL('../script.js',import.meta.url),'utf8');
const loginSource=pageSource.slice(pageSource.indexOf('function initBottleLogin() {'),pageSource.indexOf('\nmarketQualityToggle?.addEventListener',pageSource.indexOf('function initBottleLogin() {')));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const flush=async()=>{for(let n=0;n<4;n++)await new Promise(resolve=>setImmediate(resolve));};

function fixture({quota=false,firstLoginUnavailable=false}={}){
 const values=new Map(),temporary=new Map(),requests=[],events=[];
 const localStorage={getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key),setItem:(key,value)=>{if(quota)throw Error('Quota exceeded');values.set(key,String(value));}};
 const sessionStorage={getItem:key=>temporary.get(key)||null,setItem:(key,value)=>temporary.set(key,String(value)),removeItem:key=>temporary.delete(key)};
 const status={textContent:''},workspace={dataset:{locked:'true'},scrollIntoView(){}};
 const button={disabled:false};let submit,logins=0;
 const form={reportValidity:()=>true,querySelector:()=>button,elements:{password:{value:'test-password'}},addEventListener:(name,handler)=>{if(name==='submit')submit=handler;}};
 const attributes=new Map();
 const document={
  documentElement:{getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>attributes.set(key,value)},
  querySelector:selector=>({'#bottle-login-form':form,'#member-locked-content':workspace,'#bottle-login-status':status})[selector],
  getElementById:()=>workspace
 };
 const window={URL,Promise,setTimeout,clearTimeout,localStorage,sessionStorage,location:{href:'https://members.test/members.html',origin:'https://members.test',protocol:'https:',hash:''},dispatchEvent:event=>events.push(event.type),fetch:async(url,options)=>{
  requests.push({url,...options});
  if(url.endsWith('/api/health'))return json({success:true,service:'muzikaz-member-market'});
  if(url.endsWith('/api/market/session'))return json({success:false,code:'SESSION_REQUIRED',message:'Sign in'},401);
  if(url.endsWith('/api/access/free-play')){
   logins++;if(firstLoginUnavailable&&logins===1)return new Response('<html>Deploying</html>',{status:503,headers:{'content-type':'text/html'}});
   return json({success:true,data:{account:{accountId:'member-123',username:'MemberOne'},owner_id:'account:member-123',csrfToken:'csrf-123',sessionToken:'member-bearer'}});
  }
  return json({success:true,data:{walletId:'account:member-123',items:[]}});
 }};
 const context={window,document,localStorage,sessionStorage,location:window.location,Event:class{constructor(type){this.type=type;}},FormData:class{get(key){return key==='username'?'MemberOne':'test-password';}},normalizeMemberEmail:value=>String(value).trim().toLowerCase(),currentMemberEmail:''};
 vm.runInNewContext(transportSource,context);
 vm.runInNewContext(loginSource+'\ninitBottleLogin();',context);
 return {window,status,workspace,button,events,temporary,requests,submit:()=>submit({preventDefault(){}})};
}

test('successful member login unlocks the page and authenticates inventory despite a full local cache',async()=>{
 const f=fixture({quota:true});await flush();
 await f.submit();
 assert.equal(f.workspace.dataset.locked,'false');assert.match(f.status.textContent,/Signed in as memberone/);assert.equal(f.button.disabled,false);
 assert.ok(f.events.includes('muzikaz:member-ready'));
 assert.equal(f.temporary.get('muzikazAccountSessionToken'),'member-bearer');
 const response=await f.window.MUZIKAZ_API.fetch('/api/wallet/state');
 assert.equal((await f.window.MUZIKAZ_API.readJson(response)).data.walletId,'account:member-123');
 assert.equal(new Headers(f.requests.at(-1).headers).get('authorization'),'Bearer member-bearer');
 const login=f.requests.find(request=>request.url.endsWith('/api/access/free-play'));
 assert.deepEqual(JSON.parse(login.body),{username:'MemberOne',password:'test-password'});
});

test('a deployment response leaves login usable and a later explicit attempt restores the member account',async()=>{
 const f=fixture({firstLoginUnavailable:true});await flush();
 await f.submit();
 assert.equal(f.workspace.dataset.locked,'true');assert.equal(f.button.disabled,false);
 assert.match(f.status.textContent,/member service is temporarily unavailable/);assert.doesNotMatch(f.status.textContent,/Unexpected token|JSON\.parse|<html>/);
 assert.equal(f.requests.filter(request=>request.url.endsWith('/api/access/free-play')).length,1,'never silently repeat credentials');
 await f.submit();
 assert.equal(f.workspace.dataset.locked,'false');assert.match(f.status.textContent,/Signed in as memberone/);
 assert.equal(f.requests.filter(request=>request.url.endsWith('/api/access/free-play')).length,2);
});
