/** Live code and documents revalidate; large immutable models retain caching. */
export function staticAssetCacheControl(extension){
 const type=String(extension).toLowerCase();
 if(type==='.glb'||type==='.usdz')return 'public, max-age=31536000, immutable';
 if(['.html','.htm','.js','.mjs','.css','.json'].includes(type))return 'no-cache';
 return 'public, max-age=3600';
}
