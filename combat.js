import {weaponVisual} from './weapon-semantics.js';
import {estimateMeleeClash,meleeContest,meleeEngagementWindow,readMeleeRisk} from './melee-exchange.js';
import {captureFireHeld} from './capture-coordination.js';
import { add, sub, mul, dot, length, norm, clamp, bodyBasis, rotateToward, segmentSphere, arcSolution, bodyVector, interceptPoint } from "./math.js";

import {remotePermission,remoteDelay,remoteQuota,concurrentRemoteControl} from "./seed-systems.js";
import {globalPoint} from "./collision.js";
import { detachWeapons, localPoint } from "./entities.js";

export function launchDrones(b, u, target, state) {
    const w = state.definition, s = w.sim;
    if(b.t<(u.microControlUntil||0)||captureFireHeld(b,u,target)||state.formDisabled||!remotePermission(b,u,w))return false;
    const delta = sub(target.position, u.position), closing = Math.max(0, dot(sub(u.velocity, target.velocity), norm(delta))), contactTime = (length(delta) - 150) / Math.max(1, closing);
    if (state.ammo===0||contactTime < length(delta) / s.droneSpeedMps + .7) return false;
    if (state.disabled || state.readyAt > b.t || u.stability < .18 || u.energy < s.energyCost || !u.visible || length(sub(target.position, u.position)) > s.rangeM || b.drones.some(d => d.owner === u.id)) return false;
    const battery=s.droneEnergyCapacity??12,shotCost=s.droneShotCost??s.energyCost;
    const charged=(state.droneBatteries||[]).map((energy,index)=>({energy,index})).filter(x=>x.energy>=shotCost+1&&!state.droneLost?.[x.index]);
    const count = Math.min(s.droneCount,w.remoteControl?remoteQuota(b,u):24,w.remoteControl?.channels??24, charged.length, Math.floor(u.energy / Math.max(.01, s.energyCost)),Math.max(0,192-b.drones.length));
    const contacts = (b.enemies(u) || []).filter(x => x.entityType !== "ship" && u.contacts.has(x.id) && length(sub(x.position, target.position)) < 1e3 && dot(x.forward, norm(sub(u.position, x.position))) > .6).sort((a, c) => a.id.localeCompare(c.id));
    if (!count) return false;
    b.spend(u, count * s.energyCost);
    state.deployed=true;
    state.readyAt = b.t + s.cooldownS;
    u.slotReadyAt[w.slot] = b.t + .4;
    const basis = bodyBasis(u.forward);
    for (let i = 0; i < count; i++) {
        b.drones.push({
            targetable:!!w.remoteControl,
            id: "f-" + u.id + "-" + ++b.sequence,
            owner: u.id,
            side: u.side,
            weaponId: w.id,
            target: (contacts[i % Math.max(1, contacts.length)] || target).id,
            position: add(u.position, add(mul(basis.right, (i % 2 ? 1 : -1) * (25 + i * 3)), mul(basis.up, (i % 3 - 1) * 30))),
            velocity: add(u.velocity, mul(u.forward, 150)),
            forward: [ ...u.forward ],
            phase: "outbound",
            energy: Math.min(battery,charged[i].energy),
            batteryIndex: charged[i].index,
            shots: 0,
            nextAt: 0,
            started: b.t,
            lane: i
        });
    }
    for(const x of charged.slice(0,count))state.droneBatteries[x.index]=0;
    b.emit("funnel-launch", u.id, u.machine.name + " 释放 " + count + (w.remoteControl?" 枚远程终端，独立机动进入远程攻击轴线":" 枚浮游炮，独立机动进入远程攻击轴线"), {
        target: target.id,
        count: count,
        weapon: w.id
    });
    return true;
}

