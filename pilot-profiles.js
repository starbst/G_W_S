import {DEFAULT_STRATEGIES,STRATEGY_LABELS} from './pilot-strategies.js';
// Only closed, numeric/boolean data enters the simulator. No executable strategy text.
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const statRanges={reactionS:[.1,3],aim:[.1,1],tracking:[.1,1],maneuver:[.1,1],composure:[.1,1],melee:[.1,1]};
const tacticRanges={meleeCommitM:[100,2000],meleeLookaheadS:[.2,3],driftMinGainS:[0,1],turnMultiplier:[.5,3],turnStabilityCost:[.2,1.5],driftMinSpeed:[50,1000],driftWindowS:[.3,4],driftCooldownS:[.5,15],singleStability:[.1,.95],burstStability:[.08,.9],boostSeconds:[.2,4],retreatThreshold:[.1,1],retreatSeconds:[1,12],retreatDistanceM:[300,5000],retreatCooldownS:[1,30]};
export const DEFAULT_TACTICS=Object.freeze({beamGuardChance:0,beamGuardReduction:.35,shieldGuardBonus:.3,guardStabilityReduction:.55,meleeDashPulseS:.28,meleeDashLookaheadS:.75,planHoldS:1.5,planSwitchMargin:1.2,strategyTieMargin:.25,strategyLookaheadS:1.5,rangeDisadvantageRatio:1.5,rushDistanceM:14000,maxRushSeconds:24,crossfireTolerance:2,threatCruiseFraction:.85,recoveryExitStability:.4,defenseForwardFraction:.6,lowReserveFraction:.12,missionValue:9,selfPreservation:5,screenValue:6,antiFunnelThreshold:.35,jettisonGain:1.35,maxOutputCost:22,counterThrustCost:28,counterThrustLeadS:.25,energyReserveFraction:.28,exchangeMemoryS:10,exchangeDisadvantage:.08,tailThreatRangeM:2600,tailBreakSeconds:1.4,tailThrustMultiplier:12,tailLateralWeight:.95,tailRecheckS:.25,maneuverRecovery:2.6,impactRecoveryFactor:.16,impactRecoveryS:3.2,clashRecoveryS:1.8,dodgeThrustMultiplier:38,dodgePulseS:.18,allOutChance:.8,allOutMaxSpeed:320,allOutRetryS:2,meleeReserveS:.45,missileWarningS:1.6,missileDodgeLeadS:.5,predictiveDodgeChance:.55,reactionDodgeChance:.92,meleeSwingCost:.18,meleeClashCost:.34,driftChance:.72,strategyRetryS:1,meleeCommitM:1000,meleeLookaheadS:1.2,driftMinGainS:.12,turnMultiplier:1,turnStabilityCost:1,driftMinSpeed:220,driftWindowS:2.8,driftCooldownS:3,singleStability:.58,burstStability:.28,boostSeconds:1,retreatThreshold:.48,retreatSeconds:4,retreatDistanceM:2100,retreatCooldownS:8});
Object.assign(tacticRanges,{beamGuardChance:[0,1],beamGuardReduction:[0,.8],shieldGuardBonus:[0,.5],guardStabilityReduction:[0,.8]});
Object.assign(tacticRanges,{meleeDashPulseS:[.12,.4],meleeDashLookaheadS:[.3,1.2]});
Object.assign(tacticRanges,{meleeSwingCost:[.05,.5],meleeClashCost:[.15,.8],driftChance:[0,1],strategyRetryS:[.2,5]});
Object.assign(tacticRanges,{});
Object.assign(tacticRanges,{dodgeCooldownS:[0,5],missileWarningS:[.3,4],missileDodgeLeadS:[.15,1],predictiveDodgeChance:[0,1],reactionDodgeChance:[0,1]});
Object.assign(tacticRanges,{maneuverRecovery:[.5,6],impactRecoveryFactor:[.05,1],impactRecoveryS:[.2,10],clashRecoveryS:[.2,8],dodgeThrustMultiplier:[10,80],dodgePulseS:[.08,.4],allOutChance:[0,1],allOutMaxSpeed:[100,600],allOutRetryS:[.2,8],meleeReserveS:[.1,2]});
Object.assign(tacticRanges,{tailThreatRangeM:[300,6000],tailBreakSeconds:[.5,3],tailThrustMultiplier:[7,24],tailLateralWeight:[.2,1.5],tailRecheckS:[.1,2]});
Object.assign(tacticRanges,{energyReserveFraction:[.1,.6],exchangeMemoryS:[1,15],exchangeDisadvantage:[.05,.8]});
Object.assign(tacticRanges,{missionValue:[0,30],selfPreservation:[0,30],screenValue:[0,30],antiFunnelThreshold:[0,1],jettisonGain:[1,3],maxOutputCost:[0,100],counterThrustCost:[0,100],counterThrustLeadS:[.1,1]});
Object.assign(tacticRanges,{planHoldS:[.3,6],planSwitchMargin:[0,4],strategyTieMargin:[0,1],strategyLookaheadS:[.2,4],rangeDisadvantageRatio:[1,5],rushDistanceM:[1000,30000],maxRushSeconds:[3,60],crossfireTolerance:[1,4],threatCruiseFraction:[.3,1],recoveryExitStability:[.2,.8],defenseForwardFraction:[0,.8],lowReserveFraction:[.02,.4]});
function fail(message){throw Error('驾驶员模板：'+message);}
function fields(x,ranges,label){if(x===undefined)return;if(!x||typeof x!=='object'||Array.isArray(x))fail(label+' 需为键值对象');for(const [k,v]of Object.entries(x)){const range=ranges[k];if(!range||typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1])fail(label+'.'+k+' 未知或越界');}}
function validate(x){
 if(x.skills!==undefined&&(!x.skills||typeof x.skills!=='object'||Array.isArray(x.skills)||Object.keys(x.skills).length>32||Object.entries(x.skills).some(([k,v])=>!ID.test(k)||typeof v!=='boolean')))fail('技能开关无效');
 if(x.templates!==undefined&&(!Array.isArray(x.templates)||x.templates.length>8||new Set(x.templates).size!==x.templates.length||x.templates.some(id=>typeof id!=='string'||!ID.test(id))))fail('引用需为最多8个不重复ID');
 if(x.tags!==undefined&&(!Array.isArray(x.tags)||x.tags.length>30||x.tags.some(id=>typeof id!=='string'||!ID.test(id))))fail('标签无效');
 fields(x.capabilities,{spatialAwareness:[0,1],precision:[0,1],teamwork:[0,1],energyDiscipline:[0,1]},'capabilities');
 fields(x.strategies,Object.fromEntries(Object.keys(STRATEGY_LABELS).map(id=>[id,[0,3]])),'strategies');fields(x.sim,statRanges,'sim');fields(x.tactics,tacticRanges,'tactics');fields(x.weights,{aim:[-2,2],flank:[-2,2],melee:[-2,2],escape:[-2,2]},'weights');
 if(x.traits!==undefined){if(!x.traits||typeof x.traits!=='object'||Array.isArray(x.traits))fail('traits需为布尔键值');for(const [k,v]of Object.entries(x.traits))if(!['driftShot','rationalRetreat','returnSlash','antiFunnel','jettison','maximumOutput','counterThrust','nonlethal','ambush','bodyguard','modularEvasion'].includes(k)||typeof v!=='boolean')fail('未知词条或非布尔值 '+k);}
}
function overlay(base,own){return {skills:{...base.skills,...own.skills},capabilities:{...base.capabilities,...own.capabilities},sim:{...base.sim,...own.sim},traits:{...base.traits,...own.traits},tactics:{...base.tactics,...own.tactics},weights:{...base.weights,...own.weights},strategies:{...base.strategies,...own.strategies},tags:[...new Set([...(base.tags||[]),...(own.tags||[])])]};}
export function resolvePilotProfiles(pilots,templates=[]){
 if(templates.length>100)fail('模板不能超过100条');
 const table=new Map(),cache=new Map();for(const t of templates){if(!ID.test(t.id)||table.has(t.id))fail('重复或无效ID');validate(t);table.set(t.id,t);}
 function refs(ids=[],path=[]){let result={};for(const id of [...ids].reverse())result=overlay(result,resolve(id,path));return result;}
 function resolve(id,path){if(path.includes(id))fail('循环引用 '+[...path,id].join(' → '));if(path.length>=16)fail('继承超过16层');if(cache.has(id))return cache.get(id);const x=table.get(id);if(!x)fail('缺少或已禁用 '+id);const result=overlay(refs(x.templates,[...path,id]),x);cache.set(id,result);return result;}
 for(const id of table.keys())resolve(id,[]);
 const common=table.has('common')?resolve('common',[]):{};
 return pilots.map(p=>{validate(p);const base=overlay(refs((p.templates||[]).filter(id=>id!=='common')),p);return {...p,states:p.states.map(s=>{validate(s);const resolved=overlay(common,overlay(overlay(refs((s.templates||[]).filter(id=>id!=='common')),base),s));for(const k of Object.keys(statRanges).filter(k=>k!=='melee'))if(resolved.sim[k]===undefined)fail(p.id+'.'+s.id+' 缺少 '+k);return {...s,...resolved,strategies:{...DEFAULT_STRATEGIES,...resolved.strategies},tactics:{...DEFAULT_TACTICS,...resolved.tactics},templateIds:[...new Set([...(p.templates||[]),...(s.templates||[]),...(table.has('common')?['common']:[])])]};})};});
}
// User-triggered additive upgrade: fill missing common defaults, preserve configured values.
