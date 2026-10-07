// Bounded, playback-only blocks. No catalog, AI scores or simulation rules are stored.
const DEF = [ "id", "side", "groupIndex", "name", "pilot", "pilotState", "radius", "maxArmor", "maxStructure", "maxEnergy", "maxTotalEnergy", "entityType", "renderProfile", "carrierId", "defenseLayers", "unlimitedEnergy", "gnSystem" ];

const STATE = [ "position", "velocity", "forward", "armor", "structure", "energy", "track", "stability", "speedRate", "alive", "order", "weapon", "weaponKind", "targetId", "locked", "lockedTargetId", "targetedBy", "visible", "evasionMode", "recoveryDebuff", "recoveryDebuffRemaining", "shots", "hits", "damage", "aiming", "aimingWeapons", "fireArc", "threat", "weapons", "totalEnergy", "energyRecoveryRate", "energyArmorActive", "docked", "roll", "componentState", "powerCut", "formId", "stealthActive", "defenseActive", "moduleSeparated", "defenseIntegrity", "disabled", "coreActive", "coreStructure", "capturedBy", "grappleTarget", "transAmActive", "activeSkills" ];

const WDEF = [ "id", "name", "kind", "slot", "mount", "arcYawDeg", "arcPitchDeg", "windupS", "projectileSpeedMps" ];

const WSTATE = [ "ammo", "readyIn", "active", "windup", "burstRemaining", "shots", "hits", "windupUntil", "disabled", "track", "locked" ];

const CUE = new Set([ "beam", "tracer", "slash", "clash", "dodge-jet", "decoy-track", "jettison", "area-blast" ]);

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [ k, o[k] ]));

function round(v, k = "") {
    if (typeof v === "number") return Math.round(v * ([ "forward", "stability", "track", "roll" ].includes(k) ? 1e4 : 100)) / ([ "forward", "stability", "track", "roll" ].includes(k) ? 1e4 : 100);
    if (Array.isArray(v)) return v.map(x => round(x, k));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([key, x]) => [ key, round(x, key) ]));
    return v ?? null;
}

function visualObject(o) {
    return pick(o, [ "id", "owner", "side", "name", "radius", "entityType", "position", "velocity", "forward", "phase", "target", "weaponId", "shape", "bornAt", "massKg" ]);
}

export class RecordingWriter {
    constructor(meta, first, blockSize = 32) {
        this.header = {
            ...pick(meta, [ "id", "name", "createdAt", "engineVersion", "seed", "result", "battleName", "startConditions" ]),
            schemaVersion: 6,
            columnVersion: 5,
            environment: pick(meta.environment, [ "medium", "visual" ]),
            battlefield: first.battlefield,
            ...(first.geometry?.length?{geometryDefs:first.geometry.map(o=>pick(o,['id','name','position','radiusM','structure','dimensions']))}:{}),
            mission: first.mission,
            unitDefs: first.units.map(u => ({
                ...pick(u, DEF),
                weaponDefs: (u.weapons || []).map(w => pick(w, WDEF)),
                componentDefs: pick(u.componentState || {}, Object.keys(u.componentState || {}))
            })),
            frameCount: 0,
            chunkCount: 0,
            duration: 0
        };
        this.blockSize = blockSize;
        this.reset();
    }
    reset() {
        this.frames = [];
        this.events = [];
        this.cues = [];
        this.state = this.header.unitDefs.map(() => []);
    }
    observe(events = [], effects = []) {
        this.events.push(...events.map(e => round(pick(e, [ "id", "t", "type", "actor", "text", "target", "weapon", "kind", "order", "readyAt", "position", "armorDamage", "structureDamage", "stabilityLoss", "opponent", "lossA", "lossB", "outcome", "removedMassKg", "massKg", "speedLimit", "cancelFraction", "availableImpulse", "requiredImpulse", "component", "health", "carrier", "count", "origin", "remote", "object", "drone", "droneEnergy", "accelerationGain", "skill", "skillName", "pressure", "modifiers", "strategy", "progress", "loadout", "energy", "totalEnergy", "stock", "duration", "attacker", "distance", "relativeSpeed", "source", "command", "ally", "reason", "radius", "hitCount", "guarded", "shieldGuard", "shield", "reduction", "stabilityReduction" ]))));
        this.cues.push(...effects.filter(e => CUE.has(e.type)).map(e => round(e)));
    }
    capture(f) {
        if (this.frames.length >= this.blockSize) throw Error("录像块未及时写入");
        const byId = new Map(f.units.map(u => [ u.id, u ]));
        const units = this.header.unitDefs.map((d, i) => {
            const u = byId.get(d.id);
            if (!u) throw Error("录像实体集合改变");
            const delta = [];
            STATE.forEach((k, j) => {
                const value = round(k === "weapons" ? (u.weapons || []).map(w => WSTATE.map(key => w[key] ?? null)) : k === "componentState" ? Object.fromEntries(Object.entries(u.componentState || {}).map(([id, c]) => [ id, c.health ])) : k === "fireArc" ? pick(u.fireArc || {}, [ "yaw", "pitch", "effectiveRange", "range" ]) : u[k], k);
                if (JSON.stringify(this.state[i][j]) !== JSON.stringify(value)) {
                    delta.push(j, value);
                    this.state[i][j] = value;
                }
            });
            return delta;
        });
        this.frames.push([ round(f.t), f.tick, units, (f.projectiles || []).map(p => [ p.id, p.owner, p.kind, round(p.position), !!p.guiding ]), round((f.objects || []).map(visualObject)), round((f.drones || []).map(visualObject)), round(f.clouds || []),...(this.header.geometryDefs?[round((f.geometry||[]).map(o=>o.health))]:[]) ]);
        this.header.frameCount++;
        this.header.duration = f.t;
    }
    flush(force = false) {
        if (!this.frames.length || !force && this.frames.length < this.blockSize) return null;
        const block = {
            index: this.header.chunkCount++,
            frames: this.frames,
            events: this.events,
            cues: this.cues
        };
        this.reset();
        return block;
    }
    finish(result) {
        this.header.result = result;
        return this.flush(true);
    }
}

