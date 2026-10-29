import {readJsonResponse} from './json-response.js';
import {resolveModelAssetUrl} from './model-asset-url.js';

function apiBase(){
  const browser=globalThis.window||globalThis;
  return browser.MUZIKAZ_API?.base||browser.MUZIKAZ_API_BASE||globalThis.document?.documentElement?.dataset?.apiBase||browser.location?.origin||'http://localhost';
}
// Kept as a live compatibility export. Requests resolve the selected service
// when used, after discovery has had a chance to choose the persistent API.
export let API_BASE=apiBase();
export function apiUrl(path){
  API_BASE=apiBase();
  return globalThis.window?.MUZIKAZ_API?.url?.(path)||new URL(path,API_BASE+'/').href;
}
export function absoluteUrl(value){return value?resolveModelAssetUrl(value):'';}

function storedValue(key){
  const browser=globalThis.window||globalThis;
  try{const value=browser.localStorage?.getItem(key);if(value)return value;}catch{}
  try{return browser.sessionStorage?.getItem(key)||'';}catch{return '';}
}
function adminHeaders(){const token=storedValue('muzikazAdminToken');return token?{'x-admin-token':token}:{};}
function landUploadHeaders(){
  const access=globalThis.window?.MUZIKAZLandAccess;
  if(!access)throw new Error('Backpack access is still loading. Wait a moment and try again.');
  return {...access.uploadHeaders(),'x-user-id':storedValue('muzikazUserId')||'demo-user','x-user-name':storedValue('muzikazBottleMemberEmail')||'MUZIKAZ Creator',...adminHeaders()};
}
export async function requestModelApi(path,options={}){
  const api=globalThis.window?.MUZIKAZ_API;
  if(api?.fetch)return api.fetch(path,options);
  if(api?.ready)await api.ready;
  return (globalThis.window?.fetch||globalThis.fetch)(apiUrl(path),{credentials:'include',cache:'no-store',...options});
}
export async function parseResponse(response){
  const json=await readJsonResponse(response,{label:'The model server'});
  if(!response.ok||json.success===false)throw Object.assign(new Error(json.message||json.error||`Model request failed (${response.status})`),{status:response.status,code:json.code});
  return json.data??json;
}
export async function fetchPublishedModels({signal}={}){
  const payload=await parseResponse(await requestModelApi('/api/models',{headers:{Accept:'application/json'},cache:'no-store',signal}));
  if(Array.isArray(payload))return payload;
  for(const key of ['avatars','models','items'])if(Array.isArray(payload?.[key]))return payload[key];
  return [];
}
export async function fetchPublishedModel(id){return parseResponse(await requestModelApi(`/api/models/${encodeURIComponent(id)}`,{headers:{Accept:'application/json'},cache:'no-store'}));}
export async function uploadModelFiles(formData){return parseResponse(await requestModelApi('/api/models/upload',{method:'POST',headers:landUploadHeaders(),body:formData}));}
export async function uploadEnvironment(formData){return parseResponse(await requestModelApi('/api/environments/upload',{method:'POST',headers:landUploadHeaders(),body:formData}));}
export async function publishModel(metadata){return parseResponse(await requestModelApi('/api/models',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',...adminHeaders()},body:JSON.stringify(metadata)}));}
