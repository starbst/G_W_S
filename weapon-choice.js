import {weaponDamageScale,isLightAutomatic} from './weapon-semantics.js';
import {sub,length,clamp,arcSolution} from './math.js';
import {weaponTarget} from './weapon-allocation.js';
import {predictedProtectionCost} from './seed-systems.js';
import {observedProtection,perceivedValue,perceivedContactDamage} from './pilot-judgment.js';
import {weaponEnergyCost} from './energy-policy.js';
// Planning and slot selection share actual range, armor, preparation, and resource
// costs. Planning may turn toward a weapon; firing still needs its real arc/lock.
export function weaponPotential(b,u,state,target,{distance=null,aimed=false,approachS=0}={}){
 const w=state.definition,s=w.sim;if(!target?.alive||!b.available(u,state)||s.countermeasure)return 0;
 const delta=sub(b.observed(u,target),u.position),d=distance??length(delta),melee=w.kind==='melee';
 const reach=s.rangeM+(melee&&target.entityType==='ship'?target.machine.sim.radiusM:0);
 if(d<s.minRangeM||d>reach)return 0;
 const velocity=u.contacts.get(target.id)?.velocity||(u.targetId===target.id?u.lastSeen?.velocity:null)||[0,0,0],speed=length(velocity);
 const arc=aimed?arcSolution(state.turretForward||u.forward,delta,s):null,fc=state.fireControl;
 const switchS=u.slotSelected[w.slot||'slot1']===w.id?0:(s.switchS??.18);
 const cycle=Math.max(.15,s.cooldownS+s.windupS+(s.burst-1)*(s.burstIntervalS??.14)+switchS+Math.max(0,state.readyAt-b.t)+approachS);
 const range=melee?1:clamp(d<s.preferredRangeM?d/Math.max(1,s.preferredRangeM):1-(d-s.preferredRangeM)/Math.max(1,s.rangeM-s.preferredRangeM),.18,1);
 const guided=['missile','funnel-missile'].includes(w.kind),flight=melee?0:d/Math.max(1,s.projectileSpeedMps),radius=target.machine.sim.radiusM+(s.impactMode==='area'?s.blastRadiusM*.7:0);
 const precision=melee?clamp(u.stability,.2,1):clamp((.3+.7*u.pilotState.sim.aim)*(.3+.7*u.stability)*(aimed?(fc?.locked?1:.4):.8)*range/Math.max(1,arc?.spreadMultiplier||1),.03,1);
 const travel=melee?1:guided?clamp(1-speed/Math.max(1,s.projectileSpeedMps),.25,1):clamp(radius/(radius+speed*flight*.08+s.spreadRad*d),.05,1);
 const tags=u.pilotState.tags||[],style=melee?(tags.includes('blade-specialist')?1.65:tags.includes('assault-specialist')?1.25:tags.includes('marksman')?.85:1):(tags.includes('artillery-specialist')&&s.windupS>.5?1.4:tags.includes('marksman')?1.3:1);
 const size=target.entityType==='ship'||target.entityType==='terrain'?1.5:s.windupS>.55?clamp(1-speed/900,.25,1):1;
 const cost=weaponEnergyCost(w)*s.burst,energy=cost>0?clamp(u.energy/(cost+u.machine.sim.energyCapacity*.2),.15,1):1.15;
 const raw=s.damage*weaponDamageScale(w,target),protection=observedProtection(b,u,target,w,raw,d);
 // Draining active energy armor is useful, but harmless tracers are not main firepower.
 const pressure=isLightAutomatic(w)?0:Math.min(raw*.2,protection.energyCost*.25);
 const expected=(protection.remainingDamage+pressure)*perceivedContactDamage(b,u,target,w)*s.burst*precision*travel*size;
 const useful=Math.min(expected,target.machine.sim.structure+target.machine.sim.armor*.4+radius);
 return Math.max(0,perceivedValue(b,u,'weapon:'+target.id+':'+w.id,useful/cycle*style*energy,{step:.25,relative:.08}));
}
export function weaponUtility(b,u,state,fallback){
 const target=weaponTarget(b,u,state,fallback);
 if(!target?.alive||!b.weaponDecision(u,target,state)||b.t<state.readyAt)return -Infinity;
 const value=weaponPotential(b,u,state,target,{aimed:true});
 // Keep a small relative switch margin. A constant bonus used to outweigh the
 // entire damage value of low-output weapons and make slot selection sticky.
 return value*(state.definition.id===u.slotSelected[state.definition.slot||'slot1']?1.08:1);
}
export function meaningfulThreat(b,attacker,weapon,defender,distance,bearing){
 const raw=weapon.sim.damage*weaponDamageScale(weapon,defender)*(weapon.sim.burst||1)*(b.rules.damageMultiplier??1);
 const protection=predictedProtectionCost(defender,weapon,raw,bearing,distance);
 // Harmless tracers do not break an approach; a lethal volley still merits defense.
 if(isLightAutomatic(weapon))return protection.remainingDamage>=Math.max(.01,defender.structure)*.2;
 return protection.remainingDamage>=Math.max(2,defender.structure*.02)||protection.energyCost>Math.max(2,defender.energy*.08);
}
