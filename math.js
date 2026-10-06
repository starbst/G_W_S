export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const add = (a, b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a, b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul = (a, s) => [a[0]*s,a[1]*s,a[2]*s];
export const dot = (a, b) => ((0+a[0]*b[0])+a[1]*b[1])+a[2]*b[2];
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const length = a => Math.hypot(...a);
export const norm = a => mul(a, 1 / (length(a) || 1));
export const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function rotateToward(a, b, radians) {
    const angle = Math.acos(clamp(dot(a, b), -1, 1));
    if (angle <= radians) return [...b];
    let axis = norm(cross(a, b));
    if (length(axis) < 0.1) axis = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0,1,0] : [1,0,0]));
    return norm(add(add(mul(a, Math.cos(radians)), mul(cross(axis, a), Math.sin(radians))), mul(axis, dot(axis,a)*(1-Math.cos(radians)))));
}
// Closest approach of two moving points during a tick (continuous collision).
export function segmentSphere(a, b, radius) {
    const d = sub(b, a), t = clamp(-dot(a, d) / (dot(d, d) || 1));
    return length(add(a, mul(d, t))) <= radius;
}
export function seededRandom(seed) {
    let s = seed >>> 0;
    return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Body-space helpers: local z is forward, x right, y up. Angles are degrees.
export function bodyBasis(forward) {
 const f=norm(forward),right=norm(cross(f,Math.abs(f[1])>0.98?[0,0,1]:[0,1,0]));
 return {forward:f,right,up:norm(cross(right,f))};
}
export function bodyVector(v,forward){const b=bodyBasis(forward);return [dot(v,b.right),dot(v,b.up),dot(v,b.forward)];}
export function worldVector(v,forward){const b=bodyBasis(forward);return add(add(mul(b.right,v[0]),mul(b.up,v[1])),mul(b.forward,v[2]));}
// Pose arrays are replaced or checked component by component; WeakMap does not
// retain old poses, and an in-place edit cannot leave a stale weapon basis.
const arcBases=new WeakMap();
function arcBasis(forward){
 const cached=arcBases.get(forward);if(cached&&Object.is(cached.x,forward[0])&&Object.is(cached.y,forward[1])&&Object.is(cached.z,forward[2]))return cached;
 const fl=1/(Math.hypot(...forward)||1),fx=forward[0]*fl,fy=forward[1]*fl,fz=forward[2]*fl;
 const vertical=Math.abs(fy)>0.98,ax=0,ay=vertical?0:1,az=vertical?1:0;
 let rx=fy*az-fz*ay,ry=fz*ax-fx*az,rz=fx*ay-fy*ax;
 const rl=1/(Math.hypot(rx,ry,rz)||1);rx*=rl;ry*=rl;rz*=rl;
 let ux=ry*fz-rz*fy,uy=rz*fx-rx*fz,uz=rx*fy-ry*fx;
 const ul=1/(Math.hypot(ux,uy,uz)||1);ux*=ul;uy*=ul;uz*=ul;
 const basis={x:forward[0],y:forward[1],z:forward[2],fx,fy,fz,rx,ry,rz,ux,uy,uz};arcBases.set(forward,basis);return basis;
}
export function arcSolution(forward,direction,weapon){
 const {fx,fy,fz,rx,ry,rz,ux,uy,uz}=arcBasis(forward);
 const dl=1/(Math.hypot(...direction)||1),dx=direction[0]*dl,dy=direction[1]*dl,dz=direction[2]*dl;
 const x=((0+dx*rx)+dy*ry)+dz*rz,y=((0+dx*ux)+dy*uy)+dz*uz,z=((0+dx*fx)+dy*fy)+dz*fz;
 const yaw=Math.atan2(x,z)*180/Math.PI,pitch=Math.atan2(y,Math.hypot(x,z))*180/Math.PI;
 const edge=Math.max(Math.abs(yaw)/weapon.arcYawDeg,Math.abs(pitch)/weapon.arcPitchDeg);
 return {inside:edge<=1,edge,yaw,pitch,spreadMultiplier:1+(weapon.edgeSpreadMultiplier-1)*clamp((edge-0.55)/0.45)**2};
}
// Policies only need the boolean cone gate; avoid creating a spread/angle result
// for every candidate weapon. Arithmetic stays identical to arcSolution.
export function insideArc(forward,direction,weapon){
 const {fx,fy,fz,rx,ry,rz,ux,uy,uz}=arcBasis(forward);
 const dl=1/(Math.hypot(...direction)||1),dx=direction[0]*dl,dy=direction[1]*dl,dz=direction[2]*dl;
 const x=((0+dx*rx)+dy*ry)+dz*rz,y=((0+dx*ux)+dy*uy)+dz*uz,z=((0+dx*fx)+dy*fy)+dz*fz;
 const yaw=Math.atan2(x,z)*180/Math.PI,pitch=Math.atan2(y,Math.hypot(x,z))*180/Math.PI;
 return Math.max(Math.abs(yaw)/weapon.arcYawDeg,Math.abs(pitch)/weapon.arcPitchDeg)<=1;
}
export function rotateBody(forward,target,yawRate,pitchRate,dt){
 const yaw=Math.atan2(forward[2],forward[0]),pitch=Math.asin(clamp(forward[1],-1,1));
 const wantYaw=Math.atan2(target[2],target[0]),wantPitch=Math.asin(clamp(target[1],-1,1));
 const dy=Math.atan2(Math.sin(wantYaw-yaw),Math.cos(wantYaw-yaw));
 const nextYaw=yaw+clamp(dy,-yawRate*dt,yawRate*dt),nextPitch=pitch+clamp(wantPitch-pitch,-pitchRate*dt,pitchRate*dt);
 return [Math.cos(nextPitch)*Math.cos(nextYaw),Math.sin(nextPitch),Math.cos(nextPitch)*Math.sin(nextYaw)];
}
export function limitBodyVector(vector,forward,limits,base){
 if(base<=0)return [0,0,0];
 const b=bodyBasis(forward),local=[dot(vector,b.right),dot(vector,b.up),dot(vector,b.forward)];
 const caps=[limits.lateral,local[1]>=0?limits.up:limits.down,local[2]>=0?limits.forward:limits.reverse].map(v=>v*base);
 const ratio=Math.hypot(...local.map((v,i)=>v/caps[i]));
 const scaled=local.map(v=>v/Math.max(1,ratio));
 return add(add(mul(b.right,scaled[0]),mul(b.up,scaled[1])),mul(b.forward,scaled[2]));
}

// Constant-velocity interception; the emitted projectile never homes after this solution.
export function interceptPoint(origin,position,velocity,speed,maxTime=10){
 const r=sub(position,origin),a=dot(velocity,velocity)-speed*speed,b=2*dot(r,velocity),c=dot(r,r);let t;
 if(Math.abs(a)<1e-9)t=Math.abs(b)>1e-9?-c/b:0;
 else {const disc=b*b-4*a*c;if(disc>=0){const roots=[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)].filter(x=>x>=0);t=roots.length?Math.min(...roots):undefined;}}
 t=Number.isFinite(t)&&t>=0?Math.min(t,maxTime):Math.min(length(r)/Math.max(1,speed),maxTime);
 return {position:add(position,mul(velocity,t)),time:t};
}

// Axis-aligned terrain entry; padding belongs to the projectile, not blast damage.
export function boxEntry(from,to,center,dimensions,padding=0){
 let entry=0,exit=1;for(let i=0;i<3;i++){const start=from[i]-center[i],delta=to[i]-from[i],half=dimensions[i]*.5+padding;if(Math.abs(delta)<1e-12){if(Math.abs(start)>half)return null;continue;}let a=(-half-start)/delta,z=(half-start)/delta;if(a>z)[a,z]=[z,a];entry=Math.max(entry,a);exit=Math.min(exit,z);if(entry>exit)return null;}return entry;
}