function fireDrone(b, d, owner, target, state) {
    if (b.t<(owner.microControlUntil||0)&&!concurrentRemoteControl(owner,state.definition)||captureFireHeld(b,owner,target)) { d.aim=null; return; }
    if (b.projectiles.length >= 192) return;
    const s = state.definition.sim, solution = d.aim,kind=state.definition.remoteControl?.projectileKind||"beam";
    if(state.ammo===0){d.phase="return";d.aim=null;return;}
    if(kind==="ballistic"&&state.ammo>0)state.ammo--;
    d.aim = null;
    const cost=s.droneShotCost??s.energyCost;
    if(d.energy<cost){d.phase="return";return;}
    d.energy-=cost;d.shots++;
    d.nextAt = b.t + (s.droneFireIntervalS??1.1);
    const aim=solution.position;
    const direction = norm(sub(aim, d.position)), origin = [ ...d.position ];
    // The shot draws from the drone battery; recharge already consumed carrier energy.
    state.shots++;
    owner.shots++;
    owner.lastFiredAt = b.t;
    b.projectiles.push({
        id: ++b.sequence,
        owner: owner.id,
        target: target.id,
        weaponId: state.definition.id,
        kind,
        position: origin,
        previous: origin,
        velocity: mul(direction, s.projectileSpeedMps),
        age: 0,
        traveled: 0,
        weapon: s,
        guiding: false,
        order: "funnel-control",
        trace: [ origin ],
        funnel: true
    });
    b.effects.push({
        type: kind==="beam"?"beam":"tracer",
        beamRifle: false,
        vulcan: weaponVisual(state.definition,kind)==='vulcan',
        visualProfile:weaponVisual(state.definition,kind),
        projectileSpeedMps:s.projectileSpeedMps,
        beamClass:s.beamClass,
        from: origin,
        to: add(origin, mul(direction, Math.min(length(sub(solution.position, origin)) + 100, s.droneAttackRangeM))),
        actor: owner.id,
        t: b.t,
        life: .55
    });
    b.emit("shot", owner.id, owner.machine.name + (state.definition.remoteControl?" "+state.definition.name+" 发射":" 浮游炮发射"), {
        weapon: state.definition.id,
        kind,
        target: target.id,
        remote: true,
        origin: origin,
        drone: d.id,
        droneEnergy: d.energy
    });
    b.notice(owner,state.definition.name,'info','fire-'+(state.definition.slot||'slot1'),.55);
    const weaponNotice=b.effects.at(-1);if(weaponNotice?.type==='notice'&&weaponNotice.actor===owner.id)weaponNotice.weaponNotice=true;
    {const shot=b.projectiles.at(-1),relative=sub(shot.velocity,target.velocity),delta=sub(target.position,origin),tti=Math.max(0,dot(delta,relative)/Math.max(1,dot(relative,relative)));
      b.warn(target,owner,{...state.definition,kind},'launch',direction,{id:shot.id,cueDroneId:d.id,direct:true,position:origin,velocity:shot.velocity,tti,clearance:length(sub(delta,mul(relative,tti)))});
    }
    d.phase=d.energy<cost+.2?"return":"reposition";
}

