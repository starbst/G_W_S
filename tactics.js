import {isLightAutomatic,isTacticalThreat} from './weapon-semantics.js';
import {motionSpeedLimit,meleeInterceptCourse} from './locomotion.js';
import {mayEngage} from './target-policy.js';
import {shipRamCourse} from './ship-maneuvers.js';
import {captureFireHeld,captureApproachHeld} from './capture-coordination.js';
import {commandTargetBonus,commandCourse,escortObjective} from './command.js';
import {grappleDecision,captiveRescueTarget} from './grapples.js';
import {shipWeaponRole} from './ship-weapons.js';
import {withdrawalOption} from './missions.js';
import {canObserve,environmentAt,searchWaypoint,meleeAltitudeReachable} from './battlefield.js';
import {concealedFrom,bodyguardCourse,remotePermission,mountedRemote,predictedProtectionCost} from './seed-systems.js';
import {choosePilotStrategy,funnelVelocity,bladeTrade,safePilotCourse} from './pilot-strategies.js';
import { add, sub, mul, dot, length, norm, cross, clamp, arcSolution, bodyBasis, rotateToward } from "./math.js";

import { missionPriority, navigationGoal, captureObjective } from "./missions.js";

const strength = (u,b) => u.machine.sim.thrustN / u.machine.sim.massKg * (u.machine.sim.structure / 200) * (u.weapons.some(w => w.definition.kind === "funnel" && !w.disabled&&!w.formDisabled&&remotePermission(b,u,w.definition)) ? 2 : 1);

