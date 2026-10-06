import {limitObstacleSizes} from './battlefield.js';
import {resolveMission} from './missions.js';
import { add, mul, sub, dot, norm, bodyBasis, length } from "./math.js";

export function applyComponentCondition(u, selected) {
    if (selected.role === "engine") u.components.engine = Math.max(.05, selected.health / selected.structure);
    if (selected.role === "power") u.components.power = Math.max(0, selected.health / selected.structure);
    if (selected.role === "sensor") u.components.sensor = Math.max(.05, selected.health / selected.structure);
    if (selected.role === "turret" && selected.health === 0) for (const w of u.weapons) if (w.definition.slot === selected.slot) w.disabled = true;
}

export function enrichEntities(b) {
    b.objects = [];
    b.clouds = [];
    b.drones = [];
    b.environmentMap = new Map(b.catalog.environments.map(e => [ e.id, e ]));
    b.field = b.catalog.battlefields?.find(x => x.id === b.scenario.battlefieldId) || null;
    if(b.field)limitObstacleSizes(b.field);
    b.mission = structuredClone(resolveMission(b.scenario,b.catalog));
    for (const u of b.units) {
        const group = b.scenario[u.side + "Forces"][u.groupIndex];
        u.entityType = u.machine.entityType || "ms";
        u.combatant = u.machine.combatant !== false;
        if(b.catalog.skillTemplates?.some(d=>d.effects?.onLethal==='disable'))u.disabled=false;
        u.roll = 0;
        u.docked = !!group.carrierId;
        u.carrierId = group.carrierId || null;
        u.mountId=group.mountId||null;u.mountOffset=group.mountOffset?[...group.mountOffset]:null;
        u.controller = group.strategy;
        u.componentState = Object.fromEntries((u.machine.componentDefs || []).map(c => [ c.id, {
            ...structuredClone(c),
            health: c.structure
        } ]));
        for(const [id,fraction] of Object.entries(group.initialState?.componentHealth||{})){const part=u.componentState[id];part.health=part.structure*fraction;applyComponentCondition(u,part);}
        u.massOriginal = u.machine.sim.massKg;
        u.launchAt = 0;u.cruiseAltitude=u.position[1];
        u.detachCount = 0;
        u.contacts = new Map;
        if (u.entityType !== "ms" && u.entityType !== "ma") {
            u.velocity = [ 0, 0, 0 ];
            u.desired = [ 0, 0, 0 ];
        }
    }
    for (const u of b.units.filter(x => x.mountId)) {const ship=b.units.find(x=>x.id===u.mountId);if(ship.entityType!=="ship"){ship.machine.sim.massKg+=u.machine.sim.massKg;ship.riderId=u.id;ship.pilotState=structuredClone(u.pilotState);}const basis=bodyBasis(ship.forward);u.position=add(ship.position,add(mul(ship.forward,u.mountOffset[0]),add(mul(basis.up,u.mountOffset[1]),mul(basis.right,u.mountOffset[2]))));u.velocity=[...ship.velocity];}
    for (const u of b.units.filter(x => x.docked)) {
        const carrier = b.units.find(x => x.id === u.carrierId);
        u.position = [ ...carrier.position ];
        u.velocity = [ ...carrier.velocity ];
    }
}

