import {contactDamageFactor} from './projectile-policy.js';
import {isLightAutomatic,isTacticalThreat,weaponDamageScale} from './weapon-semantics.js';
import {groundLimited,motionSpeedLimit} from './locomotion.js';
import {contactMotor} from './entities.js';
import {meleeInterceptCourse} from './locomotion.js';
import {environmentAt,meleeAltitudeReachable} from './battlefield.js';
import {commandRouteGoal,escortObjective,escortScreenCourse} from './command.js';
import {grappleApproach,capturePosition,desperateCapture} from './grapples.js';
import {affordableManeuver,maneuverEnergyCost,weaponEnergyCost,pilotControlAuthority,emergencyPulseSeconds} from './energy-policy.js';
import {remoteOpportunities,remotePermission,mountedRemote,predictedProtectionCost} from './seed-systems.js';
import {navigationGoal,withdrawalOption} from './missions.js';
import {estimateClash} from './combat.js';
import { add, sub, mul, dot, cross, norm, length, clamp, bodyBasis, arcSolution, insideArc } from "./math.js";

// Closed local policy vocabulary. Conditions and movement are code; the worldbook
// only supplies bounded weights/thresholds. No names, plot times or win scripts.
export const STRATEGY_LABELS = Object.freeze({
    'melee-dash':['短促冲刺接刀','新鲜观测下，有限推进脉冲可真实进入刀刃范围，能源足够且拼刀不明显劣势时，提前切刀并冲刺；对方能观测和反应，可拔刀、侧闪或后撤，来袭能打断'],
    "blade-entry": ["优势近战切入", "自身有有效刀具，能在短时间到达，拼刀不明显劣势且不是正在保护航路时，利用对方远射空档或自身格斗优势主动切入；威胁与反应仍可中断"],
    'survival-spacing':['生存优先距离管理','生存任务中，遭有效火控、逼近刀战或连续损伤时优先安全横切拉开；安全且有优质反击窗口时可以还击，玩家明确指挥优先'],
    "fixated-pursuit": ["执着追击", "优先锁定首次识别的近邻敌方MS并持续追击，降低重新分配任务和主动退到母舰的意愿；仍需真实索敌、火控、资源与防御反应。适用于愤怒或执念状态，默认关闭"],
    "blade-cover": ["近战危机截击", "友机遭近战威胁且本机有刀/盾、观测新鲜并可及时接触时，尝试侧向切入挡住攻击者；不能瞬移，不取消挥刀，保留自我闪避与真实碰撞风险"],
    "reckless-clearance": ["冲动目标误判", "可见移动平民载具进入本机前方有效射击区时可能误认威胁并优先攻击；默认关闭，仅用于特定驾驶员的错误判断，不改变弹道或指定命中"],
    "terminal-intercept": ["危急舰体截击", "舰艇结构濒危、推进仍可用、可见大型目标在实际截击范围内时，考虑撞击；只计算航向，接触与损伤由质量和相对速度判定"],
    "shield-coast": ["惯性举盾迎击", "实体盾仍有耐久且能在重攻击抵达前转向覆盖时，保持惯性面向威胁；不增加盾的耐久或瞬间转向"],
    "capture-restraint": ["夺回优先火力克制", "具备捕获机构且正在友军压制下侧向占位时，本机暂缓对该目标的新射击；丢失观测、改派、受迫闪避或退出捕获接近后解除，不改变已发弹体和伤害"],
    "capture-position": ["捕获前侧向占位", "有捕获意图且友军正在压制可见敌机时提前靠近侧翼并匹配航速；仍允许攻击、闪避和风险脱离，未观察到失去动力前不能抓取"],
    "last-resort-detonation": ["绝境接触自爆", "真实抓住敌机后，常规出力不足或自身重伤且友军已远离爆区时，比较接触自爆；可被解救、真实伤害或失去保持出力打断"],
    "capture-disabled": ["捕获无法推进的目标", "观测到敌机装甲断电或推进失效后比较近距抓取；真实接触、相对速度和保持出力决定能否抓住"],
    "free-ally": ["援护解救被抓友机", "可观测友机被抓取时优先压制抓取者；必须有实际攻击命中才能解除保持"],
    "mission-retreat": ["任务风险撤离","出现难以承受的重炮、重伤或能源危机时比较撤离航路；不按固定时间撤退"],
    "mission-transit": ["任务航点突进", "需要抵达航点时优先推进真实任务航路；仍允许近战、来袭威胁、回气和回身反击打断，不因敌机存在而无限缠斗"],
    "mission-withdraw": ["脱离后归队", "护航目标已经脱离时评估安全归队航向；近距追击未解除则先处理拦截者"],
    "pursuit-boost": ["回身射后重新推进", "短时朝后反击结束或追击逼近时重新面向脱离航向加速，避免长时间背向出力被追上"],
    "pursuit-fire": ["惯性回身反击", "被持续追击但仍有远射窗口时保留脱离惯性，短时朝后射击；攻击窗口结束即转回推进，不硬拼低稳定刀战"],
    "blade-denial": ["劣势避刀横切", "预计刀刃接触且拼刀可能破稳时先横切或急刹离开接触路径，有能源也不强行格挡"],
    "pressure-jink": ["受压主动变线", "连续受击或多方向快速火控使临射急闪来不及时，优先改变航迹，避免原地回稳挨打"],
    "reserve-counter": ["回气间隙反击", "缓冲不足但存在廉价或弹药类攻击窗口时，维持惯性回气并有限反击，保留下一次急闪预算"],
    "pursuit-counter": ["摆脱失败转反击", "连续拉开无收益且仍被有效追射时建立射击窗口或侧切，避免无限尾追"],
    "melee-pressure": [ "保持近战压迫", "已有可行近战截击航向时持续接敌，不能被一般远射偏好覆盖" ],
    "modular-counter": ["分体避刃反击","观察敌方挥斩后，以可分离机体让开中心斩击，重合后利用对方收刀窗口反击；必须有模块结构与能源"],
    "safe-recovery": [ "安全回稳", "没有有效来袭射线时保留惯性，停止无意义转向" ],
    "combat-recovery": [ "火力下保速回稳", "失稳但仍有推进能力时沿稳定航向加速，避免低速原地挨打" ],
    "energy-reserve": [ "能源储备重整", "能源缓冲不足时寻找低威胁惯性航向，保留急闪和反推预算" ],
    "contact-search": [ "沿最后航迹搜索", "视野丢失后外推最近观测位置，不凭空知道隐藏敌人位置" ],
    "mission-approach": [ "任务目标推进", "安全时继续推进任务目标，进攻舰艇仍考虑拦截者" ],
    "gun-range": [ "远射最佳距离", "有可用远射武器时调节距离，在有效射程与命中窗口内射击" ],
    "gun-close": [ "远射劣势转近战", "远射能力或交换收益明显落后时评估近战突入，不因低稳禁止推进" ],
    "funnel-rush": [ "反浮游持续突入", "面对浮游远程压制时以斜切逼近本体，闪避后继续突入目标" ],
    "crossfire-exit": [ "离开交叉火力", "多个可观测敌人具有有效射线时避开火力汇合区" ],
    "missile-drag": [ "导弹拖曳横切", "制导弹仍有真实追踪限制时保速改变攻击轴线" ],
    "tail-break": [ "追尾主动摆脱", "提前加速、横切或滚动脱离尾部火控，安全空档才反击" ],
    "cover-ally": [ "近邻协防", "友舰请求支援且自己能及时接敌时优先驱离威胁" ],
    "formation-spacing": [ "友机避碰与协同", "避免同方扎堆，保持攻防射线和基本空间间隔" ],
    "recovery-window": [ "破稳窗口截击", "对方失稳且自己能在其恢复前接触时尝试刀战" ],
    "cooldown-counter": [ "射后空档反击", "观测到敌方刚发射并进入冷却时改变朝向抢射或逼近" ],
    "lateral-flank": [ "侧翼改轴接敌", "己方远射交换无收益时改变射线而非持续同轴对射" ],
    "pursuit-cutoff": [ "预测拦截航迹", "对方远离时按观测速度和自身推力预测交汇，不只追当前位置" ],
    "melee-reset": [ "刀战劣势重建射线", "刀战交换失利且还有远射能力时脱离接触" ],
    "post-clash-escape": [ "拼刀后保速脱离", "破稳时优先保速离开刀刃范围，未恢复格挡能力不硬拼" ],
    "return-slash": [ "回身再斩", "拼刀后自身姿态不劣且实际能够及时回身才再次斩击" ],
    "drift-window": [ "高速预判抢射", "高速且有效射程内快转确有回稳射击收益才漂移抢射" ],
    "low-speed-barrage": [ "低速窗口集中火力", "敌人低速或急刹且可用武器有射线时提高集中攻击优先级" ],
    "funnel-standoff": [ "浮游优势距离", "远程浮游占优时保持控制距离，不无故冲入刀战" ],
    "funnel-recall": [ "近战前回收浮游", "预计近战先于下一次远射收益时回收共槽浮游并切刀" ],
    "decoy-breakthrough": [ "掩护减重突破", "使用已有卸装条件和真实诱饵实体掩护近战突入" ],
    "lock-denial": ["快射威胁预判横切","根据可见敌机射向、武器准备和弹速提前比较反应加横移时间；不等火控锁成才规避，有可靠装甲或更高收益的攻击窗口时保留火力"],
    "threat-retarget": ["威胁优先改目标","突破任务目标时若被近距高火力持续瞄准，先处理有攻击窗口的威胁；不能无视危险继续冲舰"],
    "remote-intercept": ["拦截遥控终端","确认敌方遥控炮处于可见且可达的攻击窗口时，使用独立武器槽优先摧毁终端；不能直接删除弹体或终端"],
    "precision-disarm": ["旧精确卸武（停用）","已由非致命制压技能替代；此兼容键不再改变行动或指定命中部件"],
    "ambush-angle": ["隐身抢角","海市蜃楼启用且有充足能源时先移向侧翼，攻击会解除隐身"],
    "team-crossfire": ["优势兵力协同","多对少时保持近战突入、远处支援与侧翼截击分工；按武装实际收益选择，紧急防御暂时打断但不抹掉有效分工，玩家目标与撤离护航优先"],
    "counter-artillery": ["重炮空档突入","已观察到长前摇重武器且有近战与机动能力时，利用蓄能窗口斜切近身"],
    "sensor-sharing": ["僚机协同观测","4Hz传递可见敌情，烟幕内单位依据带延迟的友军报告瞄准；不穿墙索敌"],
    "parallel-fire": ["独立槽多目标火控","独立武器槽与遥控终端分配可见目标，减少对单个目标的火力浪费；不影响近战主目标"],
    "deuterion-return": ["氘核补给接近","总能源不足且同方有可用氘核供给舰时，脱离危险射线接近母舰补给"],
    "disengage-reset": [ "重伤脱离重评", "当前接敌风险大于收益且能获得安全距离时脱离重整" ]
});

