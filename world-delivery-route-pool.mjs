import {Worker} from 'node:worker_threads';

/** One lazy geometry worker keeps cold GLB parsing and route searches off the
 * gameplay event loop. Requests share its bounded collision and route caches. */
export class DeliveryRoutePool {
 // The module bootstrap preserves Node's inherited execution/security flags,
 // including environments launched with --input-type, without forwarding
 // process-only flags as an invalid explicit worker execArgv list.
 constructor({maximumPending=32,workerFactory=()=>new Worker(new URL('data:text/javascript,'+encodeURIComponent('await import('+JSON.stringify(new URL('./world-delivery-route-worker.mjs',import.meta.url).href)+');')))}={}){this.maximumPending=maximumPending;this.workerFactory=workerFactory;this.pending=new Map();this.worker=null;this.sequence=0;}
 start(){
  if(this.worker)return this.worker;
  const worker=this.worker=this.workerFactory();worker.unref();
  worker.on('message',message=>{const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.plan);if(!this.pending.size)worker.unref();});
  const failed=error=>{if(this.worker!==worker)return;this.worker=null;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();};
  worker.on('error',failed);worker.on('exit',code=>failed(new Error('Delivery geometry worker stopped ('+code+').')));return worker;
 }
 calculate(input){
  if(this.pending.size>=this.maximumPending)return Promise.reject(new Error('Delivery route calculations are busy. The next update will retry.'));
  const worker=this.start(),id=++this.sequence;worker.ref();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Delivery route calculation timed out. The next update will retry.'));void worker.terminate();},15000);timer.unref();
   this.pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,input});}catch(error){this.pending.delete(id);clearTimeout(timer);reject(error);if(!this.pending.size)worker.unref();}
  });
 }
 async close(){const worker=this.worker;this.worker=null;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Delivery route worker closed.'));}this.pending.clear();if(worker)await worker.terminate();}
}
