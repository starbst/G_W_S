// A numeric reservoir placeholder keeps saved JSON finite; this flag governs consumption.
export function hasUnlimitedEnergy(unitOrMachine){
 const m=unitOrMachine.machine||unitOrMachine;
 return m.sim.unlimitedEnergy??(m.entityType==='ship'||['nuclear','hyper-deuterion','fusion'].includes(m.powerSystem?.type));
}

// Driver skill is output utilization, not extra machine thrust. High skill reaches
// the physical envelope; low skill leaves substantially less usable authority.
export function pilotControlAuthority(u){const p=Math.max(0,Math.min(1,u.pilotState.sim.maneuver));return .25+.75*p*p;}
export function emergencyPulseSeconds(u,step=.05,blastRadius=0){
 const m=u.machine.sim,c=u.pilotState.tactics,accel=m.thrustN/m.massKg*c.dodgeThrustMultiplier*pilotControlAuthority(u)*u.components.engine*u.machine.mobility.accel.lateral;
 return Math.min(c.dodgePulseS,Math.max(step,Math.sqrt(2*(m.radiusM+blastRadius*.35+5)/Math.max(1,accel))));
}
// Routine thrust and weapons keep a single reachable burst in reserve only
// during observed pressure. Emergency reactions may spend the whole buffer.
export function emergencyEnergyReserve(u,time,medium='space',step=.05){
 if(u.entityType==='ship'||!(u.components.engine>.1))return 0;
 const threatened=u.pendingReaction||u.missileThreat||time-(u.observedHeavyAt??-100)<1.5||u.threatTargeted;
 if(!threatened)return 0;
 const pulse=emergencyPulseSeconds(u,step),m=u.machine.sim,c=u.pilotState.tactics;
 return Math.min(m.energyCapacity*.55,maneuverEnergyCost(u,c.dodgeThrustMultiplier,pulse,medium,m.dodgeEnergyCost??5)+(u.controller==='survive'?m.energyCapacity*.12:0));
}
export function weaponEnergyCost(weapon){
 const s=weapon.sim,source=s.powerSource??(weapon.kind==='beam'&&s.ammo>=0?'ammo':s.energyCost>0?'reactor':'none');
 return source==='reactor'?s.energyCost:0;
}

// Burst budgets use the actual machine buffer, domain cost and active output modifiers.
export function maneuverEnergyCost(u,multiplier,seconds,medium='space',startup=0){
 const m=u.machine.sim,scale=multiplier/10*(u.skillRuntime?.factors.thrust??1),domain=['air','surface'].includes(medium)?(m.airPowerMultiplier??1):1;
 return startup+m.flightPower*domain*scale*Math.min(2.5,1+Math.max(0,scale-1)*.2)*Math.max(0,seconds);
}
export function affordableManeuver(u,maximum,seconds,medium='space',emergency=false){
 const startup=emergency?(u.machine.sim.dodgeEnergyCost??5):0,reserve=emergency?0:u.machine.sim.energyCapacity*u.pilotState.tactics.energyReserveFraction*.5;
 const budget=Math.max(0,Math.min(u.energy,hasUnlimitedEnergy(u)?Infinity:u.totalEnergy??u.energy)-reserve);
 if(budget<=startup)return {multiplier:0,cost:0,budget,startup};
 const full=maneuverEnergyCost(u,maximum,seconds,medium,startup);
 if(full<=budget)return {multiplier:maximum,cost:full,budget,startup};
 let lo=0,hi=maximum;for(let i=0;i<7;i++){const middle=(lo+hi)/2;if(maneuverEnergyCost(u,middle,seconds,medium,startup)<=budget)lo=middle;else hi=middle;}
 return {multiplier:lo,cost:maneuverEnergyCost(u,lo,seconds,medium,startup),budget,startup};
}
