// Shared terrain limits for live movement, defensive forecasts and skill speed.
import {environmentAt} from './battlefield.js';
import {pilotControlAuthority} from './energy-policy.js';
import {add,sub,mul,dot,norm,length,clamp} from './math.js';
export function atGround(u){return u.position[1]<=u.machine.sim.radiusM*.5+2&&u.velocity[1]<=.5;}
export function groundLimited(b,u,env=environmentAt(b,u.position)){
 const tags=u.machine.tags;if(u.mountId||!tags.includes('ground-combat'))return false;
 if(!['ground','air','surface'].includes(env?.medium||b.environment.medium))return false;
 // Flight capability only bypasses traction after actual lift-off. A grounded
 // aircraft can still command upward thrust; a ground-only MS gets a short jump.
 return !tags.includes('air-combat')&&!tags.includes('all-domain')||atGround(u);
}
export function groundTraction(u,env){
 const sand=env?.tags?.includes('sand');return sand?(u.machine.sim.sandTractionFactor??(u.machine.tags.includes('ground-specialized')||u.machine.tags.includes('sand-specialized')?1:.8)):1;
}
export function groundSpeed(u,env){
 const m=u.machine.sim,base=m.groundSpeedMps;
 // maxSpeed already includes the skill factor; the independent ground value does not.
 return Math.min(m.maxSpeedMps,base===undefined?Math.min(140,m.maxSpeedMps*.25):base*(u.skillRuntime?.factors.speed??1))*groundTraction(u,env);
}
export function groundHandling(b,u,env=environmentAt(b,u.position)){
 const limited=groundLimited(b,u,env),traction=limited?groundTraction(u,env):1,m=u.machine.sim;
 return {limited,acceleration:limited?(m.groundAccelerationFactor??.65)*traction:1,turn:limited?(m.groundTurnFactor??1)*traction:1};
}
export function motionSpeedLimit(b,u,emergency=false,env=environmentAt(b,u.position)){
 return groundLimited(b,u,env)?Math.min(u.machine.sim.maxSpeedMps,groundSpeed(u,env)*(emergency||b.t<(u.jumpBoostUntil||0)||!atGround(u)?1.65:1)):u.machine.sim.maxSpeedMps;
}
export function tryGroundJump(b,u){
 if(u.machine.tags.includes('air-combat')||u.machine.tags.includes('all-domain')||!groundLimited(b,u)||!atGround(u)||b.t<(u.jumpReadyAt||0)||u.components.engine<.2||u.desired[1]<=5)return false;
 const target=b.targetFor(u),seen=u.contacts?.get(target?.id),height=seen?.position[1]-u.position[1],m=u.machine.sim,maxHeight=m.jumpHeightM??100;
 if(!seen||b.t-seen.observedAt>.6||height<=5||height>maxHeight||Math.hypot(seen.position[0]-u.position[0],seen.position[2]-u.position[2])>Math.max(250,groundSpeed(u,environmentAt(b,u.position))*1.6))return false;
 const cost=m.jumpEnergyCost??m.dodgeEnergyCost;if(u.energy<cost||!(maxHeight>0))return false;
 const gravity=Math.max(1,environmentAt(b,u.position).sim.gravity);b.spend(u,cost);
 u.velocity[1]=Math.sqrt(2*gravity*maxHeight)*Math.sqrt(Math.max(.2,u.components.engine));
 u.jumpBoostUntil=b.t+.55;u.jumpReadyAt=b.t+2;u.jumping=true;
 b.emit('jump',u.id,u.machine.name+' 短促喷射跳跃',{heightM:maxHeight,energyCost:cost});return true;
}

// Finite, observation-only intercept forecast. It includes coasting while turning
// and time to accelerate, so equal-speed tail pursuit is not treated as closure.
export function meleeInterceptCourse(b,u,contact,reach=0){
 const m=u.machine.sim,c=u.pilotState.tactics,authority=pilotControlAuthority(u)*(u.components.engine??1),power=Math.max(0,Math.min(1,u.energy/12)),env=b?environmentAt(b,u.position):null,handling=b?groundHandling(b,u,env):{acceleration:1,turn:1};
 const speed=(b?motionSpeedLimit(b,u,false,env):m.maxSpeedMps)*.95,horizon=Math.max(.4,Math.min(12,c.maxRushSeconds)),delta=sub(contact.position,u.position),velocity=contact.velocity||[0,0,0];
 if(length(delta)<=reach)return {feasible:true,time:0,point:[...contact.position],heading:norm(delta),speed};
 const acceleration=m.thrustN/m.massKg*10*authority*power*u.machine.mobility.accel.forward*handling.acceleration,turnRate=Math.min(m.turnRateDeg,u.machine.mobility.pitchRateDeg)*Math.PI/180*authority*power*c.turnMultiplier*handling.turn;
 if(!(acceleration>0)||!(speed>0)||!(turnRate>0))return {feasible:false,time:Infinity,point:[...contact.position],heading:norm(delta),speed};
 const measure=time=>{const point=add(contact.position,mul(velocity,time)),direct=sub(point,u.position),turn=Math.min(time,Math.acos(clamp(dot(u.forward,norm(direct)),-1,1))/turnRate),coast=add(u.position,mul(u.velocity,turn)),route=sub(point,coast),axis=norm(route),available=Math.max(0,time-turn),initial=Math.min(speed,dot(u.velocity,axis)),ramp=Math.min(available,Math.max(0,(speed-initial)/acceleration)),travel=initial*ramp+.5*acceleration*ramp*ramp+speed*(available-ramp);return {point,gap:length(route)-reach-Math.max(0,travel)};};
 const relative=sub(velocity,u.velocity),closest=clamp(-dot(delta,relative)/Math.max(1,dot(relative,relative)),0,horizon),times=Array.from({length:8},(_,i)=>horizon*(i+1)/8);if(closest>0)times.push(closest);times.sort((a,z)=>a-z);
 let previous=0;for(const time of times){if(measure(time).gap<=0){let lo=previous,hi=time;for(let i=0;i<7;i++){const mid=(lo+hi)/2;if(measure(mid).gap<=0)hi=mid;else lo=mid;}const point=measure(hi).point;return {feasible:true,time:hi,point,heading:norm(sub(point,u.position)),speed};}previous=time;}
 return {feasible:false,time:Infinity,point:[...contact.position],heading:norm(delta),speed};
}