export function updateDrones(b, dt) {
    // Recharge is paid once from the parent's finite reserve, only after docking.
    for(const u of b.units.filter(x=>x.alive))for(const state of u.weapons.filter(w=>w.definition.kind==="funnel"&&!w.disabled)){
        const s=state.definition.sim;
        if(b.drones.some(d=>d.owner===u.id&&d.weaponId===state.definition.id))continue;
        if(state.deployed){state.deployed=false;state.readyAt=Math.max(state.readyAt,b.t+s.cooldownS);}
        state.droneBatteries??=Array(s.droneCount).fill(0);
        for(let i=0;i<s.droneCount;i++){
            if(state.droneLost?.[i])continue;
            const gain=Math.min((s.droneRechargePerS??4)*dt,(s.droneEnergyCapacity??12)-state.droneBatteries[i],Math.max(0,u.energy-u.machine.sim.energyCapacity*u.pilotState.tactics.energyReserveFraction));
            if(gain>0){b.spend(u,gain);state.droneBatteries[i]+=gain;}
        }
    }
    for (const d of b.drones) {
        if(d.dead)continue;
        const owner = b.unitById.get(d.owner), state = owner?.weapons.find(w => w.definition.id === d.weaponId);
        if (!owner || !state) {
            d.dead = true;
            continue;
        }
        const s = state.definition.sim;
        if(!remotePermission(b,owner,state.definition)||state.formDisabled)d.phase="return";
        const wire=state.definition.remoteControl?.wireLengthM;
        if(wire&&length(sub(d.position,owner.position))>wire)d.phase="return";
        if (!owner.alive) {
            d.phase = "return";
            d.dead = true;
            continue;
        }
        let target = b.unitById.get(d.target);
        if (!target?.alive || target.docked) {
            const alternatives = (b.enemies(owner) || []).filter(x => x.entityType !== "ship").sort((a, c) => length(sub(a.position, d.position)) - length(sub(c.position, d.position)));
            target = alternatives.sort((a, c) => Number(c.targetId === owner.id) - Number(a.targetId === owner.id) || length(sub(a.position, d.position)) - length(sub(c.position, d.position)))[0];
            if (target) {
                d.target = target.id;
                d.aim = null;
            } else d.phase = "return";
        }
        if(d.phase!=="return")d.energy=Math.max(0,d.energy-(s.droneFlightCostPerS??.12)*dt);
        if (b.t - d.started > (s.droneSortieSeconds??40)||d.energy<(s.droneShotCost??s.energyCost)) {d.phase = "return";d.aim=null;}
        if (d.phase === "return") {
            const delta = sub(owner.position, d.position);
            const desired = mul(norm(delta), s.returnSpeedMps);
            d.velocity = add(d.velocity, mul(sub(desired, d.velocity), Math.min(1, dt * 5)));
            if (length(delta) < 70) {d.dead = true;state.droneBatteries[d.batteryIndex]=d.energy;}
        } else if (target) {
            const delta = sub(target.position, d.position), distance = length(delta);
                        const remoteMode=state.definition.remoteControl?.attackMode;
            const ram=remoteMode==='ram'||remoteMode==='hybrid'&&distance<250;
            if(ram&&d.phase!=='return'&&b.t>=d.nextAt){
                if(distance<1600&&b.canSee(d.position,target.position)){
                    if(!d.aim||b.t>d.aim.at+.3){const tti=Math.max(.1,distance/Math.max(1,s.droneSpeedMps));d.aim={at:b.t+tti,position:[...target.position]};b.warn(target,owner,{...state.definition,kind:'funnel'},'windup',norm(sub(target.position,d.position)),{cueDroneId:d.id,position:[...d.position],tti});}
                }
                const lead=Math.min(.7,distance/Math.max(1,s.droneSpeedMps)),point=d.strikePoint||add(target.position,mul(target.velocity,lead)),desired=mul(norm(sub(point,d.position)),s.droneSpeedMps),force=sub(desired,d.velocity);
                d.velocity=add(d.velocity,mul(force,Math.min(1,s.droneAcceleration*dt/Math.max(1,length(force)))));
                if(!d.strikePoint&&distance<600)d.strikePoint=add(target.position,mul(target.velocity,Math.min(.35,distance/Math.max(1,s.droneSpeedMps))));
                const next=add(d.position,mul(d.velocity,dt)),contact=segmentSphere(sub(d.position,target.position),sub(next,target.position),target.machine.sim.radiusM+3);
                if(contact&&target.alive&&b.t>=d.nextAt&&d.energy>=(s.droneShotCost??s.energyCost)&&b.canSee(d.position,target.position)){
                    d.energy-=s.droneShotCost??s.energyCost;d.shots++;d.nextAt=b.t+(s.droneFireIntervalS??1.1);state.shots++;owner.shots++;
                    const toward=norm(sub(target.position,d.position));
                    b.damage(target,{owner:owner.id,target:target.id,weaponId:state.definition.id,kind:'melee',weapon:{...s,damage:s.damage*.65},velocity:mul(toward,s.droneSpeedMps),order:'funnel-control'});
                    b.emit('shot',owner.id,owner.machine.name+' '+state.definition.name+' 刺击',{weapon:state.definition.id,kind:'melee',target:target.id,remote:true});
                    d.aim=null;d.strikePoint=null;d.phase='reposition';d.position=add(target.position,mul(toward,target.machine.sim.radiusM+80));d.velocity=mul(toward,s.droneSpeedMps*.6);
                }
                d.position=add(d.position,mul(d.velocity,dt));d.forward=norm(d.velocity);if(d.strikePoint&&dot(sub(d.strikePoint,d.position),d.velocity)<0){d.strikePoint=null;d.nextAt=Math.max(d.nextAt,b.t+.45);d.phase='reposition';d.aim=null;}continue;
            }
            if(owner.remoteGuardUntil>b.t&&owner.remoteGuardWeaponId===state.definition.id&&owner.remoteGuardTerminalIds?.has(d.id)){const guardBasis=bodyBasis(owner.forward),angle=d.lane/Math.max(1,s.droneCount)*Math.PI*2,point=add(owner.position,add(mul(guardBasis.right,Math.cos(angle)*180),mul(guardBasis.up,Math.sin(angle)*180))),desired=add(owner.velocity,mul(norm(sub(point,d.position)),Math.min(s.droneSpeedMps,length(sub(point,d.position))*8))),force=sub(desired,d.velocity);d.velocity=add(d.velocity,mul(force,Math.min(1,s.droneAcceleration*dt/Math.max(1,length(force)))));d.position=add(d.position,mul(d.velocity,dt));d.energy=Math.max(0,d.energy-3*dt);d.aim=null;d.phase='barrier';continue;}
            const basis = bodyBasis(norm(sub(target.position, owner.position))), phase = d.lane / Math.max(1, s.droneCount) * Math.PI * 2+d.shots*.9;
            let attackPoint = add(target.position, add(mul(basis.right, Math.cos(phase) * s.droneAttackRangeM * .65), add(mul(basis.up, Math.sin(phase) * s.droneAttackRangeM * .65), mul(basis.forward, (d.lane % 3 - 1) * s.droneAttackRangeM * .35))));
            if(wire&&length(sub(attackPoint,owner.position))>wire)attackPoint=add(owner.position,mul(norm(sub(attackPoint,owner.position)),wire*.9));
            let desired = mul(norm(sub(attackPoint, d.position)), s.droneSpeedMps);
            if (length(sub(attackPoint, d.position)) < 180) desired = target.velocity;
            const force = sub(desired, d.velocity), a = length(force);
            d.velocity = add(d.velocity, mul(force, Math.min(1, s.droneAcceleration * dt / Math.max(1, a))));
            const assisted=state.definition.remoteControl?.assisted,concurrentControl=concurrentRemoteControl(owner,state.definition),defending=!concurrentControl&&(owner.order==="missileBreak"||owner.pendingReaction&&owner.pendingReaction.priority>1);
            if (owner.stability < (assisted?.1:.22) || !concurrentControl&&b.t < owner.evadeUntil || defending) {
                d.aim = null;
                d.phase = "outbound";
            }
            if (remoteMode!=='ram' && distance < s.droneAttackRangeM && length(sub(attackPoint, d.position)) < 400 && owner.stability >= (assisted?.1:.22) && !defending && (concurrentControl||b.t >= owner.evadeUntil) && b.canSee(d.position, target.position) && b.t >= d.nextAt && d.energy >= (s.droneShotCost??s.energyCost)) {
                if (!d.aim) {
                    const delay=remoteDelay(owner,state.definition),leadTime = delay + distance / s.projectileSpeedMps;
                    const estimate = add(add(target.position, mul(target.velocity, leadTime)), mul(target.acceleration || [ 0, 0, 0 ], .5 * leadTime * leadTime * owner.pilotState.sim.tracking));
                    d.aim = {
                        at: b.t + delay + d.lane % 3 * .05,
                        position: estimate
                    };
                    d.phase = "aim";
                    const decoys = b.objects.filter(o => o.side !== d.side && o.signature > .5 && dot(norm(sub(o.position, d.position)), norm(delta)) > .95 && length(sub(o.position, target.position)) < 1200);
                    if (decoys.length && b.randomFor(owner.id, "contact")() < clamp(decoys[0].signature * (1 - owner.pilotState.sim.tracking + .25), 0, .7)) {
                        d.aim.decoy = true;
                        d.aim.objectId=decoys[0].id;
                        b.effects.push({type:"decoy-track",t:b.t,life:.7,actor:owner.id,drone:d.id,from:[...d.position],to:[...decoys[0].position],object:decoys[0].id});
                        d.aim.position = add(decoys[0].position, mul(decoys[0].velocity, leadTime));
                        b.emit("decoy-lock", owner.id, "浮游炮将卸装物误判为短时攻击接触", {
                            object: decoys[0].id,
                            position: [...decoys[0].position]
                        });
                    }
                    // Slow real projectiles are warned at emission. Visible beam preparation is a distinct cue.
                    if(!d.aim.decoy&&(state.definition.remoteControl?.projectileKind||'beam')==='beam')b.warn(target, owner, {
                        ...state.definition,
                        kind: state.definition.remoteControl?.projectileKind||"beam",
                        sim: {
                            ...s,
                            windupS: delay
                        }
                    }, "windup", norm(delta), {
                        cueDroneId:d.id,
                        tti: d.aim.at-b.t+distance/s.projectileSpeedMps,
                        position: d.position,
                        velocity: mul(norm(delta), s.projectileSpeedMps)
                    });
                } else {
                    if (!d.aim.decoy && d.aim.at - b.t > .32) {
                        const lead = d.aim.at - b.t + distance / s.projectileSpeedMps;
                        d.aim.position = add(add(target.position, mul(target.velocity, lead)), mul(target.acceleration || [ 0, 0, 0 ], .5 * lead * lead * owner.pilotState.sim.tracking));
                    }
                    if (d.aim.at <= b.t) fireDrone(b, d, owner, target, state);
                }
            }
        }
        d.position = add(d.position, mul(d.velocity, dt));
        d.forward = length(d.velocity) > 1 ? norm(d.velocity) : d.forward;
    }
    b.drones = b.drones.filter(d => !d.dead);
    for (const u of b.units) {
        const state = u.weapons.find(w => w.definition.kind === "funnel");
        if (state && !b.drones.some(d => d.owner === u.id) && state.readyAt < b.t) state.readyAt = b.t;
    }
}

