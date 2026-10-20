export function mountRoomBuildingToggle({parent,onChange,announce=()=>{}}){
 const root=document.createElement('label');root.className='room-building-toggle';
 const input=document.createElement('input');input.type='checkbox';input.checked=true;
 const text=document.createElement('span');text.textContent='Allow building';root.append(input,text);parent.append(root);
 let busy=false,policy={enabled:true,hostId:null},selfId=null;
 function render(){input.checked=policy.enabled!==false;input.disabled=busy||!policy.hostId||!selfId||policy.hostId!==selfId;root.title=input.disabled?'The room host controls building permissions':'Allow or pause building for everyone in this room';}
 input.addEventListener('change',async()=>{if(busy)return;busy=true;const enabled=input.checked;render();try{await onChange(enabled);}catch(error){announce(error.message);}finally{busy=false;render();}});
 return {root,update(value,id){policy=value||{enabled:true,hostId:null};selfId=id;render();}};
}
