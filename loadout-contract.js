const fail=m=>{throw Error('背包配置错误：'+m);};
const keys=(o,a)=>{if(!o||Array.isArray(o)||typeof o!=='object'||Object.keys(o).some(k=>!a.includes(k)))fail('未知字段');};
const number=(n,lo,hi)=>{if(!Number.isFinite(n)||n<lo||n>hi)fail('数值越界');};
const id=s=>typeof s==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(s);
export function validateLoadoutMachine(m){
 const c=m.loadoutSystem;if(c){keys(c,['family','initialId','sets']);if(!id(c.family)||!Array.isArray(c.sets)||!c.sets.length||c.sets.length>8||m.forms)fail('背包族或数量/形态冲突');const ids=new Set;
 for(const s of c.sets){keys(s,['id','name','weaponIds','massKg','thrustN','maxSpeedMps','turnRateDeg','tags','installS','defenseIndices']);if(!id(s.id)||ids.has(s.id)||typeof s.name!=='string'||s.name.length>80)fail('背包名称重复或无效');ids.add(s.id);
 if(!Array.isArray(s.weaponIds)||!s.weaponIds.length||new Set(s.weaponIds).size!==s.weaponIds.length||s.weaponIds.some(id=>!m.weapons.some(w=>w.id===id)))fail('武器引用');number(s.installS,.1,10);
 for(const[k,lo,hi]of [['massKg',100,1e9],['thrustN',0,1e9],['maxSpeedMps',1,3000],['turnRateDeg',1,720]])if(s[k]!==undefined)number(s[k],lo,hi);
 if(s.defenseIndices!==undefined&&(!Array.isArray(s.defenseIndices)||new Set(s.defenseIndices).size!==s.defenseIndices.length||s.defenseIndices.some(i=>!Number.isInteger(i)||!m.defenses?.[i])))fail('防护层引用');
 if(s.tags!==undefined&&(!Array.isArray(s.tags)||s.tags.some(t=>typeof t!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(t))))fail('环境标签');
 }if(!ids.has(c.initialId))fail('初始背包不存在');
 }
 const supply=m.loadoutSupply;if(supply){keys(supply,['rangeM','speedMps','stock']);number(supply.rangeM,100,50000);number(supply.speedMps,50,2000);if(!Array.isArray(supply.stock)||!supply.stock.length||supply.stock.length>32)fail('有限库存');
 for(const s of supply.stock){keys(s,['family','setId','count','energyStock','ammo']);if(!id(s.family)||!id(s.setId)||!Number.isInteger(s.count))fail('库存标识');number(s.count,0,32);number(s.energyStock,0,100000);if(s.ammo!==undefined){keys(s.ammo,Object.keys(s.ammo));for(const[k,v]of Object.entries(s.ammo)){if(!id(k)||!Number.isInteger(v))fail('弹药配置');number(v,0,100000);}}}
 }
}
