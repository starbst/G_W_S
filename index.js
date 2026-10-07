import {renameWorldbook,validWorldbookName,remapRenamedScenario} from './worldbook-rename.js';
import {composeWorldbooks,worldbookEditPlan} from './worldbook-stack.js';
import {createReportHandoff,REPORT_PROMPT_ID} from './report-handoff.js';
import {isReusablePilot,visibleReferences,referenceOrigin} from './catalog-names.js';
import {inertPromptText,requireDependencies,renderProposalPrompt,installCompanions,manualProposalMessages} from './host-integration.js';
import {parseProposal,parseManualProposal,parseNoBattle,uniqueBookName,latestChatProposal,proposalContextText} from './chat-bridge.js';
import {resolveMission,defaultCondition} from './missions.js';
import {renderMissionEditor} from './mission-editor.js';
import {machineFamilies,machineVariantName,resetMachineInitial} from './machine-families.js';
import {COMMAND_LABELS} from './command.js';
import {swapScenarioSides} from './side-swap.js';
import {playerPauseEvents} from './command-pause.js';
import {hasUnlimitedEnergy} from './energy-policy.js';
import {buildRpBattleReport} from './battle-report.js';
import {unitLabel,renderUnitPanel,commandRecipients,commandTargetUnits} from './unit-ui.js';
import {BUILTIN_PRESETS,presetScenario,recordingScenario} from './battle-config.js';
import { parseWorldbook, validateScenario, scenarioSchema, parseChatBattle } from './domain.js';
import { BattleRenderer } from './renderer.js';
import { RecordingStore, validateRecording } from './storage.js';
import { compactRecording, expandRecording } from './recording.js';
import { Battle } from './simulation.js';
import {parameterInfo} from './armory.js';
import { createArmory } from './armory.js';
const ID='gundam-war-simulator',HANDOFF='gundam-war-simulator-handoff';
const getContext=()=>window.SillyTavern.getContext();
let proposalWarnings=[];
let root,renderer,store,abort,worker,raf=0,hostEvents=[],seen=new Set(),generationEpoch=0,pendingProposal=null,proposalFailure=null,promptKey=null,generationChat='',promptEpoch=0,promptPending=Promise.resolve(),activeGenerationId='';
let bookLoading=false,linkedBooks=[],availableBookNames=[];
let catalog=null,draft=null,book=null,loadedName='',busy=false,working=false,paused=true,autoPauseUntil=0,lastReal=0,receivedAt=0,lastHud=0;
let lastDraw=0;
import {PlaybackTimeline} from './playback-timeline.js';
let timeline=null;
let current=null,previous=null,events=[],recording=null,replay=false,replayTime=0,replayIndex=0,speed=1,battleScenario=null,lastDecisionPause=-10;
let selectedRecordings=new Set(),libraryIds=[],configurationName='高达战斗',importSeed=false;
let armory=null,preparation=null,preparing=true,settings,reportHandoff=null,uiQueue=Promise.resolve(),frameLogVersion=-1;
const $=id=>root.querySelector('#gws-'+id);
const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const status=(text,error=false)=>{if(!root)return;$('status').textContent=text;$('status').classList.toggle('gws-error',error);};
function clearStatusError(text='已修改选项，可以重试。'){if(root&&$('status').classList.contains('gws-error'))status(text);}
function configurationCorrected(){if(root&&$('status').classList.contains('gws-error'))status('当前方案已通过校验。');}
const guard=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>status(e.message,true));
const clone=x=>structuredClone(x);
function asset(name){return new URL(name,import.meta.url);}
const WORLD_PACKS=[{id:'seed',label:'SEED资料包',file:'worldbook-seed.json'},{id:'00',label:'高达00资料包',file:'worldbook-00.json'}];
async function bundled(pack=WORLD_PACKS[0]){const r=await fetch(asset(pack.file));if(!r.ok)throw Error(pack.label+'加载失败');return r.json();}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function saveSettings(){getContext().saveSettingsDebounced();}
function running(){return !!worker&&!current?.result;}
function assertIdle(){if(bookLoading)throw Error('世界书正在刷新，请稍候');if(running())throw Error('当前战斗尚未结束，请先结束本局');if(busy)throw Error('方案生成尚未完成');}
function select(id,label,options,value,parent){const wrap=element('label',label);const input=element('select');input.id='gws-'+id;for(const [v,text]of options){const o=element('option',text);o.value=v;input.append(o);}input.value=value;wrap.append(input);parent.append(wrap);return input;}
function numeric(id,label,value,parent,{min=0,max=20000,step=1}={}){const wrap=element('label',label),input=element('input');input.type='number';input.id='gws-'+id;input.min=min;input.max=max;input.step=step;input.value=value;wrap.append(input);parent.append(wrap);return input;}
function referenceLabel(row,label=row.name){return label+(referenceOrigin(row)?.hidden?'（'+referenceOrigin(row).bookName+'）':'');}
function options(list){return list.map(x=>[x.id,referenceLabel(x)]);}
function plannedUnits(plan=draft){
 const units=[];for(const side of ['a','b',...(plan.cForces?['c']:[])])for(const [groupIndex,force] of plan[side+'Forces'].entries())for(let index=0;index<force.count;index++)units.push({id:`${side}-${groupIndex}-${index}`,side,groupIndex,index,force,name:catalog?.machines.find(m=>m.id===force.machineId)?.name||force.machineId,pilot:catalog?.pilots.find(p=>p.id===force.pilotId)?.name||'无驾驶员'});
 return units;
}
function availablePilots(force){
 const used=new Set(['a','b','c'].flatMap(side=>(draft[side+'Forces']||[]).filter(f=>f!==force).map(f=>f.pilotId)));
 return visibleReferences(catalog.pilots,[force.pilotId]).filter(p=>p.id===force.pilotId||isReusablePilot(p)||(force.count===1&&!used.has(p.id)));
}
function newForceFrom(force){
 const next={...clone(force),count:1};if(!isReusablePilot(catalog.pilots.find(p=>p.id===force.pilotId))&&force.pilotId!=='unmanned'){
  const fallback=catalog.pilots.find(p=>p.id==='elite-pilot')||catalog.pilots.find(isReusablePilot);if(!fallback)throw Error('请先在世界书加入通用驾驶员模板，再增加编组');
  next.pilotId=fallback.id;next.stateId=fallback.states[0].id;delete next.pilotOptions;delete next.initialState;
 }return next;
}
function remapMissionEntities(side,removedIndex=null){
 const mission=clone(resolveMission(draft,catalog)),units=plannedUnits(),lookup=new Set(units.map(u=>u.id));
 const remap=id=>{if(!id)return id;const [s,g,i]=id.split('-');let group=Number(g);if(s===side&&removedIndex!==null&&group>removedIndex)group--;const next=s+'-'+group+'-'+i;if(!(s===side&&removedIndex!==null&&Number(g)===removedIndex)&&lookup.has(next))return next;return units.find(u=>u.side===s&&u.groupIndex===group)?.id||units.find(u=>u.side===s)?.id;};
 const visit=(c,owner)=>{if(c.conditions)c.conditions=c.conditions.map(x=>visit(x,owner));if(c.entityId){const id=remap(c.entityId);if(!id)return defaultCondition('eliminate',owner,units);c.entityId=id;}return c;};
 for(const owner of Object.keys(mission.victory)){if(!units.some(u=>u.side===owner)){delete mission.victory[owner];continue;}mission.victory[owner]=visit(mission.victory[owner],owner);}
 for(const owner of Object.keys(mission.priorities||{})){const id=remap(mission.priorities[owner].primaryEntityId);if(!id||!units.some(u=>u.side===owner))delete mission.priorities[owner];else mission.priorities[owner].primaryEntityId=id;}
 mission.withdrawals=(mission.withdrawals||[]).flatMap(w=>{const id=remap(w.entityId);if(!id)return [];w.entityId=id;if(w.cohesionEntityId){const peer=remap(w.cohesionEntityId);if(peer)w.cohesionEntityId=peer;else{delete w.cohesionEntityId;delete w.cohesionHealthFraction;}}return [w];});draft.mission=mission;
}
function ensureDeployments(){
 const units=plannedUnits(),old=new Map((draft.deployments||[]).map(x=>[x.id,x]));
 draft.deployments=units.map((u,rank)=>old.get(u.id)||{id:u.id,x:u.side==='a'?-draft.distanceM/2:draft.distanceM/2,y:draft.altitudeM+Math.floor(rank/3)*120,z:(rank%3-1)*150});
}
function renderDeploymentPreview(){
 if(!catalog||!draft)return;ensureDeployments();
 preparation=new Battle(catalog,validateScenario(draft,catalog),draft.seed??0).snapshot();
 renderer?.trails.clear();if(renderer)renderer.lastTrailTick=-1;
 if(preparing){updateCameraOptions(preparation.units);renderer?.fitPreparation(preparation.units);}
}
function renderEditor(){
 if(!catalog||!draft)return;renderDeploymentPreview();const form=$('form');form.replaceChildren();
  if(proposalWarnings.length){const info=element('details',undefined,'gws-proposal-review');info.append(element('summary','方案读取说明 · '+proposalWarnings.length+'项'),...proposalWarnings.map(text=>element('p',text)));form.append(info);}
  if(proposalFailure){const failed=element('details',undefined,'gws-proposal-review');failed.append(element('summary','方案校验失败 · 查看原因与原始输出'),element('p',proposalFailure.message),element('pre',proposalFailure.text));form.append(failed);}
  if(pendingProposal?.changes.length){const review=element('fieldset',undefined,'gws-proposal-review');review.append(element('legend','待确认资料 · 仅本局生效'),element('p','以下资料尚未写入世界书。可以直接用于本局，或审阅后保存。未公布性能属于模拟估计。'));for(const change of pendingProposal.changes){const details=element('details'),summary=element('summary',change.action+' '+change.name+'（'+({machine:'机体',pilot:'驾驶员',state:'驾驶员状态'}[change.kind]||change.kind)+'）');details.append(summary,element('p',(change.bookName?'保存至：'+change.bookName+'。 ':'')+change.reason));const pre=element('pre',JSON.stringify(change.patch,null,2));details.append(pre);review.append(details);}for(const[id,label]of [['save-proposals','保存这些资料进来源世界书'],['discard-proposals','放弃资料建议并恢复方案']]){const btn=element('button',label);btn.type='button';btn.id='gws-'+id;review.append(btn);}form.append(review);}
 const families=machineFamilies(visibleReferences(catalog.machines,['a','b','c'].flatMap(side=>(draft[side+'Forces']||[]).map(g=>g.machineId))));
 const imports=element('fieldset',undefined,'gws-config-import');imports.append(element('legend','导入作战配置'));form.append(imports);
 select('preset','内置预设',[['','选择预设'],...options(BUILTIN_PRESETS.filter(p=>{try{validateScenario(p.scenario,catalog);return true;}catch{return false;}}))],'',imports);
 const load=element('button','导入预设');load.type='button';load.dataset.importPreset='true';const seedLabel=element('label',undefined,'gws-import-seed'),seedCheck=element('input');seedCheck.type='checkbox';seedCheck.id='gws-import-seed';seedCheck.checked=importSeed;seedLabel.append(seedCheck,document.createTextNode('导入种子'));const actions=element('div',undefined,'gws-import-actions');const swap=element('button','交换敌我');swap.type='button';swap.id='gws-swap-sides';swap.disabled=running()||busy;actions.append(load,seedLabel,swap);imports.append(actions);
 const fileLabel=element('label','从录像文件导入开始条件'),file=element('input');file.type='file';file.accept='.json,application/json';file.dataset.importConditions='true';fileLabel.append(file);imports.append(fileLabel);
 imports.append(element('small','导入后可以修改；使用当前世界书的性能与规则重新计算。录像库也可直接导入开始条件。'));
 for(const [side,label] of [['a','我方编队'],['b','敌方编队'],...(draft.cForces?[['c','第三方编队（独立交战）']]:[])]){
  const group=element('fieldset');group.append(element('legend',label));form.append(group);
  const forces=draft[side+'Forces'];forces.forEach((force,index)=>{const card=element('section',undefined,'gws-force-card');card.append(element('h4','编组 '+(index+1)));group.append(card);const row=element('div','', 'gws-force-row');
   const family=families.find(f=>f.variants.some(m=>m.id===force.machineId));select(side+'Family-'+index,'机体',options(families),family.id,row);select(side+'Machine-'+index,'装备 / 形态',family.variants.map(m=>[m.id,referenceLabel(m,machineVariantName(m,family))]),force.machineId,row);const machine=catalog.machines.find(m=>m.id===force.machineId);if(machine.forms)select(side+'Form-'+index,'初始变形',options(machine.forms),force.initialState?.formId||'ms',row);if(machine.loadoutSystem)select(side+'Loadout-'+index,'初始背包',options(machine.loadoutSystem.sets),force.initialState?.loadoutId||machine.loadoutSystem.initialId,row);select(side+'Pilot-'+index,'驾驶员',[...options(availablePilots(force)),...((['pod','vehicle','terrain','turret'].includes(catalog.machines.find(m=>m.id===force.machineId)?.entityType))?[['unmanned','无驾驶员 / 自动控制']]:[])],force.pilotId,row);const pilot=catalog.pilots.find(x=>x.id===force.pilotId)||{states:[{id:'automatic',name:'自动控制'}]};select(side+'State-'+index,'状态',options(pilot.states),force.stateId,row);{const count=numeric(side+'Count-'+index,'数量',force.count,row,{min:1,max:isReusablePilot(pilot)||force.pilotId==='unmanned'?32:1});if(!isReusablePilot(pilot)&&force.pilotId!=='unmanned'){count.readOnly=true;count.title='具名驾驶员只对应一台机体；其他驾驶员请另建编组';}}select(side+'Strategy-'+index,'任务',([['attack','自主进攻'],['escort','护航协防'],['screen','牵制掩护'],['objective','突破任务目标'],['survive','生存'],['simple','简单航路']]),force.strategy,row);{const supports=plannedUnits().filter(u=>u.side===side&&!u.force.carrierId&&!u.force.mountId&&u.groupIndex!==index),carriers=supports.filter(u=>catalog.machines.find(x=>x.id===u.force.machineId)?.carrier),mounts=supports.filter(u=>{const m=catalog.machines.find(x=>x.id===u.force.machineId);return m?.entityType==='ship'||m?.tags.includes('air-combat');});select(side+'Carrier-'+index,'部署方式',[['','直接部署'],...carriers.map(u=>[u.id,'机库出击 '+catalog.machines.find(m=>m.id===u.force.machineId).name+' '+u.id]),...mounts.map(u=>['mount:'+u.id,'甲板 / 载具 '+catalog.machines.find(m=>m.id===u.force.machineId).name+' '+u.id])],force.mountId?'mount:'+force.mountId:force.carrierId||'',row);}const remove=element('button','删除编组');remove.type='button';remove.dataset.forceRemove=side;remove.dataset.index=index;remove.disabled=forces.length===1;row.append(remove);card.append(row);
   const initialBox=element('details',undefined,'gws-initial-state');initialBox.append(element('summary','初始损伤与动量'+(force.initialState?'（已设置）':'')));const initialGrid=element('div',undefined,'gws-deploy-row'),initial=force.initialState||{};
   for(const[key,label]of [['structureFraction','初始结构 %'],['armorFraction','初始装甲 %'],['energyFraction','初始能源 %'],['totalEnergyFraction','初始总能源 %'],['stability','初始稳定 %']])if(key!=='totalEnergyFraction'||!hasUnlimitedEnergy(catalog.machines.find(m=>m.id===force.machineId)))numeric(side+'Initial-'+index+'-'+key,label,(initial[key]??1)*100,initialGrid,{min:key==='structureFraction'?1:0,max:100,step:1});
   const planned=preparation?.units.find(u=>u.side===side&&u.groupIndex===index);for(const key of ['velocity','forward'])for(const[axis,axisName]of ['X','Y','Z'].entries())numeric(side+'Initial-'+index+'-'+key+'-'+axis,(key==='velocity'?'初速 ':'朝向 ')+axisName,(initial[key]||planned?.[key]||(key==='velocity'?[0,0,0]:side==='a'?[1,0,0]:[-1,0,0]))[axis],initialGrid,{min:-4000,max:4000,step:key==='velocity'?10:.1});
   initialBox.append(initialGrid,element('small','仅设置本局开始状态；后续动作由本地决策计算。'));card.append(initialBox);
    const state=pilot.states.find(s=>s.id===force.stateId),pilotBox=element('details',undefined,'gws-pilot-options');pilotBox.append(element('summary','驾驶员词条 / 策略 / 技能'));
    pilotBox.append(element('p','勾选表示允许该策略参与本局判断，取消表示禁用；不是要求立即执行。只会比较满足条件的策略，先处理紧急与任务优先级，再按世界书权重选择；同档候选可以掷骰。权重越高越偏向，但不保证执行。全部勾选表示保留完整选择。','gws-note'));
    for(const[section,title]of [['traits','策略词条'],['strategies','可用决策策略'],['skills','本局技能开关']]){const list=element('div',undefined,'gws-pilot-toggle-list');list.append(element('strong',title));if(section==='skills')list.append(element('small','仅覆盖本局方案，不修改世界书；有条件的技能仍需满足触发条件。','gws-note'));for(const[id,value]of Object.entries(state?.[section]||{})){if(id==='precision-disarm'||id==='nonlethal')continue;const info=section==='skills'?catalog.skillTemplates.find(s=>s.id===id):null,label=element('label'),input=element('input');input.type='checkbox';input.id='gws-'+side+'Option-'+index+'-'+section+'-'+id;input.checked=force.pilotOptions?.[section]?.[id]??!!value;label.title=(info?.description||parameterInfo(id)?.[1]||'只覆盖本局，不修改世界书')+(section==='strategies'?'；允许时沿用权重 '+value+'，禁用时为0':'');label.append(input,element('span',section==='strategies'?(parameterInfo(id)?.[0]||id).replace(/权重$/,'')+' · '+value:(info?.name||parameterInfo(id)?.[0]||id)));list.append(label);}pilotBox.append(list);}
    pilotBox.append(element('small','策略选择行动；技能在满足条件时改变能力。本局开关会随开始条件和录像保存。'));card.append(pilotBox);
  });
  const add=element('button','增加编组');add.type='button';add.dataset.forceAdd=side;group.append(add);
 }
 const third=element('button',draft.cForces?'移除第三方':'添加独立第三方');third.type='button';third.dataset.thirdParty='true';form.append(third);
 const group=element('fieldset');group.className='gws-situation';group.append(element('legend','交战条件'));form.append(group);
 {select('battlefieldId','战场',options(visibleReferences(catalog.battlefields,[draft.battlefieldId])),draft.battlefieldId,group);}select('environmentId','缺省环境',options(visibleReferences(catalog.environments,[draft.environmentId])),draft.environmentId,group);
 numeric('distanceM','双方阵型间距（米）',draft.distanceM,group,{min:50,max:(100000),step:10});numeric('altitudeM','整体部署高度（米）',draft.altitudeM,group,{min:-200000,max:(200000),step:10});numeric('maxSeconds','作战时限（秒，0为不限时）',draft.maxSeconds??catalog.rules.maxSeconds,group,{min:0,max:86400,step:60});const seedInput=numeric('seed','随机种子（留空则随机）',draft.seed??'',group,{min:0,max:4294967295,step:1});seedInput.placeholder='随机';
 const focusOptions=[['overall','我方整体'],...plannedUnits().map(u=>[u.id,unitLabel(u)])];if(!focusOptions.some(x=>x[0]===draft.focus))draft.focus='overall';select('focus','聚焦主体',focusOptions,draft.focus,group);
 select('mode','玩家暂停模式',[['auto','自动 / 不交给玩家暂停'],['soft','弱暂停 / 受击等关键变化'],['hard','强暂停 / 策略与威胁变化']],draft.mode,group);
 renderMissionEditor({parent:form,scenario:draft,catalog,units:plannedUnits().map(u=>({...u,machine:catalog.machines.find(m=>m.id===u.force.machineId),position:preparation.units.find(x=>x.id===u.id)?.position})),onChange:mission=>{const next=clone(draft);next.mission=mission;validateScenario(next,catalog);draft=next;preparing=true;replay=false;renderEditor();configurationCorrected();},onError:message=>{status(message,true);renderEditor();}});
 const all=[...draft.aForces,...draft.bForces,...(draft.cForces||[])].map(f=>catalog.machines.find(x=>x.id===f.machineId)).filter(Boolean);
 $('data-summary').textContent='部署 '+draft.aForces.reduce((n,f)=>n+f.count,0)+' 对 '+draft.bForces.reduce((n,f)=>n+f.count,0)+' 个单位；'+all.map(x=>x.name+' '+x.weapons.length+'组武装').join(' ｜ ')+(plannedUnits().length>48?'；超过48单位属于实验规模，密集浮游炮的计算和录像开销较大。':'');
 const deploy=element('fieldset');deploy.className='gws-deployment-fields';deploy.append(element('legend','单位部署坐标（米）'));for(const d of draft.deployments){const u=plannedUnits().find(x=>x.id===d.id),row=element('div','', 'gws-deploy-row');row.append(element('strong',`${d.id} · ${u?.side==='a'?'我方':u?.side==='c'?'第三方':'敌方'}`));for(const axis of ['x','y','z']){const input=numeric(`deploy-${axis}-${d.id}`,axis.toUpperCase(),d[axis],row,{min:(-200000),max:(200000),step:10});input.dataset.deployAxis=axis;input.dataset.deployId=d.id;}deploy.append(row);}form.append(deploy);renderDeploymentPreview();
 updateReportUi();$('player-request').disabled=busy||running();$('clear-player-request').disabled=busy||running();$('run').disabled=!loadedName||running()||busy||!settings.enabled;$('generate').disabled=!loadedName||running()||busy||!settings.enabled;$('regenerate').disabled=!loadedName||running()||busy||!settings.enabled;
 for(const node of form.querySelectorAll('select,input,button'))node.disabled=node.disabled||running()||busy;
 $('mode').disabled=busy; $('abort').disabled=!running();
}
async function applyConfiguration(scenario,name){
 assertIdle();if(armory&&!await armory.close())return;
 setMobileView('config');draft={...scenario,mode:'auto'};configurationName=String(name||'高达战斗').slice(0,110);preparing=true;replay=false;paused=true;
 renderer.reset();renderEditor();open();status('已导入 '+configurationName+' 的开始条件，请检查左侧配置后开始。使用当前世界书重新计算，不保证复现旧录像的结果。');
}
async function importConditions(record){assertIdle();if(!loadedName)throw Error('请先选择并读取参数世界书');const plan=recordingScenario(record,catalog,{importSeed});await applyConfiguration(plan,record.battleName||record.name||'录像配置');}
async function importConditionsFile(file){
 if(!file)return;assertIdle();if(file.size>64*1024*1024)throw Error('录像文件超过64MB');
 const value=JSON.parse(await file.text());if(value.bundleVersion!==undefined)throw Error('请导入单条录像文件；合集可先导入录像库，再选择对应录像的开始条件');
 validateRecording(value);await importConditions(value);
}
function readEditor(event){
 const field=event.target.id?.replace('gws-','');if(field==='mode'){setPauseMode(event.target.value);return;}if(running()||!field||field==='preset')return;if(field==='import-seed'){importSeed=event.target.checked;return;}preparing=true;replay=false;
 if(field==='battlefieldId'){draft.battlefieldId=event.target.value;draft.environmentId=catalog.battlefields.find(x=>x.id===draft.battlefieldId).defaultEnvironmentId;renderEditor();return;}
 const toggle=field.match(/^([abc])Option-(\d+)-(traits|strategies|skills)-([a-z][a-z0-9-]*)$/);if(toggle){const force=draft[toggle[1]+'Forces'][Number(toggle[2])];force.pilotOptions??={};force.pilotOptions[toggle[3]]??={};force.pilotOptions[toggle[3]][toggle[4]]=event.target.checked;validateScenario(draft,catalog);renderDeploymentPreview();return;}
  const deployment=field.match(/^deploy-(x|y|z)-([abc]-\d+-\d+)$/);if(deployment){const d=draft.deployments.find(x=>x.id===deployment[2]);if(d)d[deployment[1]]=Number(event.target.value);renderDeploymentPreview();return;}
 const initialField=field.match(/^([abc])Initial-(\d+)-(structureFraction|armorFraction|energyFraction|totalEnergyFraction|stability|velocity|forward)(?:-(\d))?$/);
 if(initialField){const force=draft[initialField[1]+'Forces'][Number(initialField[2])],key=initialField[3],value=Number(event.target.value);force.initialState??={};
  if(['velocity','forward'].includes(key)){force.initialState[key]??=[...(preparation.units.find(u=>u.side===initialField[1]&&u.groupIndex===Number(initialField[2]))?.[key]||[0,0,0])];force.initialState[key][Number(initialField[4])]=value;}else force.initialState[key]=value/100;
  validateScenario(draft,catalog);renderDeploymentPreview();return;
 }
 const configField=field.match(/^([abc])(Family|Form|Loadout)-(\d+)$/);if(configField){const force=draft[configField[1]+'Forces'][Number(configField[3])];if(configField[2]==='Family'){const family=machineFamilies(catalog.machines).find(f=>f.id===event.target.value);force.machineId=family.variants[0].id;resetMachineInitial(force);if(force.pilotId==='unmanned'&&!['pod','vehicle','terrain','turret'].includes(family.variants[0].entityType)){force.pilotId=catalog.pilots[0].id;force.stateId=catalog.pilots[0].states[0].id;force.strategy='attack';}}else{force.initialState??={};force.initialState[configField[2]==='Form'?'formId':'loadoutId']=event.target.value;}validateScenario(draft,catalog);renderEditor();return;}
 const m=field.match(/^([abc])(Machine|Pilot|State|Count|Strategy|Carrier)-(\d+)$/);if(m){const force=draft[m[1]+'Forces'][Number(m[3])],key={Machine:'machineId',Pilot:'pilotId',State:'stateId',Count:'count',Strategy:'strategy',Carrier:'carrierId'}[m[2]];force[key]=m[2]==='Count'?Math.max(1,Math.floor(Number(event.target.value))):event.target.value;if(m[2]==='Carrier'){if(force.carrierId.startsWith('mount:')){force.mountId=force.carrierId.slice(6);delete force.carrierId;const parent=plannedUnits().find(u=>u.id===force.mountId),dims=catalog.machines.find(x=>x.id===parent.force.machineId).renderProfile.dimensions;force.mountOffset=[-dims[0]*.15,dims[1]/2+18,0];}else{delete force.mountId;delete force.mountOffset;}}if(m[2]==='Machine')resetMachineInitial(force);if(['Pilot','State'].includes(m[2]))delete force.pilotOptions;if(m[2]==='Pilot'){const p=catalog.pilots.find(x=>x.id===force.pilotId);force.stateId=p?.states[0].id||'automatic';if(!p)force.strategy='simple';}if(m[2]==='Machine'&&force.pilotId==='unmanned'&&!['pod','vehicle','terrain','turret'].includes(catalog.machines.find(x=>x.id===force.machineId)?.entityType)){force.pilotId=catalog.pilots[0].id;force.stateId=catalog.pilots[0].states[0].id;force.strategy='attack';}if(m[2]==='Count')for(const group of draft[m[1]+'Forces'])for(const key of ['carrierId','mountId'])if(group[key]&&!plannedUnits().some(u=>u.id===group[key])){delete group[key];if(key==='mountId')delete group.mountOffset;}
 if(m[2]==='Count')remapMissionEntities(m[1]);if(!force.carrierId)delete force.carrierId;ensureDeployments();validateScenario(draft,catalog);renderEditor();return;}
 if(['distanceM','altitudeM'].includes(field)){
 const old=draft[field],next=Number(event.target.value);draft[field]=next;
 for(const d of draft.deployments||[])if(field==='altitudeM')d.y=clamp(d.y+next-old,(-200000),(200000));else d.x+=(d.id.startsWith('a-')?-1:1)*(next-old)/2;
 }else if(field==='seed'){if(event.target.value==='')delete draft.seed;else draft.seed=Number(event.target.value);}else if(field==='maxSeconds')draft.maxSeconds=Number(event.target.value);else if(Object.hasOwn(draft,field))draft[field]=event.target.value;
 validateScenario(draft,catalog);if(event.type==='input')renderDeploymentPreview();else renderEditor();
}
function setPauseMode(mode){
 if(!['auto','soft','hard'].includes(mode))throw Error('暂停模式无效');draft.mode=mode;if(battleScenario)battleScenario.mode=mode;
 if(recording?.startConditions?.scenario)recording.startConditions.scenario.mode=mode;
 status('玩家暂停模式已切换；当前暂停不会自动解除，点击继续后采用新规则。');
}
function controllerActive(){
 const text=getContext().chat.slice(-6).map(x=>x.mes).join('\n');
 return Object.values(book?.entries||{}).some(e=>String(e.comment||e.name).includes('[GWS] 控制器')&&!e.disable&&e.enabled!==false&&(e.constant||e.strategy?.type==='constant'||(e.key||e.strategy?.keys||[]).some(k=>typeof k==='string'&&k&&text.includes(k))));
}
function chatIdentity(){const ctx=getContext();return String(ctx.getCurrentChatId?.()??ctx.chatId??'')+':'+String(ctx.characterId??ctx.groupId??'');}
function contextText(){const ctx=getContext();return proposalContextText(ctx.chat,ctx.name1);}
async function acceptProposal(proposal){
 if(running())throw Error('当前战斗尚未结束，请先结束本局');if(armory&&!await armory.close())throw Error('请先处理整备室未保存的修改');
 proposalFailure=null;proposalWarnings=proposal.warnings||[];const previousPending=pendingProposal;pendingProposal=proposal.changes.length?{...proposal,originalBook:clone(book),originalSources:clone(linkedBooks),originalDraft:clone(previousPending?.originalDraft||draft),originalName:loadedName,chat:chatIdentity()}:null;
 catalog=proposal.catalog;promptKey=null;setMobileView('config');draft={...proposal.scenario,mode:'auto'};configurationName=proposal.title;preparing=true;replay=false;renderEditor();updatePrompt();open();
 status(proposal.changes.length?'方案已校验；'+proposal.changes.length+'项资料待确认，当前仅用于本局。':'聊天战斗方案已校验；请检查双方与任务后开始。');
}
async function saveProposals(){
 assertIdle();if(!pendingProposal)return;const pending=pendingProposal;
 const plan=worldbookEditPlan(pending.originalBook,pending.book,pending.originalSources);
 if(!plan.writes.length){pendingProposal=null;renderEditor();return;}
 if(!window.confirm('将资料保存至以下世界书？\n'+plan.writes.map(w=>w.name).join('\n')))return;
 if(loadedName!==pending.originalName)throw Error('关联世界书已改变，请重新生成方案');
 const fresh=await Promise.all(pending.originalSources.map(async source=>({name:source.name,book:await readWorldbookFresh(source.name)})));
 for(const source of fresh){const expected=pending.originalSources.find(s=>s.name===source.name);if(JSON.stringify(source.book.entries)!==JSON.stringify(expected.book.entries))throw Error(source.name+'在审阅期间发生变化，请重新生成方案；未覆盖其他修改');}
 const nextBook=composeWorldbooks(plan.sources),nextCatalog=parseWorldbook(nextBook);
 const saved=[];try{for(const write of plan.writes){await persistBook(write.name,write.book);saved.push(write.name);}}catch(error){if(saved.length){pendingProposal=null;await loadLinkedBooks(linkedBooks.map(s=>s.name));}throw Error(error.message+(saved.length?'；已保存：'+saved.join('、')+'。其余资料请重新提取并核对。':''));}
 linkedBooks=plan.sources;book=nextBook;catalog=nextCatalog;pendingProposal=null;proposalFailure=null;promptKey=null;seen.clear();renderEditor();updatePrompt();status('已保存资料并回读验证：'+saved.join('、')+'；所有关联资料已刷新。');
}
function discardProposals(){assertIdle();if(!pendingProposal)return;proposalWarnings=[];catalog=parseWorldbook(pendingProposal.originalBook);draft=clone(pendingProposal.originalDraft);pendingProposal=null;promptKey=null;renderEditor();updatePrompt();status('已放弃资料建议，恢复原方案。');}
function updateReportUi(){
 if(!root)return;const state=reportHandoff?.snapshot()||{armed:false},text=$('report').value.trim(),valid=!!text&&text!=='GWS_BATTLE_REPORT'&&text!=='战斗进行中，尚未结算。'&&text.length<=4000,modified=state.armed&&!reportHandoff.matches(text);
 $('report').readOnly=running();$('inject-report').textContent=state.armed?'更新本轮战报':'本轮注入战报';
 $('inject-report').disabled=!valid||!settings.enabled||running()||busy||state.active;
 $('clear-report').disabled=!state.armed;$('report-injection').textContent=state.armed?(state.active?'正在用于本轮RP回复；成功后自动清空。':modified?'战报已修改，尚未更新注入。点击“更新本轮战报”后才会使用新内容。':'已注入下一次RP回复'+(state.name?'：'+state.name:'')+'。聊天输入框只需填写你的本轮指令。'):'未注入战报。可直接编辑战报，再点击“本轮注入战报”并正常发送聊天。输入框内容不会改变。';
 if(text.length>4000)$('report-injection').textContent+=' 战报现有'+text.length+'字，请精简至4000字以内再注入。';
 $('report-injection').classList.toggle('gws-injection-armed',state.armed);
}
async function injectReport(){
 assertIdle();const ctx=getContext();if(ctx.characterId===undefined&&!ctx.groupId)throw Error('请先打开要续写的角色聊天');
 const state=reportHandoff.arm($('report').value,recording?.battleName||recording?.name||'');promptKey=null;await updatePrompt();updateReportUi();status('已静默注入本轮战报（'+state.characters+'字符）；请在聊天框输入你的本轮指令后正常发送，不需要复制战报。');
}
function clearReportInjection(silent=false){
 const wasActive=reportHandoff?.snapshot().active;reportHandoff?.clear();promptKey=null;updateReportUi();updatePrompt();if(!silent)status('战报注入已清空，聊天输入内容未改动。'+(wasActive?'已发送的模型请求无法撤回。':''));
}
function reportConsumed(){promptKey=null;updateReportUi();status('本轮RP回复已接收，战报注入已自动清空。');}
function updatePrompt(){
 const ctx=getContext(),ready=settings.enabled&&loadedName&&catalog&&!running()&&!busy&&controllerActive()&&settings.autoScenario!==false;
 const key=ready?loadedName+':'+chatIdentity()+':'+(pendingProposal?'original':'saved')+':'+contextText():'';
 if(key===promptKey)return promptPending;promptKey=key;const epoch=++promptEpoch,ownerRoot=root;
 ctx.setExtensionPrompt(ID,'',1,0,false,0);ctx.setExtensionPrompt(HANDOFF,'',1,0,false,0);
 if(!ready){promptPending=Promise.resolve();return promptPending;}
 const promptCatalog=pendingProposal?.originalBook?parseWorldbook(pendingProposal.originalBook):catalog;
 promptPending=renderProposalPrompt(promptCatalog,contextText()).then(text=>{if(epoch===promptEpoch&&root===ownerRoot){ctx.setExtensionPrompt(ID,text,1,0,false,0);ctx.setExtensionPrompt(HANDOFF,"[高达战争模拟器 · 本轮输出检查] 如果当前将接敌、发动攻击、遭袭或玩家请求战斗，现在必须截断战斗正文并附一个<GWS_BATTLE>完整JSON</GWS_BATTLE>，只给开始条件，等玩家确认。已有交火但尚无本地战报时也应交接当前战局；不要继续虚构命中与胜负。其他角色卡的状态栏或正文格式照常，但不能省略本标记。战报仅描述已结束交战：纯战后续写、日常或回忆不触发；但本轮出现新的敌人、任务或明确的新一场交战时，可先参考战报续写再附下一场方案，不要重复已结算的旧战斗。合法引用及资料格式见高达战争模拟器战斗交接规则。",1,0,false,0);}}).catch(error=>{if(epoch===promptEpoch&&root===ownerRoot){promptKey=null;status(error.message,true);}});
 return promptPending;
}
async function readWorldbookFresh(name){
 const response=await fetch('/api/worldinfo/get',{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify({name}),cache:'no-store'});
 if(!response.ok)throw Error('无法读取世界书“'+name+'”，可能已删除或服务器不可用');
 return response.json();
}
function renderLinkedBooks(){
 const list=$('linked-books');list.replaceChildren();
 const disabled=running()||busy||bookLoading;
 for(const [index,source]of linkedBooks.entries()){
  const row=element('div',undefined,'gws-linked-book'),label=element('span',(index+1)+' · '+source.name);label.title=source.name;const nameCell=element('div',undefined,'gws-book-name'),rename=element('button');rename.innerHTML='<i class="fa-solid fa-pen" aria-hidden="true"></i>';rename.type='button';rename.className='gws-rename-book';rename.title='重命名世界书';rename.setAttribute('aria-label','重命名：'+source.name);rename.dataset.linkAction='rename';rename.dataset.linkIndex=index;rename.disabled=disabled;nameCell.append(label,rename);row.append(nameCell);
  for(const [action,text,title]of [['up','↑','提高优先级'],['down','↓','降低优先级'],['edit','整备','只编辑这本世界书'],['remove','×','移除关联，不删除世界书']]){const button=element('button',text);button.type='button';button.title=title;button.setAttribute('aria-label',title+'：'+source.name);button.dataset.linkAction=action;button.dataset.linkIndex=index;button.disabled=disabled||(action==='up'&&index===0)||(action==='down'&&index===linkedBooks.length-1);row.append(button);}list.append(row);
 }
 if(!linkedBooks.length)list.append(element('p','尚未关联参数世界书','gws-note'));
}
async function refreshBooks(fresh=false,selected=settings.worldbook){
 let names=getContext().getWorldInfoNames?.()||[];
 if(fresh||typeof getContext().getWorldInfoNames!=='function'){const response=await fetch('/api/settings/get',{method:'POST',headers:getContext().getRequestHeaders(),body:'{}',cache:'no-store'});if(!response.ok)throw Error('世界书列表刷新失败，请检查服务器后重试');const data=await response.json();if(!Array.isArray(data.world_names))throw Error('服务器返回的世界书列表无效');names=data.world_names;}
 availableBookNames=names;
 const input=$('worldbook');input.replaceChildren();const placeholder=element('option',names.length?'选择世界书后自动关联':'尚未导入世界书');placeholder.value='';input.append(placeholder);
 for(const name of names){const option=element('option',name);option.value=name;input.append(option);}
 input.value=names.includes(selected)?selected:'';return names;
}
function invalidateWorldbook(){
 loadedName='';book=null;catalog=null;linkedBooks=[];pendingProposal=null;proposalFailure=null;promptKey=null;seen.clear();proposalWarnings=[];preparation=null;
 $('form').replaceChildren();$('data-summary').textContent='请关联参数世界书';renderLinkedBooks();
 if(preparing&&renderer){renderer.reset();const canvas=$('canvas'),context=canvas.getContext('2d');context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);$('time').textContent='等待关联世界书';}
 for(const id of ['run','generate','regenerate','armory'])if($(id))$(id).disabled=true;updatePrompt();
}
async function loadLinkedBooks(names,{refreshList=false,editorName=$('worldbook').value,renamed=null}={}){
 assertIdle();if(armory&&!await armory.close())return;
 bookLoading=true;$('worldbook').disabled=true;$('refresh-books').disabled=true;renderLinkedBooks();status('正在读取关联世界书…');
 try{
  if(refreshList)await refreshBooks(true,editorName);
  const missing=names.filter(name=>!availableBookNames.includes(name));names=[...new Set(names)].filter(name=>availableBookNames.includes(name));
  if(!names.length){invalidateWorldbook();settings.worldbooks=[];settings.worldbook='';saveSettings();status(missing.length?'关联的世界书已删除，旧资料已清除。':'请选择或导入参数世界书。');return;}
  const sources=await Promise.all(names.map(async name=>{const content=await readWorldbookFresh(name);if(!Object.values(content.entries||{}).some(e=>!e.disable&&e.enabled!==false&&String(e.content||'').includes('<GWS_DATA>')))throw Error('“'+name+'”不是模拟器参数世界书，未添加关联；请导入SEED或00资料包。');return {name,book:content};})),composite=composeWorldbooks(sources),next=parseWorldbook(composite);
  if(renamed&&catalog)draft=remapRenamedScenario(draft,catalog,next,renamed.oldName,renamed.newName);
  try{draft=validateScenario(draft,next);}catch{draft=clone(next.options.defaultScenario);}
  linkedBooks=sources;book=composite;catalog=next;loadedName=names.join(' + ');pendingProposal=null;proposalFailure=null;proposalWarnings=[];promptKey=null;seen.clear();settings.worldbooks=names;settings.worldbook=names.includes(editorName)?editorName:names[0];$('worldbook').value=settings.worldbook;saveSettings();preparing=true;replay=false;
  renderEditor();$('armory').disabled=false;await updatePrompt();status('已读取 '+names.length+' 本关联世界书：'+next.machines.length+' 机体 / '+next.pilots.length+' 驾驶员。'+(missing.length?'已移除失效关联：'+missing.join('、'):'优先级从上到下。'));
 }catch(error){$('worldbook').value=settings.worldbook||'';throw error;}
 finally{bookLoading=false;$('worldbook').disabled=false;$('refresh-books').disabled=false;renderLinkedBooks();}
}
async function loadSelected(){
 const name=$('worldbook').value;if(!name)return;
 if(linkedBooks.some(s=>s.name===name)){settings.worldbook=name;saveSettings();return;}
 await loadLinkedBooks([...linkedBooks.map(s=>s.name),name],{editorName:name});
}
async function changeLinkedBook(action,index){
 assertIdle();const source=linkedBooks[index];if(!source)return;
 if(action==='rename'){await renameLinkedBook(source);return;}
 if(action==='edit'){$('worldbook').value=source.name;settings.worldbook=source.name;saveSettings();await openArmory();return;}
 const names=linkedBooks.map(s=>s.name);
 if(action==='remove')names.splice(index,1);else {const to=index+(action==='up'?-1:1);if(to<0||to>=names.length)return;[names[index],names[to]]=[names[to],names[index]];}
 if(pendingProposal&&!window.confirm('调整关联会放弃尚未保存的聊天资料建议，是否继续？'))return;
 await loadLinkedBooks(names);
}
function askBookName(source){
 return new Promise(resolve=>{const overlay=element('div',undefined,'gws-book-rename'),form=element('form'),heading=element('h3','重命名世界书'),label=element('label','新名称'),input=element('input'),error=element('p','', 'gws-rename-error'),actions=element('div',undefined,'gws-rename-actions'),cancel=element('button','取消'),submit=element('button','保存名称','gws-primary');
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','重命名世界书');input.value=source.name;input.maxLength=120;input.required=true;input.setAttribute('aria-label','世界书新名称');cancel.type='button';submit.type='submit';label.append(input);actions.append(cancel,submit);form.append(heading,label,error,actions);overlay.append(form);root.querySelector('.gws-panel').append(overlay);
 const done=value=>{overlay.remove();resolve(value);};cancel.onclick=()=>done(null);input.oninput=()=>error.textContent='';overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(null);}if(e.key==='Tab'){const focusables=[input,cancel,submit],i=focusables.indexOf(document.activeElement);e.preventDefault();focusables[(i+(e.shiftKey?2:1))%3].focus();}};
 form.onsubmit=e=>{e.preventDefault();try{const name=validWorldbookName(input.value);if(name!==source.name&&availableBookNames.some(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('同名世界书已存在，请换个名称');done(name);}catch(e){error.textContent=e.message;input.focus();}};input.focus();input.select();
 });
}
async function renameLinkedBook(source){
 assertIdle();if(armory&&!await armory.close())return;
 await refreshBooks(true,source.name);const newName=await askBookName(source);if(!newName||newName===source.name)return;
 if(pendingProposal&&!window.confirm('重命名会清除未保存的聊天资料建议，是否继续？'))return;
 await refreshBooks(true,source.name);
 bookLoading=true;renderLinkedBooks();status('正在重命名世界书…');
 try{await renameWorldbook({oldName:source.name,newName,context:getContext(),helper:window.TavernHelper,worldInfo:await import('/scripts/world-info.js'),read:readWorldbookFresh,names:availableBookNames});}
 finally{bookLoading=false;renderLinkedBooks();}
 const names=linkedBooks.map(s=>s===source?newName:s.name);await loadLinkedBooks(names,{refreshList:true,editorName:newName,renamed:{oldName:source.name,newName}});status('世界书已重命名为“'+newName+'”；关联顺序和当前方案已刷新。');
}
async function refreshWorldbooks(){return loadLinkedBooks(linkedBooks.map(s=>s.name),{refreshList:true});}
async function installBook(){
 assertIdle();const selected=WORLD_PACKS.filter(pack=>$('pack-'+pack.id)?.checked);if(!selected.length)throw Error('请至少选择一个资料包');
 const names=await refreshBooks(true),prepared=await Promise.all(selected.map(async pack=>{const replacement=await bundled(pack),prefix='高达战争模拟器 '+(pack.id==='00'?'00 ':'')+'v1.1 · '+crypto.randomUUID().slice(0,4);let name=prefix,n=2;while(names.includes(name))name=prefix+'-'+n++;names.push(name);replacement.name=name;parseWorldbook(replacement);return {name,book:replacement};}));
 const saved=[];try{for(const item of prepared){await persistBook(item.name,item.book);saved.push(item.name);}}finally{if(saved.length){await refreshBooks(true,saved.at(-1));await loadLinkedBooks([...linkedBooks.map(s=>s.name),...saved],{editorName:saved.at(-1)});}}
 $('pack-import').open=false;status('已导入并关联：'+saved.join('、')+'。可调整优先级或只保留其中一本。');
}
async function persistBook(name,replacement){
 const ctx=getContext();await ctx.saveWorldInfo(name,replacement,true);
 const verify=await fetch('/api/worldinfo/get',{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify({name}),cache:'no-cache'});
 if(!verify.ok)throw Error('世界书写入后回读失败，请检查服务器');
 const persisted=await verify.json();if(JSON.stringify(persisted.entries)!==JSON.stringify(replacement.entries))throw Error('世界书回读与写入内容不符，未确认导入成功');
 await ctx.updateWorldInfoList();await ctx.reloadWorldInfoEditor(name);
}
async function openArmory(){
 assertIdle();const name=$('worldbook').value,source=linkedBooks.find(s=>s.name===name);if(!source)throw Error('先选择一本已关联的世界书');if(pendingProposal)throw Error('请先保存或放弃聊天资料建议，再打开整备室');if(armory)return;
 const latest=await readWorldbookFresh(name);setMobileView('battle');root.querySelector('.gws-battle-content').hidden=true;
 armory=createArmory({book:latest,container:root.querySelector('main'),save:async replacement=>{
  const fresh=await Promise.all(linkedBooks.map(async s=>({name:s.name,book:await readWorldbookFresh(s.name)})));
  if(JSON.stringify(fresh.find(s=>s.name===name).book.entries)!==JSON.stringify(latest.entries))throw Error('该世界书在编辑期间已变化，请重新打开整备室，未覆盖外部修改');
  const nextSources=fresh.map(s=>s.name===name?{name,book:replacement}:s),composite=composeWorldbooks(nextSources),next=parseWorldbook(composite);
  await persistBook(name,replacement);latest.entries=clone(replacement.entries);linkedBooks=nextSources;book=composite;catalog=next;promptKey=null;proposalFailure=null;seen.clear();preparing=true;replay=false;
  try{draft=validateScenario(draft,catalog);}catch{draft=clone(catalog.options.defaultScenario);}
  renderEditor();renderLinkedBooks();updatePrompt();status('已保存 '+name+'；所有关联世界书和当前方案参数已刷新。');
 },onClose:()=>{armory=null;root.querySelector('.gws-battle-content').hidden=false;}});
 const heading=root.querySelector('.gws-armory-toolbar strong');heading.textContent='整备室 · '+name;
}
async function extractOrGenerate(){
 assertIdle();if(!settings.enabled||!loadedName)throw Error('请启用扩展并读取参数世界书');
 const found=latestChatProposal(getContext().chat,pendingProposal?.originalBook||book);
 if(found.state==='ready'){await acceptProposal(found.proposal);status('已提取最新AI楼层的战斗方案，未调用模型。');return;}
 if(found.state==='invalid'){proposalFailure={message:found.error,text:found.text.slice(0,60000)};renderEditor();}
 const message=found.state==='invalid'?'最新AI楼层有战斗方案，但校验失败：'+found.error+'。\n\n是否调用当前模型重新生成？这会调用模型，若格式校验失败最多再校正一次（最多两次请求）。':'最新AI楼层没有输出战斗方案。\n\n是否从当前对话调用模型手动生成？这会调用模型，若格式校验失败最多再校正一次（最多两次请求）。';
 if(!window.confirm(message)){status(found.state==='invalid'?'保留校验错误，未调用模型。':'最新AI楼层没有方案；已取消，未调用模型。');return;}
 return generate();
}
async function regenerateProposal(){
 assertIdle();if(!settings.enabled||!loadedName)throw Error('请启用扩展并选择参数世界书');
 if(!window.confirm('重新从当前对话生成战斗预设？这会调用模型，若格式校验失败最多再校正一次（最多两次请求），成功后替换当前方案。')){status('已取消重新生成，未调用模型。');return;}
 return generate();
}
async function generate(){
 assertIdle();if(!settings.enabled||!loadedName)throw Error('请启用扩展并读取参数世界书');
 const ctx=getContext();if(ctx.characterId===undefined&&!ctx.groupId)throw Error('模型生成需先打开对话；本地选项配置与战斗无需角色卡');
 busy=true;const epoch=++generationEpoch,ownerRoot=root,ownerChat=chatIdentity();renderEditor();updatePrompt();status('正在调用当前模型生成选项方案…');
 try{
  const proposalBook=pendingProposal?.originalBook||book,proposalCatalog=parseWorldbook(proposalBook);
  const context=contextText(),playerRequest=$('player-request').value.trim().slice(0,4000),referenceContext=playerRequest?context.slice(-12000)+'\n[玩家本次方案要求]\n'+playerRequest:context,prompt=await renderProposalPrompt(proposalCatalog,referenceContext,{manual:true});
  if(epoch!==generationEpoch||ownerChat!==chatIdentity()||root!==ownerRoot)return;
  const ordered=manualProposalMessages(prompt,context,playerRequest);
  let lastText='',lastError='';
  for(let attempt=0;attempt<2;attempt++){
   if(epoch!==generationEpoch||ownerChat!==chatIdentity()||root!==ownerRoot)return;
   activeGenerationId='gws-'+crypto.randomUUID();
   const ordered_prompts=attempt?manualProposalMessages(prompt,context,playerRequest,lastText,lastError):ordered;
   const raw=await requireDependencies().helper.generateRaw({generation_id:activeGenerationId,should_stream:false,max_chat_history:0,ordered_prompts});
   if(epoch!==generationEpoch||ownerChat!==chatIdentity()||root!==ownerRoot)return;
   let text=String(raw).trim();const fence=String.fromCharCode(96).repeat(3);if(text.startsWith(fence)&&text.endsWith(fence))text=text.slice(text.indexOf('\n')+1,-3).trim();
   let proposal;try{const noBattle=parseNoBattle(text);if(noBattle){proposalFailure=null;proposalWarnings=[];status('当前对话没有待接入的战斗：'+noBattle);return;}proposal=parseManualProposal(text,proposalBook);}
   catch(error){lastText=text.slice(0,20000);lastError=error.message;proposalFailure={message:error.message,text:text.slice(0,60000)};if(attempt||text.length>20000)throw error;status('方案未通过校验：'+error.message+'；正在让模型校正一次…');continue;}
   await acceptProposal(proposal);if(attempt)status('方案已校正并通过本地校验；请核对任务和待确认资料（本次2次模型请求）。');return;
  }
 }finally{if(root===ownerRoot){activeGenerationId='';busy=false;renderEditor();updatePrompt();}}
}
async function openMessageProposal(messageId){
 assertIdle();if(!settings.enabled||!loadedName)throw Error('请启用扩展并选择参数世界书');
 const message=getContext().chat[messageId];if(!Number.isInteger(messageId)||!message||message.is_user||message.is_system)throw Error('找不到该按钮所在的AI回复，请刷新聊天后重试');
 const text=String(message.mes||'');let proposal;
 try{proposal=parseProposal(text,pendingProposal?.originalBook||book);if(!proposal)throw Error('该楼层没有完整的战斗方案');}
 catch(error){proposalFailure={message:error.message,text:text.slice(0,60000)};renderEditor();open();throw error;}
 await acceptProposal(proposal);status('已导入第'+(messageId+1)+'楼的战斗方案；请检查后确认开始，未调用模型。');
}
async function readChat(messageId){
 if(!catalog||!loadedName||!settings.enabled||running()||busy)return;
 const ctx=getContext(),i=typeof messageId==='number'?messageId:ctx.chat.length-1,m=ctx.chat[i];if(!m||m.is_user||m.is_system)return;
 const text=String(m.mes||'');let fingerprint=2166136261;for(let n=0;n<text.length;n++)fingerprint=Math.imul(fingerprint^text.charCodeAt(n),16777619);const key=chatIdentity()+':'+i+':'+(m.swipe_id||0)+':'+text.length+':'+(fingerprint>>>0);if(seen.has(key))return;
 let parsed;try{parsed=parseProposal(text,pendingProposal?.originalBook||book);}catch(error){proposalFailure={message:error.message,text:text.slice(0,60000)};renderEditor();throw error;}if(!parsed)return;if(seen.size>100)seen.clear();seen.add(key);status('本楼层战斗方案已校验；阅读正文后点击“进入战斗”载入并检查。');
}
function stopWorker(){if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}worker=null;working=false;}
function start(){
 assertIdle();if(!settings.enabled||!loadedName)throw Error('先启用并读取参数世界书');
 if(armory)throw Error('请先保存或关闭整备室，再开始战斗');
 reportHandoff?.clear();const scenario=validateScenario(clone(draft),catalog),seed=scenario.seed??crypto.getRandomValues(new Uint32Array(1))[0];
 setMobileView('battle');stopWorker();renderer.reset();$("seek").disabled=true;current=previous=null;events=[];frameLogVersion=-1;preparing=false;replay=false;paused=false;autoPauseUntil=0;battleScenario=clone(scenario);lastDecisionPause=-10;
 recording={schemaVersion:4,id:crypto.randomUUID(),name:configurationName+'-'+new Date().toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-').replaceAll(':','-'),createdAt:new Date().toISOString(),engineVersion:'v1.0',seed,battleName:configurationName,startConditions:{version:1,scenario:{...clone(scenario),seed}},scenario:clone(scenario),environment:clone(catalog.environments.find(x=>x.id===scenario.environmentId)),frames:[],events:[],effects:[],result:null};
 const firstA=scenario.deployments?.find(x=>x.id.startsWith('a-'))?.id||'a-0-0',firstB=scenario.deployments?.find(x=>x.id.startsWith('b-'))?.id||'b-0-0';renderer.focus=scenario.focus==='a'?firstA:scenario.focus==='b'?firstB:scenario.focus;$('camera').value=renderer.focus;$('report').value='战斗进行中，尚未结算。';updateReportUi();
 worker=new Worker(asset('battle-worker.js'),{type:'module'});
 worker.onerror=e=>failBattle('战斗线程异常：'+e.message);
 worker.onmessage=async({data})=>{
  if(data.type==='command-rejected'){working=false;status(data.message,true);updateCommandPanel();return;}
  if(data.type==='command-state'){previous=current=data.snapshot;events.push(...data.events);working=false;receivedAt=performance.now();status('我方指令已下达，战斗保持暂停；点击继续执行。');updateHud();return;}
  if(data.type==='error'){failBattle(data.message);return;}
  if(!current)renderer.fitPreparation(data.snapshot.units);
  previous=current||data.snapshot;current=data.snapshot;receivedAt=performance.now();events.push(...data.events);if(data.recordHeader&&events.length>4000)events.splice(0,events.length-4000);if(data.recordHeader)recording={...recording,...data.recordHeader};else recording.frames.push(...data.frames.map(f=>({...f,effects:[]})));if(recording.schemaVersion!==6)recording.events.push(...data.events);if(recording.schemaVersion!==6)recording.effects.push(...(data.effects||[]).filter(e=>['beam','tracer','slash','clash','dodge-jet'].includes(e.type)));
  const aiDecision=data.events.some(e=>['decision','strategy','strategy-roll','interruption','guard-break','defense','warning','reaction'].includes(e.type));
  if(aiDecision&&!current.result)autoPauseUntil=performance.now()+120;
  const pauseEvents=playerPauseEvents(data.events,battleScenario.mode,battleScenario.focus);
  if(pauseEvents.length&&!current.result){paused=true;lastDecisionPause=current.t;status('玩家决策暂停：'+pauseEvents.slice(0,3).map(e=>e.text).join(' / ')+'。可下达我方指令，或点击继续。');}

  if(data.recordHeader&&data.recordHeader.frameCount===1&&data.recordHeader.chunkCount===0){try{await store.put({...data.recordHeader,pending:true});}catch(e){failBattle("无法开始录像保存："+e.message);return;}}
  if(data.chunk){try{await store.putChunk(recording.id,data.chunk);worker?.postMessage({type:'ack',index:data.chunk.index});}catch(e){recording.unsavedChunk=data.chunk;failBattle('录像块保存失败：'+e.message);return;}}working=false;
  if(current.result){paused=true;stopWorker();recording.result=clone(current.result);guard(finish)();}
 };
 working=true;receivedAt=performance.now();worker.postMessage({type:'init',catalog:clone(catalog),scenario,seed,recordMeta:recording});renderEditor();updatePrompt();open();status('战斗运行中；仅本地计算，种子 '+seed);
}
function failBattle(message){stopWorker();paused=true;if(current){current.result={reason:'error',winner:null,t:current.t};recording.result=clone(current.result);if(recording.schemaVersion!==6)recording.frames.push(clone(current));$('report').value=battleReport();}renderEditor();updatePrompt();status(message+(recording?.schemaVersion===6?'；本局已中止，可复制战报；可以导出已写入块及未确认块作为部分录像；尚未写出块时只能复制战报。':'；本局已中止，可导出已有记录。'),true);}
function battleReport(snapshot=current,log=events,record=recording){return buildRpBattleReport(snapshot,log,record);}

async function finish(){
 busy=true;$('report').value=battleReport();renderEditor();updatePrompt();
 const completed=recording,ownerRoot=root;try{await store.put(completed.schemaVersion===6?Object.fromEntries(Object.entries(completed).filter(([k])=>!['frames','events','effects','scenario'].includes(k))):validateRecording(compactRecording(completed)));if(root!==ownerRoot)return;await renderLibrary();if(recording===completed)status('战斗结束，录像已保存。可编辑战报后注入本轮RP。');}catch(e){if(root===ownerRoot&&recording===completed)status('战斗结束，但录像未保存：'+e.message+'。请立即导出JSON。',true);}
 busy=false;if(root===ownerRoot){renderEditor();updatePrompt();}
}

function abortBattle(){if(!running())return;if(recording.schemaVersion===6){paused=true;working=true;worker.postMessage({type:'finalize'});return;}stopWorker();paused=true;if(current){current.result={reason:'aborted',winner:null,t:current.t};recording.result=current.result;recording.frames.push(clone(current));guard(finish)();}renderEditor();updatePrompt();}

function updateCameraOptions(units=current?.units||[]){const camera=$('camera');if(!camera)return;const keep=renderer.focus,key=units.map(u=>unitLabel(u)).join("|");if(camera.dataset.units===key){camera.value=keep;return;}camera.dataset.units=key;camera.replaceChildren(element('option','全景'));camera.firstChild.value='overall';for(const u of units){const option=element('option',unitLabel(u));option.value=u.id;camera.append(option);}camera.value=[...camera.options].some(o=>o.value===keep)?keep:'overall';if(camera.value!==renderer.focus)renderer.focus=camera.value;}
function updateCommandPanel(){
 const panel=$('command-panel');if(!panel)return;panel.hidden=!running()||replay||!paused;if(panel.hidden)return;
 const form=$('command-form'),eligible=current.units.filter(u=>u.side==='a'&&u.alive&&!u.docked&&!u.disabled),key=eligible.map(u=>u.id+u.name).join('|');
 if(form.dataset.units!==key){const keep=$('command-units')?.value,type=$('command-type')?.value;form.replaceChildren();form.dataset.units=key;
  const groups=[...new Set(eligible.map(u=>u.groupIndex))];select('command-units','我方单位',[['all','全部我方'],...groups.map(g=>['group:'+g,'编组 '+(g+1)]),...eligible.map(u=>[u.id,unitLabel(u)])],keep||'all',form);
  select('command-type','战术指令',Object.entries(COMMAND_LABELS),type||'attack',form);
  select('command-target','目标单位',[],null,form);const point=element('div',undefined,'gws-command-point');point.id='gws-command-point';for(const [i,label]of ['X','高度 Y','Z'].entries())numeric('command-point-'+i,label,0,point,{min:-200000,max:200000});form.append(point);
  const send=element('button','下达我方指令');send.id='gws-command-send';send.type='button';form.append(send);$('command-type').addEventListener('change',refreshCommandTargets,{signal:abort.signal});$('command-units').addEventListener('change',refreshCommandTargets,{signal:abort.signal});refreshCommandTargets();
 }
 refreshCommandTargets();$('command-send').disabled=working||!eligible.length;
 $('command-status').textContent=(current.commands||[]).filter(c=>c.unitId.startsWith('a-')).map(c=>unitLabel(current.units.find(u=>u.id===c.unitId))+'：'+(c.source==='player'?'玩家':'AI')+' '+COMMAND_LABELS[c.type]).join(' / ');
}
function refreshCommandTargets(){
 const type=$('command-type')?.value,target=$('command-target');if(!target)return;
 const selection=$('command-units').value;
 const keep=target.value,units=commandTargetUnits(current?.units||[],type,selection),key=type+'|'+units.map(u=>unitLabel(u)).join('|');
 if(target.dataset.options!==key){target.dataset.options=key;target.replaceChildren();for(const u of units){const option=element('option',unitLabel(u));option.value=u.id;target.append(option);}if(units.some(u=>u.id===keep))target.value=keep;}
 target.disabled=!units.length;if(!units.length){target.replaceChildren(element('option',type==='escort'?'没有其他可护卫单位':'没有可选目标'));target.firstChild.value='';}target.closest('label').hidden=!['attack','screen','escort'].includes(type);$('command-point').hidden=type!=='withdraw';
}
function sendCommand(){
 if(!running()||replay||!paused||working)throw Error('请在本地战斗暂停且计算完成后下达指令');
 const selection=$('command-units').value,type=$('command-type').value;
 const unitIds=commandRecipients(current.units,selection,type,$('command-target').value).map(u=>u.id);
 if(!unitIds.length)throw Error('没有可执行指令的我方单位');
 if(['attack','screen','escort'].includes(type)&&!$('command-target').value)throw Error('没有可选目标单位');
 const command={type,unitIds};if(['attack','screen','escort'].includes(type))command.targetId=$('command-target').value;
 if(type==='withdraw')command.point=[0,1,2].map(i=>Number($('command-point-'+i).value));
 working=true;worker.postMessage({type:'command',requestId:crypto.randomUUID(),command});updateCommandPanel();
}

function updateHud(){
 if(!current)return;const state=replay?(paused?'录像暂停':'只读重放'):current.result?'已结束':paused?'手动暂停':performance.now()<autoPauseUntil?'本地决策暂停':'本地运行';
 $('time').textContent=(replay?replayTime:current.t).toFixed(1)+'s · '+state+' · '+speed+'×';updateCameraOptions(current.units);
 for(const side of ['a','b','c']){const box=$('hud-'+side);box.hidden=!current.units.some(u=>u.side===side);renderUnitPanel(box,current.units,side,renderer.focus);}
 const logVersion=events.length+":"+(events.at(-1)?.id??events.at(-1)?.t??0);if(frameLogVersion!==logVersion){frameLogVersion=logVersion;const log=$('log');log.replaceChildren();for(const e of events.slice(-90))log.append(element('div',e.t.toFixed(1)+'s  '+e.text,'gws-log-'+e.type));log.scrollTop=log.scrollHeight;}
 $('pause').textContent=paused?'继续':'暂停';updateCommandPanel();
}
function replayEnd(){const end=recording.frames.at(-1).t;return end+Math.min(3,Math.max(0,...(recording.frames.at(-1).effects||[]).map(e=>e.t+e.life-end)));}
function animate(now){
 raf=requestAnimationFrame(animate);const delta=Math.min((now-lastReal)/1000,0.15);lastReal=now;if(document.hidden)return;
 if(worker&&!working&&!paused&&now>=autoPauseUntil&&now-receivedAt>=50/Math.min(1,speed)){working=true;worker.postMessage({type:'advance',steps:speed>1?Math.round(speed):1,mode:battleScenario.mode,focus:battleScenario.focus});}
 if(replay&&recording&&!paused){replayTime=Math.min(replayTime+delta*speed,replayEnd());while(replayIndex+1<recording.frames.length&&recording.frames[replayIndex+1].t<=replayTime)replayIndex++;
  $("seek").disabled=false;$("seek").max=recording.duration||recording.frames.at(-1).t;$("seek").value=replayTime;
  previous=recording.frames[replayIndex];current=recording.frames[Math.min(replayIndex+1,recording.frames.length-1)];events=timeline.at(replayTime).events;if(replayTime>=replayEnd())paused=true;
 }
 const displaySnapshot=preparing?preparation:current,drawInterval=(displaySnapshot?.units.length>32?1000/30:1000/60)-1,drawDue=now-lastDraw>=drawInterval;
 if(preparing&&preparation&&!root.querySelector('.gws-panel').hidden&&!armory&&drawDue){lastDraw=now;renderer.draw(preparation,catalog.environments.find(e=>e.id===draft.environmentId),null,1);$('time').textContent='准备部署';}
 if(!preparing&&current&&!root.querySelector('.gws-panel').hidden&&!armory&&drawDue){
  lastDraw=now;
  const alpha=replay?(current.t===previous?.t?1:(replayTime-previous.t)/(current.t-previous.t)):paused?1:Math.min(1,(now-receivedAt)/(50/Math.min(1,speed)));
  const displayTime=replay?replayTime:current.result?current.t+Math.min(3,(now-receivedAt)/1000):previous?previous.t+(current.t-previous.t)*Math.max(0,alpha):current.t;const display=replay?{...current,t:displayTime,events,effects:timeline.at(displayTime).effects}:{...current,t:displayTime,events:recording.schemaVersion===6?undefined:recording.events};renderer.draw(display,recording.environment,previous,Math.max(0,alpha));if(now-lastHud>150){lastHud=now;updateHud();}
 }
}
function updateLibrarySelection(){
 const count=selectedRecordings.size,all=$('library-all');all.checked=libraryIds.length>0&&count===libraryIds.length;all.indeterminate=count>0&&count<libraryIds.length;
 $('library-count').textContent='已选'+count+'条';$('library-export').disabled=$('library-delete').disabled=count===0;
 for(const input of $('library').querySelectorAll('input[data-record-select]'))input.checked=selectedRecordings.has(input.dataset.recordSelect);
}
async function renderLibrary(){const list=$('library');list.replaceChildren();const rows=await store.list();libraryIds=rows.map(r=>r.id);selectedRecordings=new Set([...selectedRecordings].filter(id=>libraryIds.includes(id)));for(const r of rows){
 const row=element('div',undefined,'gws-recording'),check=element('input');check.type='checkbox';check.dataset.recordSelect=r.id;check.setAttribute('aria-label','选择录像 '+r.name);row.append(check,element('span',r.name));
 for(const [action,label]of [['play','播放'],['conditions','导入开始条件'],['export','导出'],['rename','改名'],['delete','删除']]){const b=element('button',label);b.type='button';b.dataset.record=r.id;b.dataset.action=action;if(action==='play'&&![2,3,4,5,6].includes(r.schemaVersion)){b.disabled=true;b.title='当前播放器支持v2-v6';}row.append(b);}list.append(row);
 }if(!list.children.length)list.append(element('p','本局结束后自动保存；不再自动添加旧演示录像。'));updateLibrarySelection();}
async function exportSelectedRecordings(){const ids=[...selectedRecordings];if(!ids.length)return;const records=[];for(const id of ids){const r=await store.get(id);if(r)records.push(validateRecording(compactRecording(r)));}if(!records.length)throw Error('所选录像已不存在');download({bundleVersion:1,recordings:records},'高达录像合集-'+records.length+'条.json');status('已导出'+records.length+'条录像，可一次导入合集JSON。');}
async function deleteSelectedRecordings(){const ids=[...selectedRecordings];if(!ids.length)return;if(!window.confirm('删除所选'+ids.length+'条录像？此操作无法撤销。'))return;await store.deleteMany(ids);selectedRecordings.clear();await renderLibrary();status('已删除'+ids.length+'条录像。');}
async function libraryAction(button){
 const id=button.dataset.record,stored=await store.get(id);if(!stored)throw Error('录像已不存在');
 if(button.dataset.action==='conditions'){await importConditions(stored);return;}
 if(button.dataset.action==='export'){download(validateRecording(compactRecording(stored)),stored.name+'.json');return;}
 if(button.dataset.action==='delete'){if(window.confirm('删除录像“'+stored.name+'”？')){await store.delete(id);await renderLibrary();}return;}
 if(button.dataset.action==='rename'){const name=window.prompt('录像名称',stored.name);if(name?.trim()){stored.name=name.trim().slice(0,160);await store.put(stored);await renderLibrary();}return;}
 assertIdle();if(armory&&!await armory.close())return;validateRecording(stored);const r=expandRecording(stored);if(!r.effects){const effects=new Map();for(const f of r.frames)for(const e of f.effects)effects.set(JSON.stringify(e),e);r.effects=[...effects.values()].sort((a,b)=>a.t-b.t);}recording=r;timeline=new PlaybackTimeline(r);preparing=false;replay=true;replayTime=0;replayIndex=0;current=r.frames[0];previous=current;events=[];frameLogVersion=-1;paused=false;renderer.reset();renderer.fitPreparation(current.units);setMobileView('battle');open();$('report').value=battleReport(r.frames.at(-1),r.events,r);updateReportUi();status('播放 '+r.name+'；只读记录，不重新计算规则。');
}
async function importRecording(file){if(!file)return;if(file.size>256000000)throw Error('录像或合集超过256MB限制');const data=JSON.parse(await file.text()),items=data.bundleVersion===1?data.recordings:[data];if(!Array.isArray(items)||!items.length||items.length>1000)throw Error('录像合集需包含1—1000条记录');const records=items.map(item=>{const r=compactRecording(validateRecording(item));r.id=crypto.randomUUID();return validateRecording(r);});await store.putMany(records);await renderLibrary();status('已导入'+records.length+'条录像');}
function setMobileView(view){
 if(!root)return;root.dataset.mobileView=view;
 for(const id of ['config','battle'])$('mobile-'+id)?.setAttribute('aria-pressed',String(id===view));
}
async function showMobileView(view){
 if(view==='config'&&armory&&!await armory.close())return;
 setMobileView(view);
}
function bindViewport(){
 const update=()=>{if(!root)return;const vv=window.visualViewport;root.style.setProperty('--gws-viewport-height',(vv?.height||window.innerHeight)+'px');root.style.setProperty('--gws-viewport-top',(vv?.offsetTop||0)+'px');};
 window.addEventListener('resize',update,{signal:abort.signal});
 window.visualViewport?.addEventListener('resize',update,{signal:abort.signal});
 window.visualViewport?.addEventListener('scroll',update,{signal:abort.signal});update();
}
function setMapFullscreen(enabled){if(!root)return;root.classList.toggle('gws-map-fullscreen',enabled);const button=$('fullscreen');button.textContent=enabled?'退出全屏':'全屏地图';button.setAttribute('aria-pressed',String(enabled));$('canvas').focus();}
function toggleMapFullscreen(){if(armory)throw Error('请先关闭整备室');setMapFullscreen(!root.classList.contains('gws-map-fullscreen'));}
export function open(){if(root&&settings.enabled){clearStatusError('请选择方案或继续操作。');root.querySelector('.gws-panel').hidden=false;}}
function cancelGeneration(){generationEpoch++;if(activeGenerationId)window.TavernHelper?.stopGenerationById?.(activeGenerationId);activeGenerationId='';}
export function dispose(){reportHandoff?.clear();reportHandoff=null;cancelGeneration();promptEpoch++;busy=false;abort?.abort();stopWorker();cancelAnimationFrame(raf);renderer?.dispose();store?.close();for(const [event,handler]of hostEvents)getContext().eventSource.removeListener(event,handler);hostEvents=[];getContext().setExtensionPrompt(ID,'',1,0);getContext().setExtensionPrompt(HANDOFF,'',1,0);root?.remove();root=null;armory=preparation=null;current=previous=recording=null;catalog=draft=book=null;linkedBooks=[];availableBookNames=[];pendingProposal=null;promptKey=null;loadedName='';events=[];replay=false;paused=true;seen.clear();selectedRecordings.clear();libraryIds=[];uiQueue=Promise.resolve();delete window.GundamWarSimulator;}
export async function init(){
 if(root)return;requireDependencies();preparing=true;const ctx=getContext();settings=ctx.extensionSettings[ID]??={worldbook:'高达战争模拟器'};settings.enabled=false;settings.launcherVisible??=true;settings.autoScenario??=true;settings.showFireArcs??=true;settings.panelPosition??={right:18,bottom:18};settings.worldbooks??=settings.worldbook?[settings.worldbook]:[];
 abort=new AbortController();store=new RecordingStore();root=element('section');root.id=ID;root.dataset.mobileView='config';const ownerRoot=root;
 root.innerHTML='<button type="button" class="gws-launch" id="gws-open">高达战争模拟器</button><div class="gws-panel" hidden><header><div><small>GUNDAM WAR SIMULATOR</small><h2>高达战争模拟器</h2></div><div class="gws-header-actions"><button id="gws-generate">从对话提取预设</button><button id="gws-regenerate">重新生成预设</button><button id="gws-run" class="gws-primary">确认方案 · 开始本地战斗</button><button id="gws-abort">结束本局</button></div><button id="gws-action-help" type="button" aria-label="作战操作说明">?</button><button id="gws-close" type="button" aria-label="关闭面板">关闭</button></header><div id="gws-status" role="status" aria-live="polite">正在读取数据…</div><nav class="gws-mobile-nav" aria-label="模拟器页面"><button id="gws-mobile-config" type="button" aria-controls="gws-config-pane" aria-pressed="true">作战配置</button><button id="gws-mobile-battle" type="button" aria-controls="gws-battle-pane" aria-pressed="false">战术地图</button></nav><div class="gws-layout"><aside id="gws-config-pane" class="gws-config"><div class="gws-bookbar"><label>世界书（选择后自动关联）<select id="gws-worldbook"></select></label><div id="gws-linked-books" class="gws-linked-books"></div><p class="gws-note">上方优先；同书内部引用先用自身资料。整备室只编辑所选一本。</p><label class="gws-launcher-setting"><input type="checkbox" id="gws-launcher-visible">显示悬浮按钮</label><button id="gws-refresh-books" type="button" title="重新读取世界书列表和当前选中的内容">刷新世界书</button><details id="gws-pack-import" class="gws-pack-import"><summary>导入世界书资料包</summary><div class="gws-pack-options"><label><input type="checkbox" id="gws-pack-seed" checked> SEED资料包</label><label><input type="checkbox" id="gws-pack-00"> 高达00资料包</label><button id="gws-import-book">导入所选（新建副本）</button></div></details></div><form id="gws-form"></form><p id="gws-data-summary" class="gws-note"></p><div class="gws-manual-request"><label for="gws-player-request">玩家要求（手动生成，可选）</label><textarea id="gws-player-request" rows="4" maxlength="4000" placeholder="例如：增加两台友军掩护，以保护母舰并限时撤离为目标；敌方从两侧追击。" aria-describedby="gws-player-request-tip"></textarea><p id="gws-player-request-tip" class="gws-note">始终参考当前聊天；填写后按你的要求调整指定部分，未要求改变的背景和参战者保留。留空则按上下文生成；提取已有方案时不改写，想应用要求请点“重新生成预设”。</p><button id="gws-clear-player-request" type="button">清空要求</button></div></aside><main id="gws-battle-pane"><div class="gws-battle-content"><div class="gws-stage"><canvas id="gws-canvas" tabindex="0" aria-label="三维多域战场，单指旋转，双指缩放和平移；鼠标拖动旋转、右键平移、滚轮缩放"></canvas><div class="gws-stage-title">多域交战 / 3D TACTICAL VIEW</div><button id="gws-fullscreen" class="gws-fullscreen" title="展开地图，占满当前网页" aria-pressed="false">全屏地图</button><div class="gws-camera-note"><span class="gws-desktop-gesture">拖动旋转 · 右键/WASD平移 · 滚轮缩放</span><span class="gws-touch-gesture">单指旋转 · 双指缩放/平移</span></div></div><div class="gws-playbar"><button id="gws-pause">暂停</button><label>速度<select id="gws-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label class="gws-camera-control">镜头<select id="gws-camera"><option value="overall">全景</option></select></label><label>射界<select id="gws-fire-arcs"><option value="on">显示</option><option value="off">隐藏</option></select></label><button id="gws-reset-camera">重置镜头</button><label class="gws-seek-control">录像进度<input id="gws-seek" type="range" min="0" max="1" step="0.2" value="0" disabled aria-label="录像播放位置"></label><span id="gws-time">等待开始</span></div><details id="gws-command-panel" class="gws-command-panel" hidden><summary>我方战术指挥（暂停时下达）</summary><div id="gws-command-form" class="gws-command-form"></div><div id="gws-command-status" class="gws-note"></div></details><div class="gws-huds"><div id="gws-hud-a"></div><div id="gws-hud-b"></div><div id="gws-hud-c" hidden></div></div><div id="gws-log" class="gws-log" aria-label="战场实时日志"></div><details><summary>本轮战报 / 写回聊天</summary><p class="gws-note">战报可直接编辑；注入只使用点击时的内容，不改录像。修改已注入的战报后，请再次点击更新。刷新网页会清空注入。</p><textarea id="gws-report" aria-label="可编辑的战报文本" placeholder="战斗结束或打开录像后可编辑战报；也可以填写自己的战后交接内容。"></textarea><p id="gws-report-injection" class="gws-note" role="status" aria-live="polite"></p><div class="gws-report-actions"><button id="gws-inject-report" type="button" class="gws-primary">本轮注入战报</button><button id="gws-clear-report" type="button">清空注入</button><button id="gws-copy" type="button">复制战报（备用）</button><button id="gws-export-current" type="button">导出本局录像</button></div></details><details><summary>录像库</summary><label>导入 JSON<input id="gws-file" type="file" accept=".json,application/json"></label><div class="gws-library-tools"><label><input id="gws-library-all" type="checkbox">全选</label><span id="gws-library-count">已选0条</span><button id="gws-library-export">导出所选</button><button id="gws-library-delete">删除所选</button><button id="gws-library-refresh">刷新录像库</button></div><div id="gws-library"></div></details></div></main></div></div>';
 document.body.append(root);bindViewport();renderer=new BattleRenderer($('canvas'));renderer.showFireArcs=settings.showFireArcs;$('fire-arcs').value=settings.showFireArcs?'on':'off';$('fire-arcs').addEventListener('change',()=>{settings.showFireArcs=$('fire-arcs').value==='on';renderer.showFireArcs=settings.showFireArcs;saveSettings();},{signal:abort.signal});
 $('launcher-visible').checked=settings.launcherVisible;const launcher=root.querySelector('.gws-launch');launcher.style.right=(settings.panelPosition.right??18)+'px';launcher.style.bottom=(settings.panelPosition.bottom??18)+'px';launcher.hidden=!settings.launcherVisible||!settings.enabled;let launchDrag=null,launchMoved=false;launcher.addEventListener('pointerdown',e=>{launchMoved=false;launchDrag={x:e.clientX,y:e.clientY,right:parseFloat(launcher.style.right),bottom:parseFloat(launcher.style.bottom)};launcher.setPointerCapture(e.pointerId);});launcher.addEventListener('pointermove',e=>{if(!launchDrag)return;const dx=e.clientX-launchDrag.x,dy=e.clientY-launchDrag.y;if(Math.hypot(dx,dy)>5)launchMoved=true;launcher.style.right=Math.max(4,launchDrag.right-dx)+'px';launcher.style.bottom=Math.max(4,launchDrag.bottom-dy)+'px';});launcher.addEventListener('pointerup',()=>{if(!launchDrag)return;settings.panelPosition={right:parseFloat(launcher.style.right),bottom:parseFloat(launcher.style.bottom)};launchDrag=null;saveSettings();});launcher.addEventListener('click',event=>{if(launchMoved){event.preventDefault();event.stopPropagation();launchMoved=false;}});
 reportHandoff=createReportHandoff({chatId:chatIdentity,enabled:()=>!!settings.enabled,helper:{injectPrompts:(...args)=>{const helper=requireDependencies().helper;if(typeof helper.injectPrompts!=='function'||typeof helper.uninjectPrompts!=='function')throw Error('当前酒馆助手缺少提示注入接口，请更新酒馆助手');return helper.injectPrompts(...args);},uninjectPrompts:ids=>{if(typeof window.TavernHelper?.uninjectPrompts==='function')window.TavernHelper.uninjectPrompts(ids);else getContext().setExtensionPrompt(REPORT_PROMPT_ID,'',1,0,false,0);}}});
 const actions={'action-help':()=>window.alert('从对话提取预设先读取最新AI方案；缺失或错误时，经确认才调用模型。重新生成会结合聊天和玩家要求调用模型。手选方案无需模型，战斗与录像播放也不调用模型。结束本局会终止当前战斗并保存已有结果。'),'mobile-config':()=>showMobileView('config'),'mobile-battle':()=>showMobileView('battle'),'clear-player-request':()=>{$('player-request').value='';},'save-proposals':saveProposals,'discard-proposals':discardProposals,'swap-sides':()=>{assertIdle();draft=validateScenario(swapScenarioSides(draft),catalog);preparing=true;replay=false;renderEditor();configurationCorrected();status('已交换敌我编队、单位引用和胜败条件。');},'command-send':sendCommand,open,close:async()=>{if(armory&&!await armory.close())return;setMapFullscreen(false);root.querySelector('.gws-panel').hidden=true;},'import-book':installBook,'refresh-books':refreshWorldbooks,reload:refreshWorldbooks,generate:extractOrGenerate,regenerate:regenerateProposal,run:start,abort:abortBattle,pause:()=>{if(!settings.enabled&&!replay)throw Error('请先启用扩展');paused=!paused;if(!paused&&replay&&replayTime>=replayEnd()){replayTime=0;replayIndex=0;renderer.reset();}},'reset-camera':()=>{renderer.reset();renderer.fitPreparation((preparing?preparation:current)?.units||[]);},fullscreen:toggleMapFullscreen,'library-export':exportSelectedRecordings,'library-delete':deleteSelectedRecordings,'library-refresh':renderLibrary,'export-current':async()=>{if(!recording)throw Error('尚无本局录像');if(recording.schemaVersion===6){if(running())throw Error('请先结束本局再导出完整录像');let stored=await store.get(recording.id);if(recording.result?.reason==='error'){const chunks=await store.chunkRows(recording.id);if(recording.unsavedChunk&&!chunks.some(c=>c.index===recording.unsavedChunk.index))chunks.push(recording.unsavedChunk);chunks.sort((a,b)=>a.index-b.index);if(!chunks.length)throw Error('尚无可导出的录像块，请复制战报');const {unsavedChunk,frames,events,effects,scenario,...header}=recording;stored={...header,partial:true,pending:false,chunks,chunkCount:chunks.length,frameCount:chunks.reduce((n,c)=>n+c.frames.length,0),duration:chunks.at(-1).frames.at(-1)[0]};stored.result={reason:'error',winner:null,t:stored.duration};}if(!stored)throw Error('录像未完整保存');download(validateRecording(stored),recording.name+'.json');}else download(compactRecording(recording),recording.name+'.json');},'inject-report':injectReport,'clear-report':()=>clearReportInjection(),copy:async()=>{const text=$('report').value;if(!text)throw Error('尚无战报');try{await navigator.clipboard.writeText(text);status('战报已复制');}catch{$('report').focus();$('report').select();status('浏览器未允许自动复制，文本已选中，请手动复制。');}}};
 $('report').addEventListener('input',updateReportUi,{signal:abort.signal});
 root.addEventListener('change',e=>{if(e.target.closest('#gws-pack-import')||e.target.id==='gws-player-request')clearStatusError();if(e.target.id==='gws-launcher-visible'){window.GundamWarSimulator?.setLauncherVisible(e.target.checked);return;}if(e.target.id==='gws-library-all'){selectedRecordings=e.target.checked?new Set(libraryIds):new Set();updateLibrarySelection();}else if(e.target.dataset.recordSelect){const id=e.target.dataset.recordSelect;e.target.checked?selectedRecordings.add(id):selectedRecordings.delete(id);updateLibrarySelection();}},{signal:abort.signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root?.classList.contains('gws-map-fullscreen')){e.preventDefault();setMapFullscreen(false);}},{signal:abort.signal});
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.linkAction){const action=b.dataset.linkAction,index=Number(b.dataset.linkIndex);uiQueue=uiQueue.then(()=>changeLinkedBook(action,index)).catch(error=>status(error.message,true));return;}if(b.dataset.thirdParty){if(running()||busy)return;if(draft.cForces){delete draft.cForces;draft.deployments=draft.deployments?.filter(d=>!d.id.startsWith('c-'));if(draft.focus==='c'||draft.focus.startsWith('c-'))draft.focus='overall';remapMissionEntities('c');}else draft.cForces=[newForceFrom(draft.aForces[0])];preparing=true;renderEditor();configurationCorrected();return;}if(b.dataset.forceRemove){if(running()||busy)return;const side=b.dataset.forceRemove,index=Number(b.dataset.index);if(draft[side+'Forces'].length===1)return;draft[side+'Forces'].splice(index,1);remapMissionEntities(side,index);for(const group of draft[side+'Forces'])for(const key of ['carrierId','mountId'])if(group[key]){const [s,g,i]=group[key].split('-');if(s===side&&Number(g)===index){delete group[key];if(key==='mountId')delete group.mountOffset;}else if(s===side&&Number(g)>index)group[key]=`${s}-${Number(g)-1}-${i}`;}draft.deployments=(draft.deployments||[]).filter(d=>!d.id.startsWith(side+'-'+index+'-')).map(d=>{const [s,g,i]=d.id.split('-');return s===side&&Number(g)>index?{...d,id:`${s}-${Number(g)-1}-${i}`}:d;});preparing=true;replay=false;renderEditor();configurationCorrected();return;}if(b.dataset.forceAdd){if(running()||busy)return;const side=b.dataset.forceAdd;if(draft[side+'Forces'].length>=((16))){status('已达到编组数量上限',true);return;}const f=draft[side+'Forces'][0];draft[side+'Forces'].push(newForceFrom(f));preparing=true;replay=false;renderEditor();return;}const action=b.id.replace('gws-','');if(['open','close','pause','reset-camera','generate','regenerate','inject-report','clear-report','copy','fullscreen','command-send'].includes(action)){guard(actions[action])();return;}const ownerRoot=root;uiQueue=uiQueue.then(()=>root===ownerRoot?(b.dataset.record?libraryAction(b):actions[action]?.()):undefined).catch(error=>status(error.message,true));},{signal:abort.signal});
 const armoryButton=element('button','整备室');armoryButton.type='button';armoryButton.id='gws-armory';root.querySelector('.gws-bookbar').append(armoryButton);actions.armory=openArmory;
 $('canvas').addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();if(current)guard(actions.pause)();}},{signal:abort.signal});
 $('form').addEventListener('click',guard(async e=>{if(!e.target.closest('[data-import-preset]'))return;assertIdle();if(!loadedName)throw Error('请先选择并读取参数世界书');const id=$('preset').value;let referenceSeed;if(importSeed){const response=await fetch(asset('data/seed/reference-seeds.json'));if(!response.ok)throw Error('参考种子加载失败');referenceSeed=(await response.json())[id]?.seed;}await applyConfiguration(presetScenario(id,catalog,{importSeed,referenceSeed}),BUILTIN_PRESETS.find(p=>p.id===id)?.name);if(importSeed&&referenceSeed===undefined)status('该预设未保存参考种子，种子保持留空。');}),{signal:abort.signal});
 $('form').addEventListener('submit',e=>e.preventDefault(),{signal:abort.signal});$('form').addEventListener('change',guard(async e=>{if(e.target.dataset.importConditions){const file=e.target.files[0];e.target.value='';await importConditionsFile(file);return;}readEditor(e);validateScenario(draft,catalog);configurationCorrected();}),{signal:abort.signal});
 $('form').addEventListener('input',guard(e=>{if(e.target.type==='number'&&e.target.value!==''&&e.target.validity.valid&&!e.target.id.includes('Count-')){readEditor(e);validateScenario(draft,catalog);configurationCorrected();}}),{signal:abort.signal});
 $('worldbook').addEventListener('change',guard(loadSelected),{signal:abort.signal});
 $('file').addEventListener('change',guard(async e=>{await importRecording(e.target.files[0]);e.target.value='';}),{signal:abort.signal});
 $("seek").addEventListener("input",()=>{if(!replay||!recording)return;replayTime=Number($("seek").value);let lo=0,hi=recording.frames.length-1;while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(recording.frames[mid].t<=replayTime)lo=mid;else hi=mid-1;}replayIndex=lo;previous=recording.frames[lo];current=recording.frames[Math.min(lo+1,recording.frames.length-1)];events=timeline.at(replayTime).events;renderer.reset();frameLogVersion=-1;updateHud();},{signal:abort.signal});
 $('speed').addEventListener('change',e=>speed=Number(e.target.value),{signal:abort.signal});$('camera').addEventListener('change',e=>renderer.focus=e.target.value,{signal:abort.signal});
 document.addEventListener('click',guard(async e=>{const button=e.target.closest?.('[data-gws-battle-launch]');if(!button||!button.closest('#chat .mes_text'))return;e.preventDefault();const floor=button.closest('.mes[mesid]'),id=floor?.getAttribute('mesid');if(!id||!/^\d+$/.test(id))throw Error('无法确定该战斗方案所在楼层');await openMessageProposal(Number(id));}),{signal:abort.signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&running()){paused=true;status('页面切到后台，战斗已暂停');}},{signal:abort.signal});
 const autoLabel=element('label',undefined,'gws-auto-scenario'),autoInput=element('input');autoInput.type='checkbox';autoInput.checked=settings.autoScenario;autoInput.id='gws-auto-scenario';autoLabel.append(autoInput,document.createTextNode('随AI回复提出战斗方案'));root.querySelector('.gws-manual-request').before(autoLabel);autoInput.addEventListener('change',()=>{settings.autoScenario=autoInput.checked;saveSettings();promptKey=null;updatePrompt();},{signal:abort.signal});
 const on=(name,handler)=>{if(ctx.eventTypes[name]){ctx.eventSource.on(ctx.eventTypes[name],handler);hostEvents.push([ctx.eventTypes[name],handler]);}};
 on('MESSAGE_SENT',async()=>{await updatePrompt();});
 on('MESSAGE_RECEIVED',(i,type)=>{if(reportHandoff?.receive(i,getContext().chat))reportConsumed();updateReportUi();guard(()=>readChat(i))();});on('MESSAGE_SWIPED',guard(i=>readChat(i)));on('MESSAGE_EDITED',guard(i=>readChat(i)));
 on('GENERATION_ENDED',()=>{const ctx=getContext(),processor=ctx.streamingProcessor,failed=!!(processor?.isStopped||processor?.abortController?.signal.aborted);if(reportHandoff?.finish(ctx.chat,{failed}))reportConsumed();updateReportUi();guard(async()=>{if(!generationChat||generationChat===chatIdentity())await readChat();await updatePrompt();})();});
 on('GENERATION_STOPPED',()=>{reportHandoff?.stopped();updateReportUi();});
 on('GENERATION_STARTED',async(type,options,dryRun)=>{generationChat=chatIdentity();reportHandoff?.suspend();updateReportUi();await updatePrompt();});
 on('GENERATION_AFTER_COMMANDS',async(type,options,dryRun)=>{reportHandoff?.begin(type,options,dryRun,getContext().chat);updateReportUi();await updatePrompt();});
 on('CHAT_CHANGED',()=>{$('player-request').value='';reportHandoff?.clear();seen.clear();promptKey=null;proposalFailure=null;proposalWarnings=[];if(pendingProposal){catalog=parseWorldbook(book);draft=clone(catalog.options.defaultScenario);pendingProposal=null;}if(busy)cancelGeneration();if(running()){paused=true;status('切换聊天，当前战斗已暂停并保留原方案');}else status('已切换聊天；可读取本聊天的最新战斗方案。');renderEditor();updatePrompt();});
 window.GundamWarSimulator=Object.freeze({version:'1.0.0',getState:()=>({version:'1.0.0',worldbook:loadedName,worldbooks:linkedBooks.map(s=>s.name),launcherVisible:settings.launcherVisible,enabled:settings.enabled,generating:busy,running:running(),scenario:clone(draft),pendingChanges:clone(pendingProposal?.changes||[]),reportInjection:reportHandoff?.snapshot()||{armed:false}}),open,injectReport:guard(injectReport),clearReport:()=>clearReportInjection(),generate:guard(extractOrGenerate),regenerate:guard(regenerateProposal),reloadWorldbook:guard(refreshWorldbooks),openLibrary:()=>{open();$('library').closest('details').open=true;},setEnabled:guard(enabled=>{if(!enabled){cancelGeneration();reportHandoff?.clear();}settings.enabled=!!enabled;saveSettings();launcher.hidden=!settings.enabled||!settings.launcherVisible;if(!enabled){setMapFullscreen(false);root.querySelector('.gws-panel').hidden=true;}if(!enabled&&running())paused=true;renderEditor();updatePrompt();}),setLauncherVisible:guard(visible=>{settings.launcherVisible=!!visible;$('launcher-visible').checked=settings.launcherVisible;saveSettings();launcher.hidden=!settings.enabled||!settings.launcherVisible;})});
 $('run').disabled=true;$('generate').disabled=true;
 try{const response=await fetch(asset('tavern-helper.json')),regexResponse=await fetch(asset('exports/regex/gws-chat.json'));if(!response.ok||!regexResponse.ok)throw Error('配套组件文件加载失败');await installCompanions(await response.json(),await regexResponse.json());}catch(error){getContext().toast?.error?.(error.message);status('配套组件安装失败：'+error.message+'；可从仓库手动导入助手脚本和正则。',true);console.error('[GWS] companion installation',error);}
 if(root!==ownerRoot)return;
 try{const packaged=await bundled();if(root!==ownerRoot)return;catalog=parseWorldbook(packaged);draft=clone(catalog.options.defaultScenario);renderEditor();}catch(e){status(e.message+'；可重试导入世界书，或读取已安装的参数世界书。',true);}
 await refreshBooks();try{await loadLinkedBooks(settings.worldbooks);}catch(e){status(e.message+'；展开“导入世界书资料包”选择导入。',true);}
 try{const recovered=await store.recoverPending();await renderLibrary();if(recovered.recovered)status('已恢复'+recovered.recovered+'条中断录像，仅播放已保存部分，不重算胜负。');}catch(e){status('录像库不可用：'+e.message,true);}
 await updatePrompt();lastReal=performance.now();raf=requestAnimationFrame(animate);
}
