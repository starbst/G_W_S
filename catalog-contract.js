import {validateWeaponHardware} from './weapon-hardware.js';
import {validateGrappleMachine} from './grapples.js';
import {validateLoadoutMachine} from './loadout-contract.js';
import {validateSeedMachine} from "./seed-systems.js";
import { domainAllowed,environmentAt,limitObstacleSizes } from "./battlefield.js";

import { validateMission,resolveMission } from "./missions.js";

const vec = (v, label) => {
    if (!Array.isArray(v) || v.length !== 3 || v.some(x => !Number.isFinite(x) || Math.abs(x) > 1e7)) throw Error(label + "需有限XYZ");
};

const num = (v, a, z, label) => {
    if (!Number.isFinite(v) || v < a || v > z) throw Error(label + "越界");
};

const keys = (x, allowed, label) => {
    if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).some(k => !allowed.includes(k))) throw Error(label + "包含未知参数");
};

const unique = (rows, label) => {
    if (!Array.isArray(rows) || rows.length > 64 || rows.some(x => !x || !/^[a-z][a-z0-9-]{0,63}$/.test(x.id)) || new Set(rows.map(x => x.id)).size !== rows.length) throw Error(label + "ID重复或无效");
};

const machineSim = "massKg thrustN maxSpeedMps groundSpeedMps groundAccelerationFactor groundTurnFactor sandTractionFactor jumpHeightM jumpEnergyCost turnRateDeg dragCoefficient radiusM structure armor energyCapacity totalEnergy unlimitedEnergy dodgeEnergyCost turnEnergyCost energyRegen energyTransferMultiplier sensorRangeM sensorFovDeg trackGain trackDecay flightPower airPowerMultiplier airLift waterBuoyancy componentCollisions energyArmor".split(" ");

const weaponSim = "environments rangeM effectiveRangeM minimumDamageFactor minRangeM preferredRangeM projectileSpeedMps cooldownS damage energyCost spreadRad arcYawDeg arcPitchDeg edgeSpreadMultiplier windupS lifeS turnRateDeg seekerHalfAngleDeg ammo burst blastRadiusM burstIntervalS salvoBurst switchS maxLateralAccelMps2 riposteS meleeAccuracy guardEfficiency powerSource droneCount droneSpeedMps droneAcceleration droneAttackRangeM returnSpeedMps droneEnergyCapacity droneShotCost droneFireIntervalS droneRechargePerS droneFlightCostPerS droneSortieSeconds suppressionStage salvoSuppression pellets recoilCost damageClass beamFraction projectileRadiusM countermeasure screenCapacity screenDurationS screenAbsorption beamClass impactMode".split(" ");

