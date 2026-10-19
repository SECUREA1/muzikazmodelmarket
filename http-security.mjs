// Keep the existing inline scripts, CDN modules, WebGL and wallet popups working.
// This policy restricts embedding, base URLs and form destinations; it is not a
// substitute for escaping user content or a strict script-src policy.
const firstParty="https://muzikaz.com https://www.muzikaz.com https://muzikazmodelmarket.onrender.com";
export function httpSecurityHeaders({secure=false,production=false}={}){
 const headers={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(self), microphone=(self), geolocation=(self), usb=(), serial=()',
  'Content-Security-Policy':`base-uri 'self'; object-src 'none'; frame-ancestors 'self' ${firstParty}; form-action 'self' ${firstParty} mailto:`
 };
 if(production||secure)headers['Strict-Transport-Security']='max-age=15552000';
 return headers;
}
export function applyHttpSecurity(req,res,options={}){
 for(const [name,value]of Object.entries(httpSecurityHeaders({...options,secure:Boolean(req.socket?.encrypted)})))res.setHeader(name,value);
}
