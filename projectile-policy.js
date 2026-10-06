import {add,sub,mul,norm,length,clamp,boxEntry} from './math.js';
import {sphereEntry,hullEntry} from './collision.js';

// Explicit weapon policy. Direct kinetics and guided missiles retain their
// trajectories. Only declared explosive shells acquire a fixed fuse region.
export function projectilePolicy(w,machine={}){
 const s=w.sim,beamClass=s.beamClass??(w.template==='beam-cannon'||['seed-positron','seed-shipbeam','seed-disruptor'].includes(w.template)||['seed-cannon','seed-plasma'].includes(w.template)&&s.damage>=90||(s.projectileRadiusM??0)>=6||w.tags?.some(t=>['heavy-main','main-battery','large-beam'].includes(t))?'large':'standard');
 const shell=w.kind==='ballistic'&&!w.sim.countermeasure&&(s.blastRadiusM>0||/炮击炮|肩盾实弹炮|盾内115mm双炮/.test(w.name)||w.tags?.includes('explosive-shell'));
 const impactMode=s.impactMode??(shell?'area':'direct'),blastRadiusM=s.blastRadiusM>0?s.blastRadiusM:impactMode==='area'?(s.damage>=60?60:30):0;
 return {beamClass,impactMode,blastRadiusM};
}
export function applyProjectilePolicy(w,machine){
 if(w.kind==='beam')w.sim.beamClass=projectilePolicy(w,machine).beamClass;
 if(w.kind==='ballistic'){const p=projectilePolicy(w,machine);w.sim.impactMode=p.impactMode;w.sim.blastRadiusM=p.blastRadiusM;}
 return w;
}
export function isAreaShot(shot){return shot.kind==='ballistic'&&shot.weapon.impactMode==='area';}
export function beamAvoidance(b,shot,u){
 if(shot.kind!=='beam'||shot.weapon.beamClass==='large'||!['ms','ma','vehicle'].includes(u.entityType)||!u.alive||u.disabled||u.docked||u.capturedBy)return {chance:0};
 // A contact save represents pilot micro-control, separate from powered evasion.
 // It depends only on the current pilot capabilities, never energy, stability,
 // target speed, the firing pilot, or fire-control quality.
 const p=u.pilotState.sim,reaction=clamp((.65-p.reactionS)/.55);
 const ability=clamp(.5*p.maneuver+.25*p.tracking+.15*p.composure+.1*reaction);
 return {chance:.03+.9*ability**3};
}
export function evadeBeamContact(b,shot,u){
 const {chance}=beamAvoidance(b,shot,u);if(chance<=0)return false;
 const roll=b.randomFor(u.id,'beam-defense')();if(roll>=chance)return false;
 // Break offensive posture without moving the hull or issuing a thrust pulse.
 // Sensor contacts and any actual emergency evasion remain intact.
 u.captureIntent=null;u.grappleContactSince=null;u.drift=null;u.breakaway=null;u.engagementPlan=null;b.cancelAttacks(u);u.swing=null;u.flightMode='normal';
 for(const d of b.drones||[])if(d.owner===u.id)d.aim=null;
 u.stableTime=0;u.locked=false;u.lockedTargetId=null;u.track=0;
 for(const state of u.weapons)if(state.fireControl){state.fireControl.track=0;state.fireControl.locked=false;}
 u.microControlUntil=Math.max(u.microControlUntil||0,b.t+.08);u.nextDecision=b.t;
 b.emit('beam-evaded',u.id,u.machine.name+' 临界闪避光束',{attacker:shot.owner,weapon:shot.weaponId,kind:'beam',chance,roll});return true;
}
// Called only after an actual standard beam contact survives micro-evasion.
// Melee already resolves its own parry/clash; large beams and blasts cannot
// acquire this extra contact save. Shield hardware is checked, never invented.
export function beamGuard(b,shot,u){
 if(shot.kind!=='beam'||shot.weapon.beamClass==='large'||!['ms','ma','vehicle'].includes(u.entityType)||!u.alive||u.disabled||u.docked||u.capturedBy)return null;
 const c=u.pilotState.tactics,chance=c.beamGuardChance??0;if(chance<=0)return null;
 const roll=b.randomFor(u.id,'beam-guard')();if(roll>=chance)return null;
 const shield=!!u.machine.defenses?.some((d,i)=>['shield','beam-shield','reflector'].includes(d.type)&&(!u.defenseEnabledIndices||u.defenseEnabledIndices.has(i))&&(u.defenseIntegrity?.[i]??1)>0&&(d.energyPerDamage===0||u.defenseActive!==false&&u.energy>0));
 const reduction=clamp((c.beamGuardReduction??0)+(shield?(c.shieldGuardBonus??0):0),0,.9),stabilityReduction=clamp((c.guardStabilityReduction??0)+(shield?.2:0),0,.95);
 // A guard trades a small offensive interruption for reduced impact, without
 // spending propulsion energy or starting a second evasive movement.
 b.cancelAttacks(u);u.swing=null;u.stableTime=0;u.microControlUntil=Math.max(u.microControlUntil||0,b.t+.1);u.nextDecision=b.t;
 return {chance,roll,shield,damageFactor:1-reduction,stabilityFactor:1-stabilityReduction};
}
export function fuseCrossing(shot,travel){
 if(!isAreaShot(shot)||!Number.isFinite(shot.fuseDistance))return null;
 const old=shot.traveled-travel,remaining=shot.fuseDistance-old;
 return remaining<=travel+1e-6?clamp(remaining/Math.max(1e-9,travel)):null;
}
export function blastFactor(distance,radius,targetRadius=0){const gap=Math.max(0,distance-targetRadius);return gap>radius?0:clamp(1-gap/Math.max(1,radius),0,1);}
// Smoke affects visibility, not blast pressure. Test only solid geometry.
export function blastVisible(b,position,u){
 const delta=sub(u.position,position),from=add(position,mul(norm(delta),.02)),to=u.position;
 for(const o of b.field?.obstacles||[]){if(o.health===0)continue;const at=o.dimensions?boxEntry(from,to,o.position,o.dimensions):sphereEntry(sub(from,o.position),sub(to,o.position),o.radiusM);if(at!==null&&at<1-1e-6)return false;}
 for(const o of b.objects||[]){if(o.life<=0||o.coreUnitId===u.id)continue;const at=sphereEntry(sub(from,o.position),sub(to,o.position),o.radius);if(at!==null&&at<1-1e-6)return false;}
 for(const other of b.units){if(other===u||!other.alive||other.docked||!['ship','terrain'].includes(other.entityType))continue;const at=hullEntry(other,from,to,other.position);if(at!==null&&at<1-1e-6)return false;}
 return true;
}
export function detonateArea(b,shot,position){
 const radius=shot.weapon.blastRadiusM;if(!(radius>0))return;
 const owner=b.unitById.get(shot.owner),hits=[];
 // One bounded area pass per explosion; no persistent damage volume or timer.
 for(const u of b.units){if(!u.alive||u.docked)continue;const factor=blastFactor(length(sub(u.position,position)),radius,u.machine.sim.radiusM);if(factor<=0||!blastVisible(b,position,u))continue;
  b.damage(u,{...shot,position:[...position],contactPoint:null,componentId:null,segmentEnd:null,areaDamage:true,weapon:{...shot.weapon,damage:shot.weapon.damage*factor},velocity:mul(norm(sub(u.position,position)),Math.max(1,length(shot.velocity)))});hits.push(u.id);
 }
 b.effects.push({type:'area-blast',t:b.t,life:.8,position:[...position],radius,actor:shot.owner});
 b.emit('area-detonation',shot.owner,(owner?.machine.name||'炮弹')+' 炮弹在预判区域引爆',{weapon:shot.weaponId,kind:'ballistic',position:[...position],radius,hitCount:hits.length});
 if(!hits.length&&owner)b.recordExchange(owner,shot.target,shot.kind,'miss');return hits;
}

// Expected contact return used by slot choice and range strategy. It shares the
// same ability/guard model as the hit path; geometry and energy remain separate.
export function contactDamageFactor(b,w,u){
 if(w.kind!=='beam'||w.sim.beamClass==='large')return 1;
 const chance=beamAvoidance(b,{kind:'beam',weapon:w.sim},u).chance;
 const c=u.pilotState?.tactics||{},shield=!!u.machine.defenses?.some((d,i)=>['shield','beam-shield','reflector'].includes(d.type)&&(!u.defenseEnabledIndices||u.defenseEnabledIndices.has(i))&&(u.defenseIntegrity?.[i]??1)>0&&(d.energyPerDamage===0||u.energy>0&&u.defenseActive!==false));
 const reduction=clamp((c.beamGuardReduction??0)+(shield?(c.shieldGuardBonus??0):0),0,.9);
 return (1-chance)*(1-(c.beamGuardChance??0)*reduction);
}
