const text=(value,max)=>String(value??'').slice(0,max);
export function cleanDesignerDraft(input){
 if(!input||typeof input!=='object')throw new Error('A design specification is required.');
 if(JSON.stringify(input).length>8000000)throw new Error('This design is too large. Keep saved artwork under 8 MB total.');
 const fields={};for(const key of ['product','character','size','color','printShape','layout','name','number','sleeve','logo','notes'])fields[key]=text(input.fields?.[key],key==='notes'?2000:200);
 const quantity=Number(input.fields?.quantity??input.quantity??1);if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw new Error('Choose a quantity from 1 to 99.');fields.quantity=String(quantity);
 const percent=value=>/^\d{1,3}(?:\.\d+)?%$/.test(String(value))&&Number.parseFloat(value)<=100?String(value):'50%';
 const bounded=(value,min,max,fallback)=>String(Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback)));
 if(Array.isArray(input.uploads)&&input.uploads.length>12)throw new Error('Keep each design to 12 artwork layers or fewer.');
 const uploads=(Array.isArray(input.uploads)?input.uploads:[]).slice(0,12).map((layer,index)=>{const src=String(layer.src||'');if(!/^data:image\/(?:png|jpeg|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(src)&&!/^https:\/\//i.test(src))throw new Error('An artwork layer has an unsupported image source.');return {id:'layer-'+index,name:text(layer.name,180),src,left:percent(layer.left),top:percent(layer.top),zIndex:bounded(layer.zIndex,1,100,10),scale:bounded(layer.scale,.4,2.2,1),rotate:bounded(layer.rotate,-180,180,0),flipX:layer.flipX==='true'?'true':'false',flipY:layer.flipY==='true'?'true':'false'};});
 const placements={};for(const id of ['preview-character','preview-name','preview-number','preview-sleeve'])if(input.placements?.[id])placements[id]={left:percent(input.placements[id].left),top:percent(input.placements[id].top)};
 return {version:1,fields,product:text(input.product,200),character:text(input.character,200),quantity,uploads,placements,savedAt:new Date().toISOString()};
}
