import { add, sub, mul, dot, length, bodyBasis, boxEntry } from "./math.js";

import { localPoint } from "./entities.js";
const axisCache=new WeakMap();
function sweepBoundsOverlap(from,to,p,v,dt,r){for(let i=0;i<3;i++){const previous=p[i]-v[i]*dt;if(Math.max(from[i],to[i])<Math.min(p[i],previous)-r||Math.min(from[i],to[i])>Math.max(p[i],previous)+r)return false;}return true;}
function hullAxes(u){
 let axes=axisCache.get(u),f=u.forward,roll=u.roll||0;
 if(!axes||axes.x!==f[0]||axes.y!==f[1]||axes.z!==f[2]||axes.roll!==roll){const b=bodyBasis(f),c=Math.cos(roll),s=Math.sin(roll);
 axes={x:f[0],y:f[1],z:f[2],roll,up:add(mul(b.up,c),mul(b.right,s)),right:add(mul(b.right,c),mul(b.up,-s))};axisCache.set(u,axes);}
 return axes;
}

// Entry parameter of a swept segment. This is independent of rendering and timestep FPS.
export function sphereEntry(a, z, r) {
    const v = sub(z, a), qa = dot(v, v), qb = 2 * dot(a, v), qc = dot(a, a) - r * r;
    if (qc <= 0) return 0;
    const disc = qb * qb - 4 * qa * qc;
    if (qa < 1e-12 || disc < 0) return null;
    const t = (-qb - Math.sqrt(disc)) / (2 * qa);
    return t >= 0 && t <= 1 ? t : null;
}

export function hullEntry(u, from, to, previous, padding = 0) {
    const dims=u.machine.renderProfile?.dimensions;if(!dims)return sphereEntry(sub(from,previous),sub(to,u.position),u.machine.sim.radiusM+padding);
    const basis=hullAxes(u),f=u.forward,up=basis.up,right=basis.right;
    const ax=from[0]-previous[0],ay=from[1]-previous[1],az=from[2]-previous[2],zx=to[0]-u.position[0],zy=to[1]-u.position[1],zz=to[2]-u.position[2];
    const rx=dims[0]*.5+padding,ry=dims[1]*.5+padding,rz=dims[2]*.5+padding;
    const x=((0+ax*f[0])+ay*f[1]+az*f[2])/rx,y=((0+ax*up[0])+ay*up[1]+az*up[2])/ry,z=((0+ax*right[0])+ay*right[1]+az*right[2])/rz;
    const dx=((0+zx*f[0])+zy*f[1]+zz*f[2])/rx-x,dy=((0+zx*up[0])+zy*up[1]+zz*up[2])/ry-y,dz=((0+zx*right[0])+zy*right[1]+zz*right[2])/rz-z;
    const qa=((0+dx*dx)+dy*dy)+dz*dz,qb=2*(((0+x*dx)+y*dy)+z*dz),qc=((0+x*x)+y*y)+z*z-1;if(qc<=0)return 0;const disc=qb*qb-4*qa*qc;if(qa<1e-12||disc<0)return null;const t=(-qb-Math.sqrt(disc))/(2*qa);return t>=0&&t<=1?t:null;
}