// Reconsider an offensive assignment when its observed target is leaving and a
// friendly combatant is under concentrated fire. These are state-based decisions.
export function supportUnderPressure(b,u,allies,foes,pressure=null,candidates=null){
 if(!(u.pilotState.strategies?.['cover-ally']>0)||u.entityType==='ship'||!['objective','escort'].includes(u.controller)||candidates&&!candidates.length)return null;
 const primary=b.unitById.get(b.mission?.priorities?.[u.side]?.primaryEntityId),seen=primary&&u.contacts.get(primary.id);
 // A withdrawing battery can move sideways relative to this attacker. Compare
 // fresh observed motion against threatened allies too, never the enemy's flag.
 const withdrawalAxis = ally => dot(sub(seen.velocity,ally.velocity),norm(sub(seen.position,ally.position)));
 const withdrawing=primary&&seen&&b.t-seen.observedAt<.8&&(
   withdrawalAxis(u)>Math.max(40,primary.machine.sim.maxSpeedMps*.3)
   ||(candidates||allies).some(ally=>ally!==u&&ally.alive&&!ally.docked&&withdrawalAxis(ally)>Math.max(40,primary.machine.sim.maxSpeedMps*.15)));

 if(u.controller==='objective'&&primary?.alive&&!withdrawing)return null;
 if(!pressure){pressure=new Map();for(const foe of foes){if(!pressure.has(foe.targetId))pressure.set(foe.targetId,[]);pressure.get(foe.targetId).push(foe);}}
 const range=Math.max(0,...u.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind!=='melee').map(w=>w.definition.sim.rangeM));
 let best=null,score=0;
 for(const ally of candidates||allies){if(ally===u||!ally.alive||ally.docked||ally.entityType==='ship')continue;
  const threats=(pressure.get(ally.id)||[]).filter(x=>u.contacts.has(x.id)&&b.t-u.contacts.get(x.id).observedAt<.8&&x.weapons.some(w=>isTacticalThreat(w.definition,ally,b.rules.damageMultiplier)&&(w.attack?.targetId===ally.id||w.fireControl?.locked&&w.fireControl.targetId===ally.id)));
  if(threats.length<2&&ally.structure/ally.machine.sim.structure>.5&&ally.defenseActive!==false)continue;
  for(const x of threats){const c=u.contacts.get(x.id),distance=length(sub(c.position,u.position));if(distance>range+u.machine.sim.maxSpeedMps*15||!b.canSee(u.position,c.position))continue;
   const harm=Math.max(...x.weapons.filter(w=>!w.disabled&&!w.formDisabled).map(w=>w.definition.sim.damage/Math.max(.3,w.definition.sim.cooldownS)),0),value=threats.length+harm/40-distance/20000;
   if(value>score){best=x;score=value;}
  }
 }
 return best;
}
export function assignTargets(b) {
    const pressure=new Map();for(const foe of b.units){if(!foe.alive||foe.docked)continue;if(!pressure.has(foe.targetId))pressure.set(foe.targetId,[]);pressure.get(foe.targetId).push(foe);}
    const supportCandidates=new Map();for(const side of ['a','b','c'])supportCandidates.set(side,(b.spatial.sides[side]||[]).filter(a=>a.alive&&!a.docked&&a.entityType!=='ship'&&((pressure.get(a.id)||[]).filter(x=>x.side!==side).length>=2||a.structure/a.machine.sim.structure<=.5||a.defenseActive===false)));
    const allocations = new Map, strengths=new Map(b.units.filter(u=>u.alive&&!u.docked).map(u=>[u.id,strength(u,b)]));
    for (const u of b.units.filter(x => x.alive && !x.docked).sort((a, c) => a.id.localeCompare(c.id))) {
        const foes = (b.enemies(u) || []).filter(x=>mayEngage(b,u,x)), allies = b.spatial.sides[u.side] || [];
        const rescue=captiveRescueTarget(b,u),newSupport=supportUnderPressure(b,u,allies,foes,pressure,supportCandidates.get(u.side));
        const heldSupport=u.supportIntent,heldAlly=heldSupport&&b.unitById.get(heldSupport.allyId),heldThreat=heldSupport&&foes.find(f=>f.id===heldSupport.targetId),heldContact=heldThreat&&u.contacts.get(heldThreat.id);
        // A beam's charge flag disappears when it fires. That does not complete
        // the covering run: retain its observed target for one local plan window
        // instead of bouncing to the fleet objective between every shot.
        const support=newSupport||heldSupport?.until>b.t&&heldAlly?.alive&&heldAlly.side===u.side&&heldContact&&b.t-heldContact.observedAt<.8&&heldThreat;
        let best = null, score = -Infinity;const values=new Map();
        const ownStrength=Math.max(1,strengths.get(u.id)),parallel=(u.pilotState.strategies?.['parallel-fire']??0)>0;
        const assignedAlly=u.commandAssignment?.type==='escort'&&b.unitById.get(u.commandAssignment.allyId),priorityUnit=parallel&&b.unitById.get(b.mission?.priorities?.[u.side]?.primaryEntityId);
        const protectedUnit=u.controller==='escort'?(assignedAlly?.alive&&assignedAlly.side===u.side?assignedAlly:escortObjective(b,u)||(priorityUnit?.side===u.side?priorityUnit:null)):null;
        const interceptor=u.controller==='escort'&&foes.some(f=>f.entityType!=='ship'&&u.contacts.has(f.id)&&f.targetId===u.id&&length(sub(u.contacts.get(f.id).position,u.position))<Math.max(5000,...f.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0).map(w=>w.definition.sim.effectiveRangeM)));
        const objectiveAttacker=u.controller==='screen'?allies.find(a=>a.controller==='objective'):null;
        const screens=allies.filter(a=>a.controller==='screen');
        const objectivePressure=u.controller==='objective'&&foes.some(x=>x.entityType==='ship')?foes.filter(f=>f.entityType==='ms'&&length(sub(f.position,u.position))<14000).reduce((n,f)=>n+strengths.get(f.id)/ownStrength,0)/Math.max(1,screens.reduce((n,a)=>n+a.structure/a.machine.sim.structure,0)*8):0;
        const gunRange=u.controller==='objective'?Math.max(100,...u.weapons.filter(w=>!w.disabled&&w.ammo!==0&&w.definition.kind!=='melee').map(w=>w.definition.sim.rangeM)):0;
        const attackers=u.controller==='objective'&&u.entityType!=='ship'&&(u.pilotState.strategies?.['threat-retarget']??0)>0?foes.filter(f=>u.contacts.has(f.id)&&f.weapons.some(w=>!w.disabled&&w.ammo!==0&&isTacticalThreat(w.definition,u,b.rules.damageMultiplier)&&(w.attack?.targetId===u.id||w.fireControl?.targetId===u.id&&w.fireControl.locked))&&length(sub(f.position,u.position))<Math.max(3000,...f.weapons.filter(w=>!w.disabled&&w.ammo!==0).map(w=>w.definition.sim.effectiveRangeM))):[];
        const attackPressure=attackers.reduce((n,f)=>n+strengths.get(f.id)/ownStrength,0),attackerIds=new Set(attackers.map(f=>f.id));
        for (const x of foes) {
            if(captureFireHeld(b,u,x)&&b.captureReservations?.get(u.side+':'+x.id)?.captorId!==u.id&&!captureApproachHeld(b,u,x))continue;
            const contact = u.contacts.get(x.id);
            if (!contact && ((u.pilotState.strategies?.["sensor-sharing"]??0)>0||length(sub(x.position, u.position)) > u.machine.sim.sensorRangeM)) continue;
            const known = contact?.position || x.position, range = length(sub(known, u.position)), relativePower = strengths.get(x.id) / ownStrength;
            let value = (x.machine.tags?.includes('civilian')&&u.pilotState.strategies?.['reckless-clearance']>0?18:3) - range / 8e3 + (u.controller === "objective" ? missionPriority(b, u, x) * u.pilotState.tactics.missionValue / 9 : 0);
            if (u.controller === "escort") {
                const threat = protectedUnit ? length(sub(known, protectedUnit.position)) : Infinity;
                const activeThreat=(u.pilotState.strategies?.["parallel-fire"]??0)>0&&protectedUnit?x.weapons.filter(w=>!w.disabled&&w.ammo!==0&&(w.attack?.targetId===protectedUnit.id||w.fireControl?.locked&&w.fireControl.targetId===protectedUnit.id)).reduce((n,w)=>n+w.definition.sim.damage*w.definition.sim.burst/Math.max(.3,w.definition.sim.cooldownS),0):0;
                // An escort under interception cannot abandon its own fight to chase a distant battery.
                const distantBattery=interceptor&&x.entityType==='ship'&&range>5000;
                value += (protectedUnit?.supportUntil > b.t && protectedUnit.supportTarget === x.id && !distantBattery ? 8*(u.pilotState.strategies?.['cover-ally']??1) : 0) + (x.entityType !== "ship" ? 6 : 0) + Math.max(0, 16e3 - threat) / 2500+Math.min(distantBattery?3:18,activeThreat/30);
                if(interceptor&&contact&&b.t-contact.observedAt<.8&&x.entityType!=='ship'&&x.targetId===u.id){
                    // A nearby lock/charge aimed at the escort is a concrete intercept,
                    // even when another enemy remains closer to the protected ship.
                    const incoming=x.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&range<=w.definition.sim.effectiveRangeM&&(w.attack?.targetId===u.id||w.fireControl?.locked&&w.fireControl.targetId===u.id));
                    const observed=x.id===u.observedHeavyAttacker&&b.t-(u.observedHeavyAt??-100)<2.5?Math.min(14,(u.observedHeavyDamage||0)/Math.max(1,u.structure)*24):0;
                    value+=8+Math.max(observed,Math.min(14,incoming.reduce((n,w)=>n+w.definition.sim.damage/Math.max(.3,w.definition.sim.cooldownS),0)/20))*u.pilotState.tactics.selfPreservation;
                }
            }
            if (u.controller === "screen") {
                const engagingObjective = objectiveAttacker && x.id === objectiveAttacker.targetId;
                value += (["ms","ma"].includes(x.entityType) ? u.pilotState.tactics.screenValue : 0) + (engagingObjective ? 2 : 0);
            }
            if (u.controller === "objective" && x.entityType === "ship") {
                value -= objectivePressure * Math.max(0, range / gunRange - 1) * u.pilotState.tactics.selfPreservation;
            }
            if(attackers.length){const weight=u.pilotState.strategies['threat-retarget'];
                if(x.entityType==='ship')value-=attackPressure*weight*u.pilotState.tactics.selfPreservation;
                else if(attackerIds.has(x.id))value+=attackPressure*weight*4;
            }
            if (x.entityType !== "ship" && u.controller === "objective" && !screens.length) value += relativePower * 2;
            value -= (allocations.get(x.id) || 0) * (u.controller === "screen" ? .1 : 1.4);
            if (x.id === u.targetId) value += .5;
            if(rescue?.id===x.id)value+=35*(u.pilotState.strategies["free-ally"]||0);
            if(support?.id===x.id)value+=18*(u.pilotState.strategies['cover-ally']||0);
            if(contact&&dot(contact.velocity,norm(sub(contact.position,u.position)))>Math.max(40,x.machine.sim.maxSpeedMps*.3)&&support)value-=missionPriority(b,u,x)*u.pilotState.tactics.missionValue/9;
            value+=commandTargetBonus(b,u,x);
            values.set(x.id,value);
            if (value > score) {
                score = value;
                best = x;
            }
        }
        const heldTeam=!!u.coordinationPlan&&u.coordinationPlan.targetId===u.targetId&&b.t<u.coordinationPlan.until;
        const playerTarget=u.commandAssignment?.source==='player'&&['attack','screen'].includes(u.commandAssignment.type)&&u.commandAssignment.targetId!==u.targetId;
        if(best&&!playerTarget&&((u.pilotState.strategies?.['parallel-fire']??0)>0||heldTeam)){
            const current=foes.find(x=>x.id===u.targetId),retained=values.get(u.targetId);
            const changeCost=2+(heldTeam?2:0)+(u.locked?2:0)+(u.weapons.some(w=>w.attack||w.salvo)?3:0);
            if(current&&Number.isFinite(retained)&&score<retained+changeCost){best=current;score=retained;}
        }
        // The body's close-contact threat has an earlier deadline than a distant
        // support assignment. Keep its facing while independent mounts assist.
        let local=null,localDeadline=Infinity;
        for(const x of foes){const c=u.contacts.get(x.id);if(!c||b.t-c.observedAt>.5)continue;
            const blade=x.weapons.find(w=>!w.disabled&&!w.formDisabled&&w.definition.kind==='melee'&&(w.attack?.targetId===u.id||x.swing?.targetId===u.id||['melee','bladeCover'].includes(x.order)&&x.targetId===u.id));
            if(!blade)continue;const delta=sub(c.position,u.position),d=length(delta),closing=Math.max(0,-dot(sub(c.velocity,u.velocity),norm(delta)));
            if(d>=blade.definition.sim.rangeM+closing*(u.pilotState.sim.reactionS+blade.definition.sim.windupS+.5)+80)continue;
            const contact=Math.max(0,d-blade.definition.sim.rangeM)/Math.max(1,closing),release=blade.attack?Math.max(0,blade.attack.at-b.t):x.swing?0:blade.definition.sim.windupS;
            const deadline=Math.max(contact,release);
            if(deadline<localDeadline){local=x;localDeadline=deadline;}
        }
        const committed=u.weapons.find(w=>w.definition.kind==='melee'&&w.attack&&b.t<=w.attack.at+.35);
        const stroke=committed&&foes.find(x=>x.id===committed.attack.targetId),strokeView=stroke&&u.contacts.get(stroke.id);
        const strokeReach=stroke&&strokeView&&b.t-strokeView.observedAt<.5&&length(sub(strokeView.position,u.position))<=committed.definition.sim.rangeM+length(sub(strokeView.velocity,u.velocity))*Math.max(.1,committed.attack.at-b.t+.35);
        if(u.commandAssignment?.source!=='player'&&(local||strokeReach)){best=local||stroke;score=values.get(best.id);}

        u.supportIntent = best && (best.id === support?.id || best.id === rescue?.id || u.commandAssignment?.source==='ai'&&u.commandAssignment?.type==='escort'&&u.commandAssignment.targetId===best.id||u.controller==='escort'&&protectedUnit?.alive&&best.entityType!=='ship')
            ? {targetId:best.id, allyId:u.commandAssignment?.allyId || protectedUnit?.id || best.grappleTarget || (best.id===heldSupport?.targetId?heldSupport.allyId:best.targetId),until:newSupport?.id===best.id?b.t+Math.max(1,u.pilotState.tactics.planHoldS):heldSupport?.targetId===best.id?heldSupport.until:b.t+Math.max(1,u.pilotState.tactics.planHoldS)} : null;
        if (best) {
            // A ship's selected contact is not equivalent to an MS interception.
            // Count actual useful batteries only: main guns cannot cover small MS,
            // and distant point defense cannot reserve an enemy for the whole team.
            const contact=u.contacts.get(best.id),distance=contact?length(sub(contact.position,u.position)):Infinity;
            const coverage=u.entityType!=='ship'?1:u.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&distance<=w.definition.sim.effectiveRangeM&&(!['main-battery','heavy-main'].includes(shipWeaponRole(u,w.definition))||best.entityType==='ship'||best.machine.sim.radiusM>=50)&&(w.attack?.targetId===best.id||w.fireControl?.locked&&w.fireControl.targetId===best.id))?.5:0;
            allocations.set(best.id, (allocations.get(best.id) || 0) + coverage);
            if (best.id !== u.targetId) {
                const before = u.targetId;
                u.targetId = best.id;
                u.track = 0;
                u.locked = false;
                u.lockedTargetId = null;
                u.lastSeen = null;
                u.observations = [];
                u.fireSolution = null;
                if((u.pilotState.strategies?.["parallel-fire"]??0)<=0)b.cancelAttacks(u);
                u.nextDecision = b.t;
                b.emit("target", u.id, u.machine.name + " 重评任务与生存风险，目标改为 " + best.machine.name, {
                    previous: before,
                    target: best.id,
                    score: score
                });
            }
        }
    }
    coordinateEngagements(b);
}