export function prepareMaximumOutput(b, u, state) {
    if (!u.pilotState.traits.maximumOutput || state.definition.kind !== "melee" || u.energy < u.pilotState.tactics.maxOutputCost) return;
    const target = b.unitById.get(u.targetId);
    if (!target) return;
    const distance = length(sub(target.position, u.position)), closing = Math.max(0, dot(sub(u.velocity, target.velocity), norm(sub(target.position, u.position))));
    if (distance > state.definition.sim.rangeM + closing * .4) return;
    b.spend(u, u.pilotState.tactics.maxOutputCost);
    u.bladeBoostUntil = b.t + .3;
    u.powerCutUntil = b.t + .15;
    b.emit("power-transfer", u.id, u.machine.name + " 收推进出力，惯性接近并将功率分配给刀刃", {
        weapon: state.definition.id,
        until: u.bladeBoostUntil
    });
}

export function estimateClash(u,target,closing,time,anticipated=false){return estimateMeleeClash(u,target,closing,time,anticipated);}

export function predictCounterThrust(b, u, target) {
    if (!u.pilotState.traits.counterThrust || !u.machine.tags.includes("multi-axis-thrusters") || b.t < u.counterReadyAt || u.energy < u.pilotState.tactics.counterThrustCost) return;
    const delta = sub(target.position, u.position), closing = Math.max(0, dot(sub(u.velocity, target.velocity), norm(delta))), p = u.pilotState.sim, attack = target.weapons.find(w => w.definition.kind === "melee")?.attack, time = attack ? Math.max(0, attack.at - b.t) : Math.max(0, (length(delta) - 100) / Math.max(50, closing));
    if (time > u.pilotState.tactics.counterThrustLeadS + p.reactionS) return;
    // The estimate must come from an imminent observed blade contact, not a future scripted clash.
        const incomingBlade = target.weapons.find(w => w.definition.kind === "melee" && !w.disabled);
    const contact=u.contacts.get(target.id);
    if (!incomingBlade || !u.visible || !contact || b.t-contact.observedAt>.8 || u.stability > readMeleeRisk(b,u,target,closing).loss + .15 || u.stability < .12 || !(contact.bladeDrawn||contact.threatTargetIds?.includes(u.id))) return;
    if (u.counterPlan && u.counterPlan.until > b.t) return;
    const reactAt = b.t + p.reactionS;
    if (time < p.reactionS) return;
    u.counterPlan = {
        at: reactAt,
        until: b.t + time + .3,
        direction: norm(delta),
        targetId: target.id
    };
    u.counterReadyAt = b.t + 1;
    b.emit("counter-preparation", u.id, u.machine.name + " 判断下一次接触有破稳风险，准备前向反推抵消冲击", {
        contactIn: time,
        reactionS: p.reactionS
    });
}

