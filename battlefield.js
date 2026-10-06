import {guideCountermeasure} from './countermeasures.js';
import {guideLoadout} from './loadouts.js';
import {guideSupply,guideModule,guideCore} from "./seed-systems.js";
import { sub, add, mul, norm, length, segmentSphere, clamp, boxEntry } from "./math.js";

// Ordinary solid obstacles are debris/buildings, never kilometre-wide terrain.
// Keep boxes proportional and bound their enclosing size once when catalogued.
export function limitObstacleSizes(field){
 const cap=Math.min(150,field.radiusM*.02);
 for(const o of field.obstacles||[]){
  const extent=Math.max(o.radiusM,...(o.dimensions||[]).map(n=>n/2));
  if(extent<=cap)continue;
  const scale=cap/extent;o.radiusM=Math.max(1,o.radiusM*scale);
  if(o.dimensions)o.dimensions=o.dimensions.map(n=>Math.max(1,n*scale));
 }
 return field;
}
export function environmentAt(b, position) {
    const field = b.field;
    if (!field) return b.environment;
    let region = null;
    for (const r of field.regions) if ((!region || r.priority > region.priority) && position.every((v, i) => v >= r.min[i] && v <= r.max[i])) region = r;
    const base=b.environmentMap.get(region?.environmentId || field.defaultEnvironmentId)||b.environment;
    // Empty ground fields describe open terrain; explicit regions/obstacles keep
    // indoor and authored volumes intact. Air above open terrain is a separate medium.
    const airAbove=field.airAboveM??(base.medium==='ground'&&!field.regions.length&&!(field.obstacles||[]).length?80:null);
    if(!region&&base.medium==='ground'&&airAbove!==null&&position[1]>airAbove)return b.environmentMap.get('air')||base;
    return base;
}

export function domainAllowed(machine, environment) {
    const tags = machine.tags;
    if (tags.includes("all-domain")) return true;
    if(environment.medium==="surface"&&(tags.includes("surface-combat")||tags.includes("water-combat")))return true;
    const medium = environment.medium === "orbit" ? "space" : environment.medium === "surface" ? "air" : environment.medium || "air";
    return tags.includes(medium + "-combat") || tags.includes(medium + "-specialized") || medium === "surface" && tags.includes("air-combat");
}

export function canObserve(b,u,target,distance=length(sub(target.position,u.position)),from=environmentAt(b,u.position),to=environmentAt(b,target.position)){
 if(distance>Math.min(u.machine.sim.sensorRangeM,from.sim.visibilityM)||from.sim.visualOccluded)return false;
 // Water blocks optical/radar tracking across its surface; last bearing remains cached.
 if((u.pilotState.strategies?.['sensor-sharing']??0)>0&&(from.medium==='water')!==(to.medium==='water')&&Math.min(u.position[1],target.position[1])<-8)return false;
 return !target.stealthActive||distance<=target.machine.stealth.closeDetectionM?lineVisible(b,u.position,target.position):false;
}

export function environmentModifiers(machine, e) {
    const medium = e.medium || "air", special = machine.tags.includes(medium + "-specialized");
    return {
        thrust: special ? 1 : medium === "water" ? .45 : medium === "ground" ? .7 : medium === "air" && machine.tags.includes("space-combat") && machine.tags.includes("air-combat") ? .85 : 1,
        recovery: special ? 1 : medium === "water" ? .55 : 1,
        allowed: domainAllowed(machine, e)
    };
}

// Same closest-segment test as segmentSphere, without temporary vector allocations.
export function segmentBlocked(from, to, center, radius) {
    const ax = from[0] - center[0], ay = from[1] - center[1], az = from[2] - center[2];
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / (dx * dx + dy * dy + dz * dz || 1)));
    const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
    return x * x + y * y + z * z <= radius * radius;
}

export function lineVisible(b, from, to) {
    for (const o of b.field?.obstacles || []) if (o.health!==0&&(o.dimensions?boxEntry(from,to,o.position,o.dimensions)!==null:segmentBlocked(from,to,o.position,o.radiusM))) return false;
    for (const o of b.objects || []) {
        if (!o.occluder) continue;
        const x = from[0] - o.position[0], y = from[1] - o.position[1], z = from[2] - o.position[2];
        if (x * x + y * y + z * z > o.radius * o.radius * 1.44 && segmentBlocked(from, to, o.position, o.radius)) return false;
    }
    for (const cloud of b.clouds || []) if (cloud.visualOcclusion!==false && cloud.until > b.t && segmentBlocked(from, to, cloud.position, cloud.radiusM)) return false;
    return true;
}