// Basic numerical-superiority doctrine is a held team assignment, not another
// per-frame lottery. Emergency reactions suspend motion, never erase this role.
export function coordinateEngagements(b){
 const groups=new Map();
 for(const u of b.units){
  const plan=u.coordinationPlan;
  const seen=u.contacts?.get(u.targetId),freshSeen=seen?.position&&b.t-seen.observedAt<.8;
  // A held team plan must survive a short sensor/fire-control interruption.
  // Otherwise one lost lock makes both wings abandon their crossing lanes and
  // the next tick rebuilds them as if no coordination existed.
  const heldSeen=!!plan&&plan.targetId===u.targetId&&b.unitById.get(plan.targetId)?.alive&&u.contacts?.get(plan.targetId)&&b.t-u.contacts.get(plan.targetId).observedAt<2.2;
  const ready=u.alive&&!u.docked&&!u.capturedBy&&['ms','ma'].includes(u.entityType)&&(freshSeen||heldSeen)&&u.energy>u.machine.sim.energyCapacity*.12&&(u.pilotState.strategies?.['team-crossfire']??1)>0;
  const route=['hold','withdraw','escort'].includes(u.commandAssignment?.type)||(b.mission?.victory&&navigationGoal(b,u));
  const supportConflict=u.supportIntent&&u.supportIntent.targetId!==u.targetId;
  if(!ready||u.withdrawing||u.controller==='escort'||supportConflict||route&&u.commandAssignment?.type!=='attack'&&u.commandAssignment?.type!=='screen'){u.coordinationPlan=null;continue;}
  const key=u.side+':'+u.targetId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u);
 }
 b.coordinationTeams??=new Map();const active=new Set();
 for(const [key,members]of groups){
  const target=b.unitById.get(members[0].targetId),localFoes=new Set();
  for(const u of members)for(const [id,c]of u.contacts){const foe=b.unitById.get(id);if(foe?.alive&&foe.side!==u.side&&['ms','ma'].includes(foe.entityType)&&c.position&&b.t-c.observedAt<.8&&length(sub(c.position,u.position))<6500)localFoes.add(id);}
  if(members.length<2||!target?.alive||members.length<=Math.max(1,localFoes.size)){for(const u of members)u.coordinationPlan=null;continue;}
  active.add(key);const signature=members.map(u=>u.id).sort().join('|'),previous=b.coordinationTeams.get(key);
  let plan=previous;
  const leadUnit=plan?.leaderId&&b.unitById.get(plan.leaderId);
  const bladeLost=leadUnit&&!leadUnit.weapons.some(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind==='melee');
  if(!plan||plan.signature!==signature||bladeLost||b.t>=plan.until){
   const options=members.map(u=>{
    const seen=u.contacts.get(target.id),distance=length(sub(seen.position,u.position));
    const blade=b.bestBlade(u,target),course=blade&&meleeInterceptCourse(b,u,seen,blade.definition.sim.rangeM);
    const guns=u.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&!isLightAutomatic(w.definition)&&w.definition.kind!=='melee'&&distance>=w.definition.sim.minRangeM&&distance<=w.definition.sim.rangeM&&(w.definition.kind!=='funnel'||remotePermission(b,u,w.definition)||mountedRemote(b,u,w.definition)));
    let power=0,pressurePower=0;
    for(const state of guns){
     const w=state.definition,s=w.sim,rate=(s.burst||1)/Math.max(.3,s.cooldownS+s.windupS);
     const protection=predictedProtectionCost(target,w,s.damage,norm(sub(u.position,seen.position)),distance);
     // Armor-absorbed fire can drain an energy defense but cannot be counted
     // as hull damage or assigned the same value as penetrating fire.
     power+=protection.remainingDamage*rate;
     pressurePower+=protection.energyCost*rate;
    }
    const exchange=b.exchangeState(u,target.id),badExchange=exchange.rangedLoss-exchange.rangedGain+exchange.rangedMisses*.025>u.pilotState.tactics.exchangeDisadvantage;
    const energy=u.energy/u.machine.sim.energyCapacity,melee=u.pilotState.capabilities?.melee??u.pilotState.sim.maneuver;
    const pressureReady=!!blade&&u.controller!=='survive'&&energy>.3;
    const assault=pressureReady&&!!course?.feasible&&u.stability>.25&&(power<12||badExchange||u.pilotState.tags?.includes('blade-specialist')||target.stability<.25);
    return {u,distance,blade,course,power,pressurePower,badExchange,pressureReady,assault,pressureScore:melee*2+u.stability+energy-distance/4000,score:course?.feasible?melee*3+u.stability+energy-course.time*.35:-Infinity};
   });
   const leads=options.filter(o=>o.assault).sort((a,z)=>z.score-a.score||a.u.id.localeCompare(z.u.id)),lead=leads[0];
   // If direct interception is currently impossible, a losing/near exchange
   // can still justify a flank pressure role. It may not claim a reachable
   // blade contact: the pilot uses the target's observed escape lane instead.
   const pressure=options.filter(o=>o.pressureReady&&(o.distance<1800||(o.badExchange||o.power<1)&&o.distance<Math.min(8000,o.u.machine.sim.maxSpeedMps*12))).sort((a,z)=>z.pressureScore-a.pressureScore||a.u.id.localeCompare(z.u.id))[0];
   const oldLead=options.find(o=>o.u.id===previous?.leaderId&&o.pressureReady);
   const leader=oldLead&&(!lead||oldLead.assault&&oldLead.score+1>=lead.score)?oldLead:lead||pressure;
   const supportOptions=options.filter(o=>o.u!==leader?.u&&(o.power>3||o.pressurePower>.3));
   const oldSupport=supportOptions.find(o=>o.u.id===previous?.supportId);
   const support=oldSupport||supportOptions.sort((a,z)=>(z.power+z.pressurePower*.2)-(a.power+a.pressurePower*.2)||z.distance-a.distance||a.u.id.localeCompare(z.u.id))[0];
   // Roles last long enough for one approach. Reassess actual feasibility,
   // task priority and reserves; do not alternate wings after every dodge.
   plan={signature,leaderId:leader?.u.id||null,supportId:support?.u.id||null,until:b.t+8.5};b.coordinationTeams.set(key,plan);
  }
  let flankIndex=0;
  for(const u of members){const role=u.id===plan.leaderId?'assault':u.id===plan.supportId?'support':'flank',old=u.coordinationPlan,wingSide=old?.role===role&&old.targetId===target.id?old.wingSide:(++flankIndex%2?1:-1);
   u.coordinationPlan={targetId:target.id,role,leaderId:plan.leaderId,wingSide,until:plan.until};
   if(old?.role!==role||old.targetId!==target.id){u.nextDecision=b.t;b.emit('team-role',u.id,u.machine.name+' · '+({assault:'近战突入',support:'远处火力支援',flank:'侧翼截击'}[role]),{role,target:target.id,leader:plan.leaderId});}
  }
 }
 for(const key of b.coordinationTeams.keys())if(!active.has(key))b.coordinationTeams.delete(key);
}