// A successful contact can invite another cut, but never clears weapon cooldown,
// restores stability, or grants immunity. Pressure is bounded to a short exchange.
export function considerMeleeFollowup(b,u,target,weapon,{closing=0,lateral=0}={}){
 const seen=u.contacts.get(target.id),cost=weapon.sim.powerSource==='ammo'||weapon.sim.powerSource==='none'?0:weapon.sim.energyCost;
 if(!u.alive||!target.alive||!seen||b.t-seen.observedAt>.8||u.withdrawing||u.controller==='simple'||u.stability<.26||b.t<(u.meleeBreakUntil||0)||u.energy<cost+Math.max(u.machine.sim.dodgeEnergyCost??5,u.machine.sim.energyCapacity*.12)||closing>650||lateral>220)return false;
 if(u.commandAssignment?.source==='player'&&['withdraw','move','hold'].includes(u.commandAssignment.type))return false;
 const chain=b.t-(u.bladeFollowUp?.createdAt??-100)<2.5?(u.bladeFollowUp.count||0):0;if(chain>=3)return false;
 const ability=Math.min(1,u.pilotState.sim.melee??u.pilotState.sim.maneuver),chance=clamp((.24+.3*ability+(u.pilotState.traits.returnSlash?.16:0)+(u.pilotState.tags?.includes('blade-specialist')?.12:0))*(u.controller==='survive'?.45:1)*(1-chain*.22)*(1-(u.meleeStrain||0)*.6),.05,.85);
 if(b.randomFor(u.id,'blade-follow')()>chance)return false;
 const state=u.weapons.find(w=>w.definition.id===weapon.id),until=b.t+Math.max(1.2,Math.min(3,(state?.readyAt??b.t)-b.t+weapon.sim.windupS+u.pilotState.sim.reactionS+.8));
 u.bladeFollowUp={targetId:target.id,createdAt:b.t,until,count:chain+1};u.separationUntil=0;u.nextDecision=b.t;
 b.emit('melee-follow-up',u.id,u.machine.name+' 保持近战压力，准备追斩',{target:target.id,weapon:weapon.id,until,count:chain+1});return true;
}
export function resolveBladeV5(b,u,target,w,contactDelta,window){
    window=window||meleeEngagementWindow(b,u,target,w);
    if(!window)return;
    const delta=window.delta,n=norm(delta),relative=sub(u.velocity,target.velocity),closing=window.closing;
    const counter = target.swing?target.weapons.find(x=>x.definition.id===target.swing.weaponId&&!x.disabled):b.bestBlade(target,u);
    const guardSlot=counter?.definition.slot||'slot1';
    // Having a sword in the loadout is not equivalent to having it drawn.
    // A prepared stroke can block; a reactive guard must complete the actual
    // slot switch and blade-raising time first, with enough energy to parry.
    const drawn=counter&&target.slotSelected[guardSlot]===counter.definition.id&&b.t>=(target.slotReadyAt[guardSlot]||0)&&b.available(target,counter);
    const guardIntent=target.swing||target.guardUntil>b.t&&b.t>=(target.guardReadyAt||0);
    const guarding = drawn && !b.drones.some(d => d.owner === target.id && d.phase !== "return") && guardIntent && target.stability > .12 && b.t >= (target.meleeBreakUntil || 0) && arcSolution(target.forward, mul(n, -1), counter.definition.sim).inside;
    const contest=meleeContest(b,u,target,w,window,guarding,counter?.definition),random=b.randomFor([u.id,target.id].sort().join('|'),'melee'),hitRoll=random(),guardRoll=random(),moduleEvasion=b.t<(target.moduleSeparatedUntil||0);
    const hitChance=contest.hitChance*(moduleEvasion?.4:1);
    const report=(outcome,extra={})=>{u.meleeExchangePartner=target.id;target.meleeExchangePartner=u.id;u.meleeExchangeAt=target.meleeExchangeAt=b.t;return b.emit('melee-exchange',u.id,u.machine.name+' 与 '+target.machine.name+'：'+outcome,{target:target.id,weapon:w.id,hitChance,guardChance:contest.guardChance,hitRoll,guardRoll,attackScore:contest.attackScore,defenseScore:contest.defenseScore,damageFactor:contest.damageFactor,momentum:closing*(u.machine.sim.massKg*target.machine.sim.massKg/(u.machine.sim.massKg+target.machine.sim.massKg)),outcome,...extra});};
    // A real prepared guard contests the stroke first. An evasive move can still
    // evade an unguarded strike without requiring the rendered blade to miss a mesh.
    if(!guarding||guardRoll>contest.guardChance){
        u.swing=null;u.meleeContactUntil=b.t+.12;
        if(hitRoll>hitChance){report(moduleEvasion?'分体规避':'闪身避斩');b.emit(moduleEvasion?'blade-gap':'blade-miss',u.id,u.machine.name+' 近战攻势被规避',{target:target.id,weapon:w.id,hitChance,hitRoll});b.recordExchange(u,target.id,'melee','miss');return;}
        const graze=hitRoll>hitChance*.78,factor=contest.damageFactor*(graze?.4:1)*(moduleEvasion?.55:1);
        report(graze?'擦斩命中':guarding?'破开格挡命中':'斩击命中',{damageFactor:factor});
        b.damage(target,{owner:u.id,weaponId:w.id,weapon:{...w.sim,damage:w.sim.damage*factor*(u.bladeBoostUntil>b.t?1.8:1)},velocity:mul(n,Math.max(1,closing)),kind:'melee',order:'melee'});
        considerMeleeFollowup(b,u,target,w,window);
        return;
    }
    const yielding=target.guardMode==='deflect'&&target.guardUntil>b.t&&!target.swing;
    if (!yielding&&!(target.bladeBoostUntil > b.t)) prepareMaximumOutput(b, target, counter);
    const estimate = estimateMeleeClash(u,target,closing,b.t,false,w,counter.definition), {ma: ma, mb: mb, momentum: momentum, pa: pa, pb: pb} = estimate;
    const contestNoise=.86+random()*.28;let la=estimate.lossA*contestNoise,lb=estimate.lossB/contestNoise;
    if(yielding){la*=.3;lb*=.55;}
    const negate = (x, loss, incoming) => {
        const plan = x.counterPlan;
        if (!plan || plan.at > b.t || plan.until < b.t || plan.targetId !== (x === u ? target.id : u.id) || dot(plan.direction, incoming) < .8) return loss;
        const cost = x.pilotState.tactics.counterThrustCost;
        if (x.energy < cost) return loss;
        b.spend(x, cost);
        const availableImpulse = x.machine.sim.thrustN * x.components.engine * x.machine.mobility.accel.reverse * .35 * 10;
        const requiredImpulse = loss * x.machine.sim.massKg * 35, ratio = clamp(availableImpulse / Math.max(1, requiredImpulse));
        x.counterPlan = null;
        x.velocity = add(x.velocity, mul(incoming, -availableImpulse / x.machine.sim.massKg));
        b.effects.push({
            type: "dodge-jet",
            t: b.t,
            life: .8,
            counterThrust: true,
            localDirection: bodyVector(incoming, x.forward),
            position: [ ...x.position ],
            direction: incoming,
            actor: x.id
        });
        b.emit("counter-thrust", x.id, x.machine.name + " 向前喷射反推抵消拼刀冲量", {
            cancelFraction: ratio,
            availableImpulse: availableImpulse,
            requiredImpulse: requiredImpulse
        });
        return loss * (1 - ratio);
    };
    la = negate(u, la, n);
    lb = negate(target, lb, mul(n, -1));
    const beforeA = u.stability, beforeB = target.stability;
    // Numerical clash pressure can overwhelm the remaining guard. Excess impulse
    // carries a portion of the cutting force through; a parry is not invulnerability.
    const breachA=clamp((la-beforeA)/Math.max(.01,la)),breachB=clamp((lb-beforeB)/Math.max(.01,lb));
    u.stability = clamp(beforeA - la);
    target.stability = clamp(beforeB - lb);
    if (!target.swing) b.spend(target, counter.definition.sim.energyCost);
    target.swing = null;
    u.swing = null;
    const slip=window.lateral,advantage=estimate.pressureA/estimate.pressureB*contestNoise*contestNoise,deflect=target.stability>.3&&advantage<.62;
    const binding=!yielding&&slip<80&&closing<600&&u.stability>.12&&target.stability>.12&&random()<.5;
    const outcome=binding?'刀刃相持':yielding&&target.stability>.12?'卸力格挡后分离':u.stability<.12&&target.stability<.12?'双双破稳':u.stability<.12?'进攻方破稳':target.stability<.12?'防守方破稳':deflect?'拨刀反击':slip>80?'交错飞过':Math.max(advantage,1/advantage)>1.5?'压刀击退':'刀刃相持后分离';
    report(outcome,{lossA:la,lossB:lb,powerA:pa,powerB:pb,outputRatio:advantage});
    const impulse=momentum*(binding?.95:.4)+Math.min(pa,pb)*.05;
    u.velocity = sub(u.velocity, mul(n, impulse / ma));
    target.velocity = add(target.velocity, mul(n, impulse / mb));
    const lateral = bodyBasis(n).right;
    u.velocity = add(u.velocity, mul(lateral, Math.min(240,slip*.35)));
    target.velocity = add(target.velocity, mul(lateral, -Math.min(240,slip*.35)));
    for (const x of [ u, target ]) {
        x.separationUntil = b.t + (closing>350||slip>100?.6:.25);
        const loss = x === u ? la : lb;
        x.meleeContactUntil = b.t + .5;
        x.nextDecision = b.t;
        if (loss > .05) {
            x.meleeStrain = Math.min(b.rules.clashStrainCap ?? .55, (x.meleeStrain || 0) + loss * (b.rules.clashStrainGain ?? .45));
            x.recoveryDebuffUntil = b.t + x.pilotState.tactics.clashRecoveryS;
            x.recoveryDebuff = "拼刀冲击";
        }
        if (x.stability < .12) {
            x.meleeBreakUntil = b.t + 1.1;
            b.emit("guard-break", x.id, x.machine.name + " 拼刀破稳，暂时失去继续格挡能力");
        }
    }
    b.effects.push({
        type: "clash",
        t: b.t,
        life: .95,
        position: mul(add(u.position, target.position), .5),
        actor: u.id,
        opponent: target.id,
        intensity: clamp(closing / 600, .5, 1),
        losses: {
            [u.id]: la,
            [target.id]: lb
        },
        outcome: outcome
    });
    b.emit("parry", u.id, "双方拼刀后 " + outcome, {
        opponent: target.id,
        lossA: la,
        lossB: lb,
        powerA: pa,
        powerB: pb,
        closingSpeed: closing,
        outcome
    });
    // Record the real exchange cost so later utility does not treat a neutral parry as free.
    b.recordExchange(u,target.id,'melee','loss',la*u.machine.sim.structure*.25);
    b.recordExchange(target,u.id,'melee','loss',lb*target.machine.sim.structure*.25);
    const penetrate=(attacker,victim,weapon,breach,power)=>{
        if(breach<=0)return;
        const fraction=breach*clamp(.35+power/Math.max(1,pa+pb)*.7,.35,1);
        b.emit('guard-penetration',attacker.id,attacker.machine.name+' 刀刃压穿失稳格挡，切入机体',{target:victim.id,breach,fraction});
        b.damage(victim,{owner:attacker.id,weaponId:weapon.id,weapon:{...weapon.sim,damage:weapon.sim.damage*fraction*(attacker.bladeBoostUntil>b.t?1.8:1)},velocity:mul(attacker===u?n:mul(n,-1),Math.max(1,closing)),kind:'melee',order:'melee'});
    };
    penetrate(u,target,w,breachB,pa);
    penetrate(target,u,counter.definition,breachA,pb);
    // A broken guard offers a new numerical follow-up, not a scheduled free kill.
        const exploit = (attacker, victim) => {
        attacker.openingUntil = victim.meleeBreakUntil;
        attacker.separationUntil = 0;
        attacker.meleeContactUntil = b.t + attacker.pilotState.sim.reactionS;
        const blade = attacker.weapons.find(s => s.definition.kind === "melee" && !s.disabled);
        if (blade) {
            b.selectWeapon(attacker, blade, "破稳后的追击窗口");
            if (attacker.pilotState.traits.returnSlash && blade.definition.sim.riposteS !== undefined) blade.readyAt = Math.min(blade.readyAt, b.t + Math.max(attacker.pilotState.sim.reactionS, blade.definition.sim.riposteS));
        }
        attacker.nextDecision = b.t;
    };
    if (u.alive && target.alive && u.stability < .12 && target.stability >= .12) {
        exploit(target, u);
        u.recoveryDebuffUntil = b.t + 1.4;
        b.emit("opening", target.id, target.machine.name + " 取得破稳后的近战窗口", {
            target: u.id
        });
    }
    if (u.alive && target.alive && target.stability < .12 && u.stability >= .12) {
        exploit(u, target);
        target.recoveryDebuffUntil = b.t + 1.4;
        b.emit("opening", u.id, u.machine.name + " 取得破稳后的近战窗口", {
            target: target.id
        });
    }
    // Do not grant every neutral exchange an automatic clean escape.
    if(u.stability>.26)considerMeleeFollowup(b,u,target,w,window);
    if(target.stability>.26)considerMeleeFollowup(b,target,u,counter.definition,window);
    if(deflect&&target.alive&&u.alive&&target.stability>.12){
        exploit(target,u);target.openingUntil=b.t+.55;target.separationUntil=0;
        if(target.pilotState.traits.returnSlash)counter.readyAt=Math.min(counter.readyAt,b.t+Math.max(.08,target.pilotState.sim.reactionS));
        b.emit('riposte-window',target.id,target.machine.name+' 格挡拨开来刀，取得短暂反击窗口',{target:u.id,until:target.openingUntil});
    }

}