export const DEFAULT_STRATEGIES = Object.freeze(Object.fromEntries(Object.keys(STRATEGY_LABELS).map(id => [ id, ['blade-entry','fixated-pursuit','last-resort-detonation','blade-cover','reckless-clearance','terminal-intercept','capture-restraint','capture-position','capture-disabled','free-ally','sensor-sharing','parallel-fire','lock-denial','threat-retarget','remote-intercept','precision-disarm','ambush-angle','counter-artillery','deuterion-return'].includes(id)?0:1 ])));

const rangedReady = (b, u, w) => !w.disabled && !w.formDisabled && w.ammo !== 0 && !isLightAutomatic(w.definition) && w.definition.kind !== "melee" && (w.definition.kind!=="funnel"||remotePermission(b,u,w.definition)||mountedRemote(b,u,w.definition)) && (w.definition.sim.powerSource !== "reactor" || u.energy >= w.definition.sim.energyCost);

const gunPower = (b, u, distance, opponent) => u.weapons.filter(w => rangedReady(b, u, w) && distance < w.definition.sim.rangeM).reduce((n, w) => {
    const s = w.definition.sim,remote=w.definition.kind==="funnel"&&remotePermission(b,u,w.definition);
    const modern=(u.pilotState.strategies?.["parallel-fire"]??0)>0,cycles=modern?(remote?Math.min(s.droneCount||1,w.definition.remoteControl?.channels??24)/Math.max(.3,s.droneFireIntervalS??1.1):s.burst/Math.max(.3,s.cooldownS||1)):1/Math.max(.3,s.cooldownS||s.cooldown||1)*(remote?Math.sqrt(s.droneCount||1):1);
    const damage=predictedProtectionCost(opponent,w.definition,s.damage*weaponDamageScale(w.definition,opponent),norm(sub(u.position,opponent.position)),distance).remainingDamage;
    return n+damage*contactDamageFactor(b,w.definition,opponent)*cycles*clamp(1-distance/s.rangeM,.1,1);
}, 0);

// One perception pass for all policies, bounded to four closest contacts and
// twelve remote threats. It uses last seen contacts, never an invisible true pose.
export function assessPilotSituation(b, u, target) {
    const c = u.pilotState.tactics, m = u.machine.sim, seen = u.contacts.get(target.id), age = seen ? b.t - seen.observedAt : Infinity;
    const position = seen ? add(seen.position, mul(seen.velocity, Math.min(age, c.strategyLookaheadS))) : b.observed(u, target);
    // A lost track is a search bearing, never permission to chase through a
    // medium this machine cannot use. Do not inspect the hidden true pose.
    if(age>1.2&&!u.machine.tags.includes('water-combat')&&!u.machine.tags.includes('all-domain')&&environmentAt(b,position).medium==='water')position[1]=Math.max(b.rules.minimumAltitudeM+30,u.machine.sim.radiusM*2);
    const delta = sub(position, u.position), distance = length(delta), toward = norm(delta), basis = bodyBasis(toward), side = basis.right;
    const velocity = seen?.velocity || [ 0, 0, 0 ], relative = sub(velocity, u.velocity), closing = -dot(relative, toward), speed = length(u.velocity), blade = b.bestBlade(u,target), funnel = u.weapons.find(w => w.definition.kind === "funnel" && !w.disabled && !w.formDisabled&&remotePermission(b,u,w.definition));
    const direct = u.weapons.filter(w => rangedReady(b, u, w) && w.definition.kind!=="melee"&&(w.definition.kind!=="funnel"||mountedRemote(b,u,w.definition)) && distance < w.definition.sim.rangeM), ownPower = gunPower(b, u, distance, target), enemyPower = age < .8 ? gunPower(b, target, distance, u) : 0;
    const contacts = [];
    for (const foe of b.enemies(u) || []) {
        const observation = u.contacts.get(foe.id);
        if (!observation || b.t - observation.observedAt > .8) continue;
        const offset = sub(u.position, observation.position), d = length(offset);
        const farthest=contacts[3];
        // Policies consume only the same nearest four dangerous contacts. Once
        // full, a farther candidate cannot change that result; skip its gun arcs.
        if(farthest&&(d>farthest.d||d===farthest.d&&foe.id.localeCompare(farthest.foe.id)>=0))continue;
        const weapon = foe.weapons.find(w => !w.disabled && !w.formDisabled && w.ammo !== 0 && w.definition.kind !== "melee" && isTacticalThreat(w.definition,u,b.rules.damageMultiplier) && d < w.definition.sim.rangeM && insideArc(observation.forward, offset, w.definition.sim));
        if (weapon) {
            contacts.push({
                foe: foe,
                position: observation.position,
                d: d,
                axis: norm(offset)
            });
            contacts.sort((a, z) => a.d - z.d || a.foe.id.localeCompare(z.foe.id));
            if (contacts.length > 4) contacts.pop();
        }
    }
    const remote = [];
    for (const d of b.drones) {
        if (d.side === u.side || d.target !== u.id || d.phase === "return" || !b.canSee(u.position, d.position) || length(sub(d.position, u.position)) > 1e4) continue;
        remote.push(d);
        if (remote.length >= 12) break;
    }
    const crossfire = contacts.reduce((n, x, i) => n + Number(contacts.some((z, j) => j < i && dot(x.axis, z.axis) < .65)), 0), threat = contacts.length + Math.min(2, remote.length / 4) + Number(!!u.missileThreat);
    const exchange = b.exchangeState(u, target.id), rangeLoss = exchange.rangedLoss - exchange.rangedGain + exchange.rangedMisses * .025, meleeLoss = exchange.meleeLoss - exchange.meleeGain;
    const health = u.structure / m.structure, energy = u.energy / m.energyCapacity, recent = (u.recentDamage || 0) * Math.exp(-(b.t - (u.lastDamageAt || 0)) / 4) / m.structure;
    const interceptCourse=blade&&meleeInterceptCourse(b,u,{position,velocity},blade.definition.sim.rangeM),availableAcceleration = m.thrustN / m.massKg * 10 * (u.components.engine || 0) * pilotControlAuthority(u), closingSeconds = interceptCourse?.feasible?interceptCourse.time:Infinity, canPush = blade && interceptCourse?.feasible && meleeAltitudeReachable(b,u,{position},blade.definition.sim.rangeM) && u.components.engine > .15 && u.energy > Math.max(15, blade.definition.sim.energyCost) + m.energyCapacity * .12;
    const duel=u.meleeIntent?.targetId===target.id,trade=bladeTrade(b,u,target,closing);
    const reserve = u.machine.sim.totalEnergy || m.energyCapacity, remaining = (u.totalEnergy ?? reserve) / reserve;
    const controlBusy = b.drones.some(d => d.owner === u.id && d.phase !== "return");
    const rushGain = age < 1.2 && (!funnel || !controlBusy && rangeLoss > c.exchangeDisadvantage) && (u.machine.powerSystem&&remote.length>=4||enemyPower > ownPower * c.rangeDisadvantageRatio || rangeLoss > c.exchangeDisadvantage || u.jettisoned || ownPower === 0 && !funnel) && canPush && distance < c.rushDistanceM && closingSeconds < c.maxRushSeconds;
    return {
        b: b,
        u: u,
        target: target,
        c: c,
        m: m,
        seen: seen,
        age: age,
        delta: delta,
        position: position,
        distance: distance,
        toward: toward,
        side: side,
        up: basis.up,
        velocity: velocity,
        relative: relative,
        closing: closing,
        speed: speed,
        blade: blade,
        funnel: funnel,
        direct: direct,
        ownPower: ownPower,
        enemyPower: enemyPower,
        remote: remote,
        crossfire: crossfire,
        threat: threat,
        contacts: contacts,
        exchange: exchange,
        rangeLoss: rangeLoss,
        meleeLoss: meleeLoss,
        health: health,
        energy: energy,
        recent: recent,
        remaining: remaining,
        availableAcceleration: availableAcceleration,
        closingSeconds: closingSeconds,
        canPush: canPush,
        duel:duel,
        trade:trade,
        rushGain: rushGain
    };
}

// Remote weapons can project force without dragging the carrier into gun range.
// Match observed radial motion once deployed; lateral motion keeps several axes open.
// Compare an imminent exchange against the currently available remote alternative.
// This uses the same impulse/output model as actual blade contact, never a scene phase.
// A weapon aimed at us is a threat, but not necessarily a tail chase. Do not
// turn a closing attack into an escape simply because both units target each other.
export function isPursuitContact(u,target,s,range){
 if(s.age>=.8||target.targetId!==u.id||s.distance>=range||s.speed<Math.max(30,s.m.maxSpeedMps*.08))return false;
 const carry=norm(u.velocity);
 return dot(s.toward,carry)<-.25&&dot(s.velocity,s.toward)<-20&&s.closing>-60;
}

export function bladeTrade(b,u,target,closing=0){
 const estimate=estimateClash(u,target,Math.max(250,closing),b.t,true);
 const opposingBlade=target.weapons.some(w=>w.definition.kind==='melee'&&!w.disabled&&!w.formDisabled&&w.ammo!==0);
 if(!opposingBlade){estimate.lossA=0;estimate.lossB=0;}
 const modularPossible=u.pilotState.traits.modularEvasion&&u.machine.moduleSystem&&u.pilotState.strategies?.['modular-counter']>0&&b.t>=(u.moduleReadyAt||0)&&u.energy>=u.machine.moduleSystem.energyCost+20;
 const counterPossible=modularPossible||u.pilotState.traits.counterThrust&&u.machine.tags.includes('multi-axis-thrusters')&&b.t>=(u.counterReadyAt||0)&&u.energy>=u.pilotState.tactics.counterThrustCost;
 const ownAfter=u.stability-estimate.lossA,enemyAfter=target.stability-estimate.lossB;
 const unsafe=ownAfter<.12&&!counterPossible;
 const blade=b.bestBlade(u,target),cutDamage=blade?.definition.sim.damage||0;
 const ranged=u.weapons.some(w=>predictedProtectionCost(target,w.definition,w.definition.sim.damage).remainingDamage>=cutDamage*.15&&!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind!=='melee'&&(w.definition.kind!=='funnel'||remotePermission(b,u,w.definition)||mountedRemote(b,u,w.definition))&&u.energy>=w.definition.sim.energyCost&&(w.definition.kind==='funnel'||w.definition.sim.damage>=cutDamage*.15));
 return {estimate,ownAfter,enemyAfter,counterPossible,unsafe,ranged,advantage:estimate.lossB-estimate.lossA,finishWindow:(!opposingBlade||enemyAfter<.12)&&!unsafe};
}
export function funnelVelocity(u, contact, delta, weapon, deployed) {
    const distance=length(delta), toward=norm(delta), side=bodyBasis(toward).right;
    const stand=Math.min(weapon.sim.rangeM*.8, weapon.sim.preferredRangeM||weapon.sim.rangeM*.5);
    const radial=clamp((distance-stand)*.3,-u.machine.sim.maxSpeedMps*.6,u.machine.sim.maxSpeedMps*.55);
    const carry=deployed?mul(contact.velocity,.85):[0,0,0];
    return add(carry,add(mul(toward,radial),mul(side,u.orbit*u.machine.sim.maxSpeedMps*.15)));
}

