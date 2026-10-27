import {MZK_PER_USD} from './public/js/game-item-pricing.js';
const fail=(message,statusCode)=>{throw Object.assign(new Error(message),{statusCode});};
export function factoryUnitPriceMzk(item){
 const rawPrice=item.priceMzk!==undefined?item.priceMzk:item.priceUsd??item.price;
 const numericPrice=typeof rawPrice==='number'?rawPrice:typeof rawPrice==='string'&&rawPrice.trim()?Number(rawPrice):NaN;
 if(!Number.isFinite(numericPrice)||numericPrice<0||item.priceMzk!==undefined&&!Number.isSafeInteger(numericPrice))fail('The catalog price cannot be used for this production batch.',422);
 const convertedPrice=item.priceMzk!==undefined?numericPrice:Math.round(numericPrice*MZK_PER_USD);
 if(!Number.isSafeInteger(convertedPrice))fail('The catalog price cannot be used for this production batch.',422);
 return Math.max(1,convertedPrice);
}
