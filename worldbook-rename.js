import {referenceOrigin} from './catalog-names.js';
// Rename a book only after verifying the copy. Binding changes are reversible until deletion.
export function validWorldbookName(value) {
 const name=String(value??'').trim();
 if(!name||name.length>120||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('名称不能为空，最长120字，不能使用路径或文件名保留字符');
 return name;
}
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export async function renameWorldbook({oldName,newName,context,helper,worldInfo,read,names}) {
 newName=validWorldbookName(newName);if(newName===oldName)return false;
 if(names.some(n=>n.toLocaleLowerCase()===newName.toLocaleLowerCase()))throw Error('同名世界书已存在，请使用另一个名称');
 if(!names.includes(oldName))throw Error('原世界书已删除，请刷新世界书列表');
 for(const key of ['getGlobalWorldbookNames','rebindGlobalWorldbooks','deleteWorldbook'])if(typeof helper?.[key]!=='function')throw Error('酒馆助手缺少世界书管理接口：'+key);
 const original=await read(oldName);if(!original?.entries||!Object.keys(original.entries).length)throw Error('原世界书内容已失效，请刷新后重试');const replacement=structuredClone(original);if(replacement.name===oldName)replacement.name=newName;
 const globals=helper.getGlobalWorldbookNames(),primary=context.characters.filter(c=>c.data?.extensions?.world===oldName),lore=worldInfo.world_info?.charLore||[],extras=lore.filter(x=>x.extraBooks?.includes(oldName)).map(row=>({row,previous:[...row.extraBooks]}));
 const power=context.powerUserSettings,personas=Object.values(power?.persona_descriptions||{}).filter(x=>x?.lorebook===oldName),activePersona=power?.persona_description_lorebook===oldName,chat=context.chatMetadata?.world_info===oldName;
 const patched=[];let bindings=false,created=false;
 const relinkCard=async(c,name)=>{if(c===context.characters[context.characterId]){if(typeof helper.rebindCharWorldbooks!=='function'||typeof helper.getCharWorldbookNames!=='function')throw Error('酒馆助手缺少当前角色世界书关联接口');const links=helper.getCharWorldbookNames('current');await helper.rebindCharWorldbooks('current',{primary:name,additional:links.additional.map(n=>n===oldName||n===newName?name:n)});c.data.extensions.world=name;return;}const response=await fetch('/api/characters/merge-attributes',{method:'POST',headers:context.getRequestHeaders(),body:JSON.stringify({avatar:c.avatar,data:{extensions:{world:name}}})});if(!response.ok)throw Error('无法更新角色的世界书关联：'+c.name);c.data.extensions.world=name;if(c.world===oldName||c.world===newName)c.world=name;};
 try{
  await context.saveWorldInfo(newName,replacement,true);created=true;
  const saved=await read(newName);if(canonical(saved.entries)!==canonical(replacement.entries))throw Error('新名称保存后的内容不一致，原书保留');
  await context.updateWorldInfoList?.();
  // Primary links only change the book reference; character prompts remain untouched.
  for(const c of primary){await relinkCard(c,newName);patched.push(c);}
  bindings=true;for(const {row,previous}of extras)row.extraBooks=previous.map(n=>n===oldName?newName:n);
  for(const p of personas)p.lorebook=newName;if(activePersona)power.persona_description_lorebook=newName;
  if(chat){context.chatMetadata.world_info=newName;await context.saveMetadata();}
  if(globals.includes(oldName))await helper.rebindGlobalWorldbooks(globals.map(n=>n===oldName?newName:n));
  context.saveSettingsDebounced();
  if(!await helper.deleteWorldbook(oldName))throw Error('原名称删除失败，正在恢复原关联');
 }catch(error){
  let rollback=true;for(const c of patched)try{await relinkCard(c,oldName);}catch{rollback=false;}
  if(bindings){for(const {row,previous}of extras)row.extraBooks=previous;for(const p of personas)p.lorebook=oldName;if(activePersona)power.persona_description_lorebook=oldName;
   try{if(chat){context.chatMetadata.world_info=oldName;await context.saveMetadata();}if(globals.includes(oldName))await helper.rebindGlobalWorldbooks(globals);context.saveSettingsDebounced();}catch{rollback=false;}}
  if(created&&rollback)try{await helper.deleteWorldbook(newName);}catch{rollback=false;}
  throw Error(error.message+(rollback?'；原世界书和关联已保留':'；部分关联未恢复，请保留两本书并检查关联'));
 }
 await context.updateWorldInfoList?.();return true;
}

export function remapRenamedScenario(plan,previous,next,oldName,newName){
 const ids=new Map();for(const key of ['machines','pilots','pilotTemplates','skillTemplates','weaponTemplates','environments','battlefields','missions'])for(const row of previous[key]||[]){const origin=referenceOrigin(row);if(origin?.bookName!==oldName)continue;const replacement=(next[key]||[]).find(x=>{const o=referenceOrigin(x);return o?.bookName===newName&&o.originalId===origin.originalId;});if(replacement)ids.set(row.id,replacement.id);}
 const visit=x=>Array.isArray(x)?x.map(visit):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[ids.get(k)||k,visit(v)])):typeof x==='string'?(ids.get(x)||x):x;
 return visit(plan);
}