// Exposed mounts are real geometry, not aim points floating outside a hull.
export function componentEntry(u,from,to,previous,padding=0){
 if(!u.machine.sim.componentCollisions)return null;
 const axes=hullAxes(u),f=u.forward;let closest=null;
 for(const c of Object.values(u.componentState||{})){if(c.health<=0)continue;const p=c.position;
 const ox=f[0]*p[0]+axes.up[0]*p[1]+axes.right[0]*p[2],oy=f[1]*p[0]+axes.up[1]*p[1]+axes.right[1]*p[2],oz=f[2]*p[0]+axes.up[2]*p[1]+axes.right[2]*p[2];
 const ax=from[0]-previous[0]-ox,ay=from[1]-previous[1]-oy,az=from[2]-previous[2]-oz,dx=to[0]-u.position[0]-ox-ax,dy=to[1]-u.position[1]-oy-ay,dz=to[2]-u.position[2]-oz-az,r=c.radiusM+padding;
 const qa=dx*dx+dy*dy+dz*dz,qb=2*(ax*dx+ay*dy+az*dz),qc=ax*ax+ay*ay+az*az-r*r,disc=qb*qb-4*qa*qc;
 const at=qc<=0?0:qa>1e-12&&disc>=0?(-qb-Math.sqrt(disc))/(2*qa):null;
 if(at!==null&&at>=0&&at<=1&&(!closest||at<closest.at))closest={at,partId:c.id};
 }return closest;
}
export function globalPoint(u, local) {
    const basis = bodyBasis(u.forward), roll = u.roll || 0, up = add(mul(basis.up, Math.cos(roll)), mul(basis.right, Math.sin(roll))), right = add(mul(basis.right, Math.cos(roll)), mul(basis.up, -Math.sin(roll)));
    return add(u.position, add(mul(u.forward, local[0]), add(mul(up, local[1]), mul(right, local[2]))));
}

export function projectileContact(b, shot, next, previous, dt) {
    // Blast is an effect after impact, not a larger hull for every shell. Guided missiles retain a proximity fuse.
    const owner = b.unitById.get(shot.owner), padding = shot.weapon.projectileRadiusM??(['missile','funnel-missile'].includes(shot.kind)?shot.weapon.blastRadiusM*.35:shot.kind==='beam'?1:.45), maxMotion = b.tickMotionPadding ?? Math.max(0, ...b.units.filter(u => u.alive && !u.docked).map(u => length(u.velocity) * dt));
    const candidates = b.spatial.segment(shot.position, next, padding + maxMotion);
    let contact = null;
    for (const u of candidates.sort((a, c) => a.id.localeCompare(c.id))) {
        if (u === owner || !u.alive || u.docked || shot.ignoredUnitIds?.includes(u.id)) continue;
        if(b.t<(u.moduleSeparatedUntil||0))continue;
        // A proximity fuse responds to an enemy return, not the nearby carrier
        // under the launch rail. Friendly hulls still collide with the real body.
        const contactPadding=u.side===owner?.side&&['missile','funnel-missile'].includes(shot.kind)?Math.min(padding,shot.weapon.projectileRadiusM??.45):padding;
        const old=previous[b.unitIndices.get(u.id)],hull=hullEntry(u,shot.position,next,old,contactPadding),part=componentEntry(u,shot.position,next,old,contactPadding),entry=part&&(hull===null||part.at<=hull)?part.at:hull;
        if (entry !== null && (!contact || entry < contact.at)) contact = {
            unit: u,
            componentId:part&&part.at===entry?part.partId:null,
            at: entry
        };
    }
    for (const o of b.objects) {
        if(o.life<=0||o.coreUnitId===shot.owner)continue;
        if(!sweepBoundsOverlap(shot.position,next,o.position,o.velocity,dt,o.radius+padding))continue;
        const entry = sphereEntry(sub(shot.position, sub(o.position, mul(o.velocity, dt))), sub(next, o.position), o.radius + padding);
        if (entry !== null && (!contact || entry < contact.at)) contact = {
            object: o,
            at: entry
        };
    }
    for(const d of b.drones||[]){
        if(d.dead||d.owner===shot.owner||!d.targetable||!sweepBoundsOverlap(shot.position,next,d.position,d.velocity,dt,2+padding))continue;
        const entry=sphereEntry(sub(shot.position,sub(d.position,mul(d.velocity,dt))),sub(next,d.position),2+padding);
        if(entry!==null&&(!contact||entry<contact.at))contact={drone:d,at:entry};
    }
    for (const o of b.field?.obstacles || []) {
        if(o.health===0)continue;
        const entry = o.dimensions?boxEntry(shot.position,next,o.position,o.dimensions,padding):sphereEntry(sub(shot.position,o.position),sub(next,o.position),o.radiusM+padding);
        if (entry !== null && (!contact || entry < contact.at)) contact = {
            obstacle: o,
            at: entry
        };
    }
    return contact;
}