export function pointInsideHull(u, point) {
    const p = localPoint(u, point), dim = u.machine.renderProfile?.dimensions;
    if (!dim) return length(sub(point, u.position)) <= u.machine.sim.radiusM;
    return p.reduce((n, v, i) => n + (v / (dim[i] * .5)) ** 2, 0) <= 1;
}

// CIWS can service a projectile track without replacing the fleet task target.
export function pointDefense(b, dt) {
    for(const u of b.units.filter(u=>u.alive&&!u.docked&&u.entityType==='ship'&&u.weapons.some(w=>w.definition.tags?.includes('burst-defense')))){for(const state of u.weapons.filter(w=>!w.disabled&&w.definition.tags?.includes('point-defense'))){const w=state.definition,s=w.sim;if(state.readyAt>b.t||state.ammo===0)continue;const threats=b.projectiles.filter(p=>b.unitById.get(p.owner)?.side!==u.side&&['missile','funnel-missile'].includes(p.kind)&&length(sub(p.position,u.position))<s.rangeM&&!p.intercepted).sort((a,z)=>length(sub(a.position,u.position))-length(sub(z.position,u.position))).slice(0,Math.min(s.burst,Math.max(0,state.ammo),192-b.projectiles.length));let fired=0;for(const threat of threats){const origin=globalPoint(u,w.turret?.position||[u.machine.sim.radiusM,0,0]),solution=interceptPoint(origin,threat.position,threat.velocity,s.projectileSpeedMps,s.lifeS),delta=sub(solution.position,origin);state.turretForward=rotateToward(state.turretForward||u.forward,norm(delta),(w.turret?.turnRateDeg||90)*Math.PI/180*dt);if(!arcSolution(state.turretForward,delta,s).inside)continue;const r=b.randomFor(u.id,'point-defense'),basis=bodyBasis(norm(delta)),error=s.spreadRad*.15*(1+(1-u.components.sensor))*length(delta),direction=norm(add(delta,add(mul(basis.right,(r()-.5)*error),mul(basis.up,(r()-.5)*error))));b.projectiles.push({id:++b.sequence,owner:u.id,target:threat.owner,weaponId:w.id,kind:'ballistic',position:[...origin],previous:[...origin],velocity:mul(direction,s.projectileSpeedMps),age:0,traveled:0,weapon:s,guiding:false,order:'point-defense',interceptTarget:threat.id,trace:[[...origin]]});state.ammo--;state.shots++;u.shots++;fired++;b.effects.push({type:'tracer',vulcan:true,projectileSpeedMps:s.projectileSpeedMps,t:b.t,life:.4,from:origin,to:solution.position,actor:u.id});}if(fired){state.readyAt=b.t+s.cooldownS;b.emit('point-defense',u.id,u.machine.name+' 近防多管弹幕拦截来袭弹群',{rounds:fired});}}}

    for (const u of b.units.filter(u => u.alive && !u.docked && u.entityType === "ship"&&!u.weapons.some(w=>w.definition.tags?.includes("burst-defense")))) for (const state of u.weapons.filter(w => !w.disabled && w.definition.tags?.includes("point-defense"))) {
        if (state.readyAt > b.t || state.ammo === 0 || b.projectiles.length >= 192) continue;
        const w = state.definition, s = w.sim, threat = b.projectiles.filter(p => p.owner !== u.id && b.unitById.get(p.owner)?.side !== u.side && [ "missile", "funnel-missile" ].includes(p.kind) && length(sub(p.position, u.position)) < s.rangeM).sort((a, c) => length(sub(a.position, u.position)) - length(sub(c.position, u.position)))[0];
        if (!threat) continue;
        const relative = sub(threat.velocity, u.velocity), distance = length(sub(threat.position, u.position)), lead = add(threat.position, mul(relative, distance / s.projectileSpeedMps)), delta = sub(lead, u.position);
        state.turretForward = rotateToward(state.turretForward || u.forward, norm(delta), (w.turret?.turnRateDeg || 90) * Math.PI / 180 * dt);
        if (!arcSolution(state.turretForward, delta, s).inside) continue;
        state.ammo--;
        state.shots++;
        u.shots++;
        state.readyAt = b.t + s.cooldownS;
        const random = b.randomFor(u.id, "point-defense"), basis = bodyBasis(norm(delta)), error = s.spreadRad * (1 + (1 - u.stability)) * distance, aim = norm(add(delta, add(mul(basis.right, (random() - .5) * error), mul(basis.up, (random() - .5) * error)))), origin = add(u.position, mul(aim, u.machine.sim.radiusM + 4));
        b.projectiles.push({
            id: ++b.sequence,
            owner: u.id,
            target: threat.owner,
            weaponId: w.id,
            kind: "ballistic",
            position: origin,
            previous: origin,
            velocity: mul(aim, s.projectileSpeedMps),
            age: 0,
            traveled: 0,
            weapon: s,
            guiding: false,
            order: "point-defense",
            interceptTarget: threat.id,
            trace: [ origin ]
        });
        b.effects.push({
            type: "tracer",
            vulcan: true,
            projectileSpeedMps: s.projectileSpeedMps,
            t: b.t,
            life: .5,
            from: origin,
            to: lead,
            actor: u.id
        });
        b.emit("point-defense", u.id, u.machine.name + " 近防炮向预测交会点开火", {
            projectile: threat.id
        });
    }
}
