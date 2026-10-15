// Visuals follow server actors; no local movement, damage, or target selection.
export function createSharedEnemyVisual({THREE,actor,resources}){
 const root=new THREE.Group();root.userData.serverRadTox=true;
        const color=actor.kind==='ghost'?0x39cfff:actor.kind==='brain'?0xff42ad:actor.kind==='boss'?0xff6326:0xa8ff24;
        if(actor.kind==='snake') {
          for(let i=0;i<6;i++) {
            const segment=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.2}));
            segment.position.set(Math.sin(i*.8)*.12,.18,i*.18);root.add(segment);
          }
        } else {
          const bubble=new THREE.Mesh(new THREE.SphereGeometry(actor.kind==='boss'?.85:.42,12,10),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.4,transparent:true,opacity:.12,depthWrite:false}));
          bubble.position.y=1;root.add(bubble);
          const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:actor.kind==='brain'?resources.brain:actor.kind==='ghost'?resources.ghost:resources.glow.map,color:0xffffff,transparent:true,depthWrite:false,toneMapped:false}));
          sprite.renderOrder=2;sprite.position.y=1;sprite.scale.setScalar(actor.kind==='boss'?2.5:1.3);root.add(sprite);
          if(actor.kind==='toxic'){const warning=new THREE.Sprite(resources.warning.clone());warning.position.set(0,1.15,.04);warning.scale.setScalar(.48);root.add(warning);}
        }
 return root;
}
