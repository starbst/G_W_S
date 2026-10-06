import {contactDamageFactor} from './projectile-policy.js';
import {weaponDamageScale} from './weapon-semantics.js';
import {sub,length,clamp,arcSolution} from './math.js';
import {weaponTarget} from './weapon-allocation.js';
import {predictedProtectionCost} from './seed-systems.js';
import {weaponEnergyCost} from './energy-policy.js';
// One bounded comparison per weapon slot, using observed geometry and real costs.
// A gun's theoretical damage rate alone is not its value against a moving MS.
export function weaponUtility(b,u,state,fallback){
 const target=weaponTarget(b,u,state,fallback),w=state.definition,s=w.sim;
 if(!target?.alive||!b.weaponDecision(u,target,state)||b.t<state.readyAt)return -Infinity;
 const delta=sub(b.observed(u,target),u.position),d=length(delta),c=u.contacts.get(target.id),velocity=c?.velocity||u.lastSeen?.velocity||[0,0,0];
 const speed=length(velocity),arc=arcSolution(state.turretForward||u.forward,delta,s),fc=state.fireControl;
 const cycle=Math.max(.15,s.cooldownS+s.windupS+(s.burst-1)*(s.burstIntervalS??.14));
 const range=clamp(d<s.preferredRangeM?d/Math.max(1,s.preferredRangeM):1-(d-s.preferredRangeM)/Math.max(1,s.rangeM-s.preferredRangeM),.18,1);
 const melee=w.kind==='melee',guided=['missile','funnel-missile'].includes(w.kind);
 const flight=melee?0:d/Math.max(1,s.projectileSpeedMps),radius=target.machine.sim.radiusM+(s.impactMode==='area'?s.blastRadiusM*.7:0);
 const precision=melee?clamp(u.stability,.2,1):clamp((.3+.7*u.pilotState.sim.aim)*(.3+.7*u.stability)*(fc?.locked?1:.4)*range/Math.max(1,arc.spreadMultiplier),.03,1);
 const travel=melee?1:guided?clamp(1-speed/Math.max(1,s.projectileSpeedMps),.25,1):clamp(radius/(radius+speed*flight*.08+s.spreadRad*d),.05,1);
 const tags=u.pilotState.tags||[],style=melee?(tags.includes('blade-specialist')?1.65:tags.includes('assault-specialist')?1.25:tags.includes('marksman')?.85:1):(tags.includes('artillery-specialist')&&s.windupS>.5?1.4:tags.includes('marksman')?1.3:1);
 // Heavy charge fire remains useful against ships/terrain or exposed slow MS;
 // fast closing contacts favor short preparation and a reserved blade slot.
 const size=target.entityType==='ship'||target.entityType==='terrain'?1.5:s.windupS>.55?clamp(1-speed/900,.25,1):1;
 const cost=weaponEnergyCost(w)*s.burst,energy=cost>0?clamp(u.energy/(cost+u.machine.sim.energyCapacity*.2),.15,1):1.15;
 const raw=s.damage*weaponDamageScale(w,target);
 const protectedDamage=predictedProtectionCost(target,w,raw,delta.map(v=>-v/Math.max(1,d)),d).remainingDamage;
 const expected=protectedDamage*contactDamageFactor(b,w,target)*s.burst*precision*travel*size;
 const useful=Math.min(expected,target.machine.sim.structure+target.machine.sim.armor*.4+radius);
 return useful/cycle*style*energy+(state.definition.id===u.slotSelected[w.slot||'slot1']?1.5:0);
}
