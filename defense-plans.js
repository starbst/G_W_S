import {add, mul, dot, norm, sub, length, clamp} from './math.js';

// A small queue of observed threats, never one timer per shot. Reaction maturity
// belongs to its own observation; a later salvo cannot restart an older reaction.
const MAX_PLANS = 8;
export function reactionPlans(u) {
    return [u.pendingReaction, ...(u.reactionBacklog || [])].filter(Boolean);
}
function valid(b, r) {
    if (r.impactAt != null && b.t > r.impactAt + .25) return false;
    if (r.cueAt != null && !r.cueReleased && !b.reactionCueActive(r)) return false;
    if(r.cueReleased&&r.shotId!=null&&b.projectiles&&!b.projectiles.some(s=>s.id===r.shotId))return false;
    if(r.missile!=null&&b.projectiles&&!b.projectiles.some(s=>s.id===r.missile))return false;
    return true;
}
function assign(b, u, plans) {
    const due = plans.filter(r => r.at <= b.t);
    const chosen = due.length ? due.sort((a,z) => (z.priority || 0) - (a.priority || 0) || a.at-z.at)[0]
        : plans.sort((a,z) => a.at-z.at || (z.priority || 0)-(a.priority || 0))[0];
    u.pendingReaction = chosen || null;
    u.reactionBacklog = plans.filter(r => r !== chosen).sort((a,z) => a.at-z.at || (z.priority || 0)-(a.priority || 0)).slice(0, MAX_PLANS - 1);
}
export function refreshReactions(b, u) {
    if(!u.pendingReaction&&!u.reactionBacklog?.length)return;
    assign(b, u, reactionPlans(u).filter(r => valid(b,r)));
}
export function scheduleReaction(b, u, plan) {
    const plans = reactionPlans(u).filter(r => valid(b,r));
    // One response can cover a same-axis salvo. Keep the earliest actual shot,
    // not the newest, slightly higher-scoring projectile in that salvo.
    const same = plans.find(r => r.attacker === plan.attacker && r.cueWeaponId === plan.cueWeaponId
        && r.cueDroneId === plan.cueDroneId && r.missile === plan.missile
        && r.kind === plan.kind && dot(norm(r.direction),norm(plan.direction)) > .96);
    // Equal-arrival, same-axis weaker threats need no separate pulse when the
    // larger threat already has a response before both impacts.
    const dominated = plans.some(r => r.priority > plan.priority * 2 && Math.abs(r.impactAt-plan.impactAt) < .1
        && r.at < plan.impactAt && dot(norm(r.direction),norm(plan.direction)) > .96);
    if (!same && !dominated && valid(b,plan)) plans.push(plan);
    else if (same && plan.at < same.at && plan.impactAt <= same.impactAt) plans[plans.indexOf(same)] = plan;
    assign(b,u,plans);
}
export function releaseObservedCue(b, u, attacker, weapon, threat, direction, tti) {
    const r = reactionPlans(u).find(p => p.attacker === attacker.id && p.cueWeaponId === weapon.id
        && p.cueAt != null && !p.cueReleased && p.cueAt <= b.t + 1e-8
        && (!p.cueDroneId || p.cueDroneId === threat?.cueDroneId));
    if (!r) return false;
    r.cueReleased = true; r.direction = direction; r.shotId = threat?.id; r.impactAt = b.t + tti;
    return true;
}
export function clearReactions(u) {u.pendingReaction = null; u.reactionBacklog = [];}

// Conservative closest-approach test for a visible emitted threat. Existing
// acceleration is an uncertainty margin, not free future thrust. A guided
// projectile keeps its actual bounded steering authority; no immunity is given.
export function coastClearsThreat(u, shot, time, impactAt, step=.05) {
    if (!shot?.position || !shot.velocity || !Number.isFinite(impactAt)) return false;
    const horizon=Math.max(step,impactAt-time+step);if(shot.kind==='ballistic'&&shot.weapon.impactMode==='area'&&shot.fusePoint){const fuseT=Math.max(0,(shot.fuseDistance-shot.traveled)/Math.max(1,length(shot.velocity))),future=add(u.position,mul(u.velocity,fuseT)),margin=.5*length(u.acceleration||[0,0,0])*fuseT*fuseT;return length(sub(future,shot.fusePoint))>u.machine.sim.radiusM+shot.weapon.blastRadiusM+margin+5;}const delta=sub(u.position,shot.position),relative=sub(shot.velocity,u.velocity),speed2=dot(relative,relative);
    if (speed2<1) return false;
    const closest=clamp(dot(delta,relative)/speed2,0,horizon);
    const x=delta[0]-relative[0]*closest,y=delta[1]-relative[1]*closest,z=delta[2]-relative[2]*closest;
    const radius=u.machine.sim.radiusM+(shot.weapon.blastRadiusM||0)*.35+5;
    const guided=['missile','funnel-missile'].includes(shot.kind)&&!shot.seekerFailed;
    const uncertainty=.5*length(u.acceleration||[0,0,0])*closest*closest;
    const steering=guided?.5*(shot.weapon.maxLateralAccelMps2??140)*horizon*horizon:0;
    return Math.hypot(x,y,z)>radius+uncertainty+steering;
}
