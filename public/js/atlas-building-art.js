export function atlasDestinationPath(place){
 const label=`${place.mapId||place.id||''} ${place.name||''}`;
 if(/pixel.?peak|ski|alpine/i.test(label))return 'M6 86L38 30L54 54L76 12L114 86ZM62 40L76 12L90 40L77 34ZM20 86V68H48V86M26 68L34 58L43 68';
 if(/marina|dock|yacht|harbou?r/i.test(label))return 'M10 64H108L96 82H28ZM32 64V46H86V64M48 46V32H72V46M60 32V12M8 90Q20 82 32 90T56 90T80 90T110 90';
 if(/airport|airfield|runway/i.test(label))return 'M54 8H66V40L108 62V72L66 60V80L82 89V96L60 89L38 96V89L54 80V60L12 72V62L54 40Z';
 if(/basketball/i.test(label))return 'M18 16H102V90H18ZM18 53H102M48 53A12 12 0 1 0 72 53A12 12 0 1 0 48 53M42 16V36H78V16M42 90V70H78V90';
 return atlasBuildingPath(place.kind);
}
export function atlasBuildingPath(kind){
 if(kind==='district'||kind==='hub')return 'M10 84V40H28V20H46V48H60V8H82V34H100V84ZM20 48V58M36 28V38M68 18V28M88 44V54M46 84V64H64V84';
 if(kind==='deed')return 'M8 48L56 10L104 48V86H68V58H44V86H8ZM18 50V78H34V52M78 52H94V70H78Z';
 if(kind==='saved-map')return 'M8 86V28H36V10H78V28H104V86ZM20 40H34V54H20ZM48 28H64V42H48ZM78 40H94V54H78ZM44 86V64H68V86';
 return 'M12 86V20H100V86ZM24 34H40V48H24ZM72 34H88V48H72ZM44 86V60H68V86';
}
export function atlasPortalRoute(place){return [...new Set(['public-commons',place.districtId,place.mapId].filter(Boolean))];}
export function createAtlasPreview(place,doc=document){
 const ns='http://www.w3.org/2000/svg',root=doc.createElementNS(ns,'svg');root.setAttribute('viewBox','0 0 120 100');root.setAttribute('role','img');root.setAttribute('aria-label',(place.kind==='deed'?'Deed building: ':'Portal building: ')+place.name);root.classList.add('atlas-building-preview');
 const sky=doc.createElementNS(ns,'rect');for(const [key,value]of Object.entries({width:120,height:100,rx:12,fill:'#142a36'}))sky.setAttribute(key,value);root.append(sky);
 const path=doc.createElementNS(ns,'path');for(const [key,value]of Object.entries({d:atlasDestinationPath(place),fill:place.districtColor||'#9cffba',stroke:'#e8fff2','stroke-width':2,'stroke-linejoin':'round'}))path.setAttribute(key,value);root.append(path);
 if(/pixel.?peak|ski|alpine|marina|dock|yacht|harbou?r|airport|airfield|runway|basketball/i.test(`${place.mapId||''} ${place.name||''}`))return root;
 const portal=doc.createElementNS(ns,'ellipse');for(const [key,value]of Object.entries({cx:56,cy:73,rx:10,ry:16,fill:'#0b172a',stroke:'#c8f5ff','stroke-width':3}))portal.setAttribute(key,value);root.append(portal);return root;
}
