import {updateCaptureReservations} from './capture-coordination.js';
import {initCommand,updateCommand} from './command.js';
import {refreshReactions, reactionPlans, scheduleReaction, clearReactions} from './defense-plans.js';
import {updateGrapples,updateDetonations} from './grapples.js';
import {deployCountermeasures} from './countermeasures.js';
import {serviceLoadouts} from './loadouts.js';
import {globalPoint} from './collision.js';
import {tryGroundJump} from './locomotion.js';
import {updateWork} from './work-objectives.js';
import {shareContacts} from './sensor-sharing.js';
import {allocateWeapons,allocateDrones,weaponTarget} from './weapon-allocation.js';
import {updateSkills} from './pilot-skills.js';
import {updateSeedSystems,mountedRemote,serviceModules,counterRemote} from "./seed-systems.js";
import { updateFireControl } from "./fire-control.js";

import { SpatialIndex } from "./spatial.js";

import { enrichEntities, launchCarried, detachWeapons, leaveMountForContact } from "./entities.js";

import { environmentAt, environmentModifiers, lineVisible, updateObjects, smokeAtSurface } from "./battlefield.js";

import { assignTargets, updateContacts, decideV5 } from "./tactics.js";

import { launchDrones, updateDrones, pointDefense, prepareMaximumOutput, predictCounterThrust, resolveBladeV5 } from "./combat.js";

import { missionResult,updateWithdrawals } from "./missions.js";

import { add, mul, sub, length, norm, dot, rotateToward, arcSolution, clamp, seededRandom } from "./math.js";

export function initV5(b) {
    enrichEntities(b);
    b.units.sort((a,c)=>a.id.localeCompare(c.id));
    initCommand(b);
    if (b.field) b.field = {
        ...b.field,
        defaultEnvironmentId: b.scenario.environmentId
    };
    b.spatial = new SpatialIndex;
    b.spatial.rebuild(b.units);
    b.unitById = b.spatial.byId;
    b.unitIndices = new Map(b.units.map((u, i) => [ u.id, i ]));
    b.randomStreams = new Map;
    b.randomFor = (id, purpose) => {
        const key = id + ":" + purpose;
        if (!b.randomStreams.has(key)) {
            let hash = b.seed;
            for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
            b.randomStreams.set(key, seededRandom(hash));
        }
        return b.randomStreams.get(key);
    };
    b.canSee = (from, to) => lineVisible(b, from, to);
    b.detach = u => detachWeapons(b, u);
    b.launchRemote=(u,target,state)=>launchDrones(b,u,target,state);
    b.environment = b.environmentMap.get(b.field?.defaultEnvironmentId) || b.environment;
}

function turretTargets(b, u, target, dt) {
    for (const state of u.weapons) {
        const turret = state.definition.turret;
        if (!turret || state.disabled) continue;
        const mountTarget=weaponTarget(b,u,state,target);const targetDirection = norm(sub(mountTarget.position, u.position));
        state.turretForward = rotateToward(state.turretForward || u.forward, targetDirection, turret.turnRateDeg * Math.PI / 180 * dt);
    }
}