// Score a small set of courses from recent observations. No map-wide search and
// no hidden poses. Large weapon platforms remain route hazards outside their current arc.
export function safePilotCourse(b,u,preferred,goal=null){
 const m=u.machine.sim,carry=length(u.velocity)>60?norm(u.velocity):u.forward;
 const basis=bodyBasis(preferred),ships=[],foes=[];
 for(const foe of b.enemies(u)||[]){const contact=u.contacts.get(foe.id);if(!contact||b.t-contact.observedAt>1.2)continue;
  const distance=length(sub(contact.position,u.position));
  // Discarded contacts never enter the eight-ship/four-mobile risk score.
  if(foe.entityType==='ship'?ships.length>=8:foes.length>=4&&distance>=foes[3].distance)continue;
  let arms=foe.courseArms;if(arms?.tick!==b.tick){
   const guns=foe.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&!isLightAutomatic(w.definition)&&w.definition.kind!=='melee');
   arms=foe.courseArms={tick:b.tick,armed:guns.length>0,reach:guns.length?Math.max(...guns.map(w=>Math.min(w.definition.sim.rangeM,w.definition.sim.effectiveRangeM||w.definition.sim.rangeM))):0,power:guns.length?Math.max(...guns.map(w=>w.definition.sim.damage/Math.max(1,w.definition.sim.cooldownS+w.definition.sim.windupS))):0};
  }
  if(!arms.armed)continue;const item={foe,contact,distance,reach:arms.reach,power:arms.power};
  if(foe.entityType==='ship')ships.push(item);else{foes.push(item);foes.sort((a,z)=>a.distance-z.distance);if(foes.length>4)foes.pop();}
 }
 foes.sort((a,z)=>a.distance-z.distance);
 const threats=[...ships.slice(0,8),...foes.slice(0,4)].map(x=>{const rel=sub(u.position,x.contact.position);return {...x,rel,large:x.foe.entityType==='ship',now:length(rel),velocity:mul(x.contact.velocity,6),ray:insideArc(x.contact.forward,mul(rel,-1),x.foe.weapons.find(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&!isLightAutomatic(w.definition)&&w.definition.kind!=='melee').definition.sim)};}),horizon=6;
 const candidates=[preferred,carry,norm(add(preferred,mul(basis.right,1.5))),norm(add(preferred,mul(basis.right,-1.5))),norm(add(preferred,mul(basis.up,.65))),norm(add(preferred,mul(basis.up,-.65)))];
 if(u.routeCourse&&b.t<u.routeCourse.until)candidates.push(u.routeCourse.heading);
 const score=heading=>{
  const travel=mul(heading,m.maxSpeedMps*horizon),alignment=dot(heading,preferred),inertia=dot(heading,carry);
  let risk=0;for(const x of threats){const rel=x.rel,drift=sub(travel,x.velocity);
   const t=clamp(-dot(rel,drift)/Math.max(1,dot(drift,drift)),0,1),near=length(add(rel,mul(drift,t))),now=x.now,large=x.large;
   const envelope=x.reach*(large?1.25:1),inside=clamp(1-near/Math.max(300,envelope),0,1);
   const ray=x.ray;
   risk+=inside*(large?3:ray?1.1:.35)*clamp(x.power/40,.4,2)+(large&&near<now?inside*.8:0);
  }
  return alignment*.9+inertia*.2-risk;
 };
 // Detours toward a destination must still make progress. A previously safe
 // coasting axis pointing away from the exit cannot become a permanent route.
 const courses=goal?candidates.filter(heading=>dot(heading,preferred)>.25):candidates;
 const ranked=courses.map(heading=>({heading,score:score(heading)})).sort((a,z)=>z.score-a.score);
 const old=u.routeCourse&&b.t<u.routeCourse.until?ranked.find(x=>x.heading===u.routeCourse.heading):null;
 const best=old&&old.score>=ranked[0].score-.12?old:ranked[0];
 u.routeCourse={heading:best.heading,until:b.t+.8};return best.heading;
}

// Estimate reachable defense from recent observations; never inspect a hidden aim point.
export function defenseWindow(b,u,target){
 const seen=u.contacts.get(target.id);if(!seen||b.t-seen.observedAt>.8)return null;
 const delta=sub(seen.position,u.position),distance=length(delta),axis=norm(delta),closing=Math.max(0,-dot(sub(seen.velocity,u.velocity),axis));
 const p=u.pilotState.sim,m=u.machine.sim,c=u.pilotState.tactics;
 const reaction=p.reactionS*(1+(1-u.components.sensor)*.4+(1-p.composure)*.2);
 const budget=affordableManeuver(u,c.dodgeThrustMultiplier,emergencyPulseSeconds(u,b.rules.stepSeconds),b.environment.medium,true);
 const acceleration=m.thrustN/m.massKg*budget.multiplier*pilotControlAuthority(u)*u.components.engine*clamp(u.energy/12)*u.machine.mobility.accel.lateral;
 const dodgeCost=m.dodgeEnergyCost??5,clearance=m.radiusM+5,moveS=Math.sqrt(2*clearance/Math.max(1,acceleration));
 const energyReady=u.energy>=dodgeCost&&budget.multiplier>10,beams=target.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind==='beam'&&distance<w.definition.sim.rangeM&&insideArc(w.definition.turret?(w.turretForward||seen.forward):seen.forward,mul(delta,-1),w.definition.sim)&&predictedProtectionCost(u,w.definition,w.definition.sim.damage*(b.rules.damageMultiplier||1),axis).remainingDamage>Math.max(8,u.structure*.04));
 const exposure=beams.some(w=>{const until=w.attack?Math.max(0,w.attack.at-b.t):Math.max(0,w.readyAt-b.t)+w.definition.sim.windupS;return until+distance/Math.max(1,w.definition.sim.projectileSpeedMps)<reaction+moveS+b.rules.stepSeconds;});
 const blade=target.weapons.find(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind==='melee'),contact=blade?Math.max(0,(distance-blade.definition.sim.rangeM)/Math.max(1,closing)):Infinity;
 const bladeRisk=!!blade&&(target.order==='melee'||blade.attack||target.swing)&&contact<reaction+moveS+.65;
 const proactiveBudget=affordableManeuver(u,Math.min(c.dodgeThrustMultiplier,Math.max(c.tailThrustMultiplier,40)),.65,b.environment.medium);
 return {axis,distance,closing,reaction,moveS,dodgeCost,energyReady,proactiveBudget,proactiveReady:proactiveBudget.multiplier>=10,exposure,bladeRisk,contact,budget};
}

// A target assignment is only useful if the carrier can put a weapon in range.
// Preserve the rendezvous while crossing incoming fire; defense remains interruptible.
export function supportApproach(b,u,target){
 const intent=u.supportIntent,ally=intent&&b.unitById.get(intent.allyId),seen=u.contacts.get(target.id);
 if(intent?.targetId!==target.id||!ally?.alive||ally.side!==u.side||!seen||b.t-seen.observedAt>.8)return null;
 const m=u.machine.sim,available=u.weapons.filter(w=>rangedReady(b,u,w));
 const reach=Math.max(0,...available.map(w=>w.definition.sim.effectiveRangeM||w.definition.sim.rangeM))*.85;
 const delta=sub(seen.position,u.position),distance=length(delta);
 if(!reach||u.components.engine<=.1||u.energy<m.energyCapacity*u.pilotState.tactics.lowReserveFraction)return null;
  const guard=escortObjective(b,u),goal=guard&&navigationGoal(b,guard),onScreen=guard?.id===ally.id&&goal&&length(sub(guard.position,goal.point))>goal.radiusM;
  if(onScreen){
   const blade=b.bestBlade(u,target),closing=Math.max(0,-dot(sub(seen.velocity,u.velocity),norm(delta)));
   if(blade&&distance<=blade.definition.sim.rangeM+closing*1.5+180)return null;
   return escortScreenCourse(b,u,ally,seen);
  }
  if(distance<=reach)return null;
 const horizon=clamp((distance-reach)/Math.max(1,m.maxSpeedMps),0,u.pilotState.tactics.strategyLookaheadS);
 const route=sub(add(seen.position,mul(seen.velocity,horizon)),u.position),desired=mul(norm(route),m.maxSpeedMps*.95);
 const correction=sub(desired,u.velocity);
 return {order:'supportApproach',heading:length(correction)>30?norm(correction):norm(route),desired,flightMode:'normal'};
}