export function updateContacts(b) {
    const active=b.units.filter(x=>x.alive&&!x.docked),observations=[],environments=new Map(),size=b.units.length;
    if(b.contactDistances?.length!==size*size)b.contactDistances=new Float64Array(size*size);const distances=b.contactDistances;distances.fill(NaN);
    for(const u of active)environments.set(u.id,environmentAt(b,u.position));
    const sensorPeriod=active.length>32?4:1;
    for (const u of active) {
        // Large formations scan different quarters each step. A sensor revisits
        // within 200ms; direct target fire control and attack warnings stay 20Hz.
        if(b.tick>1&&sensorPeriod>1&&b.unitIndices.get(u.id)%sensorPeriod!==b.tick%sensorPeriod)continue;
        const modern=(u.pilotState.strategies?.["sensor-sharing"]??0)>0,ui=b.unitIndices.get(u.id),sensor=u.machine.sim.sensorRangeM,environment=environments.get(u.id);let refreshed=0;
        for (const x of b.enemies(u) || []) {
            const dx=x.position[0]-u.position[0],dy=x.position[1]-u.position[1],dz=x.position[2]-u.position[2];
            if(Math.abs(dx)>=sensor||Math.abs(dy)>=sensor||Math.abs(dz)>=sensor)continue;
            const xi=b.unitIndices.get(x.id),index=ui*size+xi;let distance=distances[index];if(Number.isNaN(distance)){distance=Math.hypot(dx,dy,dz);distances[index]=distance;distances[xi*size+ui]=distance;}
            if (distance < u.machine.sim.sensorRangeM && !concealedFrom(b,u,x) && (modern?canObserve(b,u,x,distance,environment,environments.get(x.id)):b.canSee(u.position,x.position))) {
                // A direct observation is read-only. Share one frozen-in-time pose per
                // target and tick; delayed radio reports keep their own copied pose.
                let contact=observations[xi];
                if(!contact){contact={position:[...x.position],velocity:[...x.velocity],forward:[...x.forward],observedAt:b.t,shared:false,entityType:x.entityType,aimTargetIds:[...new Set(x.weapons.filter(w=>!w.disabled&&!w.formDisabled&&(w.attack||w.salvo)).map(w=>w.attack?.targetId||w.salvo?.targetId))],threatTargetIds:[...new Set(x.weapons.filter(w=>!w.disabled&&!w.formDisabled&&(w.attack||w.salvo)&&isTacticalThreat(w.definition,b.unitById.get(w.attack?.targetId||w.salvo?.targetId),b.rules.damageMultiplier)).map(w=>w.attack?.targetId||w.salvo?.targetId))],...(x.machine.defenses?.some(d=>["ps","tp","vps"].includes(d.type))?{phaseArmorActive:x.defenseActive!==false}:{}),propulsionDisabled:x.components.engine<=.05};observations[xi]=contact;}
                const previous=u.contacts.get(x.id);if(contact.phaseArmorActive===false&&previous?.phaseArmorActive!==false&&(u.pilotState.strategies?.["capture-disabled"]??0)>0)u.nextDecision=b.t;
                u.contacts.set(x.id,contact);refreshed++;
            }
        }
        // Unique directly observed IDs cover the whole map: no entry can have expired.
        if(refreshed!==u.contacts.size)for (const [id, c] of u.contacts) if (b.t - c.observedAt > 12) u.contacts.delete(id);
    }
}

