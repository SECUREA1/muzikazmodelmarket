const movementKeys=new Set(['w','a','s','d']);
const nonTextInputTypes=new Set(['button','checkbox','color','file','hidden','image','radio','range','reset','submit']);

export function isGameTypingTarget(target){
 return Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
}

// A companion's selector can keep focus after choosing a quest or view. WASD
// resumes play; arrows, Space and Enter still operate the native selector.
// Text fields retain every key so conversations and searches remain editable.
export function shouldResumeCompanionMovement(event){
 if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.isComposing||!movementKeys.has(event.key?.toLowerCase()))return false;
 const control=event.target?.closest?.('select,input');
 return Boolean(control&&!control.disabled&&!control.closest('[hidden],[inert]')&&control.closest('[data-gameplay-blocking="false"]')&&(control.localName==='select'||nonTextInputTypes.has(control.type)));
}
