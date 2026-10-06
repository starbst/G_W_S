import {clearReactions} from './defense-plans.js';
// Contact capture is physical and interruptible. No names, scene clocks or forced hits.
import {add,sub,mul,norm,length,dot,clamp,interceptPoint} from './math.js';
export function validateGrappleMachine(m){
 const s=m.selfDestructSystem;
 if(s){
  if(!s||Array.isArray(s)||typeof s!=='object'||Object.keys(s).some(k=>!['radiusM','damage','fuseS','structureThreshold','energyThreshold'].includes(k)))throw Error('自爆配置包含未知字段');
  for(const[k,lo,hi]of [['radiusM',10,500],['damage',1,2000],['fuseS',.1,10],['structureThreshold',0,1],['energyThreshold',0,1]])if(!Number.isFinite(s[k])||s[k]<lo||s[k]>hi)throw Error('自爆参数越界 '+k);
  if(!m.grappleSystem)throw Error('接触自爆需要实体抓取能力');
 }
 const c=m.grappleSystem;if(!c)return;
 const allowed=['formId','reachM','relativeSpeedMps','holdS','energyPerS','releaseDamage','strengthRatio'];
 if(!c||Array.isArray(c)||typeof c!=='object'||Object.keys(c).some(k=>!allowed.includes(k)))throw Error('抓取配置包含未知字段');
 for(const[k,lo,hi]of [['reachM',5,100],['relativeSpeedMps',5,400],['holdS',.1,3],['energyPerS',.1,30],['releaseDamage',1,150],['strengthRatio',.2,5]])if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi)throw Error('抓取参数越界 '+k);
 if(c.formId!==undefined&&!m.forms?.some(f=>f.id===c.formId))throw Error('抓取形态不存在');
}
export function vulnerableContact(b,u,target){
 const c=u.contacts.get(target.id);if(!c||b.t-c.observedAt>.6||target.entityType==='ship'||target.capturedBy||!target.alive||target.docked||!b.canSee(u.position,c.position)||!b.canSee(u.position,target.position))return false;
 // Visible PS shutdown is an observation, not access to an enemy battery value.
 return c.phaseArmorActive===false||c.propulsionDisabled===true;
}
export function desperateCapture(b,u,target){
 const s=u.machine.selfDestructSystem,c=target&&u.contacts.get(target.id);
 if(!s||!(u.pilotState.strategies?.['last-resort-detonation']>0)||!c||b.t-c.observedAt>.6||!target.alive||target.entityType==='ship'||target.capturedBy||target.docked||!b.canSee(u.position,c.position))return false;
 const critical=u.structure/u.machine.sim.structure<=s.structureThreshold||u.energy/u.machine.sim.energyCapacity<=s.energyThreshold;
 const armed=u.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.sim.damage>=25&&w.definition.sim.energyCost<=u.energy);
 return critical&&!armed&&!b.units.some(a=>a!==u&&a.side===u.side&&a.alive&&!a.docked&&length(sub(a.position,u.position))<s.radiusM+a.machine.sim.radiusM);
}
function eligible(b,u,target){return !!u.machine.grappleSystem&&u.alive&&!u.docked&&!u.capturedBy&&u.energy>u.machine.grappleSystem.energyPerS*.5&&((u.pilotState.strategies?.['capture-disabled']??0)>0&&vulnerableContact(b,u,target)||desperateCapture(b,u,target));}
export function captiveRescueTarget(b,u){
 if(!(u.pilotState.strategies?.['free-ally']>0)||u.capturedBy)return null;
 let chosen=null,best=Infinity;
 for(const ally of b.spatial.sides[u.side]||[]){if(!ally.alive||!ally.capturedBy)continue;const captor=b.unitById.get(ally.capturedBy),c=captor&&u.contacts.get(captor.id);if(!captor?.alive||!c||b.t-c.observedAt>.8||!b.canSee(u.position,c.position))continue;
 const distance=length(sub(c.position,u.position)),range=Math.max(0,...u.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind!=='melee').map(w=>w.definition.sim.rangeM));if(distance>range+u.machine.sim.maxSpeedMps*5)continue;
 if(distance<best){best=distance;chosen=captor;}}
 return chosen;
}
function rendezvous(u,contact,reach){
 const delta=sub(contact.position,u.position),distance=length(delta),speed=u.machine.sim.maxSpeedMps;
 const braking=u.machine.sim.thrustN/u.machine.sim.massKg*10*u.components.engine*(.6+.4*u.pilotState.sim.maneuver)*u.machine.mobility.accel.reverse;
 const closing=Math.min(speed*.9,Math.sqrt(2*braking*Math.max(0,distance-reach*.6)));
 // Match the observed coasting velocity throughout rendezvous. Switching from
 // a far intercept axis to velocity matching only at the last instant can add
 // hundreds of metres of sideways overshoot against a fast powerless target.
 const wanted=add(contact.velocity,mul(norm(delta),closing));
 const desired=length(wanted)>speed?mul(norm(wanted),speed):wanted;
 // Face the actual velocity change for forward thrust during the approach. At
 // contact distance the claws must face the victim and match its coasting speed.
 const heading=distance>reach*3?norm(sub(desired,u.velocity)):norm(delta);
 return {order:'captureApproach',heading,desired,flightMode:'normal'};
}
export function capturePosition(b,u,target){
 const c=u.machine.grappleSystem,seen=u.contacts.get(target.id);
 if(!c||!(u.pilotState.strategies?.['capture-position']>0)||!u.alive||u.capturedBy||u.grappleTarget||b.t<u.evadeUntil||u.energy<c.energyPerS*2||!target.alive||target.entityType==='ship'||!seen||b.t-seen.observedAt>.6||!b.canSee(u.position,seen.position)||vulnerableContact(b,u,target))return null;
 // Friendly pressure is observed through shared local contacts, not an enemy energy meter.
 const supporting=(b.spatial.sides[u.side]||[]).some(ally=>ally!==u&&ally.alive&&ally.targetId===target.id&&ally.contacts?.has(target.id)&&(b.t-(ally.lastFiredAt??-100)<2.5||ally.weapons.some(w=>w.attack?.targetId===target.id||w.salvo?.targetId===target.id)));
 if(!supporting)return null;
 const delta=sub(seen.position,u.position),distance=length(delta),speed=u.machine.sim.maxSpeedMps;
 if(distance>speed*12)return null;
 const side=u.captureStation?.targetId===target.id?u.captureStation.axis:norm([-delta[2],0,delta[0]]),stand=Math.max(c.reachM*1.5,u.machine.sim.radiusM+target.machine.sim.radiusM+30);
 const goal=add(seen.position,mul(side,(u.orbit||1)*stand));
 // Intercept the observed lateral station, rather than chase its old position
 // while prematurely matching the victim's full velocity. Match speed only
 // inside the real braking envelope; this never grants contact or capture.
 const lead=interceptPoint(u.position,goal,seen.velocity,speed*.95,u.pilotState.tactics.strategyLookaheadS);
 const route=sub(lead.position,u.position),braking=u.machine.sim.thrustN/u.machine.sim.massKg*10*u.components.engine*u.machine.mobility.accel.reverse;
 const relative=length(sub(u.velocity,seen.velocity)),turnAngle=Math.acos(clamp(dot(u.forward,norm(sub(seen.velocity,u.velocity))),-1,1));
 const stopping=relative**2/Math.max(1,2*braking)+relative*turnAngle/Math.max(.1,u.machine.sim.turnRateDeg*Math.PI/180*(.6+.4*u.pilotState.sim.maneuver));
 const wanted=length(sub(goal,u.position))>stopping+stand*2
   ?mul(norm(route),speed*.95)
   :add(seen.velocity,mul(norm(sub(goal,u.position)),Math.min(speed*.6,Math.max(0,length(sub(goal,u.position))-stand*.25)*1.2)));
 const desired=length(wanted)>speed?mul(norm(wanted),speed):wanted;
 return {order:'capturePosition',heading:distance>stand*2?norm(sub(desired,u.velocity)):norm(delta),desired,flightMode:'normal',stationAxis:side};
}
export function grappleApproach(b,u,target){
 if(!eligible(b,u,target)||b.t<u.evadeUntil||b.t<(u.grappleRecheckAt||0)||b.t<(target.captureBlockedUntil||0))return null;
 const c=u.machine.grappleSystem,contact=u.contacts.get(target.id),delta=sub(contact.position,u.position),distance=length(delta);
 if(distance>u.machine.sim.maxSpeedMps*5)return null;
 return rendezvous(u,contact,c.reachM);
}
export function grappleDecision(b,u,target,activeOnly=false){
 const c=u.machine.grappleSystem;
 if(u.capturedBy){b.cancelAttacks(u);clearReactions(u);u.swing=null;u.flightMode='coast';b.setOrder(u,'captured');u.nextDecision=b.t+.1;return true;}
 if(u.grappleTarget){const captive=b.unitById.get(u.grappleTarget);if(!captive?.alive){releaseGrapple(b,u,'目标失去作战能力');return false;}
 const carrier=(b.spatial.sides[u.side]||[]).filter(x=>x.alive&&x.entityType==='ship').sort((a,z)=>length(sub(a.position,u.position))-length(sub(z.position,u.position)))[0];
 const goal=carrier?add(carrier.position,mul(carrier.velocity,2)):add(u.position,mul(u.forward,2000));
 u.desiredFacing=norm(sub(goal,u.position));u.desired=carrier?add(carrier.velocity,mul(u.desiredFacing,Math.min(u.machine.sim.maxSpeedMps*.55,length(sub(goal,u.position))*.6))):mul(u.desiredFacing,u.machine.sim.maxSpeedMps*.55);u.flightMode=u.detonation?'coast':'normal';if(u.detonation)u.desired=[...u.velocity];u.nextDecision=b.t+.15;b.cancelAttacks(u);b.setOrder(u,u.detonation?'selfDestruct':'captureTow');return true;}
 if(activeOnly)return false;
 if(!eligible(b,u,target)){u.captureIntent=null;u.grappleContactSince=null;return false;}
 const distance=length(sub(target.position,u.position));if(distance>u.machine.sim.sensorRangeM)return false;
 const incoming=u.pendingReaction||b.t<u.evadeUntil;if(incoming)return false;
 u.captureIntent=target.id;u.desiredFacing=norm(sub(target.position,u.position));
 const plan=rendezvous(u,u.contacts.get(target.id),c.reachM);u.desiredFacing=plan.heading;u.desired=plan.desired;u.flightMode='normal';u.nextDecision=b.t+.1;b.cancelAttacks(u);b.setOrder(u,'captureApproach');return true;
}
export function releaseGrapple(b,captor,reason,attacker){
 const id=captor?.grappleTarget;if(!id)return;const target=b.unitById.get(id);b.captureEpoch=(b.captureEpoch||0)+1;if(captor.detonation){b.emit('self-destruct-aborted',captor.id,captor.machine.name+' 抓取被打断，停止接触自爆',{target:captor.detonation.targetId});captor.detonation=null;}captor.grappleTarget=null;captor.captureIntent=null;captor.grappleContactSince=null;captor.grappleRecheckAt=b.t+Math.max(.3,captor.pilotState.sim.reactionS*2);captor.nextDecision=b.t;
 if(target){target.capturedBy=null;target.captureBlockedUntil=b.t+1;target.nextDecision=b.t;target.order='recover';}
 b.emit('capture-released',captor.id,captor.machine.name+' 解除抓取：'+reason,{target:id,attacker:attacker||null});if(target)b.notice(target,'抓取解脱','good','capture',1.3);
}
export function grappleImpact(b,u,damage,attacker){
 const captor=u.grappleTarget?u:u.capturedBy?b.unitById.get(u.capturedBy):null;
 if(captor?.grappleTarget&&damage>=captor.machine.grappleSystem.releaseDamage)releaseGrapple(b,captor,'受到足以破坏保持姿态的真实攻击',attacker);
}
// Last-resort contact detonation compares the captor's own resources and
// the observed held body. It never reads an enemy's battery or assigns a kill.
export function considerDetonation(b,u){
 const s=u.machine.selfDestructSystem,victim=b.unitById.get(u.grappleTarget);
 if(!s||!(u.pilotState.strategies?.['last-resort-detonation']>0)||!u.alive||!victim?.alive||victim.capturedBy!==u.id||u.detonation)return false;
 const damageCritical=u.structure/u.machine.sim.structure<=s.structureThreshold;
 const exhausted=u.energy/u.machine.sim.energyCapacity<=s.energyThreshold;
 const possibleAttack=u.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.sim.damage>=25&&w.definition.sim.energyCost<=u.energy);
 if(possibleAttack||!exhausted&&!damageCritical)return false;
 // Sacrifice is not a sound trade while a friendly body is in the blast.
 if(b.units.some(a=>a!==u&&a.side===u.side&&a.alive&&!a.docked&&length(sub(a.position,u.position))<s.radiusM+a.machine.sim.radiusM))return false;
 u.detonation={targetId:victim.id,at:b.t+s.fuseS};b.cancelAttacks(u);u.flightMode='coast';u.desired=[...u.velocity];
 b.emit('self-destruct-armed',u.id,u.machine.name+' 常规出力难以维持，启动接触自爆',{target:victim.id,fuseS:s.fuseS,energy:u.energy,structure:u.structure});b.notice(u,'自爆倒计时','damage','self-destruct',s.fuseS);return true;
}
export function updateDetonations(b){
 for(const u of b.units){const armed=u.detonation,s=u.machine.selfDestructSystem;if(!armed)continue;
  const victim=b.unitById.get(armed.targetId),friendNear=b.units.some(a=>a!==u&&a.side===u.side&&a.alive&&!a.docked&&length(sub(a.position,u.position))<s.radiusM+a.machine.sim.radiusM);
  if(!u.alive||!victim?.alive||u.grappleTarget!==victim.id||victim.capturedBy!==u.id||friendNear){u.detonation=null;b.emit('self-destruct-aborted',u.id,u.machine.name+' 接触条件失效，停止自爆',{target:armed.targetId});continue;}
  if(b.t<armed.at)continue;
  const origin=[...u.position];u.detonation=null;
  b.emit('self-destruct',u.id,u.machine.name+' 引爆机体，按真实爆心距离结算',{target:victim.id,position:origin,radiusM:s.radiusM});
  for(const target of b.units){if(target===u||!target.alive||target.docked)continue;const delta=sub(target.position,origin),distance=length(delta);if(distance>s.radiusM+target.machine.sim.radiusM||!b.canSee(origin,target.position))continue;
   const factor=clamp(1-Math.max(0,distance-target.machine.sim.radiusM)/s.radiusM);
   b.damage(target,{owner:u.id,side:u.side,weaponId:'self-destruct',areaDamage:true,kind:'ballistic',order:'self-destruct',position:origin,velocity:mul(norm(delta),1000),traveled:0,weapon:{damage:s.damage*factor,rangeM:s.radiusM,effectiveRangeM:s.radiusM,minimumDamageFactor:1,damageClass:'physical',beamFraction:0,energyCost:0}});
  }
  releaseGrapple(b,u,'自爆结束');b.destroy(u,'接触自爆');
  b.effects.push({type:'explosion',t:b.t,life:3,position:origin,actor:u.id,radiusM:s.radiusM});
 }
}
export function updateGrapples(b,dt){
 for(const u of b.units){const c=u.machine.grappleSystem;if(!c)continue;
 if(u.grappleTarget){const victim=b.unitById.get(u.grappleTarget);const required=c.energyPerS*dt;
 const ownForce=u.machine.sim.thrustN*u.components.engine,escapeForce=victim?.machine.sim.thrustN*(victim?.components.engine??0)*(victim?.energy>victim?.machine.sim.dodgeEnergyCost?1:0);
 if(!u.alive||!victim?.alive||b.spend(u,required)<required*.99||escapeForce>ownForce*c.strengthRatio||u.stability<.12){releaseGrapple(b,u,!u.alive?'抓取机退出战斗':'保持出力不足或目标恢复挣脱能力');continue;}
 victim.position=add(u.position,mul(u.forward,c.reachM*.65));victim.velocity=[...u.velocity];victim.forward=mul(u.forward,-1);victim.acceleration=[...u.acceleration];victim.desired=[...u.velocity];clearReactions(victim);victim.evadeUntil=0;victim.swing=null;b.cancelAttacks(victim);victim.order='captured';considerDetonation(b,u);continue;}
 const target=b.unitById.get(u.captureIntent);if(!target||!eligible(b,u,target)||b.t<u.evadeUntil||u.pendingReaction||b.t<(u.grappleRecheckAt||0)||b.t<(target.captureBlockedUntil||0)){u.grappleContactSince=null;continue;}
 const separation=length(sub(target.position,u.position)),relativeSpeed=length(sub(target.velocity,u.velocity));
 if(separation>c.reachM||relativeSpeed>c.relativeSpeedMps||c.formId&&u.formId!==c.formId||dot(u.forward,norm(sub(target.position,u.position)))<.75){u.grappleContactSince=null;continue;}
 u.grappleContactSince??=b.t;if(b.t-u.grappleContactSince<c.holdS)continue;
 b.captureEpoch=(b.captureEpoch||0)+1;u.grappleTarget=target.id;target.capturedBy=u.id;b.cancelAttacks(u);b.cancelAttacks(target);u.nextDecision=b.t;target.nextDecision=b.t;
 b.emit('captured',u.id,u.machine.name+' 近距抓住 '+target.machine.name,{target:target.id,distance:separation,relativeSpeed});b.notice(target,'被抓取 · 无法推进','warning','capture',1.5);
 }
}