export function updateObjects(b, dt) {
    for (const o of b.objects) {
        if(o.life<=0)continue;guideSupply(b,o,dt);guideLoadout(b,o,dt);guideCountermeasure(b,o);guideModule(b,o,dt);guideCore(b,o,dt);if(o.life<=0)continue;
        o.previous = [ ...o.position ];
        o.position = o.position.map((x, i) => x + o.velocity[i] * dt);
        if(o.coreUnitId){const u=b.unitById.get(o.coreUnitId);if(u?.disabled){u.position=[...o.position];u.velocity=[...o.velocity];u.forward=[...o.forward];}}
        o.life -= dt;
    }
    b.objects = b.objects.filter(o => o.life > 0);
    b.clouds = b.clouds.filter(c => c.until > b.t);
}

export function smokeAtSurface(b, position, power) {
    const e = environmentAt(b, position);
    if ((e.medium === "surface" || e.medium === "air") && Math.abs(position[1]) < 80) {
        b.clouds.push({
            position: [ position[0], 25, position[2] ],
            radiusM: clamp(power * 2, 50, 300),
            until: b.t + 3
        });
        b.emit("smoke", null, "海面冲击扬起水雾，穿过烟雾的观测暂时失去视野", {
            position: [ ...position ]
        });
    }
}

export function damageObstacle(b,o,shot,position){if(o.structure===undefined)return;const before=o.health??o.structure;o.health=Math.max(0,before-shot.weapon.damage*(b.rules.damageMultiplier||1));b.emit('geometry-hit',shot.owner,o.name+' 结构受击',{object:o.id,position,health:o.health,damage:before-o.health,weapon:shot.weaponId,kind:shot.kind});if(o.health===0&&before>0){b.emit('geometry-destroyed',shot.owner,o.name+' 被实际弹道破坏',{object:o.id,position,weapon:shot.weaponId,kind:shot.kind});b.effects.push({type:'explosion',t:b.t,life:2,position:[...position],actor:shot.owner});}updateFieldIntegrity(b);}

// Structural failure is a consequence of real impacts, never an elapsed-time script.
export function updateFieldIntegrity(b){
 const rule=b.field?.failure;if(!rule||b.fieldFailed)return;
 let capacity=0,remaining=0;for(const o of b.field.obstacles)if(rule.obstacleIds.includes(o.id)){capacity+=o.structure;remaining+=o.health??o.structure;}
 const damageFraction=capacity>0?1-remaining/capacity:0;
 if(damageFraction+1e-9<rule.damageFraction)return;
 b.fieldFailed=true;
 b.emit('battlefield-failure',null,'关键支撑累计受损，战场结构失效',{battlefield:b.field.id,damageFraction});
}

// A small geometric detour for a lost observation. Uses only the last bearing
// and known map solids; it is not a path finder over hidden enemy positions.
export function searchWaypoint(b,u,bearing){
 const point=[...bearing],medium=environmentAt(b,point).medium,ground=environmentAt(b,u.position).medium==='ground';
 if(ground)point[1]=u.position[1];
 else if(medium==='water'&&!u.machine.tags.includes('water-combat')&&!u.machine.tags.includes('all-domain'))point[1]=b.rules.minimumAltitudeM+30;
 const clearance=u.machine.sim.radiusM+30,ray=sub(point,u.position);
 for(const o of b.field?.obstacles||[]){
  if(o.health===0)continue;
  const expanded=o.dimensions?.map(x=>x+clearance*2),radius=o.radiusM+clearance;
  if(!(expanded?boxEntry(u.position,point,o.position,expanded)!==null:segmentBlocked(u.position,point,o.position,radius)))continue;
  let side=norm([-ray[2],0,ray[0]]);
 // Opponents approaching from opposite sides must not endlessly pick opposite
 // detours around the same rock and keep it between them. Use a common world
 // hemisphere and enough clearance to actually emerge beyond its silhouette.
 if(side[0]<-1e-6||Math.abs(side[0])<=1e-6&&side[2]<0)side=mul(side,-1);
 const reach=(expanded?Math.hypot(expanded[0],expanded[2])*.5:radius)+Math.max(60,clearance);
  const sign=u.searchDetour?.id===o.id?u.searchDetour.sign:(u.orbit||1);u.searchDetour={id:o.id,sign};
  return [o.position[0]+side[0]*reach*sign,ground?u.position[1]:Math.max(point[1],u.position[1]),o.position[2]+side[2]*reach*sign];
 }
 u.searchDetour=null;return point;
}

// Ground locomotion cannot intercept a high airborne opponent with a blade.
// Use the observed contact and actual flight/mount ability, never hidden poses.
export function meleeAltitudeReachable(b,u,contact,reach) {
    if(!contact?.position)return false;
    if(u.mountId||u.machine.tags.includes('air-combat')||u.machine.tags.includes('all-domain'))return true;
    const medium=environmentAt(b,u.position).medium;
    if(['space','orbit','water'].includes(medium))return true;
    const height=Math.abs(contact.position[1]-u.position[1]);
    const jump=u.machine.tags.includes('ground-combat')&&u.components.engine>.2&&u.energy>=(u.machine.sim.jumpEnergyCost??u.machine.sim.dodgeEnergyCost);
    return height<=reach+(jump?(u.machine.sim.jumpHeightM??100):0);
}
