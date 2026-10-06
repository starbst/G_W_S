// Names are accepted only at the chat boundary; the simulator always receives stable IDs.
export const normalizeName=value=>String(value||'').normalize('NFKC').replace(/[\u200b-\u200d\u2060\ufeff]/g,'').toLowerCase().replace(/[\s·・‧•._/／()（）-]/g,'');
export function validateAliases(value,label){if(value===undefined)return;if(!Array.isArray(value)||value.length>24||value.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw Error(label+'：别名需最多24个非空名称');}
export function resolveName(rows,value,label){
 if(typeof value!=='string')throw Error(label+'需要ID或名称');
 const exact=rows.find(x=>x.id===value);if(exact)return exact.id;
 const key=normalizeName(value),hits=rows.filter(x=>[x.name,...defaultAliases(x)].some(n=>normalizeName(n)===key));
 if(hits.length===1)return hits[0].id;
 if(hits.length>1)throw Error(label+'“'+value+'”有歧义，请使用ID：'+hits.map(x=>x.id).join('、'));
 throw Error(label+'“'+value+'”不存在；请引用已列出的ID或提出资料补充');
}
// Legacy shipped templates remain reusable in already-imported books.
export function isReusablePilot(pilot){return !!pilot&&(['ace-pilot','elite-pilot','ship-crew'].includes(pilot.id)||pilot.tags?.includes('generic-pilot'));}
export function resolveScenarioNames(plan,c){
 const out=structuredClone(plan);
 for(const key of ['aForces','bForces','cForces'])for(const g of out[key]||[]){
  g.machineId=resolveName(c.machines,g.machineId,'机体');if(g.pilotId==='unmanned')continue;g.pilotId=resolveName(c.pilots,g.pilotId,'驾驶员');
  g.stateId=resolveName(c.pilots.find(p=>p.id===g.pilotId).states,g.stateId,'驾驶员状态');
 }
 for(const [key,rows,label]of [['environmentId',c.environments,'环境'],['battlefieldId',c.battlefields,'战场'],['missionId',c.missions,'任务']])if(out[key]!==undefined)out[key]=resolveName(rows,out[key],label);
 return out;
}

const BUILTIN_ALIASES={"seed-cgue":["西古","席古","希古","CGUE","ZGMF-515"],"seed-kira":["基拉·大和","吉良·大和","煌·大和","Kira Yamato"],"seed-athrun":["阿斯兰·萨拉","阿斯兰·扎拉","阿斯蘭·薩拉","Athrun Zala"],"seed-rau":["劳·卢·克鲁泽","劳·鲁·克鲁泽","Rau Le Creuset","克鲁泽"],"seed-murrue":["玛琉·拉米亚斯","玛丽ュー·拉米亚斯","Murrue Ramius"],"seed-mu":["穆·拉·弗拉格","穆·拉·弗拉加","穆·拉·佛拉达","Mu La Flaga","穆"],"seed-yzak":["伊扎克·玖尔","伊扎克·焦耳","Yzak Joule"],"seed-dearka":["迪亚哥·艾尔斯曼","迪亚卡·埃尔斯曼","Dearka Elsman"],"seed-nicol":["尼高尔·阿玛菲","尼科尔·阿玛菲","Nicol Amalfi"],"seed-shinn":["真·飞鸟","真·飞鸟","Shinn Asuka"],"seed-lacus":["拉克丝·克莱因","拉克斯·克莱因","Lacus Clyne"],"seed-archangel":["大天使号","大天使","Archangel"],"seed-vesalius":["威萨利乌斯号","威萨里乌斯号","Vesalius"],"seed-minerva":["密涅瓦号","密涅瓦","Minerva"],"seed-eternal":["永恒号","永恆號","Eternal"],"seed-strike":["强袭高达","突击高达","Strike Gundam","GAT-X105"],"seed-freedom":["自由高达","Freedom Gundam","ZGMF-X10A"],"seed-justice":["正义高达","Justice Gundam","ZGMF-X09A"],"seed-aegis":["圣盾高达","神盾高达","Aegis Gundam","GAT-X303"],"seed-buster":["暴风高达","暴风高达","Buster Gundam","GAT-X103"],"seed-blitz":["迅雷高达","闪电高达","Blitz Gundam","GAT-X207"],"seed-duel":["决斗高达","Duel Gundam","GAT-X102"],"seed-providence":["神意高达","天意高达","Providence Gundam","ZGMF-X13A"],"seed-destiny":["命运","命运高达","Destiny Gundam","ZGMF-X42S"],"seed-legend":["传说","传说高达","Legend Gundam","ZGMF-X666S"],"seed-strike-freedom":["强袭自由高达","突击自由高达","Strike Freedom Gundam","ZGMF-X20A"],"seed-infinite-justice":["无限正义高达","Infinite Justice Gundam","ZGMF-X19A"],"seed-gaia":["大地高达","大地","Gaia Gundam","ZGMF-X88S"],"seed-chaos":["混沌","Chaos Gundam","ZGMF-X24S"],"seed-abyss":["深渊","Abyss Gundam","ZGMF-X31S"],"seed-sting":["史汀·奥克雷","史汀","斯汀","Sting Oakley"],"seed-stella":["史黛拉","史黛拉·露西耶","Stella Loussier"],"seed-auel":["奥尔","Auel Neider"],"seed-girty-lue":["加蒂·鲁号","加蒂鲁号","加迪鲁号","Girty Lue"],"seed-ginn":["金恩","吉恩","GINN","ZGMF-1017"],"seed-rey":["雷·扎·巴雷尔","雷","Rey Za Burrel"],"seed-talia":["塔莉娅","塔利亚","塔莉亚","塔丽亚"],"seed-gouf":["古夫烈焰","古夫","GOUF Ignited"],"seed-zaku-phantom-blaze":["烈焰扎古幻影","瞬发扎古幻影"],"seed-andrew":["巴尔特菲尔德","沙漠之虎"],"seed-aile-strike":["翔翼强袭","翔翼型强袭","翔翼强袭高达"],"seed-aile-strike-flight":["翔翼强袭飞行升级"],"seed-sword-strike":["剑装强袭","巨剑强袭"],"seed-launcher-strike":["炮装强袭","重炮强袭"],"seed-force-impulse":["空装脉冲","飞行脉冲","空战型脉冲"],"seed-sword-impulse":["剑装脉冲","巨剑脉冲"],"seed-blast-impulse":["炮装脉冲","重炮脉冲"],"seed-zaku-warrior-base":["基础扎古","基础扎古勇士","扎古勇士基础型"],"seed-zaku-warrior-gunner":["炮手扎古","炮装扎古","炮战型扎古勇士","炮战扎古勇士","炮手型扎古勇士"],"seed-goohn":["古恩","格恩","GOOhN","UMF-4A"],"seed-bucue-missile":["导弹巴库","巴库导弹型","巴库／导弹型","导弹型巴库"],"seed-bucue":["双轨炮巴库","轨道炮巴库"],"seed-luna":["露娜玛利亚","露娜玛莉亚","露娜玛丽亚","露娜","Lunamaria Hawke"]};
export function defaultAliases(record){return [...new Set([...(record.aliases||[]),...(BUILTIN_ALIASES[record.id]||[])])];}
