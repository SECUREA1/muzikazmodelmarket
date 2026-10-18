const paths={
 portal:'M7 20V7a5 5 0 0 1 10 0v13M5 20h14M10 7h4v10h-4z',
 commons:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18Z',
 district:'M3 21V8h7v13M10 21V3h10v18M6 11v1m0 3v1m8-9h2m-2 4h2m-2 4h2M2 21h20',
 home:'m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
 builder:'m14 4 6 6-3 3-6-6 3-3ZM12 8l-8 8v4h4l8-8M3 21h18',
 city:'m5 9 2-5h10l2 5M3 10h18v8H3zM6 18v3m12-3v3M6 13h2m8 0h2',
 nature:'m12 3-6 7h3l-5 6h6v5h4v-5h6l-5-6h3l-6-7Z',
 close:'m6 6 12 12M18 6 6 18',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',compass:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4 5-3 5-5 3 3-5 5-3Z'
};
export function portalKind(env={}){
 if(env.id==='public-commons')return 'commons';
 if(env.memberPlot||env.deedId)return 'home';
 if(env.id?.startsWith('world-district-'))return 'district';
 if(/urban-|city|driv|dock/i.test([env.id,env.name,env.category].join(' ')))return 'city';
 if(env.source==='custom-builder')return 'builder';
 if(/garden|forest|nature|mountain|park/i.test([env.id,env.name,env.category].join(' ')))return 'nature';
 return 'portal';
}
export function portalIcon(value){const kind=typeof value==='string'?value:portalKind(value);return `<svg class="portal-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[kind]||paths.portal}"/></svg>`;}
const point=(radius,angle)=>{const radians=angle*Math.PI/180;return [50+radius*Math.cos(radians),50+radius*Math.sin(radians)];};
const xy=point=>point.map(n=>n.toFixed(3)).join(' ');
export function portalSector(index){
 const angle=index*60-90,start=angle-28,end=angle+28,outer=47,inner=17,round=2;
 const path=`M ${xy(point(outer,start+round))} A ${outer} ${outer} 0 0 1 ${xy(point(outer,end-round))} Q ${xy(point(outer,end))} ${xy(point(outer-round,end))} L ${xy(point(inner+round,end))} Q ${xy(point(inner,end))} ${xy(point(inner,end-round))} A ${inner} ${inner} 0 0 0 ${xy(point(inner,start+round))} Q ${xy(point(inner,start))} ${xy(point(inner+round,start))} L ${xy(point(outer-round,start))} Q ${xy(point(outer,start))} ${xy(point(outer,start+round))} Z`;
 const [x,y]=point(32,angle);return {path,x,y};
}
