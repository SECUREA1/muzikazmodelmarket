export function muzikazAuthHeaders(){
  const email=localStorage.getItem('muzikazBottleMemberEmail')||localStorage.getItem('muzikazEmail')||'';
  const id=localStorage.getItem('muzikazUserId')||email||'';
  const headers={'Accept':'application/json'};
  if(id) headers['X-User-Id']=id;
  headers['X-User-Role']=localStorage.getItem('muzikazRole')||'owner';
  headers['X-User-Name']=localStorage.getItem('muzikazName')||email||id||'MUZIKAZ Owner';
  if(email) headers['X-User-Email']=email;
  return headers;
}
export async function muzikazApi(path,options={}){
  const base=window.MUZIKAZ_SHARED_AVATAR_API||'';
  const r=await fetch(base+path,{...options,headers:{...muzikazAuthHeaders(),...(options.headers||{})}});
  const j=await r.json().catch(()=>({success:false,message:'API returned an invalid response'}));
  if(!r.ok||j.success===false) throw new Error(j.message||'Request failed');
  return j.data??j;
}
if(typeof window!=='undefined') window.MuzikazAuthApi={muzikazAuthHeaders,muzikazApi};
