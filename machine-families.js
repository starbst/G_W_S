// Presentation groups only. Concrete machine IDs retain their physical data and old save compatibility.
const groups=[
 ['strike','强袭高达',['seed-strike','seed-aile-strike','seed-aile-strike-flight','seed-sword-strike','seed-launcher-strike','seed-perfect-strike','seed-strike-unarmed-start','seed-strike-field-packs']],
 ['strike-rouge','强袭嫣红',['seed-strike-rouge','seed-strike-rouge-ootori']],
 ['duel','决斗高达',['seed-duel','seed-duel-assault']],
 ['freedom','自由高达',['seed-freedom','seed-freedom-meteor']],
 ['justice','正义高达',['seed-justice','seed-justice-meteor']],
 ['impulse','脉冲高达',['seed-impulse','seed-force-impulse','seed-sword-impulse','seed-blast-impulse']],
 ['akatsuki','拂晓高达',['seed-akatsuki-owashi','seed-akatsuki-shiranui']],
 ['ginn','金恩',['seed-ginn','seed-ginn-recon','seed-ginn-trainer','seed-ginn-ceremonial','seed-ginn-high-maneuver-ii','seed-ginn-miguel','seed-ginn-d']],
 ['dinn','迪恩',['seed-dinn','seed-dinn-awacs']],
 ['bucue','巴库',['seed-bucue','seed-bucue-missile']],
 ['dagger-105','105短剑',['seed-dagger-105','seed-dagger-105-aile','seed-dagger-105-jet','seed-dagger-105-launcher','seed-dagger-105-sword']],
 ['dagger-l','短剑L',['seed-dagger-l','seed-dagger-l-aile','seed-dagger-l-jet','seed-dagger-l-launcher','seed-dagger-l-sword']],
 ['windam','温达姆',['seed-windam','seed-windam-aile','seed-windam-jet','seed-windam-launcher','seed-windam-sword']],
 ['skygrasper','空中霸王',['seed-skygrasper','seed-skygrasper-aile','seed-skygrasper-sword','seed-skygrasper-launcher']],
 ['zaku-warrior','扎古勇士',['seed-zaku-warrior-base','seed-zaku-warrior-gunner','seed-zaku-warrior-blaze','seed-zaku-warrior-slash','seed-zaku-warrior-kerberos']],
 ['zaku-phantom','扎古幻影',['seed-zaku-phantom-base','seed-zaku-phantom-gunner','seed-zaku-phantom-blaze','seed-zaku-phantom-slash','seed-zaku-phantom-kerberos']],
 ['m1','M1异端',['seed-m1-astray','seed-m1-astray-shrike']],
 ['gelgoog','盖尔古克威胁',['seed-gelgoog-general-space','seed-gelgoog-general-air','seed-gelgoog-luna-space','seed-gelgoog-luna-air']],
 ['gyan','吉昂风暴',['seed-gyan-agnes-space','seed-gyan-agnes-air','seed-gyan-hilda-space','seed-gyan-hilda-air']],
 ['destiny-ii','命运高达SpecⅡ',['seed-destiny-spec-ii','seed-destiny-zeus']],
 ['impulse-ii','脉冲高达SpecⅡ',['seed-impulse-spec-ii-force','seed-impulse-spec-ii-sword','seed-impulse-spec-ii-blast']],
 ['rudroa','黑骑士小队／卢德拉',['seed-black-knight-rudroa-redelard','seed-black-knight-rudroa-griffin','seed-black-knight-rudroa-liu','seed-black-knight-rudroa-daniel']],
 ['archangel','大天使号',['seed-archangel','seed-archangel-pack-support']],
 ['nazca','纳斯卡级',['seed-nazca','seed-vesalius','seed-nazca-stampeder']],
 ['laurasia','罗拉西亚级',['seed-laurasia','seed-gamow']],
 ['agamemnon','阿伽门农级',['seed-agamemnon','seed-agamemnon-ms','seed-menelaos']],
 ['nelson','纳尔逊级',['seed-nelson','seed-nelson-ms']],
 ['drake','德雷克级',['seed-drake','seed-drake-ms']]
];
const membership=new Map(groups.flatMap(([id,name,ids])=>ids.map(machineId=>[machineId,{id:'family-'+id,name}])));
export function machineFamilies(machines){
 const result=[],byId=new Map();
 for(const machine of machines){const declared=machine.selection,family=declared?{id:declared.familyId,name:declared.familyName}:membership.get(machine.id)||{id:machine.id,name:machine.name};
 let entry=byId.get(family.id);if(!entry){entry={...family,variants:[]};byId.set(entry.id,entry);result.push(entry);}entry.variants.push(machine);}
 return result;
}
export function machineVariantName(machine,family){
 return machine.selection?.variantName||(machine.name.startsWith(family.name+'／')?machine.name.slice(family.name.length+1):machine.name===family.name?'标准装备':machine.name);
}
export function resetMachineInitial(force){if(force.initialState)for(const key of ['weaponAmmo','componentHealth','loadoutId','formId'])delete force.initialState[key];}
