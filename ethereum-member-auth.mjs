import { verifyMessage, getAddress } from 'ethers';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
const invalid = message => Object.assign(new Error(message), {statusCode:401,code:'WALLET_PROOF_REQUIRED'});
export class EthereumMemberAuth {
  constructor(file,{origin='https://muzikazmodelmarket.onrender.com',clock=Date.now}={}){this.file=file;this.origin=new URL(origin).origin;this.clock=clock;this.queue=Promise.resolve();}
  transaction(operation){const task=this.queue.then(async()=>{let records;try{records=JSON.parse(await readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;records=[];}records=records.filter(item=>item.expiresAt>this.clock());const result=await operation(records);await mkdir(dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(records),{mode:0o600});await rename(temp,this.file);return result;});this.queue=task.catch(()=>{});return task;}
  issue(wallet,purpose='login',accountId=''){
    let address;try{address=getAddress(String(wallet||'').toLowerCase()).toLowerCase();}catch{throw Object.assign(new Error('Enter a valid Ethereum address.'),{statusCode:400});}
    if(!['login','attach'].includes(purpose)||(purpose==='attach'&&!accountId))throw invalid('Sign in before linking a wallet.');
    return this.transaction(records=>{if(records.length>=1000)throw Object.assign(new Error('Too many wallet requests. Try again shortly.'),{statusCode:429});const nonce=randomBytes(24).toString('hex'),issuedAt=this.clock(),expiresAt=issuedAt+300000,id=randomUUID();
      const message=`${new URL(this.origin).host} requests your Ethereum signature for MUZIKAZ member ${purpose}.\n\nAddress: ${address}\nURI: ${this.origin}\nPurpose: ${purpose}\nAccount: ${accountId||'Wallet member'}\nNonce: ${nonce}\nIssued At: ${new Date(issuedAt).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}\n\nThis signature signs you in. It does not authorize a payment.`;
      records.push({id,address,purpose,accountId,expiresAt,message});return {challengeId:id,address,message,expiresAt:new Date(expiresAt).toISOString()};});
  }
  verify({challengeId,wallet,signature},purpose='login',accountId=''){
    return this.transaction(records=>{const index=records.findIndex(item=>item.id===challengeId),record=records[index];
      if(!record||record.purpose!==purpose||record.accountId!==accountId||record.address!==String(wallet||'').toLowerCase())throw invalid('Request a new wallet signature for this account.');
      let recovered;try{recovered=verifyMessage(record.message,String(signature||'')).toLowerCase();}catch{throw invalid('The wallet signature is invalid.');}
      if(recovered!==record.address)throw invalid('The signature does not match this Ethereum address.');
      records.splice(index,1);return record.address;});
  }
}