export function decideV5(b, u, target) {
    if(grappleDecision(b,u,target,true))return;
    // No attack controller may use a stale contact as a live melee solution.
    // Emergency reactions and player navigation retain priority over searching.
    if(u.entityType!=='ship'&&u.controller!=='simple'&&!u.visible&&b.t-u.lastSeenAt>1.2&&b.t>=u.evadeUntil&&!u.missileThreat&&!commandCourse(b,u,target)&&!navigationGoal(b,u)&&target.alive){
      const c=u.contacts.get(target.id),bearing=c?add(c.position,mul(c.velocity,Math.min(2,Math.max(0,b.t-c.observedAt)))):b.observed(u,target),point=searchWaypoint(b,u,bearing),route=sub(point,u.position),distance=length(route);
      const heading=distance>10?norm(route):u.forward;u.desiredFacing=heading;u.desired=mul(heading,Math.min(u.machine.sim.maxSpeedMps*.65,distance*.8));u.flightMode='normal';u.meleeIntent=null;u.captureIntent=null;b.cancelAttacks(u);u.nextDecision=b.t+.2;b.setOrder(u,'acquire');return;
    }
    const m = u.machine.sim, p = u.pilotState.sim, c = u.pilotState.tactics, seen = u.contacts.get(target.id), known = seen?.position || b.observed(u, target), delta = sub(known, u.position), distance = length(delta), toward = norm(delta), side = norm(cross([ 0, 1, 0 ], toward));
    let order = "approach", heading = toward, desired = mul(toward, m.maxSpeedMps),bladePreparation=null;
    // A dead/stale target is not a reason to keep approaching its last position.
    // Navigation remains active even when there is nobody left to engage.
    if(u.entityType!=='ship'&&(target===u||!target.alive||target.disabled&&!target.coreActive)){
        const cover=commandCourse(b,u,target);if(cover){u.desiredFacing=cover.heading;u.desired=cover.desired;u.flightMode=cover.flightMode;u.nextDecision=b.t+.25;b.setOrder(u,cover.order);return;}
         const goal=navigationGoal(b,u),route=goal?sub(goal.point,u.position):null;
        const course=route?safePilotCourse(b,u,norm(route),goal):u.forward;
        u.desiredFacing=course;u.desired=route?mul(course,Math.min(m.maxSpeedMps*.95,length(route)*1.2)):[...u.velocity];
        u.flightMode=route?'normal':'coast';u.nextDecision=b.t+.25;
        b.setOrder(u,route?'disengage':'recover');return;
    }
    const capture=captureObjective(b,u);if(capture?.entityId===target.id){const speed=clamp((distance-capture.radiusM*.6)*1.2,0,m.maxSpeedMps);u.desiredFacing=toward;u.desired=mul(toward,speed);u.nextDecision=b.t+.25;u.flightMode="normal";b.setOrder(u,"approach");return;}
    if (u.entityType === "ship") {
        order = "cruise";
        heading = norm(mul(toward, -1));
        desired = mul(heading, m.maxSpeedMps * .55);
        if(u.machine.powerSystem&&u.controller==='objective'){
            const primary=u.weapons.filter(w=>!w.disabled&&w.ammo!==0&&w.definition.kind!=='melee').sort((a,z)=>z.definition.sim.damage-a.definition.sim.damage)[0];
            if(primary){heading=toward;desired=mul(toward,clamp((distance-primary.definition.sim.preferredRangeM)*.06,-m.maxSpeedMps*.35,m.maxSpeedMps*.65));}
        }
        const retreat=withdrawalOption(b,u);if(retreat){u.withdrawing=true;b.setOrder(u,'disengage');}
        const goal = navigationGoal(b, u);
        if (goal) {
            heading = norm(sub(goal.point, u.position));
            desired = mul(heading, u.machine.powerSystem?Math.min(m.maxSpeedMps*.8,length(sub(goal.point,u.position))*1.2):m.maxSpeedMps*.8);
        }
        const incoming = (b.enemies(u) || []).filter(e => u.contacts.has(e.id) && e.weapons.some(w => w.attack?.targetId === u.id && w.definition.sim.windupS > 1));
        if (incoming.length) {
            const maneuver = chooseShipEvasion(b, u, incoming);
            u.rollTarget = maneuver.roll;
            heading = maneuver.forward;
            desired = add(mul(heading, m.maxSpeedMps * .4), mul(side, m.maxSpeedMps * .35));
            order = "ship-evasion";
            if (b.t >= (u.heavyWarningAt || 0)) {
                u.heavyWarningAt = b.t + 2;
                u.supportTarget=incoming[0].id;u.supportUntil=b.t+4;
                b.emit("support", u.id, u.machine.name + " 探测重炮蓄能，比较可达迎角后机动并请求护航", {
                    request: true,
                    target: incoming[0].id,
                    projectedArea: maneuver.area
                });
            }
        } else u.rollTarget = 0;
        const ram=shipRamCourse(b,u,target);if(ram){({order,heading,desired}=ram);u.rollTarget=0;if(u.ramTargetId!==target.id){u.ramTargetId=target.id;b.emit('strategy',u.id,u.machine.name+' 判断舰体濒危且目标可达，选择舰体截击',{strategy:'terminal-intercept',target:target.id});}}else u.ramTargetId=null;
        if(u.machine.sim.airLift&&["air","surface","ground"].includes(b.environment.medium)&&(!goal||goal.point[1]>=0)){desired[1]=clamp(((goal?.point[1]??u.cruiseAltitude)-u.position[1])*1.2,-m.maxSpeedMps*.25,m.maxSpeedMps*.25);}
        const near = (b.enemies(u) || []).filter(e => e.entityType === "ms" && u.contacts.has(e.id) && length(sub(e.position, u.position)) < 5e3).sort((a, c) => length(sub(a.position, u.position)) - length(sub(c.position, u.position)))[0];
        if (near && (u.structure / u.machine.sim.structure < .85 || length(sub(near.position, u.position)) < 2500) && b.t > (u.supportAt || 0)) {
            u.supportAt = b.t + 3;
            u.supportTarget = near.id;
            u.supportUntil = b.t + 5;
            b.emit("support", u.id, u.machine.name + " 请求附近护航单位驱离近距威胁", {
                target: near.id,
                request: true
            });
        }
    } else if (u.controller === "simple") {
        order = "cruise";
        heading = u.forward;
        desired = mul(heading, m.maxSpeedMps * .25);
        const goal = navigationGoal(b, u);
        if (goal) {
            heading = norm(sub(goal.point, u.position));
            desired = mul(heading, m.maxSpeedMps * .8);
        }
    } else if (b.t < u.evadeUntil) {
        order = "evade";
        heading = u.forward;
        desired = [ ...u.velocity ];
    } else if (u.missileThreat) {
        order = "missileBreak";
        const axis = b.chooseEscape(u, target, "missile", u.missileThreat.direction);
        heading = norm(add(mul(length(u.velocity) > 60 ? norm(u.velocity) : u.forward, .4), mul(axis, 1.2)));
        desired = mul(heading, m.maxSpeedMps);
        if((u.pilotState.strategies?.["missile-drag"]??1)>0){const carry=length(u.velocity)>40?norm(u.velocity):u.forward;heading=norm(add(mul(carry,.8),mul(axis,.7)));desired=mul(heading,m.maxSpeedMps);}
    } else {
        const enemyFunnel = b.drones.filter(d => d.owner !== u.id && d.side !== u.side && length(sub(d.position, u.position)) < 14e3);
        const ranged = u.weapons.filter(w => !w.disabled && !w.formDisabled && w.ammo !== 0 && !isLightAutomatic(w.definition) && w.definition.kind !== "melee" && (w.definition.kind !== "funnel"||mountedRemote(b,u,w.definition))), ownFunnel = u.weapons.find(w => w.definition.kind === "funnel" && !w.disabled&&!w.formDisabled&&remotePermission(b,u,w.definition)), blade = b.bestBlade(u,target),bladeReachable=blade&&meleeAltitudeReachable(b,u,seen,blade.definition.sim.rangeM);
        const superiority = strength(target,b) / Math.max(1, strength(u,b)), guns = ranged.filter(w => distance < w.definition.sim.rangeM), screenHelp = (b.spatial.sides[u.side] || []).some(a => a !== u && a.controller === "screen");
        if (p && u.pilotState.traits.antiFunnel && Math.min(1, enemyFunnel.length / 3) >= c.antiFunnelThreshold && enemyFunnel.length && superiority > 1.3 && guns.length && !u.suppressionComplete) {
            u.suppressing = true;
            order = "suppress";
            heading = toward;
            desired = mul(norm(add(toward, mul(side, .35))), m.maxSpeedMps * .85);
        }
        if (u.suppressing && (!guns.length || ranged.filter(w=>w.definition.sim.suppressionStage).every(w => w.ammo === 0 && !w.attack && !w.salvo))) {
            u.suppressing = false;
            u.suppressionComplete = true;
        }
        const parts = (u.machine.attachments || []).filter(x => !u.detached?.has(x.id)), mass = parts.reduce((n, x) => n + x.massKg, 0), gain = m.massKg / Math.max(1, m.massKg - mass), canRush = distance < 1e4 && blade && u.energy > c.energyReserveFraction * m.energyCapacity;
        if (u.pilotState.traits.jettison && (u.pilotState.strategies?.["decoy-breakthrough"]??1)>0 && parts.length && canRush && (superiority > 1.3 || u.suppressionComplete) && gain > c.jettisonGain && (u.suppressionComplete || !guns.length)) {
            b.detach(u);
            u.suppressing = false;
        }
        // Remote preparation/emission is observed once by updateDrones; tactics must not invent a second launch.
        const closingForBlade = Math.max(0, dot(sub(u.velocity, seen?.velocity || target.velocity), toward));
        if ((u.pilotState.strategies?.["funnel-recall"]??1)>0 && ownFunnel && blade && distance < Math.max(1e3, blade.definition.sim.rangeM + closingForBlade * (p.reactionS + blade.definition.sim.switchS + blade.definition.sim.windupS + 1))) {
            const control = b.drones.filter(d => d.owner === u.id && d.phase !== "return");
            if (control.length) {
                for (const d of control) {
                    d.phase = "return";
                    d.aim = null;
                }
                b.emit("funnel-withdraw", u.id, u.machine.name + " 近战接触将早于下一次远程收益，停止控制并自动回收", {
                    target: target.id,
                    count: control.length
                });
            }
            bladePreparation={blade,reason:"近战威胁优先"};
        }
        const bladeAdvantage = blade && target.weapons.some(w => w.definition.kind === "melee") && u.machine.sim.thrustN * (u.machine.bladeOutput || 1) > target.machine.sim.thrustN * (target.machine.bladeOutput || 1) * 1.3;
        const turnS=Math.acos(clamp(dot(u.forward,toward),-1,1))/(Math.max(1,m.turnRateDeg)*Math.PI/180),closingBudget=distance/Math.max(150,m.maxSpeedMps*.65)+turnS;
        const trade=bladeTrade(b,u,target,closingForBlade),exchange=b.exchangeState(u,target.id);
        const rangeFailed=exchange.rangedLoss-exchange.rangedGain+exchange.rangedMisses*.025>c.exchangeDisadvantage;
        const knifeReason=!trade.ranged||rangeFailed||bladeAdvantage&&target.jettisoned&&!trade.unsafe;
        const resetRemote=trade.ranged&&trade.unsafe;
        const committed=u.meleeIntent?.targetId===target.id;
        const interceptCourse=blade&&meleeInterceptCourse(b,u,{position:add(u.position,delta),velocity:seen?.velocity||target.velocity},blade.definition.sim.rangeM);
        const chaseFeasible=!!interceptCourse?.feasible;
        const duelPreferred=bladeReachable&&chaseFeasible&&knifeReason&&!resetRemote&&u.components.engine>.15&&u.energy>blade.definition.sim.energyCost+m.energyCapacity*.12&&(distance<4500||committed&&closingBudget<c.maxRushSeconds)&&!screenHelp;
        u.meleeIntent=duelPreferred?{targetId:target.id,reason:u.jettisoned?'ranged-exhausted':'blade-output-window'}:null;
        const recovery = u.stability < .16 || b.t < (u.meleeBreakUntil || 0), funnelBusy = b.drones.some(d => d.owner === u.id && d.phase !== "return");
        if (b.t < (u.openingUntil || 0) && bladeReachable && target.stability < .2) {
            order = "melee";
            heading = toward;
            desired = meleeVelocity(u, seen || target, delta, blade.definition.sim.rangeM, target,b);
            if(distance>blade.definition.sim.rangeM*1.5)heading=norm(desired);
            bladePreparation={blade,reason:"抓住破稳窗口"};
        } else if (b.t < (u.separationUntil || 0)) {
            order = "extend";
            heading = length(u.velocity) > 20 ? norm(u.velocity) : u.forward;
            desired = mul(heading, m.maxSpeedMps);
        } else if (recovery) {
            order = "recover";
            // A blade engagement needs one completed turn and recovery, not
            // alternating half turns and straight-line retreats.
            heading = duelPreferred?toward:[...u.forward];
            desired = duelPreferred?mul(u.velocity,.65):[...u.velocity];
            u.flightMode = duelPreferred?"normal":"coast";
        } else if (u.energy < m.energyCapacity * .22) {
            order = "cool";
            desired = [ ...u.velocity ];
            heading = u.forward;
            u.flightMode = "coast";
        } else if (duelPreferred || chaseFeasible && !resetRemote && !ownFunnel && bladeReachable && distance < blade.definition.sim.rangeM+Math.max(0,closingForBlade)*(p.reactionS+blade.definition.sim.switchS+blade.definition.sim.windupS+c.meleeReserveS+.25)+80) {
            order = "melee";
            heading = toward;
            const intercept = add(delta, mul(seen?.velocity || [ 0, 0, 0 ], clamp(distance / m.maxSpeedMps, 0, .7) * .4));
            const relative = sub(u.velocity, seen?.velocity || target.velocity), lateral = sub(relative, mul(toward, dot(relative, toward)));
            desired = meleeVelocity(u, seen || target, delta, blade.definition.sim.rangeM, target,b);
            if(distance>blade.definition.sim.rangeM*1.5)heading=norm(desired);
            if (!funnelBusy) bladePreparation={blade,reason:"近战截击"};
        } else if (ownFunnel && (distance > 1e3 || resetRemote)) {
            order = "funnel-control";
            heading = toward;
            desired = funnelVelocity(u, seen || target, delta, ownFunnel.definition, funnelBusy);
            if (!funnelBusy) b.selectWeapon(u, ownFunnel, "远程优势");
        } else if (ownFunnel && bladeReachable && distance <= 1e3 && !funnelBusy) {
            order = "melee";
            heading = toward;
            const relative = sub(u.velocity, seen?.velocity || target.velocity), lateral = sub(relative, mul(toward, dot(relative, toward)));
            desired = meleeVelocity(u, seen || target, delta, blade.definition.sim.rangeM, target,b);
            if(distance>blade.definition.sim.rangeM*1.5)heading=norm(desired);
            bladePreparation={blade,reason:"浮游回收后切刀"};
        } else if (u.controller === "objective" && target.entityType === "ship") {
            // Use a waypoint outside observed interceptors' firing reach when viable, never a fixed lap.
            const interceptors = (b.enemies(u) || []).filter(e => e.entityType === "ms"), near = interceptors.find(e => {
                const contact=u.contacts.get(e.id);if(!contact)return false;
                const reach=Math.max(1000,...e.weapons.filter(w=>!w.disabled&&w.ammo!==0&&w.definition.kind!=="melee").map(w=>w.definition.sim.rangeM));
                return length(sub(contact.position,u.position))<reach*1.2;
            });
            if (near) {
                const covered = alliesCover(b, u, near);
                heading = norm(add(toward, mul(side, u.orbit * (covered ? .25 : .9))));
                desired = mul(heading, m.maxSpeedMps);
                order = "bypass";
            }
        } else if (u.controller === "screen") {
            order = "screen";
            heading = toward;
            desired = add(mul(toward, clamp((distance - 2400) * .4, -350, m.maxSpeedMps * .9)), mul(side, u.orbit * m.maxSpeedMps * .2));
        }
        if (u.suppressing) {
            order = "suppress";
            heading = toward;
        }
        if (bladeReachable && distance < blade.definition.sim.rangeM + 500) {
            const closing = -dot(sub(seen?.velocity || target.velocity, u.velocity), toward), contact = (distance - blade.definition.sim.rangeM) / Math.max(1, closing);
            if (contact < blade.definition.sim.switchS + p.reactionS + blade.definition.sim.windupS + .25 && !funnelBusy) bladePreparation={blade,reason:"交会提前拔刀"};
        }
    }
    const decisionRandom=b.random;let choice;
    try{b.random=b.randomFor(u.id,"policy");choice=choosePilotStrategy(b,u,target,{order,heading,desired});}finally{b.random=decisionRandom;}
    if(choice){({order,heading,desired}=choice);u.flightMode=choice.flightMode||'normal';}
    if (b.t < u.evadeUntil) u.flightMode = "normal"; else if (!choice?.flightMode&&![ "recover", "cool", "drift" ].includes(order)) u.flightMode = "normal";
    const protect=b.unitById.get(b.mission?.priorities?.[u.side]?.primaryEntityId),captureThreat=captureObjective(b,target);
    if(u.controller==='escort'&&protect?.alive&&captureThreat?.entityId===protect.id&&seen&&b.t>=u.evadeUntil&&distance<8000){const stop=captureThreat.contestedRadiusM*.65,guardDelta=sub(protect.position,u.position),guardDistance=length(guardDelta);if(guardDistance>stop){heading=toward;desired=add(mul(norm(guardDelta),Math.min(m.maxSpeedMps*.85,(guardDistance-stop)*1.2)),mul(protect.velocity,.5));order='bodyguard';u.flightMode='normal';}}
    const directed=commandCourse(b,u,target);
    if(directed){({heading,desired,order}=directed);u.flightMode=directed.flightMode;}
    const transit=!directed&&u.combatant===false&&navigationGoal(b,u);
    if(transit&&b.t>=u.evadeUntil){const route=sub(transit.point,u.position);heading=norm(route);desired=mul(heading,Math.min(m.maxSpeedMps*.65,length(route)*.45));order="missionTransit";u.flightMode="normal";b.cancelAttacks(u);}
    const cover=!directed&&!transit&&bodyguardCourse(b,u);
    if(cover&&b.t>=u.evadeUntil){({heading,desired,order}=cover);u.flightMode='normal';if(b.t>=(u.coverLogAt||0)){u.coverLogAt=b.t+1;b.emit('bodyguard',u.id,u.machine.name+' 依据重炮射线与接触时限主动挡护',{ally:cover.ally,attacker:cover.attacker,point:cover.point,contactIn:cover.horizon});}}
    if(bladePreparation&&['melee','shieldGuard','bladeCover'].includes(order)&&b.t>=u.evadeUntil)b.prepareBlade(u,target,bladePreparation.blade,bladePreparation.reason);
    u.desiredFacing = heading;
    u.desired = desired;
    u.nextDecision = b.t + (distance < 1200 ? .05 : .25);
    b.setOrder(u, order);
    b.serviceMeleeDash(u,target);
}

