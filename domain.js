import {validateAliases} from './catalog-names.js';
import {missionConditionSchema,missionSchema} from './missions.js';
import { validateV5Catalog,validateV5Scenario } from './catalog-contract.js';
import {applyProjectilePolicy} from './projectile-policy.js';
import { validateSkills } from './pilot-skills.js';
import { resolvePilotProfiles } from './pilot-profiles.js';
const ID = /^[a-z][a-z0-9-]{0,63}$/;
function requireThat(ok, message) { if (!ok) throw new Error(message); }
function number(n, lo, hi, path) { requireThat(typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi, path + ' 数值越界'); }
const ranges = {
 machine:{massKg:[1000,1e7],thrustN:[0,1e9],maxSpeedMps:[0,4000],turnRateDeg:[5,180],dragCoefficient:[0,0.01],radiusM:[1,500],structure:[1,20000],armor:[0,20000],energyCapacity:[10,1000],energyRegen:[0,250],sensorRangeM:[500,200000],sensorFovDeg:[30,180],trackGain:[0.1,3],trackDecay:[0.1,3],flightPower:[0,50]},
 weapon:{rangeM:[20,60000],effectiveRangeM:[10,60000],minimumDamageFactor:[0.05,1],minRangeM:[0,1000],preferredRangeM:[10,30000],projectileSpeedMps:[0,50000],cooldownS:[0.15,30],damage:[0,500],energyCost:[0,1000],spreadRad:[0.0001,0.2],arcYawDeg:[2,180],arcPitchDeg:[2,180],edgeSpreadMultiplier:[1,10],windupS:[0,3],lifeS:[0.05,30],turnRateDeg:[0,360],seekerHalfAngleDeg:[0,180],ammo:[-1,2000],burst:[1,12],blastRadiusM:[0,100]},
 pilot:{reactionS:[0.1,3],aim:[0.1,1],tracking:[0.1,1],maneuver:[0.1,1],composure:[0.1,1]},
 environment:{density:[0,2],visibilityM:[500,200000],seaClutter:[0,0.9],gravity:[0,20]},
};
function stats(kind,x,path) { if(kind==='weapon')for(const k of ['meleeAccuracy','guardEfficiency'])if(x?.[k]!==undefined)number(x[k],.5,1.5,path+'.'+k);requireThat(x&&typeof x==='object',path+' 缺少sim');for(const [k,[lo,hi]] of Object.entries(ranges[kind]))number(x[k],lo,hi,path+'.'+k); }
function tags(x,path){requireThat(Array.isArray(x)&&x.length<=30&&x.every(t=>typeof t==='string'&&ID.test(t)),path+' 标签无效');}
function validateMachine(m){
 requireThat(m.sim.maxSpeedMps===0||m.sim.thrustN>=1e4,'移动机体推力须至少10000；零推力只用于静止实体');
 requireThat(m.sim.thrustN/m.sim.massKg<=200,'推力质量比超出当前计算范围');
 for(const [key,lo,hi]of [['totalEnergy',10,1000000],['dodgeEnergyCost',0,100],['turnEnergyCost',0,10],['energyTransferMultiplier',.25,6]])if(m.sim[key]!==undefined)number(m.sim[key],lo,hi,m.id+'.'+key);
 if(m.sim.totalEnergy!==undefined)requireThat(m.sim.totalEnergy>=m.sim.energyCapacity,'总能源不可小于能源容量');
 if(m.sim.energyArmor!==undefined){const a=m.sim.energyArmor;requireThat(a&&Array.isArray(a.types)&&a.types.length>0&&a.types.every(t=>['beam','ballistic','missile','funnel-missile','funnel','melee'].includes(t)),'能量装甲类型无效');number(a.idleCostPerS,0,50,'装甲待机耗能');number(a.costPerDamage,.001,10,'装甲受击耗能');number(a.absorptionBoost,0,.8,'装甲吸收增益');}
 const mobility=m.mobility;requireThat(mobility&&mobility.accel&&mobility.speed,'机体缺少各向机动定义');
 for(const kind of ['accel','speed']){
  requireThat(mobility[kind].forward===1,'前向机动系数须为1');
  for(const axis of ['reverse','lateral','up','down'])number(mobility[kind][axis],0.05,0.99,m.id+'.'+kind+'.'+axis);
 }
 number(mobility.pitchRateDeg,5,180,m.id+'.pitchRateDeg');number(mobility.brakeMultiplier,0.5,2,m.id+'.brakeMultiplier');
 requireThat(Array.isArray(m.weapons)&&(m.weapons.length>0||m.combatant===false)&&m.weapons.length<=16,'机体须内置1—16组武装');
 const ids=new Set();
 for(const w of m.weapons){
  requireThat(w&&ID.test(w.id)&&!ids.has(w.id)&&typeof w.name==='string'&&w.name.length<=100,m.name+'：武装需不重复的英文ID和name；不能仅填写武器名称字符串');ids.add(w.id);tags(w.tags,w.id);
  requireThat(['beam','ballistic','missile','funnel-missile','funnel','melee'].includes(w.kind),'未知武器种类');
  if(w.sim.environments!==undefined)requireThat(Array.isArray(w.sim.environments)&&w.sim.environments.length>0&&w.sim.environments.every(e=>['space','orbit','air','surface','water','ground'].includes(e)),'武器介质错误');
  requireThat(['head','hand','shoulder','arm','body','skirt'].includes(w.mount),'未知武器安装部位');
  requireThat(typeof w.requiresLock==='boolean','武器缺少锁定要求');stats('weapon',w.sim,m.id+'.'+w.id);
  requireThat(/^slot[1-8]$/.test(w.slot),'武器槽需slot1—slot8');
  const s=w.sim;if(s.powerSource!==undefined)requireThat(['reactor','ammo','none'].includes(s.powerSource),'武器供能来源无效');if(s.powerSource==='ammo')requireThat(s.ammo>0,'弹药供能武器需要有限弹药');for(const [key,lo,hi] of [['burstIntervalS',.05,2],['salvoBurst',1,12],['switchS',0,2],['maxLateralAccelMps2',20,2000],['riposteS',.1,2],['meleeAccuracy',.5,1.5],['guardEfficiency',.5,1.5]])if(s[key]!==undefined)number(s[key],lo,hi,w.id+'.'+key);requireThat(s.salvoBurst===undefined||Number.isInteger(s.salvoBurst),'齐射总数需整数');requireThat(s.minRangeM<s.preferredRangeM&&s.preferredRangeM<=s.effectiveRangeM&&s.effectiveRangeM<=s.rangeM,'武器距离区间错误');
  requireThat(s.energyCost<=m.sim.energyCapacity,'武器耗能超过容量');requireThat(Number.isInteger(s.ammo)&&Number.isInteger(s.burst),'弹药/齐射须为整数');

  if(w.kind==='melee')requireThat(s.projectileSpeedMps===0&&s.rangeM<=150&&s.burst===1,'近战武器参数错误');
  else requireThat(s.projectileSpeedMps>=100&&s.lifeS*s.projectileSpeedMps>=s.rangeM,'弹体速度/寿命无法覆盖射程');
  if(['missile','funnel-missile'].includes(w.kind))requireThat(s.ammo>0&&s.turnRateDeg>0&&s.seekerHalfAngleDeg>0,'制导弹需有限弹药和导引能力');
  if(w.kind==='ballistic')requireThat(s.ammo>0,'实弹需有限弹药');
 }
}
export function parseWorldbook(book) {
 requireThat(book?.entries&&typeof book.entries==='object','不是酒馆世界书');
 const catalog={machines:[],pilots:[],pilotTemplates:[],skillTemplates:[],weaponTemplates:[],environments:[],battlefields:[],missions:[],rules:null,options:null};
 const names={machine:'machines',pilot:'pilots',environment:'environments', 'entity-template':'machines'},keys=new Set(),entries=Object.values(book.entries);
 requireThat(entries.length<=1000,'世界书条目过多');
 for(const e of entries){
  if(e.disable||e.enabled===false)continue;const content=String(e.content||'');if(!content.includes('<GWS_DATA>'))continue;
  const blocks=[...content.matchAll(/<GWS_DATA>\s*([\s\S]*?)\s*<\/GWS_DATA>/g)];
  requireThat(blocks.length===1&&blocks[0][1].length<60000,'每条数据需一个完整且小于60KB的GWS_DATA块');
  const x=JSON.parse(blocks[0][1]);requireThat(x&&ID.test(x.id)&&typeof x.name==='string'&&x.name.length<=100,'无效数据标识');
  validateAliases(x.aliases,x.name);if(['machine','entity-template','pilot','weapon-template','environment','battlefield'].includes(x.kind))x.aliases=[...new Set([...(x.aliases||[]),...(e.key||[]).filter(k=>typeof k==='string'&&k.trim()&&k.length<=100)])].slice(0,24);
  const namespace=x.kind==='entity-template'?'machine':x.kind;requireThat(!keys.has(namespace+':'+x.id),'重复数据ID '+x.id);keys.add(namespace+':'+x.id);
  if(x.kind==='battlefield'){catalog.battlefields.push(x);continue;}
  if(x.kind==='mission'){catalog.missions.push(x);continue;}
  if(x.kind==='entity-template')stats('machine',x.sim,x.id);
  if(x.kind==='pilot-skill'){catalog.skillTemplates.push(x);continue;}
  if(x.kind==='pilot-template'){catalog.pilotTemplates.push(x);continue;}
  if(x.kind==='weapon-template'){catalog.weaponTemplates.push(x);continue;}
  if(Object.hasOwn(names,x.kind)){
   if(x.kind!=='pilot'||x.tags!==undefined)tags(x.tags,x.id);
   if(x.kind==='pilot'){
    if(x.experience!==undefined){requireThat(x.experience&&typeof x.experience==='object'&&!Array.isArray(x.experience)&&Object.keys(x.experience).length<=100,'经验表无效');for(const [opponent,record]of Object.entries(x.experience)){requireThat(ID.test(opponent),'经验机体ID无效');for(const k of ['aim','flank','melee','escape'])number(record[k],-2,2,'经验权重');}}
    requireThat(Array.isArray(x.states)&&x.states.length>0&&x.states.length<=30,'驾驶员需1—30个状态');const ids=new Set();
    for(const s of x.states){validateAliases(s.aliases,x.name+'状态');requireThat(ID.test(s.id)&&!ids.has(s.id)&&typeof s.name==='string'&&s.name.length<=100,'驾驶员状态错误');ids.add(s.id);}
   }else if(x.kind!=='entity-template')stats(x.kind,x.sim,x.id);
   if(x.kind==='environment'){requireThat(Array.isArray(x.sim.windMps)&&x.sim.windMps.length===3,'风速需XYZ');x.sim.windMps.forEach(v=>number(v,-100,100,'风速'));for(const k of ['sky','horizon','sea'])requireThat(/^#[0-9a-f]{6}$/i.test(x.visual?.[k]),'环境颜色无效');}

   catalog[names[x.kind]].push(x);
  }else if(x.kind==='rules'||x.kind==='options'){requireThat(!catalog[x.kind],'规则/选项只能启用一份');catalog[x.kind]=x;}
  else throw Error('未知数据类型 '+x.kind+'；武器须由机体weapons引用武器模板');
 }
 for(const w of catalog.weaponTemplates){requireThat(['beam','ballistic','missile','funnel-missile','funnel','melee'].includes(w.weaponKind),'武器模板类别错误');requireThat(['head','hand','shoulder','arm','body','skirt'].includes(w.mount)&&typeof w.requiresLock==='boolean','武器模板安装/锁定错误');tags(w.tags,w.id);stats('weapon',w.sim,w.id);}
 for(const m of catalog.machines){m.weapons=m.weapons.map(w=>{if(!w.template)return applyProjectilePolicy({...w,slot:w.slot||'slot1'},m);const base=catalog.weaponTemplates.find(x=>x.id===w.template);requireThat(base,'缺少或已禁用武器模板 '+w.template);return applyProjectilePolicy({...structuredClone(base),...w,kind:base.weaponKind,sim:{...base.sim,...w.sim},facts:{...base.facts,...w.facts},slot:w.slot||'slot1'},m);});validateMachine(m);}
 validateSkills(catalog.skillTemplates);catalog.pilots=resolvePilotProfiles(catalog.pilots,catalog.pilotTemplates);
 for(const p of catalog.pilots)for(const s of p.states)for(const id of Object.keys(s.skills||{}))requireThat(catalog.skillTemplates.some(d=>d.id===id),'缺少驾驶员技能 '+id);
 requireThat(catalog.rules?.schemaVersion===5&&catalog.options,'当前扩展需要第5版数据结构，请导入 v1.0 配套世界书');
 const r=catalog.rules;if(r.damageMultiplier!==undefined)number(r.damageMultiplier,1,6,'伤害倍率');requireThat(r.stepSeconds===0.05,'当前计算器使用固定20Hz');
 for(const [k,lo,hi]of [['maxSeconds',0,86400],['lockThreshold',0.1,1],['unlockThreshold',0,0.9],['damageVariance',0,0.5],['armorAbsorption',0,0.9],['componentDamageFraction',0,0.01],['boundaryRadiusM',3000,200000],['minimumAltitudeM',10,100]])number(r[k],lo,hi,k);
 requireThat(r.unlockThreshold<r.lockThreshold,'丢锁阈值必须低于锁定阈值');
 for(const k of ['machines','pilots','environments'])requireThat(catalog[k].length>0&&catalog[k].length<=(k==='environments'?100:512),'缺少或过多条目 '+k);
 validateV5Catalog(catalog);
 validateScenario(catalog.options.defaultScenario,catalog);return catalog;
}
export function scenarioChoices(c){
 return {environmentId:c.environments.map(x=>x.id),focus:['overall','a','b','c'],mode:['auto','soft','hard'],machines:c.machines.map(x=>x.id),pilots:c.pilots.map(x=>x.id),states:[...new Set(c.pilots.flatMap(x=>x.states.map(y=>y.id)))],strategies:(['attack','escort','screen','objective','survive','simple']),battlefields:c.battlefields.map(x=>x.id),missions:c.missions.map(x=>x.id)};
}
export function validateScenario(value,c){
 requireThat(c.rules?.schemaVersion===5,'当前世界书数据格式不兼容，请导入与扩展匹配的参数世界书');
 requireThat(value&&typeof value==='object'&&!Array.isArray(value),'方案必须为对象');

 if(value.sidesSwapped!==undefined)requireThat(typeof value.sidesSwapped==='boolean','敌我交换标记须为布尔值');
 if(value.maxSeconds!==undefined)number(value.maxSeconds,0,86400,'作战时限（0为不限时）');
 const keys=['environmentId','distanceM','altitudeM','focus','mode','aForces','bForces'],optional=['seed','deployments','battlefieldId','missionId','cForces','maxSeconds','sidesSwapped','mission'];const missing=keys.filter(k=>!Object.hasOwn(value,k)),extra=Object.keys(value).filter(k=>!keys.includes(k)&&!optional.includes(k));requireThat(!missing.length&&!extra.length,'方案字段缺少或包含额外字段'+(missing.length?'；缺少：'+missing.join('、'):'')+(extra.length?'；额外：'+extra.join('、'):''));
 requireThat(c.environments.some(x=>x.id===value.environmentId),'战场不在允许范围');number(value.distanceM,50,(100000),'初始间距');number(value.altitudeM,(-200000),(200000),'初始高度');requireThat(['overall','a','b','c'].includes(value.focus)||/^([abc])-\d+-\d+$/.test(value.focus),'聚焦主体不允许');requireThat(['auto','soft','hard'].includes(value.mode),'暂停模式不允许');requireThat(value.seed===undefined||value.seed===null||Number.isInteger(value.seed)&&value.seed>=0&&value.seed<=4294967295,'随机种子须为0—4294967295整数或null');
 for(const side of ['a','b',...(value?.cForces?['c']:[])]){const groups=value[side+'Forces'];requireThat(Array.isArray(groups)&&groups.length>=1&&groups.length<=((16)),side+'方需1—16个编组');let total=0;for(const [i,g]of groups.entries()){
  requireThat(g&&Object.keys(g).every(k=>['machineId','pilotId','stateId','count','strategy','carrierId','mountId','mountOffset','initialState','pilotOptions'].includes(k))&&['machineId','pilotId','stateId','count','strategy'].every(k=>Object.hasOwn(g,k)),side+'方编组字段无效');requireThat(c.machines.some(x=>x.id===g.machineId),'未知机体 '+g.machineId);const pilot=c.pilots.find(x=>x.id===g.pilotId);requireThat(pilot?.states.some(x=>x.id===g.stateId)||(g.pilotId==='unmanned')&&g.stateId==='automatic'&&g.strategy==='simple'&&['pod','vehicle','terrain','turret'].includes(c.machines.find(m=>m.id===g.machineId).entityType),'驾驶员状态与所属驾驶员不匹配');requireThat(Number.isInteger(g.count)&&g.count>=1&&g.count<=((32)),'每编组数量须为1—32');requireThat(((['attack','escort','screen','objective','survive','simple'].includes(g.strategy))),'策略不在允许范围');if(g.pilotOptions){const o=g.pilotOptions,s=pilot?.states.find(x=>x.id===g.stateId);requireThat(s&&o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>['traits','strategies','skills'].includes(k)),'驾驶员开关结构错误');for(const[k,v]of Object.entries(o)){requireThat(v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([id,on])=>typeof on==='boolean'&&Object.hasOwn(s[k]||{},id)),'驾驶员开关引用未知或值非布尔 '+k);}}
  if(g.initialState){const v=g.initialState;requireThat(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>['structureFraction','armorFraction','energyFraction','totalEnergyFraction','stability','velocity','forward','weaponAmmo','componentHealth','loadoutId','formId'].includes(k)),'初始状态字段错误');for(const k of ['structureFraction','armorFraction','energyFraction','totalEnergyFraction','stability'])if(v[k]!==undefined)number(v[k],k==='structureFraction'?.01:0,1,'初始状态.'+k);for(const k of ['velocity','forward'])if(v[k]!==undefined){requireThat(Array.isArray(v[k])&&v[k].length===3,'初始向量需XYZ');v[k].forEach(n=>number(n,-4000,4000,k));if(k==='forward')requireThat(Math.hypot(...v[k])>.1,'朝向不能为零');}if(v.formId!==undefined)requireThat(c.machines.find(m=>m.id===g.machineId).forms?.some(f=>f.id===v.formId),'初始变形形态不存在');if(v.loadoutId!==undefined)requireThat(c.machines.find(m=>m.id===g.machineId).loadoutSystem?.sets.some(s=>s.id===v.loadoutId),'初始背包不存在');if(v.componentHealth!==undefined){const defs=c.machines.find(m=>m.id===g.machineId).componentDefs||[];requireThat(v.componentHealth&&typeof v.componentHealth==='object'&&!Array.isArray(v.componentHealth)&&Object.keys(v.componentHealth).every(id=>defs.some(p=>p.id===id)),'初始部件引用错误');for(const[id,n]of Object.entries(v.componentHealth))number(n,defs.find(p=>p.id===id).critical?.01:0,1,'初始部件.'+id);}if(v.weaponAmmo!==undefined){const machine=c.machines.find(m=>m.id===g.machineId);requireThat(v.weaponAmmo&&Object.keys(v.weaponAmmo).every(id=>machine.weapons.some(w=>w.id===id)),'初始武器引用错误');for(const[id,n]of Object.entries(v.weaponAmmo)){const max=machine.weapons.find(w=>w.id===id).sim.ammo;requireThat(Number.isInteger(n)&&n>=0&&(max>=0&&n<=max||max===-1&&n===0),'初始弹药越界');}}}
 total+=g.count;
 }requireThat(total<=((64)),side+'方单位总数不能超过64');}
 const copy=structuredClone(value),units=['a','b',...(value?.cForces?['c']:[])].flatMap(side=>copy[side+'Forces'].flatMap((g,gi)=>Array.from({length:g.count},(_,i)=>({id:side+'-'+gi+'-'+i,side,group:gi,index:i}))));
 if(copy.deployments!==undefined){requireThat(Array.isArray(copy.deployments)&&copy.deployments.length===units.length,'部署位置数量必须匹配总单位数');const ids=new Set();for(const d of copy.deployments){requireThat(d&&Object.keys(d).every(k=>['id','x','y','z'].includes(k)),'部署位置包含未知字段');requireThat(units.some(u=>u.id===d.id)&&!ids.has(d.id),'部署单位ID无效或重复');ids.add(d.id);for(const k of ['x','y','z'])number(d[k],(-200000),(200000),'部署位置.'+k);}}
 validateV5Scenario(copy,c);
 return copy;
}
export function scenarioSchema(c,{localMission=false}={}){
 const fraction={type:'number',minimum:0,maximum:1},vector={type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-4000,maximum:4000}};
 const initialState={type:'object',additionalProperties:false,properties:{formId:{type:'string',enum:[...new Set(c.machines.flatMap(m=>m.forms?.map(f=>f.id)||[]))]},loadoutId:{type:'string',enum:[...new Set(c.machines.flatMap(m=>m.loadoutSystem?.sets.map(s=>s.id)||[]))]},structureFraction:{...fraction,minimum:.01},armorFraction:fraction,energyFraction:fraction,totalEnergyFraction:fraction,stability:fraction,velocity:vector,forward:vector,componentHealth:{type:'object',additionalProperties:fraction},weaponAmmo:{type:'object',additionalProperties:{type:'integer',minimum:0}}}};
 const optionMap=ids=>({type:'object',additionalProperties:false,properties:Object.fromEntries(ids.map(id=>[id,{type:'boolean'}]))});
 const pilotOptions={type:'object',additionalProperties:false,properties:{traits:optionMap([...new Set(c.pilots.flatMap(p=>p.states.flatMap(s=>Object.keys(s.traits||{}))))]),strategies:optionMap([...new Set(c.pilots.flatMap(p=>p.states.flatMap(s=>Object.keys(s.strategies||{}))))]),skills:optionMap(c.skillTemplates.map(d=>d.id))}};
 const group={type:'object',additionalProperties:false,properties:{machineId:{type:'string',enum:c.machines.map(x=>x.id)},pilotId:{type:'string',enum:[...c.pilots.map(x=>x.id),'unmanned']},stateId:{type:'string',enum:[...new Set(c.pilots.flatMap(p=>p.states.map(s=>s.id))),'automatic']},count:{type:'integer',minimum:1,maximum:32},strategy:{type:'string',enum:['attack','escort','screen','objective','survive','simple']},carrierId:{type:'string',pattern:'^[abc]-[0-9]+-[0-9]+$'},mountId:{type:'string',pattern:'^[abc]-[0-9]+-[0-9]+$'},mountOffset:vector,initialState,pilotOptions},required:['machineId','pilotId','stateId','count','strategy']};
 const properties={sidesSwapped:{type:'boolean'},cForces:{type:'array',minItems:1,maxItems:16,items:group},environmentId:{type:'string',enum:c.environments.map(x=>x.id)},distanceM:{type:'number',minimum:50,maximum:100000},altitudeM:{type:'number',minimum:-200000,maximum:200000},focus:{type:'string',enum:['overall','a','b','c']},mode:{type:'string',enum:['auto','soft','hard']},seed:{type:['integer','null'],minimum:0,maximum:4294967295},aForces:{type:'array',minItems:1,maxItems:16,items:group},bForces:{type:'array',minItems:1,maxItems:16,items:group},battlefieldId:{type:'string',enum:c.battlefields.map(x=>x.id)},missionId:{type:'string',enum:c.missions.map(x=>x.id)}};
 const required=Object.keys(properties).filter(k=>!['seed','cForces','sidesSwapped'].includes(k));if(localMission)properties.mission=missionSchema;properties.maxSeconds={type:'number',minimum:0,maximum:86400};properties.deployments={type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string',pattern:'^[abc]-[0-9]+-[0-9]+$'},...Object.fromEntries(['x','y','z'].map(k=>[k,{type:'number',minimum:-200000,maximum:200000}]))},required:['id','x','y','z']}};
 return {type:'object',additionalProperties:false,properties,required,...(localMission?{$defs:{gwsMissionCondition:missionConditionSchema}}:{})};
}
export function parseChatBattle(text,c){
 requireThat(typeof text==='string'&&text.length<=2000000,'消息过长');const matches=[...text.matchAll(/<GWS_BATTLE>\s*([\s\S]*?)\s*<\/GWS_BATTLE>/g)];
 if(!matches.length)return null;requireThat(matches.length===1&&matches[0][1].length<10000,'每条回复只能有一个战斗方案');return validateScenario(JSON.parse(matches[0][1]),c);
}
