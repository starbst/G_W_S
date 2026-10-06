import {trackingSignature} from './pilot-skills.js';
import {weaponTarget} from './weapon-allocation.js';
import { add, mul, sub, length, cross, clamp, arcSolution } from "./math.js";

// Charge time is not an instruction to stare at the target's old starting point.
// Follow delayed, visible fire-control samples during preparation, then freeze the
// last sample before the physical firing deadline. Emitted rays never follow targets.
export function updateAttackAim(b,u,state){
 updateSalvoAim(b,u,state);
 const attack=state.attack;if(!attack||attack.aimCommitted||state.definition.kind==='melee')return;
 const commitAt=attack.aimCommitAt??attack.at;
 const solution=state.fireControl?.targetId===attack.targetId&&state.fireControl.visible?state.fireControl.solution:null;
 if(solution&&solution.t<=commitAt+1e-8&&solution.t>=(attack.trackingSolution?.t??attack.solution?.t??-Infinity))attack.trackingSolution=solution;
 if(b.t>=commitAt-1e-8){
  const sample=attack.trackingSolution||attack.solution;
  if(sample)attack.solution={position:[...sample.position],velocity:[...sample.velocity],t:sample.t};
  attack.aimCommitted=true;delete attack.trackingSolution;
 }
}

// Sensor contacts belong to the unit; each equipped mount has its own fire-control quality.
export function updateFireControl(b, u, target, dt) {
    if(b.t<(u.microControlUntil||0))return;
    const m = u.machine.sim, p = u.pilotState.sim;
    for (const state of u.weapons) {
        const mountTarget=weaponTarget(b,u,state,target),contact=u.contacts?.get(mountTarget.id),delta=sub(contact?.position||mountTarget.position,u.position),distance=length(delta),angular=length(cross(sub(contact?.velocity||mountTarget.velocity,u.velocity),delta))/Math.max(1,distance*distance),shared=!!contact?.shared&&b.t-contact.observedAt<.4,visible=(mountTarget===target?u.visible:!!contact&&b.t-contact.observedAt<.1)||shared;
        const s = state.definition.sim, previous = state.fireControl?.targetId === mountTarget.id ? state.fireControl : {
            track: 0,
            locked: false
        }, inside = arcSolution(state.turretForward || u.forward, delta, s).inside, quality = visible && !state.disabled ? trackingSignature(mountTarget)*clamp(1 - distance / (m.sensorRangeM * 3) - angular * (.12 + (1 - p.tracking) * .2)) * (u.entityType==='ship'?1:(.8 + .2 * u.stability)) * (inside ? 1 : .18) : 0, track = clamp(previous.track + clamp(quality - previous.track, -m.trackDecay * dt, m.trackGain * p.tracking * dt)), locked = track >= (previous.locked ? b.rules.unlockThreshold : b.rules.lockThreshold), delay = (locked ? .05 : p.reactionS * .5 + (1 - track) * .08)+(1-trackingSignature(mountTarget))*.06;
        const solution = shared?{t:contact.observedAt,position:[...contact.position],velocity:[...contact.velocity]}:mountTarget===target?(u.observations.findLast(o => o.t <= b.t - delay)||null):contact?{t:contact.observedAt,position:[...contact.position],velocity:[...contact.velocity]}:null;
        state.fireControl = {
            targetId: mountTarget.id,
            track: track,
            locked: locked,
            visible: visible,
            solution: solution
        };
    }
    const before = u.locked, selected = b.state(u).fireControl;
    if (selected) {
        u.track = selected.track;
        u.locked = selected.locked;
        u.lockedTargetId = u.locked ? selected.targetId : null;
        u.fireSolution = selected.solution;
        if (before !== u.locked) {
            b.emit(u.locked ? "lock" : "lost", u.id, u.machine.name + (u.locked ? " 火控锁定" : " 火控丢锁"));
            b.notice(u, u.locked ? "火控锁定" : "丢失锁定", u.locked ? "good" : "warning", "lock", .2);
            u.nextDecision = b.t;
        }
    }
}

// Use only delayed visible observations for rounds which have not left the mount.
// Deliberate lane/acceleration suppression retains its predicted aim pattern.
export function updateSalvoAim(b,u,state){
 const salvo=state.salvo,c=state.fireControl;
 if(!salvo||salvo.index<1||salvo.remaining<=0||u.suppressing&&state.definition.sim.suppressionStage||!c?.visible||c.targetId!==salvo.targetId)return;
 const sample=c.solution,old=salvo.solution,deadline=salvo.nextAt-b.rules.stepSeconds;
 if(!sample||!old||sample.t>deadline+1e-8||sample.t<=(salvo.aimSampleAt??old.t)||b.t-sample.t>.6)return;
 const age=Math.max(0,sample.t-old.t),projected=add(old.position,mul(old.velocity,age)),gain=clamp(.22+.5*u.pilotState.sim.tracking+.15*c.track,.25,.85);
 salvo.solution={position:add(projected,mul(sub(sample.position,projected),gain)),velocity:add(old.velocity,mul(sub(sample.velocity,old.velocity),gain)),t:sample.t};salvo.aimSampleAt=sample.t;
}