// Closing speed is chosen from the remaining distance and actual braking authority.
export function meleeVelocity(u, contact, delta, reach, target, b=null) {
    const distance = length(delta), axis = norm(delta), relative = sub(u.velocity, contact.velocity), lateral = sub(relative, mul(axis, dot(relative, axis)));
    const braking = u.machine.sim.thrustN / u.machine.sim.massKg * 10 * u.machine.mobility.brakeMultiplier;
    const close = clamp(Math.sqrt(2 * braking * Math.max(0, distance - reach * .65)), 250, u.machine.sim.maxSpeedMps * .8);
    const intercept=meleeInterceptCourse(b,u,{position:add(u.position,delta),velocity:contact.velocity},reach);
    let desired;
    if(intercept.feasible&&distance>reach*1.5){
      desired=mul(intercept.heading,Math.min(intercept.speed,Math.max(close,length(contact.velocity))));
    } else if((u.pilotState.strategies?.['parallel-fire']??0)>0){
      // Match the observed target velocity before adding closure; otherwise a lateral target is followed at half speed forever.
      const lead=norm(add(delta,mul(lateral,-Math.min(.4,distance/Math.max(250,u.machine.sim.maxSpeedMps))*.35)));
      desired=sub(add(contact.velocity,mul(lead,close)),mul(lateral,.3));
    } else {
      const carry=add(mul(contact.velocity,.45),mul(axis,Math.max(0,dot(contact.velocity,axis))*.55));
      desired=sub(add(carry,mul(axis,close)),mul(lateral,.8));
    }
    // A blade pass should cross its reach without steering both hulls into the
    // same center. Choose a tangent on the current passing side; acceleration
    // limits still decide whether this late correction can physically succeed.
    if(target&&target.entityType!=='ship'){
      const clearance=u.machine.sim.radiusM+target.machine.sim.radiusM+8;
      const available=u.machine.sim.thrustN/u.machine.sim.massKg*10*u.machine.mobility.accel.lateral;
      const collisionIn=(distance-clearance)/Math.max(1,dot(relative,axis));
      if(clearance<reach*.25&&distance>reach*1.5&&collisionIn>u.pilotState.sim.reactionS+Math.sqrt(2*clearance/Math.max(1,available))){
        const relativeDesired=sub(desired,contact.velocity),closure=dot(relativeDesired,axis);
        const transverse=sub(relativeDesired,mul(axis,closure));
        const passAxis=length(lateral)>5?norm(lateral):mul(bodyBasis(axis).right,u.orbit||1);
        const required=Math.max(0,closure)*clearance/Math.sqrt(Math.max(1,distance*distance-clearance*clearance));
        const present=dot(transverse,passAxis);
        if(present<required)desired=add(desired,mul(passAxis,required-present));
      }
    }
    return desired;
}

