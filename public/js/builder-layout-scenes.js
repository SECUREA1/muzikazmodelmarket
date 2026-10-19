// These 40 m activity sets belong inside a world, with their own transforms.
const rows=[
 ['hedge-maze','Hedge maze'],['neon-maze','Neon labyrinth'],['dungeon-maze','Dungeon maze'],
 ['vendor-street','Vendor street'],['creator-studios','Creator studios'],['market-square','Market square'],
 ['blacksite','Blacksite compound'],['cargo-yard','Cargo yard'],['neon-arena','Neon arena'],['desert-outpost','Desert outpost'],
 ['mega-mall','Mall scene'],['office-tower','Office scene'],['firing-range','Force training range'],['movie-studio','Movie studio']
];
export const LAYOUT_SCENES=Object.freeze(Object.fromEntries(rows.map(([layout,name])=>['scene-'+layout,Object.freeze({id:'scene-'+layout,layout,name,description:name+' activity scene. Place inside a larger map, then move, rotate or scale independently.',dimensions:[40,7,40]})])));
export const SCENE_SOURCE_IDS=Object.freeze(Object.fromEntries(Object.values(LAYOUT_SCENES).map(item=>[item.layout,item.id])));
export const LAYOUT_SCENE_INFO=Object.freeze(Object.fromEntries(Object.values(LAYOUT_SCENES).map(item=>[item.id,[item.name,item.description,item.dimensions]])));
export function isLayoutSceneObject(object={}){return Boolean(LAYOUT_SCENES[object.asset?.buildAssetId||object.modelId]);}