export function validateV5Catalog(c) {
    if (!c.battlefields.length || !c.missions.length || c.battlefields.length > 100 || c.missions.length > 100) throw Error("需要1—100个战场和任务");
    keys(c.rules, "kind id name schemaVersion stepSeconds maxSeconds lockThreshold unlockThreshold damageMultiplier damageVariance armorAbsorption componentDamageFraction boundaryRadiusM minimumAltitudeM provenance clashStrainCap clashStrainGain clashStrainRecoveryS commandEnabled commandIntervalS collisionEnergyJPerKg".split(" "), "规则");
    if(c.rules.collisionEnergyJPerKg!==undefined)num(c.rules.collisionEnergyJPerKg,1000,100000,"舰体碰撞耐冲击比能");
    if(c.rules.commandEnabled!==undefined&&typeof c.rules.commandEnabled!=="boolean")throw Error("战场指挥开关须为布尔值");
    if(c.rules.commandIntervalS!==undefined)num(c.rules.commandIntervalS,.25,5,"指挥更新间隔");
    for (const [key, a, z] of [ [ "clashStrainCap", 0, .7 ], [ "clashStrainGain", 0, 1 ], [ "clashStrainRecoveryS", 1, 120 ] ]) if (c.rules[key] !== undefined) num(c.rules[key], a, z, key);
    for (const m of c.machines) {
        keys(m, "kind entityType id name aliases selection tags mobility weapons facts sim renderProfile bladeOutput attachments unloadedSpeedFactor componentDefs carrier combatant powerSystem defenses stealth forms moduleSystem moduleSupply workSystem loadoutSystem loadoutSupply grappleSystem selfDestructSystem".split(" "), "实体模板");
        if(m.selection){keys(m.selection,["familyId","familyName","variantName"],"机体选择分组");for(const key of ["familyId","familyName","variantName"])if(typeof m.selection[key]!=="string"||!m.selection[key].length||m.selection[key].length>100)throw Error("机体选择分组字段错误");}
        keys(m.sim, machineSim, "实体数值");
        for(const [key,min,max] of [["groundSpeedMps",0,m.sim.maxSpeedMps],["groundAccelerationFactor",.05,1.5],["groundTurnFactor",.25,3],["sandTractionFactor",.1,1.5],["jumpHeightM",0,500],["jumpEnergyCost",0,10000]])if(m.sim[key]!==undefined&&(!Number.isFinite(m.sim[key])||m.sim[key]<min||m.sim[key]>max))throw Error("地面运动参数越界 "+key);
        if(m.sim.unlimitedEnergy!==undefined&&typeof m.sim.unlimitedEnergy!=="boolean")throw Error("无限总能源必须是布尔值");
        if(m.sim.waterBuoyancy!==undefined)num(m.sim.waterBuoyancy,0,1,"水中浮力支持");
        if(m.sim.airLift!==undefined)num(m.sim.airLift,0,1,"持续飞行支持");
        if(m.sim.componentCollisions!==undefined&&typeof m.sim.componentCollisions!=="boolean")throw Error("部件碰撞开关必须是布尔值");
        if(m.sim.airPowerMultiplier!==undefined)num(m.sim.airPowerMultiplier,1,8,"大气机动耗能倍率");
        validateSeedMachine(m);validateLoadoutMachine(m);validateGrappleMachine(m);if(m.workSystem){keys(m.workSystem,['secondsRequired','energyPerS'],'工程作业');num(m.workSystem.secondsRequired,1,3600,'作业需求');num(m.workSystem.energyPerS,0,50,'作业耗能');if(m.combatant!==false)throw Error('工程装置不能被计为战斗员');}
        unique(m.componentDefs || [], "部件");
        unique(m.attachments || [], "外挂");
        if (m.bladeOutput !== undefined) num(m.bladeOutput, .1, 4, "刀刃出力倍率");
        if (m.unloadedSpeedFactor !== undefined) num(m.unloadedSpeedFactor, 1, 3, "卸装速度倍率");
        if (m.combatant !== undefined && typeof m.combatant !== "boolean") throw Error("作战实体标识需开关");
        if (![ "ms", "ma", "ship", "vehicle", "pod", "turret", "terrain" ].includes(m.entityType || "ms")) throw Error("实体类型错误");
        if (m.renderProfile) {
            vec(m.renderProfile.dimensions, "模型尺寸");
            if (m.renderProfile.dimensions.some(x => x <= 0)) throw Error("模型尺寸必须为正");
        }
        for (const p of m.componentDefs || []) {
            keys(p, "id name role position radiusM structure critical slot".split(" "), "部件");
            if (p.critical !== undefined && typeof p.critical !== "boolean") throw Error("致命部件标记需开关");
            if (p.slot !== undefined && !m.weapons.some(w => w.slot === p.slot)) throw Error("部件武器槽不存在");
            vec(p.position, "部件位置");
            num(p.radiusM, 1, 500, "部件半径");
            num(p.structure, 1, 1e5, "部件耐久");
            if (![ "bridge", "engine", "turret", "hangar", "sensor", "hull", "power" ].includes(p.role)) throw Error("部件作用错误");
        }
        if (m.carrier && m.entityType !== "ship") throw Error("舰载配置只能用于战舰");
        if (m.carrier) {
            keys(m.carrier, "launchPoint launchSpeedMps intervalS".split(" "), "机库出击");
            vec(m.carrier.launchPoint, "出击挂点");
            num(m.carrier.launchSpeedMps, 1, 500, "出击速度");
            num(m.carrier.intervalS, .1, 30, "出击间隔");
            if (Math.hypot(...m.carrier.launchPoint) < m.sim.radiusM + 30) throw Error("出击挂点缺少安全净空");
        }
        for (const p of m.attachments || []) {
            keys(p, "id name massKg weaponIds radiusM ejectSpeedMps lifeS signature occluder pieces".split(" "), "外挂");
            if (!Array.isArray(p.weaponIds) || p.weaponIds.length > 16 || new Set(p.weaponIds).size !== p.weaponIds.length || typeof p.occluder !== "boolean") throw Error("外挂武器/遮挡格式错误");
            num(p.massKg, 1, m.sim.massKg * .65, "外挂质量");
            if(p.pieces!==undefined&&(!Number.isInteger(p.pieces)||p.pieces<1||p.pieces>8))throw Error("外挂分件须1—8整数");
            num(p.ejectSpeedMps, 1, 500, "抛弃初速");
            num(p.radiusM, 1, 100, "抛弃物尺寸");
            num(p.lifeS, 1, 60, "抛弃物寿命");
            num(p.signature, 0, 2, "抛弃物特征");
            if (p.weaponIds.some(id => !m.weapons.some(w => w.id === id))) throw Error("外挂武器引用不存在");
        }
        if ((m.attachments || []).reduce((n, x) => n + x.massKg, 0) >= m.sim.massKg * .65) throw Error("外挂总重过大");
        validateWeaponHardware(m);
        for (const w of m.weapons) {
            keys(w.sim, weaponSim, "武器数值");if(w.sim.beamClass!==undefined&&(!["standard","large"].includes(w.sim.beamClass)||w.kind!=="beam"))throw Error("光束分类须standard或large，仅用于光束");if(w.sim.impactMode!==undefined&&(!["direct","area"].includes(w.sim.impactMode)||w.kind!=="ballistic"))throw Error("实弹判定须direct或area，仅用于非导引实弹");if(w.sim.impactMode==="area"&&!(w.sim.blastRadiusM>0))throw Error("区域引爆需要正爆炸半径");if(w.sim.projectileRadiusM!==undefined)num(w.sim.projectileRadiusM,0,30,"弹体碰撞半径");if(w.sim.countermeasure!==undefined){if(w.sim.countermeasure!=="beam-screen"||w.kind!=="missile"||w.sim.ammo<1||w.sim.damage!==0)throw Error("反光束弹用途错误");num(w.sim.screenCapacity,1,1e5,"防御幕容量");num(w.sim.screenDurationS,.2,30,"防御幕时长");num(w.sim.screenAbsorption,0,1,"光束削减比例");}
            if(w.sim.beamFraction!==undefined)num(w.sim.beamFraction,0,1,"混合伤害光束比例");
            if(w.sim.damageClass==="hybrid"&&w.sim.beamFraction===undefined)throw Error("混合伤害需要光束比例");
            if(w.sim.damageClass!==undefined&&!["physical","energy","hybrid"].includes(w.sim.damageClass))throw Error("武器伤害性质错误");
            if (w.sim.droneCount !== undefined && !Number.isInteger(w.sim.droneCount) || w.sim.pellets !== undefined && !Number.isInteger(w.sim.pellets)) throw Error("弹丸/浮游炮数量需整数");
            for (const [k, lo, hi] of [ [ "droneCount", 1, 24 ], [ "droneSpeedMps", 100, 4e3 ], [ "droneAcceleration", 10, 5e3 ], [ "droneAttackRangeM", 100, 4e3 ], [ "returnSpeedMps", 100, 4e3 ], [ "droneEnergyCapacity", 1, 100 ], [ "droneShotCost", .01, 50 ], [ "droneFireIntervalS", .1, 20 ], [ "droneRechargePerS", .01, 50 ], [ "droneFlightCostPerS", 0, 10 ], [ "droneSortieSeconds", 2, 120 ], [ "suppressionStage", 0, 8 ], [ "salvoSuppression", 0, 1 ], [ "pellets", 1, 12 ], [ "recoilCost", 0, .5 ] ]) if (w.sim[k] !== undefined) num(w.sim[k], lo, hi, "武器 " + k);
            if (w.turret) {
                vec(w.turret.position, "炮塔位置");
                num(w.turret.turnRateDeg, 1, 180, "炮塔转速");
            }
        }
    }
    for (const e of c.environments) {
        keys(e.sim, "density visibilityM seaClutter windMps gravity visualOccluded".split(" "), "环境数值");
        if (e.sim.visualOccluded !== undefined && typeof e.sim.visualOccluded !== "boolean") throw Error("视野遮蔽需开关");
        if (![ "space", "orbit", "air", "surface", "water", "ground" ].includes(e.medium)) throw Error("未知环境介质");
    }
    for (const f of c.battlefields) {
        keys(f, "kind id name aliases radiusM defaultEnvironmentId regions obstacles failure airAboveM".split(" "), "战场");
        if (!Array.isArray(f.regions) || !Array.isArray(f.obstacles || []) || (f.obstacles || []).length > 128) throw Error("战场分区/障碍格式错误");
        if (!c.environments.some(e => e.id === f.defaultEnvironmentId)) throw Error("战场缺省环境不存在");
        num(f.radiusM, 3e3, 2e5, "战场半径");
        if (f.regions.length > 64) throw Error("环境区域过多");
        for (const o of f.obstacles || []) {
            keys(o, "id name position radiusM structure dimensions".split(" "), "障碍");
            vec(o.position, "障碍位置");
            num(o.radiusM, 1, 1e4, "障碍半径");if(o.dimensions!==undefined){if(!Array.isArray(o.dimensions)||o.dimensions.length!==3)throw Error('障碍尺寸格式');for(const n of o.dimensions)num(n,1,20000,'障碍尺寸');}if(o.structure!==undefined)num(o.structure,1,1e7,"障碍结构");
        }
        limitObstacleSizes(f);
        if(f.airAboveM!==undefined)num(f.airAboveM,20,10000,'空域起始高度');
        if(f.failure){
            keys(f.failure,['obstacleIds','damageFraction'],'战场结构失效条件');
            const ids=f.failure.obstacleIds;
            if(!Array.isArray(ids)||!ids.length||ids.length>128||new Set(ids).size!==ids.length||ids.some(id=>!f.obstacles.some(o=>o.id===id&&o.structure>0)))throw Error('战场结构条件必须引用实际可损坏障碍');
            num(f.failure.damageFraction,.01,1,'战场结构损坏比例');
        }
        for (const r of f.regions) {
            keys(r, "id min max priority environmentId".split(" "), "环境分区");
            vec(r.min, "区域最小值");
            vec(r.max, "区域最大值");
            if (r.min.some((v, i) => v >= r.max[i]) || !c.environments.some(e => e.id === r.environmentId)) throw Error("环境区域错误");
            num(r.priority, 0, 100, "区域优先级");
        }
    }
    for (const m of c.missions) validateMission(m);
}