// A carrier is transportation, not a permanent constraint on an MS's own thrust.
export function contactMotor(b,u){
 const mount=u.mountId&&b.unitById.get(u.mountId);
 if(!mount?.alive||mount.entityType==='ship')return u;
 const canJump=u.machine.tags.includes('ground-combat')&&u.energy>=u.machine.sim.dodgeEnergyCost&&u.components.engine>.3;
 return u.machine.tags.includes('air-combat')||canJump?u:mount;
}
export function leaveMountForContact(b,u,target){
 const mount=u.mountId&&b.unitById.get(u.mountId);
 if(!mount?.alive||mount.entityType==='ship'||!['melee','bladeCover'].includes(u.order))return false;
 const seen=target&&u.contacts.get(target.id),blade=b.bestBlade(u,target);
 if(contactMotor(b,u)!==u||!seen||b.t-seen.observedAt>.5||!blade||!['melee','bladeCover'].includes(u.order)||b.t<u.evadeUntil)return false;
 const delta=sub(seen.position,u.position),distance=length(delta),closing=Math.max(0,-dot(sub(seen.velocity,u.velocity),norm(delta)));
 const reach=blade.definition.sim.rangeM+closing*(blade.definition.sim.windupS+.5)+u.machine.sim.maxSpeedMps*.3;
 if(distance>reach)return false;
 const cost=u.machine.sim.dodgeEnergyCost*.5;if(u.energy<cost+blade.definition.sim.energyCost)return false;
 b.spend(u,cost);u.mountId=null;u.mountOffset=null;u.velocity=[...mount.velocity];
 mount.machine.sim.massKg=Math.max(mount.massOriginal,mount.machine.sim.massKg-u.machine.sim.massKg);mount.riderId=null;
 u.jumpBoostUntil=b.t+Math.min(1.2,Math.max(.5,u.pilotState.tactics.dodgePulseS*2));u.nextDecision=b.t;
 b.emit('mount-release',u.id,u.machine.name+' 脱离飞行载具，以自身推进争取近战窗口',{carrier:mount.id,target:target.id,boostUntil:u.jumpBoostUntil,energyCost:cost});
 b.effects.push({type:'dodge-jet',actor:u.id,t:b.t,life:.65,position:[...u.position],direction:mul(u.forward,-1),localDirection:[-1,0,0]});return true;
}

export function launchCarried(b) {
    for (const carrier of b.units.filter(u => u.entityType === "ship")) {
        const hangar = Object.values(carrier.componentState).find(c => c.role === "hangar");
        if (!carrier.alive || hangar?.health <= 0) {
            for (const child of b.units.filter(u => u.docked && u.carrierId === carrier.id)) b.destroy(child, "搭载舰/机库失效");
            continue;
        }
        const child = b.units.find(u => u.alive && u.docked && u.carrierId === carrier.id);
        if (!child || b.t < (carrier.nextLaunchAt || 0)) continue;
        const c = carrier.machine.carrier;
        if (!c) continue;
        const basis = bodyBasis(carrier.forward), offset = add(mul(carrier.forward, c.launchPoint[0]), add(mul(basis.up, c.launchPoint[1]), mul(basis.right, c.launchPoint[2])));
        child.position = add(carrier.position, offset);
        child.velocity = add(carrier.velocity, mul(carrier.forward, c.launchSpeedMps));
        child.forward = [ ...carrier.forward ];
        child.desiredFacing = [ ...child.forward ];
        child.docked = false;
        child.nextDecision = b.t;
        carrier.nextLaunchAt = b.t + c.intervalS;
        b.emit("launch", child.id, child.machine.name + " 从 " + carrier.machine.name + " 出击", {
            carrier: carrier.id,
            position: [ ...child.position ]
        });
    }
}

export function localPoint(u, p) {
    const basis = bodyBasis(u.forward), v = sub(p, u.position), up = add(mul(basis.up, Math.cos(u.roll || 0)), mul(basis.right, Math.sin(u.roll || 0))), right = add(mul(basis.right, Math.cos(u.roll || 0)), mul(basis.up, -Math.sin(u.roll || 0)));
    return [ dot(v, u.forward), dot(v, up), dot(v, right) ];
}

