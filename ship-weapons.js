import {sub,length,cross,norm} from './math.js';
// Roles are explicit data tags; legacy fleets keep their original rules.
export function shipWeaponRole(u,w){
 if(u.entityType!=='ship')return null;
 return ['heavy-main','main-battery','secondary-battery','point-defense','missile-battery'].find(role=>w.tags?.includes(role))||(w.template==='ship-main'?'main-battery':null);
}
export function shipWeaponWindow(b,u,target,state){
 const w=state.definition,role=shipWeaponRole(u,w);if(!role)return true;
 const delta=sub(b.observed(u,target),u.position),distance=length(delta);
 if(role==='point-defense'){
  // Keep the mount available to intercept incoming missiles before firing at MS.
  if(b.projectiles.some(p=>b.unitById.get(p.owner)?.side!==u.side&&['missile','funnel-missile'].includes(p.kind)&&!p.intercepted&&length(sub(p.position,u.position))<w.sim.rangeM))return false;
  return target.entityType!=='ship'&&distance<=w.sim.effectiveRangeM;
 }
 if(role==='secondary-battery'&&target.entityType!=='ship'&&target.machine.sim.radiusM<50){const observed=state.fireControl?.solution||u.contacts?.get(target.id),relative=sub(observed?.velocity||[0,0,0],u.velocity),angular=length(cross(relative,norm(delta)))/Math.max(1,distance);return (state.fireControl?.locked??u.locked)&&angular<.05;}
 if(role==='missile-battery'&&target.entityType!=='ship')return b.projectiles.filter(p=>p.owner===u.id&&p.weaponId===w.id&&p.target===target.id).length<Math.max(3,w.sim.burst);
 if(!['main-battery','heavy-main'].includes(role))return true;
 if(!state.attack&&!state.salvo&&(b.t<(u.mainBusReadyAt||0)||u.weapons.some(x=>x!==state&&['main-battery','heavy-main'].includes(shipWeaponRole(u,x.definition))&&(x.attack||x.salvo))))return false;
 const observed=state.fireControl?.solution||u.contacts?.get(target.id)||u.lastSeen;
 const relative=sub(observed?.velocity||[0,0,0],u.velocity),angular=length(cross(relative,norm(delta)))/Math.max(1,distance);
 const large=target.entityType==='ship'||target.machine.sim.radiusM>=50;
 if(!large)return false;
 // A whole bank must fit the buffer before charging. Committed rounds still pay per shot.
 const rounds=state.salvo?.remaining??w.sim.burst,cost=shipMainEnergyCost(u,w),reserve=u.machine.sim.energyCapacity*.08;
 if(u.energy<cost*rounds+reserve||!state.salvo&&u.energy<u.machine.sim.energyCapacity*.92)return false;
 const threshold=role==='heavy-main'?.12:.2;
 return (state.fireControl?.locked??u.locked)&&angular<threshold;
}
export function shipMainEnergyCost(u,w){
 const role=shipWeaponRole(u,w);if(!['heavy-main','main-battery'].includes(role))return null;
 // Floors also apply to older installed books. Higher user-authored costs remain honored.
 return Math.max(w.sim.energyCost,u.machine.sim.energyCapacity*(role==='heavy-main'?.88:.72)/Math.max(1,w.sim.burst));
}
export function shipShotCue(u,w){
 const role=shipWeaponRole(u,w);if(!role)return {};
 return {shipRole:role,beamRifle:false,vulcan:role==='point-defense'};
}
