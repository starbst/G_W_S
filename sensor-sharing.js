// Direct observations are queued with real radio delay. Forwarded reports never circulate.
export function shareContacts(b){
 const queue=b.contactReports??=[];
 // Delivered data is the actual frozen observation, not a rewound current position.
 while(queue.length&&queue[0].deliverAt<=b.t+1e-9){const report=queue.shift(),source=b.unitById.get(report.source);for(const u of b.spatial.sides[report.side]||[]){if(u.id===report.source||(u.pilotState.strategies?.['sensor-sharing']??0)<=0)continue;const local=u.contacts.get(report.id);if(local&&local.observedAt>=report.contact.observedAt)continue;if(!source||Math.hypot(u.position[0]-source.position[0],u.position[1]-source.position[1],u.position[2]-source.position[2])>u.machine.sim.sensorRangeM)continue;u.contacts.set(report.id,{...report.contact,position:[...report.contact.position],velocity:[...report.contact.velocity],forward:[...report.contact.forward],source:report.source,shared:true});}}
 if(b.tick%5!==1)return;
 for(const side of Object.keys(b.spatial.sides)){const reports=new Map();for(const u of b.spatial.sides[side]||[]){if((u.pilotState.strategies?.['sensor-sharing']??0)<=0)continue;for(const[id,c]of u.contacts)if(!c.shared&&b.t-c.observedAt<(b.units.length>32?.22:.1)&&(!reports.has(id)||reports.get(id).contact.observedAt<c.observedAt))reports.set(id,{id,source:u.id,side,contact:{...c,position:[...c.position],velocity:[...c.velocity],forward:[...c.forward]},deliverAt:b.t+.12});}queue.push(...reports.values());}
}
