export async function loadSvgGameTexture({THREE,markup,size,timeoutMs=5000}) {
 const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
 const image=new Image();let timer;
 try {
  await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('Game artwork took too long to decode. Select Try again.')),timeoutMs);
   image.onload=resolve;image.onerror=()=>reject(Error('Game SVG artwork could not be decoded. Select Try again.'));image.src=url;
  });
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const context=canvas.getContext('2d');if(!context)throw Error('Game artwork requires a Canvas 2D context.');
  context.drawImage(image,0,0,size,size);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
 }finally{clearTimeout(timer);image.onload=image.onerror=null;URL.revokeObjectURL(url);}
}
