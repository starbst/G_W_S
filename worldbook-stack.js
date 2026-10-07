import {normalizeName,registerReferenceOrigin} from './catalog-names.js';
const clone=value=>structuredClone(value);
const ns=kind=>kind==='entity-template'?'machine':kind;
const hash=text=>{let n=2166136261;for(const char of text)n=Math.imul(n^char.charCodeAt(0),16777619);return (n>>>0).toString(16).padStart(8,'0');};
const dataOf=entry=>{const blocks=[...String(entry.content||'').matchAll(/<GWS_DATA>\s*([\s\S]*?)\s*<\/GWS_DATA>/g)];if(!blocks.length)return null;if(blocks.length!==1)throw Error('每条数据只能有一个GWS_DATA块');return JSON.parse(blocks[0][1]);};
const setData=(entry,data)=>{entry.content=String(entry.content||'').replace(/<GWS_DATA>[\s\S]*?<\/GWS_DATA>/,'<GWS_DATA>\n'+JSON.stringify(data,null,2)+'\n</GWS_DATA>');};
function references(data,resolve){
 const kind=ns(data.kind),ref=(type,id)=>id===undefined?id:resolve(type,id);
 if(kind==='machine')for(const w of data.weapons||[])if(w.template)w.template=ref('weapon-template',w.template);
 const profile=p=>{if(p.templates)p.templates=p.templates.map(id=>ref('pilot-template',id));if(p.skills)p.skills=Object.fromEntries(Object.entries(p.skills).map(([id,on])=>[ref('pilot-skill',id),on]));};
 if(kind==='pilot'||kind==='pilot-template'){profile(data);for(const state of data.states||[])profile(state);if(data.experience)data.experience=Object.fromEntries(Object.entries(data.experience).map(([id,v])=>[ref('machine',id),v]));}
 if(kind==='battlefield'){data.defaultEnvironmentId=ref('environment',data.defaultEnvironmentId);for(const r of data.regions||[])r.environmentId=ref('environment',r.environmentId);}
 if(kind==='options'&&data.defaultScenario){const s=data.defaultScenario;for(const [key,type]of [['environmentId','environment'],['battlefieldId','battlefield'],['missionId','mission']])if(s[key])s[key]=ref(type,s[key]);for(const side of ['a','b','c'])for(const group of s[side+'Forces']||[]){group.machineId=ref('machine',group.machineId);if(group.pilotId!=='unmanned')group.pilotId=ref('pilot',group.pilotId);if(group.pilotOptions?.skills)group.pilotOptions.skills=Object.fromEntries(Object.entries(group.pilotOptions.skills).map(([id,on])=>[ref('pilot-skill',id),on]));}}
 return data;
}
export function composeWorldbooks(sources){
 if(!Array.isArray(sources)||!sources.length)throw Error('请至少关联一本参数世界书');
 const names=new Set(),records=[],locals=new Map();
 for(const [priority,source]of sources.entries()){
  if(!source.name||names.has(source.name)||!source.book?.entries)throw Error('关联世界书名称重复或内容无效');names.add(source.name);const table=new Map();locals.set(source.name,table);
  for(const [uid,entry]of Object.entries(source.book.entries)){
   if(entry.disable||entry.enabled===false)continue;let data;try{data=dataOf(entry);}catch(error){throw Error(source.name+' / '+(entry.comment||uid)+'：'+error.message);}if(!data)continue;
   if(!/^[a-z][a-z0-9-]{0,63}$/.test(data.id)||typeof data.name!=='string')throw Error(source.name+'：数据标识或名称无效');
   const type=ns(data.kind),key=type+':'+data.id;if(table.has(key))throw Error(source.name+'：重复数据ID '+data.id);
   const record={source:source.name,priority,uid,entry,data,type};table.set(key,record);records.push(record);
  }
 }
 const publicById=new Map(),publicByName=new Map(),roots=[],redirects=new Map();
 for(const record of records){const idKey=record.type+':'+record.data.id,nameKey=record.type+':'+normalizeName(record.data.name);const named=publicByName.get(nameKey);const winner=publicById.get(idKey)||redirects.get(idKey)||(named?.source!==record.source?named:null)||(['rules','options'].includes(record.type)?roots.find(r=>r.type===record.type):null);
  if(winner){record.winner=winner;if(!redirects.has(idKey))redirects.set(idKey,winner);if(!publicByName.has(nameKey))publicByName.set(nameKey,winner);continue;}
  record.winner=record;publicById.set(idKey,record);publicByName.set(nameKey,record);roots.push(record);
 }
 const result={name:sources.map(s=>s.name).join(' + '),entries:{},gwsWorldbooks:{version:1,names:[...names],origins:{},commonTemplates:{}}};
 const ids=new Map(),allocated=new Set();let uid=0;
 const lookup=(source,type,id)=>{const table=locals.get(source),exact=table?.get(type+':'+id);if(exact)return exact;const normalized=normalizeName(id),local=[...(table?.values()||[])].filter(r=>r.type===type&&[r.data.name,...(r.data.aliases||[]),...(r.entry.key||[])].some(n=>normalizeName(n)===normalized));if(local.length>1)throw Error(source+'：内部引用有歧义 '+id);if(local.length===1)return local[0];const global=publicById.get(type+':'+id)||redirects.get(type+':'+id);if(global)return global;const matches=roots.filter(r=>r.type===type&&[r.data.name,...(r.data.aliases||[]),...(r.entry.key||[])].some(n=>normalizeName(n)===normalized));if(matches.length){const priority=Math.min(...matches.map(r=>r.priority)),best=matches.filter(r=>r.priority===priority);if(best.length===1)return best[0];throw Error(source+'：外部引用有歧义 '+id);}throw Error(source+'：缺少或已禁用 '+type+' '+id);};
 function ensure(record){
  if(ids.has(record))return ids.get(record);
  const internalId=record.winner===record?record.data.id:'gws-'+hash(record.source)+'-'+record.data.id.slice(0,35)+'-'+hash(record.type+':'+record.data.id);
  if(allocated.has(record.type+':'+internalId))throw Error('合并后的内部标识冲突 '+internalId);allocated.add(record.type+':'+internalId);ids.set(record,internalId);const entry=clone(record.entry),data=clone(record.data);data.id=internalId;entry.uid=uid++;const origin={bookName:record.source,uid:record.uid,originalId:record.data.id,kind:record.type,priority:record.priority,hidden:record.winner!==record,aliases:[]};entry.gwsOrigin=origin;result.entries[entry.uid]=entry;result.gwsWorldbooks.origins[record.type+':'+internalId]=origin;
  references(data,(type,id)=>ensure(lookup(record.source,type,id)));
  if(record.type==='pilot'){const ownCommon=locals.get(record.source)?.get('pilot-template:common')||publicById.get('pilot-template:common');if(ownCommon)result.gwsWorldbooks.commonTemplates[internalId]=ensure(ownCommon);}
  setData(entry,data);return internalId;
 }
 for(const record of roots)ensure(record);
 for(const record of records)if(record.winner!==record){const winnerId=ids.get(record.winner),origin=result.gwsWorldbooks.origins[record.type+':'+winnerId];if(origin)origin.aliases.push(record.data.id,record.data.name,...(record.entry.key||[]));}
 for(const origin of Object.values(result.gwsWorldbooks.origins))origin.aliases=[...new Set(origin.aliases)].filter(s=>typeof s==='string'&&s.length<=100);
 // Preserve controllers separately. They are activation rules, not catalog records.
 for(const source of sources)for(const entry of Object.values(source.book.entries))if(!String(entry.content||'').includes('<GWS_DATA>')&&String(entry.comment||entry.name||'').includes('[GWS] 控制器')){const copy=clone(entry);copy.uid=uid++;copy.gwsOrigin={bookName:source.name};result.entries[copy.uid]=copy;}
 const entries=Object.values(result.entries),byId=new Map(entries.map(e=>{const d=dataOf(e);return [d?ns(d.kind)+':'+d.id:'controller:'+e.uid,e];})),ordered=roots.map(r=>byId.get(r.type+':'+ids.get(r))),included=new Set(ordered);
 result.entries=Object.fromEntries([...ordered,...entries.filter(e=>!included.has(e))].map((e,i)=>{e.uid=i;return [i,e];}));
 return result;
}
const arrays={machines:'machine',pilots:'pilot',pilotTemplates:'pilot-template',skillTemplates:'pilot-skill',weaponTemplates:'weapon-template',environments:'environment',battlefields:'battlefield',missions:'mission'};
export function registerWorldbookOrigins(catalog,book){
 if(!book.gwsWorldbooks)return catalog;
 catalog.worldbooks=clone(book.gwsWorldbooks);
 for(const [list,type]of Object.entries(arrays))for(const row of catalog[list]||[]){const origin=book.gwsWorldbooks.origins[type+':'+row.id]||Object.values(book.entries).find(e=>e.gwsOrigin&&dataOf(e)?.id===row.id&&ns(dataOf(e).kind)===type)?.gwsOrigin;if(origin){const registered=clone(origin);if(type==='pilot'){registered.skillIds={};for(const state of row.states)for(const id of Object.keys(state.skills||{})){const skill=book.gwsWorldbooks.origins['pilot-skill:'+id];if(skill&&(!registered.skillIds[skill.originalId]||skill.bookName===origin.bookName))registered.skillIds[skill.originalId]=id;}}registerReferenceOrigin(row,registered);}}
 return catalog;
}
export function worldbookEditPlan(original,proposed,sources){
 const changed=[],next=new Map(sources.map(s=>[s.name,clone(s.book)])),originalById=new Map(),proposedById=new Map();
 for(const [key,entry]of Object.entries(original.entries)){const data=dataOf(entry);if(data)originalById.set(ns(data.kind)+':'+data.id,{key,entry,data});}
 for(const [key,entry]of Object.entries(proposed.entries)){const data=dataOf(entry);if(data)proposedById.set(ns(data.kind)+':'+data.id,{key,entry,data});}
 const touched=new Set(),copyCache=new Map();
 function allocate(book){return Math.max(0,...Object.keys(book.entries).map(Number).filter(Number.isFinite))+1;}
 function restoreRef(destination,type,id){
  const row=proposedById.get(type+':'+id);if(!row)throw Error('保存资料缺少依赖 '+type+' '+id);
  const origin=row.entry.gwsOrigin||proposed.gwsWorldbooks?.origins[type+':'+id],rawId=origin?.originalId||id;
  const local=Object.values(next.get(destination).entries).map(e=>dataOf(e)).find(d=>d&&ns(d.kind)===type&&d.id===rawId);
  const wantedSource=origin?.bookName||destination;
  const external=sources.flatMap(s=>Object.values(next.get(s.name).entries).filter(e=>!e.disable&&e.enabled!==false).map(e=>({name:s.name,data:dataOf(e)}))).find(r=>r.data&&ns(r.data.kind)===type&&r.data.id===rawId);
  if(wantedSource===destination||!local&&external?.name===wantedSource){return rawId;}
  // A dependency from another book clashes with the destination's own definition.
  // Copy only that dependency under a distinct ID so the saved record retains its behavior.
  const cacheKey=destination+':'+type+':'+id;if(copyCache.has(cacheKey))return copyCache.get(cacheKey);
  const copiedId='gws-'+hash(wantedSource)+'-'+rawId.slice(0,35)+'-'+hash(type+':'+rawId);copyCache.set(cacheKey,copiedId);
  const book=next.get(destination),entry=clone(row.entry),data=clone(row.data);delete entry.gwsOrigin;data.id=copiedId;references(data,(t,ref)=>restoreRef(destination,t,ref));setData(entry,data);const existing=Object.entries(book.entries).find(([,e])=>{const d=dataOf(e);return d&&ns(d.kind)===type&&d.id===copiedId;});entry.uid=existing?existing[1].uid:allocate(book);book.entries[existing?existing[0]:entry.uid]=entry;touched.add(destination);return copiedId;
 }
 for(const [identity,row]of proposedById){const old=originalById.get(identity);if(old&&old.entry.content===row.entry.content&&JSON.stringify(old.entry.key)===JSON.stringify(row.entry.key))continue;const origin=row.entry.gwsOrigin||proposed.gwsWorldbooks?.origins[identity];if(!origin?.bookName||!next.has(origin.bookName))throw Error('资料没有可写回的关联世界书来源');const destination=origin.bookName,book=next.get(destination),entry=clone(row.entry),data=clone(row.data);delete entry.gwsOrigin;data.id=origin.originalId||data.id;references(data,(type,id)=>restoreRef(destination,type,id));setData(entry,data);const target=old?(old.entry.gwsOrigin?.uid??origin.uid):null;entry.uid=target!==null&&book.entries[target]?book.entries[target].uid:allocate(book);book.entries[entry.uid]=entry;touched.add(destination);changed.push({name:data.name,bookName:destination});}
 return {sources:sources.map(s=>({name:s.name,book:next.get(s.name)})),writes:[...touched].map(name=>({name,book:next.get(name)})),changes:changed};
}
