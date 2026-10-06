import {mayEngage} from './target-policy.js';
import {captureFireHeld} from './capture-coordination.js';
import {sub,length,dot,norm,arcSolution} from './math.js';
import {shipWeaponWindow} from './ship-weapons.js';
const enabled=u=>(u.pilotState.strategies?.['parallel-fire']??0)>0;
export function weaponTarget(b,u,state,fallback){
 // Blade contact follows the current body interception, not a quarter-second-old
 // ranged mount allocation. A stroke already prepared keeps its committed target.
 if(state.definition.kind==='melee')return b.unitById.get(state.attack?.targetId||state.salvo?.targetId)||fallback;
 return enabled(u)?b.unitById.get(state.assignedTargetId)||fallback:fallback;
}
export function allocateWeapons(b,u){
 if(u.commandAssignment?.source==='player'&&['attack','screen'].includes(u.commandAssignment.type)){for(const w of u.weapons)w.assignedTargetId=u.commandAssignment.targetId;return;}
 if(!enabled(u)||!u.alive||u.docked||b.t<(u.nextWeaponAllocation??0))return;u.nextWeaponAllocation=b.t+.25;
 const candidates=[];for(const[id,c]of u.contacts){const target=b.unitById.get(id);if(target?.alive&&mayEngage(b,u,target)&&!target.docked&&!captureFireHeld(b,u,target)&&b.t-c.observedAt<.3){const delta=sub(c.position,u.position);candidates.push({target,contact:c,delta,d:length(delta),axis:norm(delta)});}}
 const multi=u.machine.tags.includes('multi-lock'),allocations=new Map();for(const state of u.weapons){
 if(state.disabled||state.formDisabled||state.ammo===0)continue;const w=state.definition,s=w.sim;
 if(state.attack||state.salvo){state.assignedTargetId=state.attack?.targetId||state.salvo.targetId;continue;}
 if(w.kind==='melee'){state.assignedTargetId=u.targetId;continue;}let best=null,score=-Infinity;
 for(const{target:x,contact:c,delta,d,axis}of candidates){if(!shipWeaponWindow(b,u,x,state))continue;if(d<s.minRangeM||d>s.rangeM)continue;const arc=arcSolution(state.turretForward||u.forward,delta,s);if(!arc.inside&&!w.turret)continue;
 const priority=x.id===u.targetId?(multi?.7:2):0,threat=x.lockedTargetId===u.id?1:0,window=1-Math.min(1,Math.abs(d-s.preferredRangeM)/Math.max(1,s.rangeM));
 const value=priority+threat+window*2+dot(state.turretForward||u.forward,axis)-(allocations.get(x.id)||0)*(multi?2:1.2)+(x.id===state.assignedTargetId?.3:0);
 if(value>score){score=value;best=x;}
 }state.assignedTargetId=best?.id||u.targetId;if(best)allocations.set(best.id,(allocations.get(best.id)||0)+1);
 }
}
export function allocateDrones(b){
 if(b.tick%5!==1)return;const owners=new Map();for(const d of b.drones)if(!d.dead&&d.phase!=='return'){if(!owners.has(d.owner))owners.set(d.owner,[]);owners.get(d.owner).push(d);}
 for(const[id,drones]of owners){const u=b.unitById.get(id);if(!u||!enabled(u))continue;
 if(u.commandAssignment?.source==='player'&&['attack','screen'].includes(u.commandAssignment.type)){for(const d of drones)if(!d.aim&&d.target!==u.commandAssignment.targetId){d.target=u.commandAssignment.targetId;d.aim=null;}continue;}const candidates=[...u.contacts].map(([id,c])=>({x:b.unitById.get(id),c})).filter(({x,c})=>x?.alive&&mayEngage(b,u,x)&&!x.docked&&!captureFireHeld(b,u,x)&&b.t-c.observedAt<.3),allocations=new Map();
 for(const d of drones){if(d.aim&&b.unitById.get(d.target)?.alive){allocations.set(d.target,(allocations.get(d.target)||0)+1);continue;}if(!b.unitById.get(d.target)?.alive)d.aim=null;let best=null,score=-Infinity;for(const{x,c}of candidates){const dist=length(sub(c.position,d.position));if(dist>u.machine.sim.sensorRangeM)continue;const urgency=x.targetId===u.id?1:0,value=urgency+(x.id===u.targetId?.8:0)-dist/12000-(allocations.get(x.id)||0)*1.25+(x.id===d.target?.25:0);if(value>score){score=value;best=x;}}if(best){if(d.target!==best.id){d.target=best.id;d.aim=null;}allocations.set(best.id,(allocations.get(best.id)||0)+1);}
 }
 }
}
