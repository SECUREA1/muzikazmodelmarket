// Yield between small groups of authored items so loading can paint, cancel,
// receive input and service the connection instead of freezing the page.
export async function prepareGameItems(items,prepare,{current=()=>true,progress=()=>{},yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),batchSize=4}={}){
 for(let index=0;index<items.length;index++){
  if(!current())return false;
  await prepare(items[index],index);
  if((index+1)%batchSize===0||index===items.length-1){progress(index+1,items.length);await yieldTask();}
 }
 return current();
}