function alliesCover(b, u, interceptor) {
    return (b.spatial.sides[u.side] || []).some(a => a !== u && a.controller === "screen" && a.alive && a.targetId === interceptor.id && a.structure / a.machine.sim.structure > .3);
}

// Compare the silhouette that can actually be reached before observed charge completes.
export function chooseShipEvasion(b, u, incoming) {
    const axes = (u.machine.renderProfile?.dimensions || [ u.machine.sim.radiusM * 2, u.machine.sim.radiusM * 2, u.machine.sim.radiusM * 2 ]).map(x => x / 2), rate = u.machine.sim.turnRateDeg * Math.PI / 180;
    const threats = incoming.map(e => ({
        direction: norm(sub(e.position, u.position)),
        remaining: Math.max(.05, ...e.weapons.filter(w => w.attack?.targetId === u.id).map(w => w.attack.at - b.t + length(sub(e.position, u.position)) / Math.max(1, w.definition.sim.projectileSpeedMps)))
    }));
    const time = Math.min(8, ...threats.map(x => x.remaining)), turn = rate * time, candidates = [];
    for (const want of [ u.forward, ...threats.flatMap(t => [ t.direction, mul(t.direction, -1) ]) ]) {
        const forward = rotateToward(u.forward, want, turn), basis = bodyBasis(forward);
        for (const wantRoll of [ u.roll, 0, Math.PI / 2, -Math.PI / 2 ]) {
            const roll = u.roll + clamp(wantRoll - u.roll, -turn, turn), up = add(mul(basis.up, Math.cos(roll)), mul(basis.right, Math.sin(roll))), right = add(mul(basis.right, Math.cos(roll)), mul(basis.up, -Math.sin(roll)));
            const area = threats.reduce((sum, t) => sum + Math.PI * axes[0] * axes[1] * axes[2] * Math.sqrt((dot(t.direction, forward) / axes[0]) ** 2 + (dot(t.direction, up) / axes[1]) ** 2 + (dot(t.direction, right) / axes[2]) ** 2), 0);
            const cost = area * (1 + .04 * Math.abs(roll - u.roll) + .08 * Math.acos(clamp(dot(forward, u.forward), -1, 1)));
            candidates.push({
                forward: forward,
                roll: roll,
                area: area,
                cost: cost
            });
        }
    }
    return candidates.sort((a, z) => a.cost - z.cost)[0];
}