export function validateV6(r) {
    const fail = m => {
        throw Error("录像v6无效：" + m);
    };
    if(r?.startConditions!==undefined&&(r.startConditions?.version!==1||!r.startConditions.scenario||typeof r.startConditions.scenario!=='object'||Array.isArray(r.startConditions.scenario)||JSON.stringify(r.startConditions).length>65536))fail('开始条件');
    const columnCount = r?.columnVersion === 5 ? STATE.length : r?.columnVersion === 4 ? STATE.length-1 : r?.columnVersion === 3 ? 44 : r?.columnVersion === 2 ? 41 : r?.columnVersion === 1 ? 36 : 35;
    if (r?.columnVersion !== undefined && ![1,2,3,4,5].includes(r.columnVersion)) fail("状态列版本");
    const vec = v => Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x) && Math.abs(x) < 1e8);
    if (!r || r.schemaVersion !== 6 || typeof r.id !== "string" || r.id.length > 160 || typeof r.name !== "string" || r.name.length > 160 || !Array.isArray(r.unitDefs) || r.unitDefs.length < 1 || r.unitDefs.length > 128 || !Array.isArray(r.chunks) || r.chunks.length < 1 || r.chunks.length > 2e4) fail("头部容量");
    for (const k of [ "sky", "horizon", "sea" ]) if (!/^#[0-9a-f]{6}$/i.test(r.environment?.visual?.[k])) fail("环境颜色");
    if(r.geometryDefs&&(!Array.isArray(r.geometryDefs)||r.geometryDefs.length>128||new Set(r.geometryDefs.map(o=>o.id)).size!==r.geometryDefs.length||r.geometryDefs.some(o=>!o||typeof o.id!=='string'||o.id.length>64||typeof o.name!=='string'||o.name.length>160||!vec(o.position)||o.dimensions!==undefined&&(!vec(o.dimensions)||o.dimensions.some(n=>n<1||n>20000))||!Number.isFinite(o.radiusM)||o.radiusM<=0||o.radiusM>20000||o.structure!==null&&(!Number.isFinite(o.structure)||o.structure<=0||o.structure>1e8))))fail('地形定义');
    let last = -1, count = 0, eventCount = 0, cueCount = 0;
    const ids = new Set;
    for (const u of r.unitDefs) {
        if(u.unlimitedEnergy!==undefined&&typeof u.unlimitedEnergy!=="boolean")fail("总能源标记");
        if (!/^[abc]-\d+-\d+$/.test(u.id) || ids.has(u.id) || ![ "a", "b", "c" ].includes(u.side) || typeof u.name !== "string" || u.name.length > 160 || !(u.maxStructure > 0 && u.radius > 0) || u.renderProfile?.dimensions && !vec(u.renderProfile.dimensions)) fail("实体定义");
        for (const k of [ "maxArmor", "maxStructure", "maxEnergy", "radius" ]) if (!Number.isFinite(u[k]) || u[k] < 0 || u[k] > 1e8) fail("实体容量");
        for (const k of [ "pilot", "pilotState" ]) if (typeof u[k] !== "string" || u[k].length > 160) fail("实体标签");
        ids.add(u.id);
    }
    for (const [bi, b] of r.chunks.entries()) {
        if (b.index !== bi || !Array.isArray(b.frames) || !b.frames.length || b.frames.length > 64 || !Array.isArray(b.events) || !Array.isArray(b.cues)) fail("块");
        const states = r.unitDefs.map(() => []);
        for (const [fi, f] of b.frames.entries()) {
            if (!Array.isArray(f) || f.length !== (r.geometryDefs?8:7) || !Number.isFinite(f[0]) || f[0] < last || f[0] > 7201 || !Number.isInteger(f[1]) || f[1] < 0 || !Array.isArray(f[2]) || f[2].length !== r.unitDefs.length) fail("帧");
            if(r.geometryDefs&&(!Array.isArray(f[7])||f[7].length!==r.geometryDefs.length||f[7].some((h,i)=>r.geometryDefs[i].structure===null?h!==null:!Number.isFinite(h)||h<0||h>r.geometryDefs[i].structure+.02)))fail('地形状态');
            last = f[0];
            count++;
            for (const [i, delta] of f[2].entries()) {
                if (!Array.isArray(delta) || delta.length % 2 || delta.length > STATE.length * 2) fail("单位变更");
                const seen = new Set;
                for (let j = 0; j < delta.length; j += 2) {
                    const k = delta[j];
                    if (!Number.isInteger(k) || k < 0 || k >= columnCount || seen.has(k)) fail("状态列");
                    seen.add(k);
                    states[i][k] = delta[j + 1];
                }
                if (!fi && seen.size !== columnCount) fail("块首帧");
                const u = Object.fromEntries(STATE.map((k, j) => [ k, states[i][j] ]));
                if(r.columnVersion===5&&(!Array.isArray(u.activeSkills)||u.activeSkills.length>32||u.activeSkills.some(s=>!s||typeof s.id!=='string'||s.id.length>64||typeof s.name!=='string'||s.name.length>160)))fail('技能状态');
                if (columnCount >= 42 && u.disabled !== null && (typeof u.disabled !== 'boolean' || u.disabled && (u.alive || u.structure !== 0 || !u.coreActive && u.velocity.some(n=>n!==0)))) fail('失能状态');
                if(columnCount>=46)for(const key of ["capturedBy","grappleTarget"])if(u[key]!==null&&!ids.has(u[key]))fail("抓取实体引用");
                if(columnCount>=44){if(u.coreActive!==null&&typeof u.coreActive!=='boolean'||u.coreStructure!==null&&(!Number.isFinite(u.coreStructure)||u.coreStructure<0||u.coreStructure>300)||u.coreActive&&(!u.disabled||!(u.coreStructure>0)))fail('核心战机状态');}
                if (!vec(u.position) || !vec(u.velocity) || !vec(u.forward) || !Number.isFinite(u.stability) || u.stability < 0 || u.stability > 1 || typeof u.alive !== "boolean" || !Array.isArray(u.weapons) || u.weapons.length > 16) fail("单位状态");
                for (const k of [ "energy", "totalEnergy", "armor", "structure" ]) if (u[k] !== null && (!Number.isFinite(u[k]) || u[k] < 0 || u[k] > 1e8)) fail("资源");
                if (u.totalEnergy !== null && u.energy > u.totalEnergy + .02) fail("能源守恒");
                for (const k of [ "shots", "hits", "damage", "speedRate", "track" ]) if (!Number.isFinite(u[k]) || Math.abs(u[k]) > 1e8) fail("单位数值");
                for (const k of [ "order", "weapon", "weaponKind", "threat" ]) if (typeof u[k] !== "string" || u[k].length > 500) fail("单位文字");
                if (columnCount >= 36 && typeof u.powerCut !== "boolean") fail("推进表现状态");
                if(columnCount>36){if(u.formId!==null&&!['ms','ma'].includes(u.formId)&&!(typeof u.formId==='string'&&/^loadout-[a-z][a-z0-9-]{0,63}$/.test(u.formId)))fail('形态状态');for(const k of ['stealthActive','defenseActive','moduleSeparated'])if(u[k]!==null&&typeof u[k]!=='boolean')fail('防护/分体状态');if(u.defenseIntegrity!==null&&(typeof u.defenseIntegrity!=='object'||Array.isArray(u.defenseIntegrity)||Object.values(u.defenseIntegrity).some(n=>!Number.isFinite(n)||n<0||n>20000)))fail('盾牌耐久');}
                const defs = r.unitDefs[i].weaponDefs;
                if (defs) {
                    if (!Array.isArray(defs) || defs.length !== u.weapons.length) fail("武器定义数量");
                    for (const [wi, row] of u.weapons.entries()) {
                        if (!Array.isArray(row) || row.length !== WSTATE.length || !Number.isInteger(row[0]) || row[0] < -1 || !Number.isFinite(row[1]) || row[1] < 0 || row[1] > 60 || [ 2, 3, 8 ].some(j => typeof row[j] !== "boolean") || [ 4, 5, 6, 7 ].some(j => !Number.isFinite(row[j]) || row[j] < 0)) fail("武器状态");
                    }
                    for (const [id, h] of Object.entries(u.componentState || {})) if (!r.unitDefs[i].componentDefs?.[id] || !Number.isFinite(h) || h < 0 || h > r.unitDefs[i].componentDefs[id].structure + .00501) fail("部件状态");
                }
            }
            if (!Array.isArray(f[3]) || f[3].length > 192) fail("投射体容量");
            for (const p of f[3]) if (p.length !== 5 || !Number.isInteger(p[0]) || !ids.has(p[1]) || !vec(p[3])) fail("投射体");
            for (const list of [ f[4], f[5], f[6] ]) if (!Array.isArray(list) || list.length > 3072) fail("动态实体容量");
            for (const o of [ ...f[4], ...f[5] ]) if (typeof o.id !== "string" || o.id.length > 160 || !vec(o.position) || !vec(o.velocity) || !vec(o.forward)) fail("动态实体");
        }
        eventCount += b.events.length;
        cueCount += b.cues.length;
        if (eventCount > 2e5 || cueCount > 2e5 || count > 4e4) fail("总容量");
        for (const e of [ ...b.events, ...b.cues ]) {
            if (!Number.isFinite(e.t) || e.t < 0 || e.t > 7201 || e.text !== undefined && (typeof e.text !== "string" || e.text.length > 500)) fail("事件");
        }
        for (const e of b.cues) if (!CUE.has(e.type) || !Number.isFinite(e.life) || e.life <= 0 || e.life > 10 || ([ "beam", "tracer", "slash", "decoy-track" ].includes(e.type) ? !vec(e.from) || !vec(e.to) : !vec(e.position))) fail("动画提示");
    }
    if (count !== r.frameCount || r.chunkCount !== r.chunks.length || Math.abs(last - r.duration) > .011) fail("计数");
    return r;
}

