import {isTacticalThreat} from './weapon-semantics.js';
import {runtimePilotStats,pilotAbilityValue,runtimePilotTactics} from './pilot-profiles.js';
// Closed data-driven skill modifiers. Strategies choose actions; skills change capability.
const FACTORS={reaction:[.3,1.5],aim:[.5,2],tracking:[.5,2],maneuver:[.5,2],melee:[.5,2],thrust:[.5,3],turn:[.5,3],speed:[.5,2],recovery:[.5,3],recharge:[.5,3],signature:[.25,1]};
export const SKILL_FACTORS=Object.keys(FACTORS);
export function validateSkills(definitions){
 if(!Array.isArray(definitions)||definitions.length>512)throw Error('技能定义数量无效');
 const ids=new Set();for(const d of definitions){if(!d||Object.keys(d).some(k=>!['kind','id','name','description','activation','modifiers','pressureThreshold','durationS','energyCost','oncePerBattle','effects','facts','activationGate','equipmentGate','recoveryS','recoveryModifiers','endEnergyFraction'].includes(k)))throw Error('技能包含未知字段');if(!/^[a-z][a-z0-9-]{0,63}$/.test(d.id)||ids.has(d.id))throw Error('技能ID重复或无效');ids.add(d.id);
 if(!['passive','pressure'].includes(d.activation)||!d.modifiers||typeof d.modifiers!=='object'||Array.isArray(d.modifiers)||!Object.keys(d.modifiers).length&&!d.effects)throw Error('技能激活/倍率无效');
 if(d.effects){if(Array.isArray(d.effects)||Object.keys(d.effects).some(k=>!['onLethal','remoteDisruption'].includes(k))||(d.effects.onLethal!==undefined&&d.effects.onLethal!=='disable'))throw Error('技能结果效果无效');const e=d.effects.remoteDisruption;if(e){if(typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['radiusM','durationS','retryS','energyCost'].includes(k)))throw Error('赛可谬干扰参数无效');for(const[k,lo,hi]of [['radiusM',1,10000],['durationS',.1,5],['retryS',1,60],['energyCost',0,100]])if(!Number.isFinite(e[k])||e[k]<lo||e[k]>hi)throw Error('赛可谬干扰参数越界 '+k);}}
 for(const[k,v]of Object.entries(d.modifiers)){const r=FACTORS[k];if(!r||!Number.isFinite(v)||v<r[0]||v>r[1])throw Error('技能倍率越界 '+k);}
 for(const[k,lo,hi]of [['pressureThreshold',0,10],['durationS',1,1200],['energyCost',0,100]])if(!Number.isFinite(d[k])||d[k]<lo||d[k]>hi)throw Error('技能参数无效 '+k);
 if(d.activationGate!==undefined&&!['protected-ally-crisis','ranged-window','melee-window'].includes(d.activationGate))throw Error('技能触发门槛无效');
 if(d.equipmentGate!==undefined&& !/^[a-z][a-z0-9-]{0,63}$/.test(d.equipmentGate))throw Error('技能装备标签无效');
 if(d.recoveryS!==undefined&&(!Number.isFinite(d.recoveryS)||d.recoveryS<0||d.recoveryS>1200))throw Error('技能回充时长无效');
 if(d.endEnergyFraction!==undefined&&(!Number.isFinite(d.endEnergyFraction)||d.endEnergyFraction<0||d.endEnergyFraction>1))throw Error('技能结束能源比例无效');
 if(d.recoveryModifiers){for(const[k,v]of Object.entries(d.recoveryModifiers)){const r=FACTORS[k];if(!r||!Number.isFinite(v)||v<r[0]||v>r[1])throw Error('技能回充倍率无效');}}
 if(typeof d.oncePerBattle!=='boolean')throw Error('技能次数规则无效');
 }return definitions;
}
export function applyPilotOptions(state,options={},skills=[]){
 const next=structuredClone(state);next.configuredSim={...state.sim};next.sim=runtimePilotStats(state.sim);next.tactics=runtimePilotTactics(state.tactics);next.capabilities=Object.fromEntries(Object.entries(state.capabilities||{}).map(([k,v])=>[k,pilotAbilityValue(v)]));next.strategies=Object.fromEntries(Object.entries(state.strategies||{}).map(([k,v])=>[k,Math.min(100,v)]));for(const section of ['traits','strategies','skills']){const overrides=options[section]||{};for(const[k,v]of Object.entries(overrides)){if(section==='strategies')next.strategies[k]=v?Math.min(100,state.strategies[k]||1):0;else{next[section]??={};next[section][k]=v;}}}
 return next;
}
export function initializeSkills(b,u,definitions){
 const allowed=definitions.filter(d=>u.pilotState.skills?.[d.id]);
 u.skillRuntime={definitions:allowed,active:new Map(),recovering:new Map(),used:new Set(),base:structuredClone(u.pilotState),factors:{}};
}
function pressure(b,u){
 // Only visible contacts and reported protection requests; no secret target trajectory.
 const recent=b.t-(u.lastDamageAt??-100)<3?.8:0;let p=recent+(1-u.structure/u.machine.sim.structure)*.8;
 for(const [id,c]of u.contacts||[]){if(b.t-c.observedAt>1)continue;const delta=u.position.map((v,i)=>v-c.position[i]),d=Math.hypot(...delta),pointing=delta.reduce((n,v,i)=>n+v*c.forward[i],0)/Math.max(1,d);if(d<8000&&pointing>.85){const foe=b.unitById.get(id),armed=foe?.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&isTacticalThreat(w.definition,u,b.rules.damageMultiplier)),aiming=armed&&foe.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&isTacticalThreat(w.definition,u,b.rules.damageMultiplier)&&(w.attack?.targetId===u.id||w.fireControl?.locked&&w.fireControl.targetId===u.id));if(armed)p+=.35;if(aiming)p+=.55;}}
 for(const ally of b.units)if(ally.side===u.side&&ally.alive&&ally.supportUntil>b.t)p+=.7;
 return p;
}
export function allyCrisis(b,u){
 if(!(u.pilotState.strategies?.['cover-ally']>0))return false;
 const allies=b.spatial.sides[u.side]||[];
 for(const ally of allies){if(ally===u||!ally.alive)continue;if(ally.supportUntil>b.t)return true;
  for(const [id,contact]of u.contacts||[]){if(b.t-contact.observedAt>.8)continue;const foe=b.unitById.get(id);if(!foe?.alive||foe.side===u.side)continue;
   for(const w of foe.weapons){const attack=w.attack;if(!attack||attack.targetId!==ally.id||w.disabled||w.formDisabled||w.definition.sim.damage<20)continue;
    const distance=Math.hypot(...contact.position.map((v,i)=>v-ally.position[i]));if(distance<w.definition.sim.effectiveRangeM&&attack.at-b.t+(w.definition.kind==='melee'?0:distance/Math.max(1,w.definition.sim.projectileSpeedMps))<2)return true;
   }
  }
 }
 return false;
}
// Windows use the current sensor observation, not the enemy's private resources.
export function skillWindow(b,u,gate){
 if(!gate)return true;if(gate==='protected-ally-crisis')return allyCrisis(b,u);
 if(!u.combatant||u.entityType==='ship'||b.t<u.evadeUntil||b.t<(u.microControlUntil||0))return false;
 const target=b.unitById.get(u.targetId),contact=u.contacts?.get(u.targetId);if(!target?.alive||!contact||b.t-contact.observedAt>1)return false;
 const delta=contact.position.map((v,i)=>v-u.position[i]),distance=Math.hypot(...delta),axis=delta.map(v=>v/Math.max(1,distance)),closing=u.velocity.reduce((n,v,i)=>n+(v-contact.velocity[i])*axis[i],0);
 if(gate==='ranged-window')return u.stability>.32&&distance>400&&u.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&['beam','ballistic'].includes(w.definition.kind)&&isTacticalThreat(w.definition,u,b.rules.damageMultiplier)&&w.fireControl?.targetId===target.id&&w.fireControl?.locked&&distance<=w.definition.sim.effectiveRangeM&&distance>=w.definition.sim.minRangeM&&(!!w.attack||!!w.salvo||w.readyAt<=b.t));
 if(gate==='melee-window')return u.stability>.28&&u.energy>u.machine.sim.energyCapacity*.18&&['melee','closeAngle','bladeCover'].includes(u.order)&&u.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.definition.kind==='melee'&&w.readyAt<=b.t+.4&&distance<=w.definition.sim.rangeM+Math.max(0,closing)*.8+80);
 return false;
}
export function updateSkills(b,u){
 const rt=u.skillRuntime;if(!rt?.definitions.length||!u.alive||u.docked||b.t<(rt.nextAt??0))return;if(rt.definitions.every(d=>d.oncePerBattle&&rt.used.has(d.id))&&!rt.active.size&&!rt.recovering.size)return;rt.nextAt=b.t+.2;let changed=false;
 // Pressure cannot reactivate an already spent once-per-battle skill. Keep the
 // expiry check, but skip the contact scan when no activation can occur.
 const canActivate=rt.definitions.some(d=>(!rt.active.has(d.id)||b.t>=rt.active.get(d.id))&&(!d.oncePerBattle||!rt.used.has(d.id))&&!rt.recovering.has(d.id)),threat=canActivate&&rt.definitions.some(d=>d.activation==='pressure'&&d.pressureThreshold>0&&!rt.active.has(d.id)&&!rt.recovering.has(d.id)&&(!d.oncePerBattle||!rt.used.has(d.id)))?pressure(b,u):0;
 for(const d of rt.definitions){const active=rt.active.get(d.id);if(active!==undefined&&b.t>=active){rt.active.delete(d.id);if(d.recoveryS>0)rt.recovering.set(d.id,b.t+d.recoveryS);if(d.endEnergyFraction!==undefined)b.spend(u,u.energy*(1-d.endEnergyFraction));changed=true;b.emit('skill-ended',u.id,u.machine.name+'：'+d.name+'结束',{skill:d.id});}
 if(rt.recovering.has(d.id)&&b.t>=rt.recovering.get(d.id)){rt.recovering.delete(d.id);changed=true;}
  if(!rt.active.has(d.id)&&!rt.recovering.has(d.id)&&(!d.oncePerBattle||!rt.used.has(d.id))&&(d.activation==='passive'||threat>=d.pressureThreshold)&&skillWindow(b,u,d.activationGate)&&(!d.equipmentGate||u.machine.tags.includes(d.equipmentGate))&&u.energy>=d.energyCost){
 b.spend(u,d.energyCost);rt.active.set(d.id,d.activation==='passive'?Infinity:b.t+d.durationS);rt.used.add(d.id);changed=true;b.emit('skill',u.id,u.machine.name+'：'+d.name,{skill:d.id,skillName:d.name,duration:d.activation==='passive'?null:d.durationS,pressure:+threat.toFixed(3),modifiers:d.modifiers});u.nextDecision=b.t;
 }}
 applyRemoteDisruption(b,u,rt);
 if(!changed)return;const factors={};for(const d of rt.definitions){const modifiers=rt.active.has(d.id)?d.modifiers:rt.recovering.has(d.id)?d.recoveryModifiers:null;for(const[k,v]of Object.entries(modifiers||{}))factors[k]=Math.min(3,(factors[k]??1)*v);}
 const base=rt.base,configured={...(base.configuredSim||base.sim)};for(const[k,stat]of [['reaction','reactionS'],['aim','aim'],['tracking','tracking'],['maneuver','maneuver'],['melee','melee']])if(configured[stat]!==undefined||factors[k]!==undefined)configured[stat]=(configured[stat]??configured.maneuver??.65)*(factors[k]??1);u.pilotState.sim=runtimePilotStats(configured);
 u.pilotState.tactics.maneuverRecovery=base.tactics.maneuverRecovery*(factors.recovery??1);
 for(const[k,stat]of [['thrust','thrustN'],['turn','turnRateDeg'],['speed','maxSpeedMps'],['recharge','energyRegen']])u.machine.sim[stat]=u.machine.sim[stat]/(rt.factors[k]??1)*(factors[k]??1);
 u.machine.mobility.pitchRateDeg=u.machine.mobility.pitchRateDeg/(rt.factors.turn??1)*(factors.turn??1);rt.factors=factors;
}

