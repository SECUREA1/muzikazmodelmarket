const API_BASE = window.MUZIKAZ_API_BASE || document.documentElement.dataset.apiBase || window.location.origin;
console.info('[Live Models] API base:', API_BASE);

function apiUrl(path){return new URL(path, API_BASE).href;}
function absoluteUrl(value){return value ? new URL(value, API_BASE).href : '';}
function landUploadHeaders(){
  const access=window.MUZIKAZLandAccess;
  if(!access) throw new Error('Backpack access is still loading. Wait a moment and try again.');
  return {...access.uploadHeaders(),'x-user-id':localStorage.getItem('muzikazUserId')||'demo-user','x-user-name':localStorage.getItem('muzikazBottleMemberEmail')||'MUZIKAZ Creator','x-admin-token':sessionStorage.getItem('muzikazAdminToken')||''};
}
async function parseResponse(response){
  const json=await response.json().catch(()=>({success:false,message:'Invalid JSON response'}));
  if(!response.ok||json.success===false) throw new Error(json.message||json.error||`Request failed (${response.status})`);
  return json.data ?? json;
}
export {API_BASE,apiUrl,absoluteUrl,parseResponse};
export async function fetchPublishedModels({signal}={}){
  const endpoint=apiUrl('/api/models');
  const response=await fetch(endpoint,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal});
  if(!response.ok) throw new Error(`Published model request failed: ${response.status}`);
  const payload=await parseResponse(response);
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload.avatars)) return payload.avatars;
  if(Array.isArray(payload.models)) return payload.models;
  if(Array.isArray(payload.items)) return payload.items;
  return [];
}
export async function fetchPublishedModel(id){return parseResponse(await fetch(apiUrl(`/api/models/${encodeURIComponent(id)}`),{headers:{Accept:'application/json'},cache:'no-store'}));}
export async function uploadModelFiles(formData){return parseResponse(await fetch(apiUrl('/api/models/upload'),{method:'POST',headers:landUploadHeaders(),body:formData}));}
export async function uploadEnvironment(formData){return parseResponse(await fetch(apiUrl('/api/environments/upload'),{method:'POST',headers:landUploadHeaders(),body:formData}));}
export async function publishModel(metadata){return parseResponse(await fetch(apiUrl('/api/models'),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(metadata)}));}