export function componentImpact(b, u, shot, penetratingDamage) {
    if (!Object.keys(u.componentState || {}).length) return null;
    const from = localPoint(u, shot.position || u.position), to = localPoint(u, shot.segmentEnd || shot.contactPoint || u.position);
    let selected = shot.componentId?u.componentState[shot.componentId]:null, best = selected?0:Infinity;
    for (const c of Object.values(u.componentState)) {
        if (c.health <= 0) continue;
        const delta = sub(to, from), v = sub(c.position, from), t = Math.max(0, Math.min(1, dot(v, delta) / Math.max(1, dot(delta, delta)))), closest = add(from, mul(delta, t));
        if (length(sub(closest, c.position)) < c.radiusM && t < best) {
            selected = c;
            best = t;
        }
    }
    // Propulsion hits use normal hull damage; do not permanently cripple movement.
    // Explicit initial component health is still handled by applyComponentCondition.
    if (!selected || selected.role === "engine") return null;
    const damage = penetratingDamage ?? shot.weapon.damage * (b.rules.damageMultiplier || 3.25);
    selected.health = Math.max(0, selected.health - damage);
    b.emit("component-hit", u.id, u.machine.name + " " + selected.name + "受损", {
        component: selected.id,
        health: selected.health,
        position: shot.contactPoint
    });
    applyComponentCondition(u, selected);
    if (selected.critical && selected.health === 0) b.destroy(u, selected.name + " 被击破",shot);
    return selected;
}

export function detachWeapons(b, u) {
    const refs = u.machine.attachments || [];
    let removed = 0;
    for (const part of refs) {
        if (u.detached?.has(part.id)) continue;
        u.detached ??= new Set;
        u.detached.add(part.id);
        removed += part.massKg;
        for (const w of u.weapons) if (part.weaponIds.includes(w.definition.id)) {
            w.disabled = true;
            w.ammo = 0;
            w.attack = null;
            w.salvo = null;
        }
        const basis = bodyBasis(u.forward),pieces=part.pieces||1;
        for(let piece=0;piece<pieces;piece++){
            const hand=u.detachCount++%2?1:-1;
            const axis=norm(add(mul(basis.right,hand*.7),mul(u.forward,-.7)));
            const offset=add(mul(basis.right,hand*(u.machine.sim.radiusM+part.radiusM*.35)),mul(basis.up,part.id.includes("missile")?u.machine.sim.radiusM*.6:-u.machine.sim.radiusM*.2));
            b.objects.push({
                id:"debris-"+u.id+"-"+part.id+"-"+piece,
                side:u.side,owner:u.id,entityType:"debris",name:part.name+(pieces>1?" "+(piece+1):""),
                position:add(u.position,offset),velocity:add(u.velocity,mul(axis,part.ejectSpeedMps)),
                forward:[...u.forward],radius:part.radiusM,life:part.lifeS,
                signature:part.signature,occluder:part.occluder,massKg:part.massKg/pieces,
                shape:part.id.includes("missile")?"missile-rack":"gun-pack",bornAt:b.t
            });
        }
    }
    if (removed) {
        u.machine.sim.massKg = Math.max(u.massOriginal * .35, u.machine.sim.massKg - removed);
        const ratio = u.massOriginal / u.machine.sim.massKg;
        b.effects.push({type:"jettison",t:b.t,life:1.5,actor:u.id,position:[...u.position],removedMassKg:removed,accelerationGain:ratio});
        u.machine.sim.maxSpeedMps *= Math.sqrt(ratio) * (u.machine.unloadedSpeedFactor || 1);
        u.machine.sim.turnRateDeg = Math.min(180, u.machine.sim.turnRateDeg * ratio);
        u.machine.mobility.pitchRateDeg = Math.min(180, u.machine.mobility.pitchRateDeg * ratio);
        u.jettisoned = true;
        b.emit("jettison", u.id, u.machine.name + " 抛弃 " + Math.round(removed / 1e3) + "吨外挂，保留惯性加速突进", {
            removedMassKg: removed,
            massKg: u.machine.sim.massKg,
            speedLimit: u.machine.sim.maxSpeedMps,
            thrustN: u.machine.sim.thrustN,
            accelerationGain: ratio,
            objects: b.objects.filter(o=>o.owner===u.id).map(o=>o.id)
        });
    }
    return removed;
}
