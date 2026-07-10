async function parseResponse(response){const json=await response.json().catch(()=>({success:false,message:'Invalid JSON response'})); if(!response.ok||!json.success) throw new Error(json.message||`Request failed (${response.status})`); return json.data;}
export async function fetchPublishedModels(){return parseResponse(await fetch('/api/models',{headers:{Accept:'application/json'}}));}
export async function fetchPublishedModel(id){return parseResponse(await fetch(`/api/models/${encodeURIComponent(id)}`,{headers:{Accept:'application/json'}}));}
export async function uploadModelFiles(formData){return parseResponse(await fetch('/api/models/upload',{method:'POST',body:formData}));}
export async function publishModel(metadata){return parseResponse(await fetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(metadata)}));}
