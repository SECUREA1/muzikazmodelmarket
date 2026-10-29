import {mkdir,readFile,rename,writeFile,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

const empty = () => ({chatMessages:[],supportMessages:[]});

// Conversation history is ancillary runtime state. Preserve damaged bytes for
// recovery without preventing the account, model and game endpoints from booting.
export async function readRuntimeMessages(file,{warn=message=>console.warn(message)}={}) {
  let bytes;
  try { bytes=await readFile(file,'utf8'); }
  catch(error) { if(error.code==='ENOENT')return empty();throw error; }
  let value;
  try {
    value=JSON.parse(bytes);
    if(!value||typeof value!=='object'||Array.isArray(value))throw new SyntaxError('Invalid conversation history object.');
  } catch(error) {
    if(!(error instanceof SyntaxError))throw error;
    const recoveryFile=file+'.corrupt-'+Date.now()+'-'+randomUUID()+'.quarantine';
    await rename(file,recoveryFile);
    warn('[Server runtime] Damaged conversation history was preserved at '+recoveryFile+'. Starting with empty chat history.');
    return empty();
  }
  return {
    chatMessages:Array.isArray(value.chatMessages)?value.chatMessages.slice(-100):[],
    supportMessages:Array.isArray(value.supportMessages)?value.supportMessages.slice(-500):[]
  };
}

export async function writeRuntimeMessages(file,value) {
  await mkdir(dirname(file),{recursive:true});
  const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try {
    await writeFile(temporary,JSON.stringify(value),{mode:0o600});
    await rename(temporary,file);
  } finally { await rm(temporary,{force:true}).catch(()=>{}); }
}