export function bladeSupportCourse(b,u,target){
 const intent=u.supportIntent,command=u.commandAssignment,seen=u.contacts.get(target.id),blade=b.bestBlade(u,target);
 const stroke=target.weapons.find(w=>w.definition.kind==='melee'&&w.attack)?.attack;
 const threatenedId=target.swing?.targetId||stroke?.targetId||target.targetId;
 const ally=b.unitById.get(intent?.allyId||command?.allyId||threatenedId);
 if(!(u.pilotState.strategies?.['blade-cover']>0)||!blade||!ally?.alive||ally===u||ally.side!==u.side||!seen||b.t-seen.observedAt>.5||u.energy<u.machine.sim.dodgeEnergyCost||u.components.engine<.3)return null;
 if((intent?.targetId||command?.targetId)!==target.id&&threatenedId!==ally.id)return null;
 const allyDelta=sub(ally.position,seen.position),distance=length(allyDelta),enemyBlade=target.weapons.find(w=>!w.disabled&&!w.formDisabled&&w.definition.kind==='melee');if(!enemyBlade)return null;
 const closing=Math.max(0,dot(sub(seen.velocity,ally.velocity),norm(allyDelta))),time=Math.max(0,distance-enemyBlade.definition.sim.rangeM)/Math.max(1,closing);
 const imminentApproach=target.targetId===ally.id&&closing>80&&time<u.pilotState.tactics.strategyLookaheadS&&dot(norm(seen.velocity),norm(allyDelta))>.3;
  const contact=target.swing?.targetId===ally.id||stroke?.targetId===ally.id||target.order==='melee'&&target.targetId===ally.id&&time<2||imminentApproach;
 if(!contact||distance>enemyBlade.definition.sim.rangeM+Math.max(180,closing*2))return null;
 const axis=norm(allyDelta),deadline=Math.min(2,Math.max(.15,time)+.35),reaction=u.pilotState.sim.reactionS;
 const horizon=Math.max(0,deadline-reaction),point=add(add(seen.position,mul(seen.velocity,deadline)),mul(axis,Math.min(distance*.5,enemyBlade.definition.sim.rangeM*.6))),delta=sub(point,u.position);
 const motor=contactMotor(b,u),mm=motor.machine.sim;
 const radial=dot(u.velocity,norm(delta)),accel=mm.thrustN/mm.massKg*10*pilotControlAuthority(u)*motor.components.engine;
 // The ally can be covered from the defender's real blade reach; matching
 // the attacker's hull center is unnecessary and would reject a valid parry.
 const reach=Math.max(u.machine.sim.radiusM,blade.definition.sim.rangeM);
 // The policy lookahead cannot extend an ally's physical contact deadline.
 const travel=Math.min(mm.maxSpeedMps*horizon,Math.max(0,radial*horizon+.5*accel*horizon*horizon));
 if(length(delta)>reach+travel)return null;
 const desired=add(seen.velocity,mul(norm(delta),Math.min(mm.maxSpeedMps*.95,length(delta)/Math.max(.1,horizon))));
 return {order:'bladeCover',heading:norm(sub(add(seen.position,mul(seen.velocity,Math.min(.2,deadline))),u.position)),desired,flightMode:'normal',allyId:ally.id,deadline};
}

function path(s, mode) {
    const {u: u, m: m, toward: toward, side: side, velocity: velocity, delta: delta, distance: distance} = s, carry = s.speed > 60 ? norm(u.velocity) : u.forward;
    if(mode==='capture')return s.capturePlan;
    if(mode==='blade-support')return s.bladeSupportPlan;
    if(mode==='support')return s.supportPlan;
    if(mode==='shield'){return {order:'shieldGuard',heading:s.shieldBearing||toward,desired:[...u.velocity],flightMode:'coast'};}
    if(mode==='escape-boost')return {order:'pursuitBoost',heading:carry,desired:mul(carry,m.maxSpeedMps)};
    if(mode==='backfire'||mode==='reserve-fire'){
      return {order:'trailingFire',heading:toward,desired:[...u.velocity],flightMode:'coast'};
    }
    if(mode==='avoid-blade'){
      const axis=s.b.chooseEscape(u,s.target,'melee',mul(toward,-1),null,.3),heading=norm(add(mul(carry,.7),mul(axis,.8)));
      return {order:'bladeEvade',heading,desired:mul(heading,m.maxSpeedMps)};
    }
    if(mode==='deny'){
      const intercept=s.capturePlan||s.capturePosition||s.supportPlan;
      if(intercept){
        // A defensive sidestep need not abandon a reachable interception. Carry
        // the rendezvous velocity while crossing its approach axis; reactions
        // can still interrupt it, and no contact/capture is granted here.
        const desired=add(intercept.desired,mul(side,u.orbit*Math.min(m.maxSpeedMps*.25,Math.max(30,distance*.08))));
        return {order:'flank',heading:intercept.heading,desired,flightMode:'normal'};
      }
      if(s.rushGain&&s.canPush&&!s.trade.unsafe&&u.controller!=='survive'&&!u.withdrawing&&!groundLimited(s.b,u)){
        const approach=path(s,'rush'),desired=add(approach.desired,mul(side,u.orbit*m.maxSpeedMps*.2));
        return {...approach,order:'closeAngle',desired,flightMode:'normal'};
      }
      const route=commandRouteGoal(s.b,u);
      if(route&&length(sub(route.point,u.position))>route.radiusM){
        const axis=safePilotCourse(s.b,u,norm(sub(route.point,u.position)),route),heading=norm(add(axis,mul(side,u.orbit*.4)));
        return {order:'flank',heading,desired:mul(heading,m.maxSpeedMps*.95),flightMode:'normal'};
      }
      // Keep one crossing direction for the maneuver; do not flip every sine half-cycle.
      if(groundLimited(s.b,u)&&s.direct.some(w=>w.definition.turret))return groundGunCourse(s,true);
       const lateral=mul(side,u.orbit);
      // This is a defensive change of course, not a reason to aim back at the pursuer.
      // Keep escape momentum while crossing the predicted ray; guns get their own window.
      const leaving=u.operationalPlan?.mode==='escape'||dot(carry,toward)<-.3;
      const heading=norm(add(mul(carry,leaving?.85:.55),add(mul(lateral,.55),mul(toward,leaving?0:.15))));
      return {order:'flank',heading,desired:mul(heading,m.maxSpeedMps*.95)};
    }
    if(mode==='remote'){
      const d=remoteOpportunities(s.b,u)[0]?.d;
      if(d){const motion=s.rushGain?path(s,'rush'):{desired:[...u.velocity],flightMode:'coast'};return {...motion,order:'counter',heading:s.rushGain?motion.heading:norm(sub(add(d.position,mul(d.velocity,.12)),u.position))};}
    }
    if(mode==='supply'){
        const ship=(s.b.spatial.sides[u.side]||[]).filter(a=>a.alive&&a.machine.powerSystem?.supplyRate>0).sort((a,z)=>length(sub(a.position,u.position))-length(sub(z.position,u.position)))[0];
        if(ship){const delta=sub(add(ship.position,mul(ship.forward,Math.min(800,ship.machine.powerSystem.supplyRangeM*.4))),u.position),near=length(delta)<200;
        return {order:'cool',heading:near?ship.forward:norm(delta),desired:near?ship.velocity:add(ship.velocity,mul(norm(delta),Math.min(m.maxSpeedMps*.6,length(delta)*.5)))};}
    }
    if (mode === "recover") return {
        order: "recover",
        heading: s.duel ? s.toward : u.forward,
        desired: s.duel ? mul(u.velocity,.65) : [...u.velocity],
        flightMode: s.duel ? "normal" : "coast"
    };
    if (mode === "combat-recover") {
        const heading = s.duel ? s.toward : u.forward;
        return {
            order: "combatRecover",
            heading: heading,
            desired: s.duel ? mul(u.velocity,.65) : mul(s.speed > m.maxSpeedMps * .18 ? carry : heading, m.maxSpeedMps * s.c.threatCruiseFraction)
        };
    }
    if(mode==='search'){
      const approach=distance>180?Math.min(m.maxSpeedMps*.6,distance*.8):Math.min(80,distance*.4);
      return {order:'acquire',heading:distance>20?toward:u.forward,desired:mul(toward,approach),flightMode:'normal'};
    }
    if(mode==='team-support'){
        const guns=s.direct.filter(w=>w.definition.kind!=='funnel'),stand=Math.max(300,Math.min(2500,...guns.map(w=>w.definition.sim.preferredRangeM))),radial=clamp((distance-stand)*.45,-m.maxSpeedMps*.35,m.maxSpeedMps*.6);
        return {order:'screen',heading:toward,desired:add(mul(velocity,.8),add(mul(toward,radial),mul(side,(u.coordinationPlan?.wingSide||u.orbit)*m.maxSpeedMps*.12))),flightMode:'normal'};
    }
    if(mode==='pincer'){
        const ally=(s.b.spatial.sides[u.side]||[]).find(a=>a!==u&&a.alive&&a.targetId===s.target.id&&!a.docked),lead=add(delta,mul(velocity,Math.min(2.5,distance/Math.max(1,m.maxSpeedMps))));
        const bearing=ally?dot(sub(ally.position,s.position),side):u.orbit;
        const offset=mul(side,(u.coordinationPlan?.wingSide??(bearing>=0?-1:1))*Math.min(450,distance*.28)),heading=norm(add(lead,offset));
        return {order:'flank',heading,desired:mul(heading,m.maxSpeedMps*.97),flightMode:'normal'};
    }
    if (mode === "rush" || mode === "intercept") {
        if(mode==='rush'&&s.blade&&distance<s.blade.definition.sim.rangeM*2.5){
          const axis=norm(delta),relative=sub(u.velocity,velocity),lateral=sub(relative,mul(axis,dot(relative,axis))),braking=m.thrustN/m.massKg*10*u.machine.mobility.brakeMultiplier;
          const close=clamp(Math.sqrt(2*braking*Math.max(0,distance-s.blade.definition.sim.rangeM*.65)),80,m.maxSpeedMps*.85);
          return {order:'melee',heading:axis,desired:sub(add(velocity,mul(axis,close)),mul(lateral,.3))};
        }
        const course=meleeInterceptCourse(s.b,u,{position:add(u.position,delta),velocity},s.blade?.definition.sim.rangeM||0);
        if(mode==='rush'&&!course.feasible)return path(s,s.direct.length?'gun':'flank');
        const travel = clamp(course.feasible?course.time:s.closingSeconds, 0, s.c.strategyLookaheadS), lead = course.feasible?sub(course.point,u.position):add(delta, mul(velocity, travel * .65)), offset = mode === "rush" ? mul(side, u.orbit * Math.min(100, distance * .06)) : mul(side, 0);
        const heading = norm(add(lead, offset));
        return {
            order: mode === "rush" ? distance < s.c.meleeCommitM ? "melee" : "closeAngle" : "approach",
            heading: heading,
            desired: course.feasible?sub(mul(heading,course.speed),mul(sub(u.velocity,mul(heading,dot(u.velocity,heading))),.08)):sub(add(mul(velocity,.6),mul(heading,m.maxSpeedMps*.9)),mul(sub(u.velocity,mul(toward,dot(u.velocity,toward))),.25))
        };
    }
    if(mode==='missile-drag'){
      const route=commandRouteGoal(s.b,u),carry=route?mul(norm(sub(route.point,u.position)),m.maxSpeedMps):u.velocity;
      const heading=norm(add(carry,mul(s.missileAxis,m.maxSpeedMps*.65)));
      return {order:'missileBreak',heading,desired:mul(heading,m.maxSpeedMps),flightMode:'normal'};
    }
    if(mode==='capture-position')return s.capturePosition;
    if(mode==='retreat'){
        const goal=u.withdrawalCandidate,route=sub(goal.point,u.position),heading=safePilotCourse(s.b,u,norm(route),goal);
        // A weak buffer limits route correction rather than freezing a wrong velocity
        // until an arbitrary reserve threshold is reached. Actual thrust still pays.
        const driveCost=maneuverEnergyCost(u,10,.6,s.b.environment.medium);
        const fraction=u.components.engine<=.05?0:clamp(u.energy*.65/Math.max(1,driveCost));
        const cruise=mul(heading,Math.min(m.maxSpeedMps*.95,length(route)*1.2));
        return {order:'disengage',heading,desired:add(u.velocity,mul(sub(cruise,u.velocity),fraction)),flightMode:fraction>.03?'normal':'coast'};
    }
    if(mode==='transit'){
        const goal=navigationGoal(s.b,u),route=sub(goal.point,u.position),course=safePilotCourse(s.b,u,norm(route),goal);
        const speed=dot(u.velocity,course),guns=s.direct.filter(w=>w.definition.kind!=='funnel'&&distance<w.definition.sim.effectiveRangeM&&predictedProtectionCost(s.target,w.definition,w.definition.sim.damage*(s.b.rules.damageMultiplier||1)).remainingDamage>s.target.structure*.015);
        const firingWindow=s.age<.6&&speed>m.maxSpeedMps*.6&&s.energy>u.pilotState.tactics.energyReserveFraction&&guns.some(w=>w.attack||w.salvo||s.b.t>=w.readyAt);
        // Translate along the mission course; only spend the already established
        // inertia on a useful passing shot. Slow ships return to their thrust axis.
        const heading=firingWindow?toward:course;
        return {order:'missionTransit',heading,desired:mul(course,Math.min(m.maxSpeedMps*.95,Math.max(0,length(route)-goal.radiusM*.5)*1.2)),flightMode:firingWindow?'coast':'normal'};
    }
    if(mode==='withdraw'){
        const goal=navigationGoal(s.b,u),route=sub(goal.point,u.position),heading=safePilotCourse(s.b,u,norm(route),goal);
        return {order:'disengage',heading,desired:mul(heading,Math.min(m.maxSpeedMps*.95,length(route)*1.2))};
    }
    if (mode === "escape") {
        if(groundLimited(s.b,u)&&s.direct.some(w=>w.definition.turret))return groundGunCourse(s,true);
        const heading = safePilotCourse(s.b,u,norm(add(add(mul(toward, -1), mul(carry, .45)), mul(side, u.orbit * .4))));
        return {
            order: "disengage",
            heading: heading,
            desired: mul(heading, m.maxSpeedMps)
        };
    }
    if (mode === "crossfire") {
        if(s.supportPlan&&u.controller==='escort'){
         // A flank is a short offset around the interception station, not an
         // unlimited flight toward the escort's later recovery waypoint.
         const correction=sub(s.supportPlan.desired,u.velocity),desired=add(s.supportPlan.desired,mul(side,u.orbit*m.maxSpeedMps*.14));
         return {order:'crossfireExit',heading:length(correction)>m.maxSpeedMps*.18?norm(correction):toward,desired,flightMode:'normal'};
        }
        const danger = s.contacts.reduce((a, x) => add(a, mul(x.axis, 1 / Math.max(300, x.d))), [ 0, 0, 0 ]), heading = safePilotCourse(s.b,u,norm(add(add(mul(norm(danger), .8), mul(carry, .6)),mul(side,u.orbit*.9))));
        return {
            order: "crossfireExit",
            heading: heading,
            desired: mul(heading, m.maxSpeedMps)
        };
    }
    if (mode === "flank") {
        if(groundLimited(s.b,u)&&s.direct.some(w=>w.definition.turret))return groundGunCourse(s,true);
        const heading = norm(add(toward, mul(side, u.orbit * .65)));
        return {
            order: "flank",
            heading: heading,
            desired: mul(heading, m.maxSpeedMps * .85)
        };
    }
    if (mode === "energy") {
        // Preserve an established closing trajectory while recharging. Turning away
        // and braking spends the very buffer this policy is trying to save.
        if(s.duel && dot(u.velocity,toward)>0 && !s.trade.unsafe)return {order:'cool',heading:u.forward,desired:[...u.velocity],flightMode:'coast'};
        const exhausted=u.energy<Math.max(m.dodgeEnergyCost,m.energyCapacity*s.c.energyReserveFraction,u.defenseEnergyReserve||0);
        const turretGround=groundLimited(s.b,u)&&s.direct.some(w=>w.definition.turret);
        const heading = turretGround?u.forward:s.threat&&!exhausted ? norm(add(mul(toward, -.6), mul(carry, 1.2))) : u.forward;
        return {
            order: s.threat ? "energyEscape" : "cool",
            heading: heading,
            desired: s.threat&&!exhausted ? mul(heading, m.maxSpeedMps * .55) : [ ...u.velocity ],
            flightMode: s.threat&&!exhausted ? "normal" : "coast"
        };
    }
    if (mode === "funnel") {
        return {
            order: "funnel-control",
            heading: toward,
            desired: funnelVelocity(u, {velocity}, delta, s.funnel.definition, s.u.weapons.some(w=>w.definition.kind==="funnel"&&w.deployed))
        };
    }
    if (mode === "gun") {
        if(groundLimited(s.b,u))return groundGunCourse(s,false);
         const w = s.direct.reduce((a, w) => !a || w.definition.sim.damage > a.definition.sim.damage ? w : a, null), best = w?.definition.sim.preferredRangeM || 1800;
        return {
            order: "aim",
            heading: dot(u.forward, toward) > .98 ? u.forward : toward,
            desired: add(mul(velocity, .7), add(mul(toward, clamp((distance - best) * .5, -m.maxSpeedMps * .55, m.maxSpeedMps * .8)), mul(side, u.orbit * m.maxSpeedMps * .12)))
        };
    }
    return {
        order: "approach",
        heading: toward,
        desired: mul(toward, m.maxSpeedMps * .8)
    };
}

