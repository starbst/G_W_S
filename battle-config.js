import {validateScenario} from './domain.js';
import {SEED_PRESETS} from './data/seed/presets.js';
import {MAJOR_CASES} from './data/seed/major-cases.js';

// Only selected major battles appear in the menu. Reference fixtures are not delivered as presets.
export const BUILTIN_PRESETS=MAJOR_CASES.flatMap(meta=>{const p=SEED_PRESETS.find(p=>p.id===meta.id);return p?[p]:[];});

export function presetScenario(id,catalog,{importSeed=false,referenceSeed}={}){
 const preset=BUILTIN_PRESETS.find(p=>p.id===id);
 if(!preset)throw Error('请选择一个内置预设');
 const scenario=structuredClone(preset.scenario);delete scenario.seed;if(importSeed&&referenceSeed!==undefined&&referenceSeed!==null)scenario.seed=referenceSeed;return validateScenario(scenario,catalog);
}
export function recordingScenario(record,catalog,{importSeed=false}={}){
 const saved=record?.startConditions;
 if(saved&&saved.version!==1)throw Error('录像开始条件版本不受支持');
 const initial=saved?.scenario||record?.scenario;
 if(!initial)throw Error('这条旧录像未保存完整开始条件，仍可播放，但无法导入作战配置');
 if(JSON.stringify(initial).length>65536)throw Error('录像开始条件过大');
 try{const scenario=structuredClone(initial);delete scenario.seed;if(importSeed){const seed=record.seed??initial.seed;if(seed!==undefined&&seed!==null)scenario.seed=seed;}return validateScenario(scenario,catalog);}
 catch(e){throw Error('录像开始条件与当前世界书不匹配：'+e.message+'。请选择包含对应单位、驾驶员、战场和任务的世界书');}
}