export function validateV5Scenario(s, c) {
    if (!c.battlefields.some(f => f.id === s.battlefieldId) || !c.missions.some(m => m.id === s.missionId)) throw Error("战场/任务引用不存在");
    const units = [ "a", "b", ...(s.cForces ? ["c"] : []) ].flatMap(side => s[side + "Forces"].flatMap((g, gi) => Array.from({
        length: g.count
    }, (_, i) => ({
        id: side + "-" + gi + "-" + i,
        side: side,
        machine: c.machines.find(x => x.id === g.machineId),
        group: g
    }))));
    const field = c.battlefields.find(f => f.id === s.battlefieldId);
    const selectedMedium=c.environments.find(e=>e.id===s.environmentId)?.medium,fieldMedium=c.environments.find(e=>e.id===field.defaultEnvironmentId)?.medium;
    const openGroundAir=fieldMedium==='ground'&&selectedMedium==='air'&&(field.airAboveM!==undefined||(!field.regions.length&&!(field.obstacles||[]).length));
    const seaAir=fieldMedium==='surface'&&selectedMedium==='air';
    if(!field.regions.length&&selectedMedium!==fieldMedium&&!openGroundAir&&!seaAir)throw Error('缺省环境与战场不匹配，请使用该战场的缺省环境；独立部署按高度和显式区域判断');
    const environmentContext={field,environmentMap:new Map(c.environments.map(e=>[e.id,e])),environment:c.environments.find(e=>e.id===s.environmentId)};
    for (const u of units) {
        const deployment=s.deployments?.find(p=>p.id===u.id),point=deployment?[deployment.x,deployment.y,deployment.z]:[u.side==='a'?-s.distanceM/2:s.distanceM/2,s.altitudeM,0],env=environmentAt(environmentContext,point);
        if(u.group.mountId){const mount=units.find(x=>x.id===u.group.mountId);if(!mount||mount.side!==u.side||!(mount.machine.entityType==="ship"||mount.machine.tags.includes("air-combat"))||mount.group.mountId||mount.group.carrierId||u.group.carrierId||mount.id===u.id)throw Error("甲板挂载归属错误");vec(u.group.mountOffset,"甲板挂载点");if(Math.hypot(...u.group.mountOffset)>Math.max(...mount.machine.renderProfile.dimensions)*.8)throw Error("甲板挂载点超出舰体");}else if(u.group.mountOffset)throw Error("挂载点需要母舰");
        if (!u.group.mountId&&!domainAllowed(u.machine, env)) throw Error(u.id + " 缺少 " + env.medium + " 作战标签");
        if (env.medium === "orbit" && point[1] < 1e5) throw Error("近轨部署高度不得低于100000米");
        const id = u.group.carrierId;
        if (id) {
            const carrier = units.find(x => x.id === id);
            if (!carrier || carrier.side !== u.side || !carrier.machine.carrier || carrier.id === u.id || carrier.group.carrierId) throw Error("舰载归属错误");
        }
        if (u.group.strategy === "simple" && ![ "vehicle", "pod", "terrain", "turret" ].includes(u.machine.entityType)) throw Error("简单控制器仅用于简易实体");
    }
    const mission=resolveMission(s,c);validateMission(mission);
    const visit = x => {
        if (x.conditions) x.conditions.forEach(visit);
        if (x.type === "field-failed" && !c.battlefields.find(f=>f.id===s.battlefieldId)?.failure) throw Error("任务要求结构失效但战场没有结构条件");
        if (x.entityId && !units.some(u => u.id === x.entityId)) throw Error("任务实体不在本局 " + x.entityId);
        if (x.type === "complete-work" && !units.find(u => u.id === x.entityId)?.machine.workSystem) throw Error("工程目标没有作业系统 " + x.entityId);
    };
    visit(mission.victory.a);
    visit(mission.victory.b);
    if(mission.victory.c){if(!s.cForces)throw Error("第三方任务需要第三方编队");visit(mission.victory.c);}
    for(const w of mission.withdrawals||[])for(const key of ["entityId","cohesionEntityId"])if(w[key]&&!units.some(u=>u.id===w[key]))throw Error("撤离实体不在本局 "+w[key]);
    for (const p of Object.values(mission.priorities || {})) if (!units.some(u => u.id === p.primaryEntityId)) throw Error("任务优先目标不在本局 " + p.primaryEntityId);
}