// Ground mounts can fire independently of the chassis: retain body heading while
// crossing the enemy's firing axis and use actual terrain motor limits to manage range.
// A hand-held weapon keeps facing the observed target. No unit or story IDs here.
export function groundGunCourse(s,defensive=false){
 const {b,u,m,distance,toward,side,velocity}=s,limit=motionSpeedLimit(b,u),guns=s.direct;
 const state=guns.reduce((best,w)=>!best||w.definition.sim.damage>best.definition.sim.damage?w:best,null);
 const weapon=state?.definition.sim,bestRange=Math.min(weapon?.preferredRangeM||1800,(weapon?.effectiveRangeM||2400)*.8);
 const radial=clamp((distance-bestRange)*.35,-limit*.55,limit*.6);
 const lateral=limit*(defensive?.8:.35)*u.orbit;
 const desired=add(mul(velocity,.5),add(mul(toward,radial),mul(side,lateral)));
 desired[1]=0;
 const turret=state?.definition.turret;
 const heading=turret?u.forward:toward;
 return {order:defensive?'flank':'aim',heading:[...heading],desired,flightMode:'normal'};
}

// Conditions first, utility second. Dice only resolves nearly equal valid choices.
// The transient plan survives a reactive dodge, but every reassessment can break
// it for safety, target loss or a substantially better opportunity.
export function choosePilotStrategy(b, u, target, base) {
    if (u.policyEnabled === false || !target?.alive || !u.combatant || u.entityType === "ship" || u.controller === "simple") return null;
    if (b.t < u.evadeUntil || u.suppressing) {
        u.strategySuspended = true;
        return null;
    }
    const s = assessPilotSituation(b, u, target), {c: c, m: m, distance: distance, threat: threat, canPush: canPush, rushGain: rushGain} = s, choices = [];
    if (u.operationalTarget !== target.id) {
        u.operationalTarget = target.id;
        u.captureStation = null;
        u.captureIntent = null;
        u.grappleContactSince = null;
        u.operationalPlan = null;
        u.strategyFailures = {};
    }
    u.strategyFailures??={};
    const expired=u.operationalPlan;
    if(expired&&b.t>=expired.until){
        const gain=expired.mode==='rush'?expired.distance-distance:expired.mode==='escape'?distance-expired.distance:0;
        if(['rush','escape'].includes(expired.mode))u.strategyFailures[expired.id]=gain>Math.max(60,expired.distance*.05)?0:Math.min(3,(u.strategyFailures[expired.id]||0)+1);
        u.operationalPlan=null;
    }
    const weights = u.pilotState.strategies || DEFAULT_STRATEGIES,survival=u.controller==='survive'&&u.commandAssignment?.source!=='player';
    const addChoice = (id, valid, score, mode, reason, extra = {}) => {
        const styleBonus=(mode==='rush'&&u.pilotState.tags?.includes('assault-specialist')&&s.energy>.2&&!s.trade.unsafe)?1.18:1;
        const gunFit=['gun-range','low-speed-barrage','drift-window'].includes(id)&&s.blade?clamp(s.ownPower/Math.max(8,s.blade.definition.sim.damage*.12),.15,1):1;
        const held=u.coordinationPlan?.targetId===target.id&&b.t<u.coordinationPlan.until?u.coordinationPlan:null;
        const contactDeadline=s.blade&&distance<s.blade.definition.sim.rangeM+Math.max(0,s.closing)*(u.pilotState.sim.reactionS+.5)+100;
        // Team roles narrow ordinary offensive choices. Actual contact, emergency
        // defense, energy and mission deadlines still compete without this penalty.
        const roleFit=!held||id==='team-crossfire'||contactDeadline?1:held.role==='assault'&&mode==='gun'?.3:held.role!=='assault'&&['rush','intercept'].includes(mode)?.25:1;
        const weight=(weights[id]??DEFAULT_STRATEGIES[id])*styleBonus*gunFit*roleFit;
        if (!valid || !(weight > 0)) return;
        choices.push({
            id: id,
            priority: 0,
            score: (id==='mission-retreat'&&u.withdrawing?Math.max(score,80):score) * weight * (survival?(['rush','intercept','capture'].includes(mode)?.8:['energy','escape','crossfire','deny','avoid-blade','missile-drag'].includes(mode)?1.35:1):1) * (['energy-reserve','deuterion-return'].includes(id)?1+(u.pilotState.capabilities?.energyDiscipline??0)*.2:1) / (1 + (u.strategyFailures?.[id] || 0) * .3),
            mode: mode,
            reason: reason,
            ...extra
        });
    };
    const shield=u.machine.defenses?.map((d,index)=>({d,index})).find(x=>x.d.type==='shield'&&(!u.defenseEnabledIndices||u.defenseEnabledIndices.has(x.index))&&(u.defenseIntegrity?.[x.index]??x.d.capacity??0)>20);
    if(shield){let bestShield=null;
      const consider=(foe,weapon,bearing,arrival)=>{
        const w=weapon.definition||weapon,raw=w.sim.damage*(b.rules.damageMultiplier||1);
        if(w.kind==='melee'||raw<20)return;
        const angle=Math.acos(clamp(dot(u.forward,bearing),-1,1)),turn=Math.max(0,angle-shield.d.arcDeg*Math.PI/180*.65)/Math.max(.1,m.turnRateDeg*Math.PI/180*pilotControlAuthority(u)*u.components.engine*clamp(u.energy/12));
        const capacity=u.defenseIntegrity?.[shield.index]??shield.d.capacity,absorb=w.kind==='beam'?shield.d.beamStrength:shield.d.strength;
        const forecast=predictedProtectionCost({...u,forward:bearing},w,raw,bearing);
        if(absorb>=.6&&arrival>=turn&&capacity>=raw*absorb*.5&&forecast.remainingDamage<raw*.4&&(!bestShield||raw>bestShield.damage))bestShield={bearing,damage:raw};
      };
      for(const contact of s.contacts){const foe=contact.foe,seen=u.contacts.get(foe.id);if(!seen||b.t-seen.observedAt>.6)continue;
        for(const weapon of foe.weapons){if(!weapon.attack||weapon.attack.targetId!==u.id)continue;
          const delta=sub(seen.position,u.position),arrival=Math.max(0,weapon.attack.at-b.t)+length(delta)/Math.max(1,weapon.definition.sim.projectileSpeedMps);
          consider(foe,weapon,norm(delta),arrival-u.pilotState.sim.reactionS);
        }
      }
      // A visible emitted shot still threatens the hull after its charge disappears.
      for(const shot of b.projectiles){if(shot.target!==u.id||shot.side===u.side||shot.kind==='melee')continue;
        const delta=sub(shot.position,u.position),relative=sub(shot.velocity,u.velocity),travel=-dot(delta,relative)/Math.max(1,dot(relative,relative));
        if(travel<0||travel>1.5||length(add(delta,mul(relative,travel)))>m.radiusM+shot.weapon.blastRadiusM||length(delta)>m.sensorRangeM*u.components.sensor||!b.canSee(u.position,shot.position))continue;
        consider(null,{kind:shot.kind,sim:shot.weapon},norm(mul(shot.velocity,-1)),travel);
      }
      if(bestShield){s.shieldBearing=bestShield.bearing;addChoice('shield-coast',u.energy<Math.max(m.dodgeEnergyCost*1.5,m.energyCapacity*c.energyReserveFraction*1.5)||s.threat>1||bestShield.damage>u.structure*.5,(u.energy<m.energyCapacity*.12?30:12)+Math.min(36,bestShield.damage/Math.max(1,u.structure)*24),'shield','有限盾耐久可覆盖已观察的攻击，保留惯性和急闪能源',{priority:u.energy<m.energyCapacity*.12?3:1});}
    }
    s.bladeSupportPlan=bladeSupportCourse(b,u,target);
    s.supportPlan=supportApproach(b,u,target);
    addChoice('cover-ally',!!s.supportPlan,14,'support','先截击到实际援护射程，不能把远程盘旋当成有效支援',{priority:1});
    s.capturePosition=capturePosition(b,u,target);
    addChoice('capture-position',!!s.capturePosition&&s.health>.5&&s.energy>Math.min(c.energyReserveFraction,(u.machine.grappleSystem.energyPerS*3+m.dodgeEnergyCost)/m.energyCapacity),10,'capture-position','友军已压制目标且本机具备捕获意图，提前靠近侧翼匹配航速',{priority:1});
    s.capturePlan=grappleApproach(b,u,target);
    if (!s.capturePlan) {u.captureIntent = null;u.grappleContactSince = null;}
    addChoice('last-resort-detonation',!!s.capturePlan&&desperateCapture(b,u,target),40,'capture','自身常规武装已无力继续，比较可达抓抱与最后接触爆破',{priority:3});
    // A live capture opportunity competes with attacking the same victim. Its
    // value rises as real rendezvous time falls; defense can still interrupt it.
    const captureHorizon = distance / Math.max(1, m.maxSpeedMps);
    addChoice('capture-disabled',!!s.capturePlan&&s.health>.25,
        18 + 12 * clamp(1 - captureHorizon / 4), 'capture',
        '观察到装甲停机或推进失效，按真实接近距离比较捕获与杀伤收益',
        {priority:captureHorizon < u.pilotState.sim.reactionS + 1 ? 1 : 0});
    const recovering = u.stability < ([ "safe-recovery", "combat-recovery" ].includes(u.lastStrategyId) ? c.recoveryExitStability : .16) || b.t < (u.meleeBreakUntil || 0), contactSoon = s.blade && distance < s.blade.definition.sim.rangeM + Math.max(0, s.closing) * (u.pilotState.sim.reactionS + .4), broken = b.t < (u.meleeBreakUntil || 0);
    const tail = b.tailPressure(u, target), safeWindow = (u.observedCooldownUntil || 0) > b.t + u.pilotState.sim.reactionS + .4;
    const caps=u.pilotState.capabilities||{},ally=(b.spatial.sides[u.side]||[]).filter(a=>a!==u&&a.alive&&a.targetId===target.id&&!a.docked&&['ms','ma'].includes(a.entityType)&&a.energy>a.machine.sim.energyCapacity*.15).sort((a,z)=>length(sub(a.position,s.position))-length(sub(z.position,s.position))||a.id.localeCompare(z.id))[0],supply=(b.spatial.sides[u.side]||[]).find(a=>a.alive&&a.machine.powerSystem?.supplyRate>0&&a.totalEnergy>a.machine.sim.energyCapacity*2);
    const routeActive=!!navigationGoal(b,u);
    const defense=defenseWindow(b,u,target),snapThreat=s.contacts.some(x=>defenseWindow(b,u,x.foe)?.exposure);
    const ownWindow=s.direct.some(w=>w.definition.sim.damage>=25&&w.fireControl?.locked&&(w.attack||w.salvo||b.t>=w.readyAt)&&u.stability>.75&&insideArc(w.turretForward||u.forward,s.delta,w.definition.sim));
    const dangerous=snapThreat&&(s.recent>.02||s.health<.6||recovering||s.crossfire>0);
    addChoice('survival-spacing',survival&&s.age<1.2&&(s.recent>.04||s.crossfire>=c.crossfireTolerance||threat>0&&(snapThreat||s.health<.65||s.energy<c.energyReserveFraction)||distance<1400&&s.trade.unsafe)&&!ownWindow,19+threat*2,'escape','生存偏好提高脱离风险的收益，仍比较全局任务和反击机会');
    addChoice('blade-cover',!!s.bladeSupportPlan&&!broken,24,'blade-support','近战危机可达，侧向切入保护友机并承担真实接触风险',{priority:2});
    addChoice('lock-denial',snapThreat&&defense?.proactiveReady&&u.components.engine>.1&&!contactSoon&&(!ownWindow||dangerous),17,'deny','快射到达早于反应加真实横移所需时间，提前改变瞄点',{priority:routeActive?2:dangerous?1:0});
    addChoice('pressure-jink',threat>0&&!safeWindow&&snapThreat&&(s.recent>.04||recovering)&&defense?.proactiveReady&&!contactSoon,23,'deny','当前直线回稳仍在有效射线内，保留惯性主动横切',{priority:1});
    const missile=u.missileThreat;
    if(missile&&missile.tti>u.pilotState.sim.reactionS&&missile.tti<=c.missileWarningS){s.missileBudget=affordableManeuver(u,Math.min(c.dodgeThrustMultiplier,50),.5,b.environment.medium,false);if(s.missileBudget.multiplier>=10)s.missileAxis=b.chooseEscape(u,b.unitById.get(missile.owner)||target,'missile',missile.direction,missile,Math.min(.38,missile.tti-u.pilotState.sim.reactionS));}
    addChoice('missile-drag',!!s.missileAxis&&!contactSoon,28,'missile-drag','已观察的导弹群仍能追上当前航迹，提前持续横切再保留末段急闪',{priority:u.withdrawing?5:s.energy>.12?2:0});
    addChoice('blade-denial',defense?.bladeRisk&&s.trade.unsafe&&defense.proactiveReady,30,'avoid-blade','预测拼刀会破稳，趁接触前离开刀刃路径',{priority:2});
    addChoice('remote-intercept',caps.spatialAwareness>.75&&remoteOpportunities(b,u).length>0&&u.stability>.35&&s.energy>c.energyReserveFraction&&!contactSoon,rushGain?6:13,'remote','可见遥控终端进入可达拦截窗口，比较拦截收益与突入收益');
    const ambushShot=s.age<.5&&s.direct.some(w=>w.definition.kind!=='funnel'&&distance<=Math.min(4000,w.definition.sim.effectiveRangeM*.85)&&b.t>=w.readyAt)&&dot(s.seen.forward||target.forward,mul(s.toward,-1))<.75;
    addChoice('ambush-angle',u.stealthActive&&s.energy>.3&&!contactSoon,9,ambushShot?'gun':'flank',ambushShot?'已到侧翼有效射程，结束绕行转向形成真实射击窗口':'利用隐身改变接敌轴线');
    const teamwork=caps.teamwork??u.pilotState.sim.tracking,allySeen=ally?.contacts.get(target.id),pairAngle=allySeen?.position?dot(norm(sub(allySeen.position,ally.position)),s.toward):-1;
    // Assign complementary courses only when both pilots share a fresh contact.
    // The closer ready blade carries the approach; the wing cuts across escape lanes.
    const team=u.coordinationPlan?.targetId===target.id&&b.t<u.coordinationPlan.until?u.coordinationPlan:null;
    const pairReady=ally&&allySeen?.position&&b.t-allySeen.observedAt<.8&&teamwork>.6&&s.age<.8&&!contactSoon&&!routeActive&&!s.supportPlan&&u.controller!=='escort'&&!u.withdrawing&&!broken&&!recovering&&s.energy>.3;
    const rangedBlocked=s.direct.length>0&&s.ownPower<1&&s.enemyPower>4,partnerClosing=ally&&['melee','closeAngle'].includes(ally.order);
    const ownLead=pairReady&&s.blade&&canPush&&(distance<length(sub(allySeen.position,ally.position))-30||Math.abs(distance-length(sub(allySeen.position,ally.position)))<=30&&u.id.localeCompare(ally.id)<0);
    const teamReady=team&&s.age<.8&&!contactSoon&&!routeActive&&!s.supportPlan&&!broken&&!recovering&&s.energy>.25;
    const assaultRole=teamReady?team.role==='assault':ownLead;
    addChoice('team-crossfire',teamReady&&(team.role!=='assault'||!s.trade.unsafe)||!team&&pairReady&&((rangedBlocked&&(canPush||partnerClosing))||!ownWindow&&pairAngle>.75&&threat>0&&s.ownPower>1),teamReady?18:rangedBlocked?16:9,assaultRole?(canPush?'rush':'pincer'):teamReady&&team.role==='support'?'team-support':'pincer',assaultRole?(canPush?'保持团队近战突入分工，沿预判航线接敌':'直接追尾无法接敌，保持突入分工并侧切预判逃逸轴线'):'保持支援或侧翼分工；威胁解除后继续原接敌任务');
    addChoice('counter-artillery',canPush&&!contactSoon&&s.age<.6&&target.weapons.some(w=>w.attack&&w.definition.sim.windupS>.65)&&s.closingSeconds<4&&!s.trade.unsafe,10,'rush','敌方重武器蓄能时斜切缩短距离');
    addChoice('deuterion-return',u.machine.powerSystem?.receiveDeuterion&&supply&&(s.remaining<.3||s.energy<.2)&&s.threat<4&&!contactSoon&&length(sub(supply.position,u.position))<supply.machine.powerSystem.supplyRangeM,23,'supply','接近可见母舰以获得有限能源补给',{priority:s.energy<.12||s.remaining<.02?3:0});
    const retreat=withdrawalOption(b,u);if(retreat)u.withdrawalCandidate=retreat;
    addChoice('mission-retreat',retreat&&(u.components.engine>.1||u.withdrawing&&s.speed>20)&&(s.speed>20||s.energy>.03)&&!contactSoon,30,'retreat','威胁大于可承担风险，选择指定安全出口',{priority:u.withdrawing?4:retreat&&retreat.health<(retreat.healthFraction||0)||retreat&&retreat.cohesionEntityId?3:1});
    const goal=navigationGoal(b,u),protect=escortObjective(b,u)||b.unitById.get(b.mission?.priorities?.[u.side]?.primaryEntityId),shipGoal=protect&&navigationGoal(b,protect),guarding=u.controller==='escort'&&protect?.side===u.side&&protect.alive&&(!shipGoal||length(sub(protect.position,shipGoal.point))>shipGoal.radiusM);
    addChoice('mission-transit',goal&&!guarding&&!s.supportPlan&&!u.withdrawing&&!contactSoon&&!broken&&s.energy>c.lowReserveFraction,Math.max(9,c.missionValue*2+6), 'transit','交战仅为突破航路创造条件，继续抵达任务区域',{priority:u.controller==='objective'?1:0});
    const withdrawalReady=u.controller==='escort'&&goal&&protect?.alive&&shipGoal&&length(sub(protect.position,shipGoal.point))<=shipGoal.radiusM;
    const pursuitRange=Math.max(1800,...target.weapons.filter(w=>!w.disabled&&!w.formDisabled&&w.ammo!==0&&w.definition.kind!=='melee').map(w=>w.definition.sim.effectiveRangeM||w.definition.sim.rangeM));
    const pursuer=isPursuitContact(u,target,s,pursuitRange);
    if(pursuer){u.pursuitStartedAt??=b.t;}else u.pursuitStartedAt=null;
    const prolongedPursuit=pursuer&&b.t-u.pursuitStartedAt>3;
    const escapeFailed=prolongedPursuit||['melee-reset','tail-break','disengage-reset','mission-withdraw'].some(id=>(u.strategyFailures[id]||0)>=1);
    // An unsafe blade trade does not invalidate a gun counter. Use separate
    // entry/exit stability thresholds so the aiming turn cannot restart escape.
    const separating=['melee-reset','post-clash-escape'].includes(u.operationalPlan?.id);
    const resetNeeded=broken||u.stability<(separating?.4:.16);
    addChoice('mission-withdraw',withdrawalReady&&!contactSoon&&!broken&&!pursuer,13,'withdraw','护航目标已脱离，选择避开已知火力的归队航向',{priority:1});
    const firingOpportunity=s.direct.some(w=>w.definition.kind!=='funnel'&&w.definition.sim.damage>=20&&b.t>=w.readyAt&&distance>w.definition.sim.minRangeM&&(!snapThreat||safeWindow||!dangerous&&u.stability>.3));
    const backfireOpen=pursuer&&escapeFailed&&firingOpportunity&&!contactSoon&&!broken&&u.stability>.04&&s.energy>c.energyReserveFraction&&(!u.pursuitFireUntil||b.t<u.pursuitFireUntil||b.t>(u.pursuitBoostUntil||0));
    addChoice('pursuit-boost',pursuer&&b.t>=u.pursuitFireUntil&&b.t<u.pursuitBoostUntil&&!contactSoon,26,'escape-boost','回身射击窗口结束，转回惯性航向恢复前向推力');
    addChoice('pursuit-fire',backfireOpen,24,'backfire','拉开无收益但有反击窗口，保留惯性转身短时射击');
    addChoice('pursuit-counter',pursuer&&escapeFailed&&s.direct.length>0&&s.trade.ranged&&!contactSoon&&!resetNeeded&&!backfireOpen,22,'gun','拉开没有收益，利用惯性重新建立反击窗口');
    const cheapShot=s.direct.some(w=>w.definition.kind!=='melee'&&weaponEnergyCost(w.definition)<(u.machine.sim.dodgeEnergyCost??5)*.5&&b.t>=w.readyAt);
    addChoice('reserve-counter',s.energy<c.energyReserveFraction&&s.energy>.12&&cheapShot&&!contactSoon&&!snapThreat,23,'reserve-fire','有限廉价射击仍可保留急闪能源，同时按惯性回气');
    addChoice("tail-break", tail && !safeWindow && s.energy > .2 && !rushGain && (!escapeFailed||resetNeeded), 14, "escape", "敌方已形成追尾射线，攻击前主动摆脱");
    addChoice("drift-window", u.pilotState.traits.driftShot && s.direct.length && s.speed >= c.driftMinSpeed && u.stability > .32 && !tail && !rushGain && distance > 350 && !recovering, 6.5, "gun", "快转可以争取有意义的稳瞄窗口");
    const bladeStyle=u.pilotState.tags?.includes('blade-specialist'),shortArms=s.direct.every(w=>w.definition.sim.damage<12),poorRanged=s.ownPower<Math.max(12,(s.blade?.definition.sim.damage||0)*.1),cutWindow=s.age<.6&&canPush&&!broken&&!recovering&&!s.trade.unsafe&&distance<Math.min(c.rushDistanceM,m.maxSpeedMps*4)&&s.closingSeconds<4&&(safeWindow||shortArms||poorRanged||bladeStyle&&s.trade.advantage>-.05||s.rangeLoss>c.exchangeDisadvantage)&&u.controller!=='escort'&&!s.supportPlan;
    const activeDash=u.breakaway?.meleeDash&&u.breakaway.target===target.id&&b.t<u.breakaway.until;
    const dashWindow=activeDash||!recovering&&!broken&&!snapThreat&&s.crossfire<c.crossfireTolerance&&!s.supportPlan&&!goal&&!u.withdrawing&&u.controller!=='escort'&&b.meleeDashPlan(u,target,s.blade);
    addChoice('melee-dash',!!dashWindow,(activeDash?26:18)+(bladeStyle?4:0)+(poorRanged?3:0)+(target.stability<.3?4:0),'rush','短促出力可真实接触，提前切刀并用冲刺争取近战收益');
    addChoice('blade-entry',cutWindow,12+(shortArms?8:poorRanged?6:bladeStyle?4:0)+Math.max(0,s.trade.advantage)*6,'rush','可达近战窗口与装备/驾驶员优势足以抵偿突入风险');
    addChoice("melee-pressure", s.age < .8 && !snapThreat && base.order === "melee" && !broken && canPush && (!s.trade.unsafe||!s.trade.ranged), 20, "rush", "已有近战截击可行，继续向接触窗口施压");
    addChoice("safe-recovery", recovering && !threat, 18, "recover", "没有有效来袭射线，保持惯性回稳");
    addChoice("combat-recovery", recovering && threat, 18 + threat, "combat-recover", "仍在有效火力内，回稳也需要保速推进");
    addChoice("energy-reserve", s.energy < c.energyReserveFraction || u.energy < (u.defenseEnergyReserve||0)*1.1 || s.remaining < c.lowReserveFraction, 22, "energy", "保留下一次急闪和推进所需能源", {
        priority: s.energy < .12 || s.remaining < .02 ? 3 : 0
    });
    addChoice("contact-search", s.age > 1.2, 20, "search", "沿最后观测航迹搜索可达空域", {priority:1});
    addChoice("mission-approach", target.entityType === "ship" && s.energy > c.energyReserveFraction, 6, "intercept", "继续向任务目标推进");
    addChoice("gun-range", s.direct.length > 0 && !broken && !u.jettisoned, 4 + u.stability * 2, "gun", "在可用远射武器最佳距离建立射线");
    addChoice("gun-close", rushGain && !contactSoon && (!(weights["parallel-fire"]>0)||s.threat<3||distance<1200||s.ownPower>s.enemyPower*2) && (u.controller !== "screen" || s.rangeLoss > c.exchangeDisadvantage), 8 + Math.min(3, s.rangeLoss * 4), "rush", "远射交换处于劣势，转为有推进收益的近战突入");
    addChoice("funnel-rush", rushGain && s.remote.length && !contactSoon && (u.controller !== "screen" || s.rangeLoss > c.exchangeDisadvantage), 10 + Math.min(2, s.remote.length / 6), "rush", "浮游压制下保留逼近本体的目标，急闪后继续突进");
    addChoice("crossfire-exit", (s.crossfire >= c.crossfireTolerance || weights["parallel-fire"]>0&&s.contacts.length>=3&&s.ownPower<s.enemyPower*1.5) && !contactSoon, 15 + s.crossfire, "crossfire", "多方向射线重叠，先离开交叉火力", {
        priority: 1
    });
    addChoice("recovery-window", s.age < .6 && canPush && !broken && target.stability < .2 && s.closingSeconds < 2 && u.stability > .2, 17, "rush", "敌方失稳且能够在恢复前接敌");
    addChoice("cooldown-counter", s.age < .6 && u.observedCooldownUntil > b.t + u.pilotState.sim.reactionS + .15 && s.direct.length > 0 && u.stability > .3, 8, "gun", "利用已经观测到的射后空档");
    addChoice("lateral-flank", s.rangeLoss > c.exchangeDisadvantage && s.direct.length > 0 && !canPush && s.energy > .35, 7, "flank", "交换无收益，改变射线轴向");
    addChoice("pursuit-cutoff", canPush && s.closing < 30 && distance > 1200 && dot(s.velocity,s.toward)>30 && !ownWindow && !s.funnel, 8, "intercept", "按观测速度预判截击而不是慢速尾随");
    addChoice("melee-reset", s.trade.ranged && canPush && (base.order==='melee'||s.meleeLoss>c.exchangeDisadvantage||defense?.contact<2) && (!escapeFailed||resetNeeded) && (s.trade.unsafe || s.meleeLoss > c.exchangeDisadvantage && !s.trade.finishWindow && s.trade.advantage < .08 && !s.trade.counterPossible) && distance < 3000 && !contactSoon, 24, "escape", "下一次拼刀有破稳风险且仍有远射收益，先脱离接触");
    addChoice("post-clash-escape", broken && distance < 600, 19, "escape", "失去格挡能力，先脱离刀刃覆盖", {
        priority: 2
    });
    addChoice("return-slash", s.age < .6 && u.pilotState.traits.returnSlash && u.returnSlashTarget === target.id && b.t < u.returnSlashUntil && canPush && !broken && u.stability >= target.stability + .08 && u.stability > .38 && distance < 300, 18, "rush", "拼刀后己方姿态占优，及时回身再斩");
    addChoice("low-speed-barrage", s.direct.length > 1 && length(s.velocity) < c.allOutMaxSpeed && u.stability > .3 && s.age < .6 && !contactSoon, 7, "gun", "敌方低速暴露，用独立槽集中火力");
    addChoice("funnel-standoff", s.funnel && !s.duel && s.age < 1 && !contactSoon && distance > 1e3, 7, "funnel", "发挥浮游远射优势并保留机动空间");
    addChoice("decoy-breakthrough", u.jettisoned && canPush && !contactSoon, 10, "rush", "已减重，利用掩护保持近战突入");
    addChoice("disengage-reset", u.pilotState.traits.rationalRetreat && s.health < .35 && s.recent > .12 && s.direct.length > 0 && s.availableAcceleration > 20 && !contactSoon && s.crossfire === 0, 10 + s.recent * 4, "escape", "近期重创，短期脱离能恢复更安全的攻击窗口");
    // Keep close-contact/suppression ordering in the combat controller; those are
    // deadlines, not a lottery between a firing window and a lethal blade contact.
        const captureCandidate = choices.find(x => ['capture-disabled','capture-position','last-resort-detonation'].includes(x.id));
    if (contactSoon && !broken && !s.trade.unsafe && s.energy >= .12 && !captureCandidate && !s.bladeSupportPlan
        || b.t < (u.separationUntil || 0)
        || b.t < (u.openingUntil || 0) && base.order === "melee") {
        u.captureIntent = null;u.grappleContactSince = null;return null;
    }
    if (!choices.length) return null;
    // Established fire/screen/mission courses remain valid unless a better tactical
    // alternative has a concrete payoff. Basic candidates document the decision
    // without replacing a proven motion controller unnecessarily.
        choices.sort((a, z) => z.priority - a.priority || z.score - a.score);
    const previous = u.operationalPlan;
    let best = choices[0], same = previous && choices.find(x => x.id === previous.id);
    if (previous && same && b.t < previous.until && same.priority >= best.priority && same.score + c.planSwitchMargin >= best.score) best = same; else {
        const near = choices.filter(x => x.priority === best.priority && x.score >= best.score - c.strategyTieMargin);
        if (near.length > 1) best = near[Math.min(near.length - 1, Math.floor(b.random() * near.length))];
    }
    if(best.id==='mission-retreat')u.withdrawing=true;
    best = {
        ...best,
        ...path(s, best.mode)
    };
    if(best.id==='missile-drag'&&(!u.breakaway||b.t>=u.breakaway.until)){u.breakaway={target:target.id,style:'jink',sign:u.orbit,axis:s.missileAxis,heading:best.heading,started:b.t,duration:.5,until:b.t+.5,thrustMultiplier:s.missileBudget.multiplier};}
    if(['lock-denial','pressure-jink','blade-denial'].includes(best.id)){
      // A short burst changes lateral acceleration during the enemy's linear lead.
      // Retain its chosen side for one pulse; never redraw a direction every tick.
      if(!u.breakaway||b.t>=u.breakaway.until){
        const heading=best.heading,axis=b.chooseEscape(u,target,'beam',mul(s.toward,-1),null,.3),duration=.4,output=affordableManeuver(u,Math.min(c.dodgeThrustMultiplier,40),duration,b.environment.medium);
        u.breakaway={target:target.id,style:'jink',sign:u.orbit,axis,heading,translationAxis:axis,started:b.t,duration,until:b.t+duration,thrustMultiplier:output.multiplier};
         b.effects.push({type:'dodge-jet',actor:u.id,t:b.t,life:.45,position:[...u.position],direction:mul(axis,-1)});
      }
    }
    // Translational thrusters cross the ray without repeatedly spinning the
    // hull. Keep aim attitude for one short pulse, then re-evaluate normally.
    if(['lock-denial','pressure-jink'].includes(best.id)&&u.breakaway&&b.t<u.breakaway.until)best.heading=s.age<.6&&s.direct.length>0&&!defense?.bladeRisk?s.toward:[...u.forward];
    if(best.id==='pursuit-fire'&&(!u.pursuitFireUntil||b.t>=(u.pursuitBoostUntil||0))){u.pursuitFireUntil=b.t+Math.min(1.2,c.planHoldS);u.pursuitBoostUntil=u.pursuitFireUntil+.7;}
    if (best.id === "tail-break") {
        const maneuver = b.proactiveBreakaway(u, target, safeWindow);
        if (maneuver) Object.assign(best, maneuver);
    }
    if (best.id === "drift-window" && s.age < .6) {
        const maneuver = b.pilotManeuver(u, target, distance, s.toward, false, b.meleeEncounter(u, target));
        if (maneuver && [ "drift", "boost" ].includes(maneuver.order)) Object.assign(best, maneuver); else {
            const fallback = choices.find(x => x.id !== "drift-window");
            if (fallback) best = {
                ...fallback,
                ...path(s, fallback.mode)
            };
        }
    }
    if ((best.id==='mission-approach'||['gun-range','low-speed-barrage'].includes(best.id)&&['screen','escort'].includes(u.controller)) && ![ 'recover', 'cool' ].includes(base.order)) Object.assign(best, base);
    if (s.duel && ["safe-recovery","combat-recovery"].includes(best.id) && base.order === "recover") Object.assign(best,base);
    if (best.id === "funnel-standoff" && base.order === "funnel-control") Object.assign(best, base);
    if ([ "gun-close", "funnel-rush", "decoy-breakthrough", "melee-pressure", "blade-entry", "melee-dash" ].includes(best.id) && base.order === "melee") Object.assign(best, base);
    if(best.id==='capture-position')u.captureStation={targetId:target.id,axis:s.capturePosition.stationAxis};
    u.captureIntent=['capture-disabled','last-resort-detonation'].includes(best.id)?target.id:null;
    if(u.captureIntent)b.cancelAttacks(u);else u.grappleContactSince=null;
    const changed = u.lastStrategyId !== best.id;
    u.lastStrategyId = best.id;
    u.strategySuspended = false;
    u.pressuredAdvance = [ "gun-close", "funnel-rush", "decoy-breakthrough", "pursuit-cutoff", "combat-recovery", "melee-pressure", "blade-entry" ].includes(best.id) && threat > 0;
    if (!u.operationalPlan || u.operationalPlan.id !== best.id) {
        u.operationalPlan = {
            id: best.id,
            target: target.id,
            until: b.t + c.planHoldS,
            distance: distance,
            mode: [ "gun-close", "funnel-rush", "decoy-breakthrough", "recovery-window", "return-slash", "melee-pressure", "blade-entry" ].includes(best.id) ? "rush" : best.order === "disengage" ? "escape" : "other"
        };
    }
    if (changed && b.t >= (u.strategyLogAt || 0)) {
        u.strategyLogAt = b.t + .6;
        b.emit("strategy", u.id, u.machine.name + "：" + STRATEGY_LABELS[best.id][0] + "（" + best.reason + "）", {
            strategy: best.id,
            ...(best.id==='blade-cover'?{ally:s.bladeSupportPlan.allyId}:{}),
            target: target.id,
            score: +best.score.toFixed(2),
            distance: +distance.toFixed(1),
            threat: threat,
            rangeLoss: +s.rangeLoss.toFixed(3)
        });
    }
    if (best.id !== "drift-window") u.drift = null;
    if (!["missile-drag","tail-break","lock-denial","pressure-jink","blade-denial","melee-dash"].includes(best.id)) u.breakaway = null;
    if(best.order==='bladeCover'){u.bladeSupportTargetId=target.id;u.bladeSupportUntil=b.t+s.bladeSupportPlan.deadline+.35;}else{u.bladeSupportTargetId=null;u.bladeSupportUntil=0;}
    if ([ "closeAngle", "melee", "bladeCover" ].includes(best.order) && s.blade && !b.drones.some(d => d.owner === u.id && d.phase !== "return")) b.prepareBlade(u, target, s.blade, "策略近战突入");
    if (best.order === "funnel-control" && s.funnel && !b.drones.some(d => d.owner === u.id && d.phase !== "return")) b.selectWeapon(u, s.funnel, "策略远射优势");
    if ((weights["formation-spacing"] || 0) > 0 && !contactSoon && best.flightMode !== "coast") {
        for (const ally of b.spatial.sides[u.side] || []) {
            if (ally === u) continue;
            const away = sub(u.position, ally.position), d = length(away), spacing = Math.max(80, (u.machine.sim.radiusM + ally.machine.sim.radiusM) * 3);
            if (d < spacing) {
                best.desired = add(best.desired, mul(norm(away), m.maxSpeedMps * .3 * (1 - d / spacing) * Math.min(1, weights["formation-spacing"])));
            }
        }
    }
    return best;
}
