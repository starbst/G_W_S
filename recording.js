import {expandV6} from './recording-codec.js';
// Playback data only: schema 5 stores immutable labels once and changed state columns per frame.
const STATE_FIELDS=['position','velocity','forward','armor','structure','energy','track','stability','speedRate','alive','order','weapon','weaponKind','targetId','locked','lockedTargetId','targetedBy','visible','evasionMode','recoveryDebuff','recoveryDebuffRemaining','shots','hits','damage','aiming','aimingWeapons','fireArc','threat','weapons','totalEnergy','energyRecoveryRate','energyArmorActive'];
const UNIT_FIELDS=['id','side','groupIndex','name','pilot','pilotState','radius','maxArmor','maxStructure','maxEnergy','maxTotalEnergy'];
const WEAPON_FIELDS=['id','name','kind','slot','mount','arcYawDeg','arcPitchDeg','windupS','projectileSpeedMps'];
const WEAPON_STATE=['ammo','readyIn','active','windup','burstRemaining','shots','hits','windupUntil'];
// Shot/strike direction is already decided. These cues preserve it; generated effects are not saved.
const CUE_TYPES=['beam','tracer','slash','clash','dodge-jet'];
const picked=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
function rounded(value,key=''){
 if(typeof value==='number'){const p=['forward','track','stability'].includes(key)?10000:100;return Math.round(value*p)/p;}
 if(Array.isArray(value))return value.map(v=>rounded(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rounded(v,k)]));
 return value??null;
}
export function compactRecording(record){
 if([5,6].includes(record.schemaVersion))return record;
 const first=record.frames[0],ids=first.units.map(u=>u.id),unitDefs=first.units.map(u=>({...picked(u,UNIT_FIELDS),weapons:(u.weapons||[]).map(w=>picked(w,WEAPON_FIELDS))}));
 const strings=[],stringIds=new Map();const intern=v=>{if(typeof v!=='string')return v;if(!stringIds.has(v)){stringIds.set(v,strings.length);strings.push(v);}return ['s',stringIds.get(v)];};
 const previous=ids.map(()=>[]),frames=record.frames.map(f=>[rounded(f.t),f.tick,ids.map((id,i)=>{
  const u=f.units.find(u=>u.id===id);if(!u)throw Error('录像单位集合发生变化');
  const state=STATE_FIELDS.map(k=>k==='weapons'?(u.weapons||[]).map(w=>WEAPON_STATE.map(key=>rounded(w[key]))):k==='aimingWeapons'?(u.aimingWeapons||[]).map(intern):k==='fireArc'?rounded(picked(u.fireArc||{},['yaw','pitch','effectiveRange','range'])):intern(rounded(u[k],k)));
  const delta=[];state.forEach((value,j)=>{if(JSON.stringify(previous[i][j])!==JSON.stringify(value)){delta.push(j,value);previous[i][j]=value;}});return delta;
 }), (f.projectiles||[]).map(p=>[p.id,p.owner,p.kind,rounded(p.position),!!p.guiding])]);
 const shotKinds=new Map();for(const e of record.events)if(e.type==='shot'){const weapon=first.units.find(u=>u.id===e.actor)?.weapons?.find(w=>w.id===e.weapon);shotKinds.set(e.actor+':'+e.t,e.kind==='beam'?e.weapon?.endsWith('-rifle'):e.kind==='ballistic'?(weapon?.mount==='head'||e.weapon?.endsWith('-vulcan')):null);}
 const allEffects=new Map();for(const f of record.frames)for(const e of f.effects||[])if(CUE_TYPES.includes(e.type))allEffects.set(JSON.stringify(e),e);for(const e of record.effects||[])if(CUE_TYPES.includes(e.type))allEffects.set(JSON.stringify(e),e);
 const cues=[...allEffects.values()].sort((a,b)=>a.t-b.t).map(e=>[CUE_TYPES.indexOf(e.type),rounded(e.t),e.actor||null,e.opponent||null,rounded(e.from||e.position),rounded(e.to||e.direction),rounded(e.intensity),rounded(e.losses),e.type==='beam'?(e.beamRifle??shotKinds.get(e.actor+':'+e.t)??null):e.type==='tracer'?(e.vulcan??shotKinds.get(e.actor+':'+e.t)??null):null]);
 const events=record.events.map(e=>rounded(picked(e,['t','type','actor','text','target','weapon','kind','weaponKind','order','armorDamage','structureDamage','position','stabilityLoss','escape','readyAt','opponent','lossA','lossB','outcome'])));
 return {...picked(record,['id','name','createdAt','engineVersion','seed','result','battleName','startConditions']),schemaVersion:5,sourceSchema:record.schemaVersion,environment:{visual:{...record.environment.visual}},unitDefs,strings,frames,cues,events};
}
export function expandRecording(record){
 if(record.schemaVersion===6)return expandV6(record);
 if(record.schemaVersion!==5)return record;
 const fail=()=>{throw Error('录像无效：精简记录格式');};
 if(![2,3,4].includes(record.sourceSchema)||!Array.isArray(record.unitDefs)||record.unitDefs.length<2||record.unitDefs.length>48||!Array.isArray(record.strings)||record.strings.length>10000||record.strings.some(s=>typeof s!=='string'||s.length>160)||!Array.isArray(record.frames)||!record.frames.length||record.frames.length>10000||!Array.isArray(record.cues)||record.cues.length>30000||!Array.isArray(record.events)||record.events.length>20000)fail();
 for(const d of record.unitDefs)if(!d||typeof d.id!=='string'||!Array.isArray(d.weapons)||d.weapons.length>16)fail();
 const resolve=value=>{if(Array.isArray(value)&&value[0]==='s'){if(value.length!==2||!Number.isInteger(value[1])||record.strings[value[1]]===undefined)fail();return record.strings[value[1]];}return value;};
 const shotsByTime=new Map(),preparations=new Map(),pendingPreparations=new Map(),durations=new Map();
 for(const event of record.events){
  const key=event.actor+':'+event.weapon;
  if(event.type==='aim'){const entry={t:event.t};if(!preparations.has(key))preparations.set(key,[]);preparations.get(key).push(entry);pendingPreparations.set(key,entry);}
  if(event.type==='interruption')for(const active of pendingPreparations.keys())if(active.startsWith(event.actor+':'))pendingPreparations.delete(active);
  if(event.type==='shot'){shotsByTime.set(event.actor+':'+event.t,event);const pending=pendingPreparations.get(key);if(pending){const duration=event.t-pending.t;if(duration>=0&&duration<=3){if(!durations.has(key))durations.set(key,[]);durations.get(key).push(duration);}pendingPreparations.delete(key);}}
 }
 const preparationAt=(key,time)=>{const list=preparations.get(key)||[];let lo=0,hi=list.length-1;if(!list.length||list[0].t>time)return null;while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(list[mid].t<=time)lo=mid;else hi=mid-1;}return list[lo];};
 const durationValues=new Map([...durations].map(([key,values])=>{const sorted=values.sort((a,b)=>a-b);return [key,sorted[Math.floor(sorted.length/2)]];}));
 const durationAt=key=>durationValues.get(key);
 const states=record.unitDefs.map(()=>[]),projectileTrail=new Map();
 const frames=record.frames.map((f,fi)=>{
  if(!Array.isArray(f)||f.length!==4||!Array.isArray(f[2])||f[2].length!==states.length||!Array.isArray(f[3])||f[3].length>192)fail();
  const units=f[2].map((delta,i)=>{
   if(!Array.isArray(delta)||delta.length%2||delta.length>STATE_FIELDS.length*2)fail();const seen=new Set();
   for(let n=0;n<delta.length;n+=2){const j=delta[n];if(!Number.isInteger(j)||j<0||j>=STATE_FIELDS.length||seen.has(j))fail();seen.add(j);states[i][j]=delta[n+1];}
   if(!fi){for(let j=0;j<STATE_FIELDS.length-3;j++)if(!seen.has(j))fail();}
   const def=record.unitDefs[i],u={...def};STATE_FIELDS.forEach((key,j)=>u[key]=resolve(states[i][j]));
   if(!Array.isArray(u.weapons)||u.weapons.length!==def.weapons.length||!Array.isArray(u.aimingWeapons))fail();
   u.weapons=u.weapons.map((row,j)=>{if(!Array.isArray(row)||![7,WEAPON_STATE.length].includes(row.length))fail();const weapon={...def.weapons[j],...Object.fromEntries(WEAPON_STATE.map((key,k)=>[key,row[k]]))},key=u.id+':'+weapon.id;weapon.windupS??=durationAt(key);if(weapon.windup&&weapon.windupUntil==null){const prep=preparationAt(key,f[0]);if(prep&&weapon.windupS!=null)weapon.windupUntil=prep.t+weapon.windupS;}return weapon;});u.aimingWeapons=u.aimingWeapons.map(resolve);for(const key of ['totalEnergy','energyRecoveryRate','energyArmorActive'])if(u[key]==null)delete u[key];u.orderLabel=u.order;if(u.speedRate===null)delete u.speedRate;
   // Older records may omit optional state. Retain their original validation contract.
   return u;
  });
  const active=new Set(),projectiles=f[3].map(p=>{if(!Array.isArray(p)||p.length!==5||!Number.isInteger(p[0])||typeof p[1]!=='string'||typeof p[2]!=='string'||typeof p[4]!=='boolean')fail();const last=projectileTrail.get(p[0]),trace=last?[...last.trace,p[3]].slice(-10):[p[3]];const out={id:p[0],owner:p[1],kind:p[2],position:p[3],previous:last?.position||p[3],guiding:p[4],trace};projectileTrail.set(p[0],out);active.add(p[0]);return out;});for(const id of projectileTrail.keys())if(!active.has(id))projectileTrail.delete(id);
  return {t:f[0],tick:f[1],units,projectiles,effects:[],result:fi===record.frames.length-1?record.result:null};
 });
 const lives={beam:.55,tracer:.4,slash:.7,clash:.95,'dodge-jet':.45};
 const effects=record.cues.map(c=>{if(!Array.isArray(c)||![8,9].includes(c.length)||!Number.isInteger(c[0])||!CUE_TYPES[c[0]])fail();const type=CUE_TYPES[c[0]],e={type,t:c[1],actor:c[2],opponent:c[3],life:lives[type]};if(type==='beam'&&typeof c[8]==='boolean')e.beamRifle=c[8];if(type==='tracer'){const event=shotsByTime.get(c[2]+':'+c[1]),weapon=record.unitDefs.find(u=>u.id===c[2])?.weapons.find(w=>w.id===event?.weapon);e.vulcan=typeof c[8]==='boolean'?c[8]:weapon?.mount==='head'||String(event?.weapon).endsWith('-vulcan');e.projectileSpeedMps=weapon?.projectileSpeedMps??1000;if(e.vulcan)e.life=.95;}if(['beam','tracer','slash'].includes(type)){e.from=c[4];e.to=c[5];}else {e.position=c[4];if(type==='dodge-jet')e.direction=c[5];if(type==='clash'){e.intensity=c[6];e.losses=c[7];}}return e;});
 function positionAt(id,time){let lo=0,hi=frames.length-1;while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(frames[mid].t<=time)lo=mid;else hi=mid-1;}const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],u=a.units.find(u=>u.id===id),v=b.units.find(u=>u.id===id);if(!u)return [0,0,0];const fraction=b.t===a.t?0:Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t)));return u.position.map((n,i)=>n+(v.position[i]-n)*fraction);}
 for(const event of record.events){
  if(event.type==='hit'){const id=event.target,unit=record.unitDefs.find(u=>u.id===id),severity=Math.max(event.stabilityLoss??0,Math.min(1,(event.structureDamage||0)/Math.max(1,unit?.maxStructure||100)));effects.push({type:'impact',t:event.t,life:.55,actor:id,position:event.position||positionAt(id,event.t),severity});}
  if(event.type==='destroyed')effects.push({type:'explosion',t:event.t,life:3,actor:event.actor,position:event.position||positionAt(event.actor,event.t)});
  if(['hit','parry','lost','lock'].includes(event.type)){const id=event.type==='hit'?event.target:event.actor;effects.push({type:'notice',t:event.t,life:event.type==='hit'?1.1:.7,actor:id,position:event.position||positionAt(id,event.t),tone:event.type==='hit'?'damage':event.type==='lock'?'good':'warning',text:event.type==='hit'?'受击 · 失稳':event.type==='parry'?'拼刀':event.type==='lock'?'火控锁定':'火控丢锁'});}
 }
 effects.sort((a,b)=>a.t-b.t);if(frames.length)frames.at(-1).effects=effects.filter(e=>e.t<=frames.at(-1).t&&e.t+e.life>=frames.at(-1).t);
 return {...record,schemaVersion:record.sourceSchema,frames,effects};
}
