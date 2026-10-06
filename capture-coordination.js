import {capturePosition,vulnerableContact} from './grapples.js';
import {sub,length,dot,norm} from './math.js';

// Recovery intentions coordinate friendly fire, never collisions or damage. A
// reservation expires as soon as observation, reachability or intent is lost.
export function updateCaptureReservations(b){
 const previous=b.captureReservations||new Map(),next=new Map();
 for(const captor of b.units){const g=captor.machine.grappleSystem;
  if(!g||!captor.alive||captor.docked||captor.capturedBy||captor.withdrawing||captor.components.engine<.2||captor.energy<g.energyPerS*2||!(captor.pilotState.strategies?.['capture-disabled']>0))continue;
  if(!captor.grappleTarget&&captor.commandAssignment?.source==='player'&&['attack','screen'].includes(captor.commandAssignment.type))continue;
  const id=captor.grappleTarget||captor.captureIntent||captor.targetId,target=b.unitById.get(id),c=captor.contacts.get(id);
  if(!target?.alive||target.side===captor.side||target.docked||!c||b.t-c.observedAt>.6||!b.canSee(captor.position,c.position)||target.capturedBy&&target.capturedBy!==captor.id)continue;
  // A firing reservation must describe a capture the contact controller can
  // actually execute. In particular, damaged ships are never MS claw targets.
  if(!captor.grappleTarget&&!vulnerableContact(b,captor,target))continue;
  const delta=sub(c.position,captor.position),away=Math.max(0,-dot(captor.velocity,norm(delta)));
  const accel=captor.machine.sim.thrustN/captor.machine.sim.massKg*10*captor.components.engine;
  const eta=Math.max(0,length(delta)-g.reachM)/Math.max(1,captor.machine.sim.maxSpeedMps*.85)+away/Math.max(1,accel);
  if(!captor.grappleTarget&&eta>6)continue;
  const key=captor.side+':'+id,old=next.get(key),retained=previous.get(key)?.captorId===captor.id?.25:0;
  if(!old||eta-retained<old.eta)next.set(key,{captorId:captor.id,targetId:id,eta,at:b.t});
 }
 b.captureReservations=next;
}
export function captureApproachHeld(b,u,target){
 if(!target||u.commandAssignment?.source==='player'&&['attack','screen'].includes(u.commandAssignment.type))return false;
 return u.targetId===target.id&&u.pilotState.strategies?.['capture-restraint']>0&&u.structure>=u.machine.sim.structure*.5&&!!capturePosition(b,u,target);
}
export function captureFireHeld(b,u,target){
 if(!target)return false;
 if(target.capturedBy&&b.unitById.get(target.capturedBy)?.side===u.side)return true;
 if(u.commandAssignment?.source==='player'&&['attack','screen'].includes(u.commandAssignment.type)&&u.commandAssignment.targetId===target.id)return false;
 if(captureApproachHeld(b,u,target))return true;
 const claim=b.captureReservations?.get(u.side+':'+target.id);if(!claim||b.t-claim.at>.1)return false;
 if(claim.captorId===u.id)return true;
 // Capturing an immobile prize does not override immediate self-defense against
 // an observed active attack from it. No hidden energy or cooldown is queried.
 const contact=u.contacts.get(target.id);
 return !(contact&&b.t-contact.observedAt<=.6&&contact.aimTargetIds?.includes(u.id));
}
