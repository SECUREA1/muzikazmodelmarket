// Nonphysical products (stock, deeds, bundles and scripts) are displayed as
// labeled product cards in 3D/AR, rather than inventing an authored model.
export async function createProductCard(T,item,{signal}={}){
 const root=new T.Group(),geometry=new T.BoxGeometry(.9,1.2,.035),material=new T.MeshStandardMaterial({color:0x142c23,roughness:.85});
 const panel=new T.Mesh(geometry,material);panel.position.y=.6;root.add(panel);root.name=item.name;
 root.userData.productCard={name:item.name,category:item.category,presentation:'product-card'};
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=512;const context=canvas.getContext('2d');
  if(context){
   context.fillStyle='#142c23';context.fillRect(0,0,384,512);context.strokeStyle='#7fb895';context.lineWidth=3;context.strokeRect(16,16,352,480);
   context.fillStyle='#97d9af';context.font='bold 18px sans-serif';context.fillText('MUZIKAZ WORLD',32,55);context.fillStyle='#fff';context.font='bold 27px sans-serif';
   const words=String(item.name||'Product').split(/\s+/);let line='',y=156;
   for(const word of words){if(context.measureText(line+' '+word).width>312&&line){context.fillText(line,32,y);y+=37;line=word;}else line+=(line?' ':'')+word;if(y>300)break;}
   context.fillText(line,32,y);context.font='17px sans-serif';context.fillStyle='#c2dccd';context.fillText(String(item.category||'Product').slice(0,34),32,393);context.fillText('Product card · preview',32,455);
   const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;
   const front=new T.Mesh(new T.PlaneGeometry(.86,1.16),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));front.position.set(0,.6,.019);root.add(front);
  }
 }
 if(signal?.aborted){root.traverse(node=>{node.geometry?.dispose();node.material?.map?.dispose();node.material?.dispose();});throw new DOMException('Preview canceled','AbortError');}
 return root;
}
