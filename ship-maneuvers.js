import {add,sub,mul,norm,length,dot,clamp} from './math.js';

// A disabled/critical ship may trade its hull only against an observed large
// target. Reaching the hull remains a movement problem; no damage is granted.
export function shipRamCourse(b,u,target){
 if(u.entityType!=='ship'||target.entityType!=='ship'||target.side===u.side||!(u.pilotState.strategies?.['terminal-intercept']>0)||u.structure/u.machine.sim.structure>.35||u.components.engine<.2)return null;
 const seen=u.contacts.get(target.id);if(!target.alive||!seen||b.t-seen.observedAt>.8)return null;
 const delta=sub(seen.position,u.position),distance=length(delta),speed=u.machine.sim.maxSpeedMps;
 if(distance>speed*20||u.energy<u.machine.sim.energyCapacity*.1)return null;
 const relative=sub(seen.velocity,u.velocity),horizon=clamp(distance/Math.max(50,speed-dot(seen.velocity,norm(delta))),0,12),lead=add(delta,mul(relative,horizon*.65)),heading=norm(lead);
 return {order:'terminalIntercept',heading,desired:mul(heading,speed),target:target.id};
}

// Convert only real heavy-hull contact into damage. The reduced mass accounts
// for both vessels; glancing contact uses closing speed along the contact normal.
// Specific energy is a game calibration, not an official ship material property.
export function damageShipCollision(b,a,z,closingSpeed){
 if(a.entityType!=='ship'||z.entityType!=='ship'||closingSpeed<60)return;
 const reduced=a.machine.sim.massKg*z.machine.sim.massKg/(a.machine.sim.massKg+z.machine.sim.massKg),joules=.5*reduced*closingSpeed*closingSpeed,reference=b.rules.collisionEnergyJPerKg??12000;
 const impacts=[{u:a,other:z},{u:z,other:a}].map(({u,other})=>{const raw=joules/(u.machine.sim.massKg*reference)*u.machine.sim.structure,absorbed=Math.min(u.armor,raw*.25);return {u,other,raw,absorbed,damage:raw-absorbed};});
 for(const {u,other,raw,absorbed,damage} of impacts){u.armor=Math.max(0,u.armor-absorbed);u.structure=Math.max(0,u.structure-damage);u.recentDamage=(u.recentDamage||0)+damage;u.lastDamageAt=b.t;u.observedHeavyAt=b.t;u.observedHeavyDamage=damage;u.observedHeavyAttacker=other.id;u.nextDecision=b.t;
  b.emit('hit',other.id,other.machine.name+' 舰体碰撞 '+u.machine.name,{target:u.id,weapon:'hull-impact',kind:'collision',structureDamage:damage,energyJ:joules,closingSpeed});
  b.effects.push({type:'impact',t:b.t,life:.7,position:[...u.position],actor:u.id,severity:clamp(damage/u.machine.sim.structure)});
 }
 for(const {u}of impacts)if(u.structure<=0)b.destroy(u,'舰体碰撞导致结构失效');
}
