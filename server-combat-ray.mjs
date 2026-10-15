// Distance to the near face of a box along a normalized authoritative aim ray.
export function rayBoxDistance(origin,ray,min,max){
 let near=0,far=Infinity;
 for(const [i,key]of ['x','y','z'].entries()){
  if(Math.abs(ray[i])<1e-9){if(origin[key]<min[key]||origin[key]>max[key])return null;continue;}
  let a=(min[key]-origin[key])/ray[i],b=(max[key]-origin[key])/ray[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;
 }
 return far>0?near:null;
}