export function expandV6(r) {
    validateV6(r);
    const offsets = [], timestamps = new Float64Array(r.frameCount);
    let total = 0;
    for (const c of r.chunks) {
        offsets.push(total);
        for(const f of c.frames)timestamps[total++]=f[0];
    }
    const cache = new Map;
    function block(index) {
        if (cache.has(index)) return cache.get(index);
        const state = r.unitDefs.map(() => []), frames = r.chunks[index].frames.map(f => {
            const units = f[2].map((delta, i) => {
                for (let j = 0; j < delta.length; j += 2) state[i][delta[j]] = delta[j + 1];
                const u = {
                    ...r.unitDefs[i],
                    ...Object.fromEntries(STATE.map((k, j) => [ k, state[i][j] ]))
                };
                if (r.unitDefs[i].weaponDefs) {
                    u.weapons = u.weapons.map((row, j) => ({
                        ...r.unitDefs[i].weaponDefs[j],
                        ...Object.fromEntries(WSTATE.map((k, z) => [ k, row[z] ]))
                    }));
                    u.componentState = Object.fromEntries(Object.entries(u.componentState || {}).map(([id, health]) => [ id, {
                        ...r.unitDefs[i].componentDefs[id],
                        health: health
                    } ]));
                }
                u.orderLabel = u.order;
                return u;
            });
            return {
                t: f[0],
                tick: f[1],
                units: units,
                projectiles: f[3].map(p => ({
                    id: p[0],
                    owner: p[1],
                    kind: p[2],
                    position: p[3],
                    previous: p[3],
                    guiding: p[4],
                    trace: [ p[3] ]
                })),
                objects: f[4],
                drones: f[5],
                clouds: f[6],
                geometry:(r.geometryDefs||[]).map((o,i)=>({...o,health:f[7][i]})),
                effects: [],
                battlefield: r.battlefield,
                mission: r.mission,
                result: null
            };
        });
        cache.set(index, frames);
        if (cache.size > 2) cache.delete(cache.keys().next().value);
        return frames;
    }
    const at = n => {
        if (n < 0) n += total;
        if (n < 0 || n >= total) return undefined;
        let lo = 0, hi = offsets.length - 1;
        while (lo < hi) {
            const mid = Math.floor((lo + hi + 1) / 2);
            if (offsets[mid] <= n) lo = mid; else hi = mid - 1;
        }
        const f = block(lo)[n - offsets[lo]];
        if (n === total - 1) {
            f.result = r.result;
            f.effects = effects.filter(e => e.t + e.life >= r.duration);
        }
        return f;
    };
    const frames = new Proxy([], {
        has(_,key){if(/^\d+$/.test(String(key)))return Number(key)<total;return Reflect.has(_,key);},
        get(_, key) {
            if (key === "length") return total;
            if (key === "at") return at;
            if (key === Symbol.iterator) return function*() {
                for (let n = 0; n < total; n++) yield at(n);
            };
            if (/^\d+$/.test(String(key))) return at(Number(key));
            return Reflect.get(_, key);
        }
    });
    const events = r.chunks.flatMap(c => c.events), effects = r.chunks.flatMap(c => c.cues).map(e => e.type === "clash" ? {...e, life: Math.max(e.life, .95)} : e);
    const positionAt = (id, time) => {
        let lo = 0, hi = total - 1;
        while (lo < hi) {
            const mid = Math.floor((lo + hi + 1) / 2);
            if (timestamps[mid] <= time) lo = mid; else hi = mid - 1;
        }
        return at(lo).units.find(u => u.id === id)?.position || [ 0, 0, 0 ];
    };
    for (const e of events) {
        if (e.type === "hit") effects.push({
            type: "impact",
            t: e.t,
            life: .55,
            actor: e.target,
            kind: e.kind,
            position: e.position || positionAt(e.target, e.t),
            severity: Math.max(e.stabilityLoss ?? 0, (e.structureDamage || 0) / Math.max(1, r.unitDefs.find(u => u.id === e.target)?.maxStructure || 100))
        });
        if(e.type==='shot'){const def=r.unitDefs.find(u=>u.id===e.actor)?.weaponDefs?.find(w=>w.id===e.weapon);if(def)effects.push({type:'notice',t:e.t,life:def.kind==='melee'?.65:.55,actor:e.actor,position:positionAt(e.actor,e.t),tone:'info',weaponNotice:true,text:def.name});}
        if(e.type==="magazine-empty")effects.push({type:"notice",t:e.t,life:.8,actor:e.actor,position:positionAt(e.actor,e.t),tone:"warning",text:(r.unitDefs.find(u=>u.id===e.actor)?.weaponDefs?.find(w=>w.id===e.weapon)?.name||"武器")+" 射空"});
        if(e.type==="debris-hit")effects.push({type:"impact",t:e.t,life:.4,actor:e.object,position:e.position,severity:0});
        if (e.type === "destroyed") effects.push({
            type: "explosion",
            t: e.t,
            life: 3,
            actor: e.actor,
            position: positionAt(e.actor, e.t)
        });
    }
    effects.sort((a, b) => a.t - b.t);
    at(total - 1).effects = effects.filter(e => e.t + e.life >= r.duration);
    return {
        ...r,
        frames: frames,
        events: events,
        effects: effects
    };
}