export function disablesOnLethal(u){return !!u?.skillRuntime?.definitions.some(d=>d.effects?.onLethal==='disable'&&u.skillRuntime.active.has(d.id));}

// Residual optical images confuse tracking only during a real fast maneuver.
// They do not hide sensor contacts or make the unit intangible.
export function trackingSignature(u){
 const strength=u.skillRuntime?.factors?.signature??1;
 if(strength===1)return 1;
 const v=Math.hypot(...u.velocity),a=Math.hypot(...u.acceleration);
 return 1-(1-strength)*Math.min(1,v/400)*Math.min(1,a/250);
}

// Only deployed enemy psycommu terminals are interrupted; other remote systems remain independent.
export function applyRemoteDisruption(b,u,rt=u.skillRuntime){
 if(!rt?.active?.size||!b.drones?.length)return;rt.disruptionAt??=new Map();
 for(const d of rt.definitions){const e=d.effects?.remoteDisruption;if(!e||!rt.active.has(d.id)||b.t<(rt.disruptionAt.get(d.id)??0)||u.energy<e.energyCost)continue;
 const terminals=b.drones.filter(t=>{const owner=b.unitById.get(t.owner),weapon=owner?.weapons.find(w=>w.definition.id===t.weaponId);return owner?.alive&&owner.side!==u.side&&t.phase!=='return'&&!t.dead&&weapon?.definition.remoteControl?.system==='psycommu'&&Math.hypot(...t.position.map((v,i)=>v-u.position[i]))<=e.radiusM;});
 if(!terminals.length)continue;b.spend(u,e.energyCost);rt.disruptionAt.set(d.id,b.t+e.retryS);for(const t of terminals){t.nextAt=Math.max(t.nextAt||0,b.t+e.durationS);t.aim=null;}b.emit('remote-disruption',u.id,u.machine.name+'：赛可谬干扰',{skill:d.id,count:terminals.length,duration:e.durationS});
 }
}
