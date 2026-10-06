// Engineering is a destructible task with continuous work, not a plot trigger.
export function updateWork(b,u,dt){const work=u.machine.workSystem;if(!work||!u.alive||u.docked||u.workProgress>=1)return;
 if(u.energy<work.energyPerS*dt)return;b.spend(u,work.energyPerS*dt);u.workProgress=Math.min(1,(u.workProgress||0)+dt/work.secondsRequired);
 const stage=Math.floor(u.workProgress*4+1e-9);if(stage>(u.workStage||0)){u.workStage=stage;b.emit('work',u.id,u.machine.name+' 作业 '+Math.round(u.workProgress*100)+'%',{progress:u.workProgress});}
}