export function stepV5(b) {
    if (b.result) return;
    if(b.unitIndices.size!==b.units.length){b.units.sort((a,c)=>a.id.localeCompare(c.id));b.unitIndices=new Map(b.units.map((u,i)=>[u.id,i]));b.previousPositions=null;}
    const dt=b.rules.stepSeconds,active=b.units,previous=b.previousPositions??=b.units.map(u=>[...u.position]);
    for(let i=0;i<active.length;i++){const p=active[i].position;previous[i][0]=p[0];previous[i][1]=p[1];previous[i][2]=p[2];}
    b.tick++;
    b.t = b.tick * dt;
    launchCarried(b);
    b.spatial.rebuild(b.units);
    b.unitById = b.spatial.byId;
    for(const u of active){updateWork(b,u,dt);updateSeedSystems(b,u,dt);serviceModules(b,u,dt);serviceLoadouts(b,u);}
    updateContacts(b);
    shareContacts(b);
    for(const u of active)updateSkills(b,u);
    updateCommand(b);
    updateCaptureReservations(b);
    if (b.tick % 5 === 1 || b.units.some(u => u.targetId && !b.unitById.get(u.targetId)?.alive)) assignTargets(b);
    for (const u of active) if (u.alive && !u.docked) {
        allocateWeapons(b,u);const target = b.targetFor(u);
        b.environment = environmentAt(b, u.position);
        b.sense(u, target, dt);
        turretTargets(b, u, target, dt);
        updateFireControl(b, u, target, dt);
    }
    b.environment = b.environmentMap.get(b.field?.defaultEnvironmentId) || b.environment;
    allocateDrones(b);
    for(const u of active)deployCountermeasures(b,u);
    pointDefense(b, dt);
    b.assessMissiles();
    // Same-tick attack observations are checked before any defensive interruption.
        for (const u of active) {
        refreshReactions(b,u);
        for(const r of reactionPlans(u)) if(r.cueAt != null && r.at <= b.t) r.cueValid = !!b.reactionCueActive(r);
    }
    for (const u of active) if (u.alive && !u.docked) {
        const target = b.targetFor(u);
        b.random = b.randomFor(u.id, "decision");
        b.environment = environmentAt(b, u.position);
        if(u.mountId&&u.pendingReaction){const mount=b.unitById.get(u.mountId);if(mount&&mount.entityType!=="ship")for(const plan of reactionPlans(u))scheduleReaction(b,mount,plan);clearReactions(u);}
        if(!u.mountId&&!u.capturedBy)b.react(u, target);
        if (b.t >= u.nextDecision && b.t >= (u.microControlUntil||0)) decideV5(b, u, target);
        leaveMountForContact(b,u,target);
        predictCounterThrust(b, u, target);
        if(u.capturedBy||u.grappleTarget||u.captureIntent)continue;
        const blade = u.visible && target.order === "melee" ? b.bestBlade(u,target) : null;
        if (blade) {
            const delta = sub(target.position, u.position), distance = length(delta), closing = Math.max(0, dot(sub(u.velocity, target.velocity), norm(delta)));
            if (distance < blade.definition.sim.rangeM + closing * (u.pilotState.sim.reactionS + .45) && !u.pendingGuard && b.t >= (u.guardUntil || 0) && b.t >= (u.meleeBreakUntil || 0)) b.warn(u, target, target.weapons.find(w => w.definition.kind === "melee")?.definition || blade.definition, "windup");
        }
        if (u.counterPlan && b.t >= u.counterPlan.at && u.counterPlan.until < b.t) u.counterPlan = null;
    }
    for (const u of active) if (u.alive && !u.docked && u.combatant) {
        const target = b.targetFor(u);
        b.random = b.randomFor(u.id, "weapon");
        b.environment = environmentAt(b, u.position);
        counterRemote(b,u);
        const selected = b.state(u);
        if (selected.definition.kind === "funnel"&&!mountedRemote(b,u,selected.definition)) {
            launchDrones(b, u, target, selected);
            for (const s of u.weapons.filter(s => s.definition.slot !== selected.definition.slot && !s.disabled)) {
                const mountTarget=weaponTarget(b,u,s,target);b.beginAttack(u, mountTarget, s);
                b.releaseAttack(u, mountTarget, s);
            }
        } else b.serviceWeapons(u);
    }
    for (const u of active) if (u.alive && !u.docked && !u.capturedBy) {
        const env = environmentAt(b, u.position), mods = environmentModifiers(u.machine, env);
        b.environment = env;
        tryGroundJump(b,u);
        const saved = u.machine.sim.thrustN;
        const captive=u.grappleTarget&&b.unitById.get(u.grappleTarget);
        u.machine.sim.thrustN *= mods.thrust*(captive?.alive?u.machine.sim.massKg/(u.machine.sim.massKg+captive.machine.sim.massKg):1);
        u.domainRecoveryFactor = mods.recovery;
        if (u.powerCutUntil > b.t) u.flightMode = "coast";
        if (!mods.allowed && env.medium !== "water" && env.medium !== "air") u.machine.sim.thrustN = 0;
        if (env.medium === "air" && !mods.allowed && b.t >= (u.jumpBoostUntil||0)) {
            u.machine.sim.thrustN = 0;
            u.desired[1] = 0;
        }
        if(u.riderId){const rider=b.unitById.get(u.riderId);if(rider?.alive){u.desired=[...rider.desired];u.desiredFacing=[...rider.desiredFacing];u.flightMode=rider.flightMode;}}
        const previousHeight = u.position[1], previousMedium = u.environmentMedium;
        u.environmentMedium = env.medium;
        if (previousMedium && previousMedium !== env.medium) b.emit("environment", u.id, u.machine.name + " 进入 " + env.name, {
            environment: env.id
        });
        const radius = b.field?.radiusM || b.rules.boundaryM;
        if (length(env.medium === "space" ? u.position : [ u.position[0], 0, u.position[2] ]) > radius * .92) {
            const inward = norm(mul(u.position, -1));
            u.desired = mul(inward, u.machine.sim.maxSpeedMps * .75);
            u.desiredFacing = inward;
            u.flightMode = "normal";
            u.breakaway = null;
        }
        if(b.t>=u.evadeUntil){const aiming=u.weapons.find(w=>w.attack&&String(w.attack.targetId).startsWith('f-'));const terminal=aiming&&b.remoteTarget(aiming.attack.targetId);
          if(terminal&&b.canSee(u.position,terminal.position)){const lead=Math.max(0,aiming.attack.at-b.t)+length(sub(terminal.position,u.position))/aiming.definition.sim.projectileSpeedMps;
           u.desiredFacing=norm(sub(add(terminal.position,mul(terminal.velocity,lead)),u.position));}}
        if(u.mountId){const savedEnvironment=b.environment,savedVelocity=u.velocity,savedDesired=u.desired,speed=u.machine.sim.maxSpeedMps;u.velocity=[0,0,0];u.desired=[0,0,0];u.machine.sim.thrustN=0;u.machine.sim.maxSpeedMps=0;b.environment={...env,sim:{...env.sim,gravity:0,density:0}};b.move(u,dt);u.velocity=savedVelocity;u.desired=savedDesired;u.machine.sim.maxSpeedMps=speed;b.environment=savedEnvironment;}else b.move(u, dt);
        if (!u.mountId && env.medium === "ground" && mods.allowed && u.position[1]<=u.machine.sim.radiusM*.5) {
            u.position[1] = u.machine.sim.radiusM * .5;
            u.velocity[1] = 0;if(u.jumping){u.jumping=false;u.jumpBoostUntil=0;u.jumpReadyAt=Math.max(u.jumpReadyAt||0,b.t+.6);}
        }
        if(env.medium==='surface'&&u.machine.tags.includes('surface-combat')&&!u.machine.tags.includes('air-combat')){u.position[1]=0;u.velocity[1]=0;u.desired[1]=0;}
        // Surface-capable hulls retain passive waterline support when their flight
        // propulsion is damaged. Only crossing the local sea surface is constrained;
        // a diving-capable hull ordered below it may still enter water normally.
        if(u.entityType==='ship'&&u.machine.tags.includes('surface-combat')&&previousHeight>=0&&u.position[1]<0&&!(u.machine.tags.includes('water-combat')&&u.desired[1]<0)&&environmentAt(b,[u.position[0],0,u.position[2]]).medium==='surface'){
            u.position[1]=0;u.velocity[1]=Math.max(0,u.velocity[1]);
        }
        u.machine.sim.thrustN = saved;
        u.roll += clamp((u.rollTarget || 0) - u.roll, -u.machine.sim.turnRateDeg * Math.PI / 180 * dt, u.machine.sim.turnRateDeg * Math.PI / 180 * dt);
    }
    for(const u of active)if(u.mountId&&u.alive){const parent=b.unitById.get(u.mountId);if(!parent?.alive){if(parent?.entityType!=="ship"){u.mountId=null;u.velocity=[...parent.velocity];b.emit("mount-lost",u.id,u.machine.name+" 飞行载具失效，脱离挂载");}else b.destroy(u,"挂载舰被毁");continue;}u.position=globalPoint(parent,u.mountOffset);u.velocity=[...parent.velocity];u.acceleration=[...parent.acceleration];}
    b.spatial.rebuild(b.units);
    b.unitById = b.spatial.byId;
    b.environment = b.environmentMap.get(b.field?.defaultEnvironmentId) || b.environment;
    for(const u of active)if(u.alive&&u.capturedBy)b.recharge(u,dt);
    updateGrapples(b,dt);
    updateDrones(b, dt);
    b.sweepMelee(previous);
    updateObjects(b, dt);
    b.tickMotionPadding=0;for(let i=0;i<b.units.length;i++){const u=b.units[i];if(!u.alive||u.docked)continue;b.tickMotionPadding=Math.max(b.tickMotionPadding,length(u.velocity)*dt,length(sub(u.position,previous[i])));}
    b.flyProjectiles(previous, dt);
    updateDetonations(b);
    if (b.clouds.length > 64) b.clouds = b.clouds.slice(-64);
    b.effects = b.effects.filter(e => b.t - e.t < e.life);
    const budget = Math.max(300, b.units.length * 10);
    if (b.effects.length > budget) b.effects = b.effects.slice(-budget);
    updateWithdrawals(b);b.result = missionResult(b);
    if (b.result) b.emit("result", null, b.result.winner ? (b.result.winner === "a" ? "我方" : "敌方") + " 完成任务：" + b.mission.name : "任务未分胜负：" + b.result.reason, {
        mission: b.mission.id
    });
}

export { prepareMaximumOutput, resolveBladeV5 };
