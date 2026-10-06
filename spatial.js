import { sub, length, segmentSphere } from "./math.js";

// Simulation broad phase only. Exact tests remain in the caller; camera never enters this index.
const extents=new WeakMap();const extent=u=>{const r=u.machine?.sim.radiusM??u.radius??0,d=u.machine?.renderProfile?.dimensions;let cache=extents.get(u);if(!cache||cache.r!==r||cache.x!==d?.[0]||cache.y!==d?.[1]||cache.z!==d?.[2]){cache={r,x:d?.[0],y:d?.[1],z:d?.[2],value:Math.max(r,(d?.[0]||0)*.5,(d?.[1]||0)*.5,(d?.[2]||0)*.5,...(u.machine?.sim.componentCollisions?Object.values(u.componentState||{}).map(c=>Math.hypot(...c.position)+c.radiusM):[]))};extents.set(u,cache);}return cache.value;};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const intersects=(from,to,p,r)=>{const ax=from[0]-p[0],ay=from[1]-p[1],az=from[2]-p[2],dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2],t=Math.max(0,Math.min(1,-(((0+ax*dx)+ay*dy)+az*dz)/(((0+dx*dx)+dy*dy+dz*dz)||1)));return Math.hypot(ax+dx*t,ay+dy*t,az+dz*t)<=r;};

export class SpatialIndex {
    constructor(cellSize = 1600) {
        this.cellSize = cellSize;
        this.cells = new Map;
        this.byId = new Map;
        this.sides = {
            a: [],
            b: [],
            c: []
        };
        this.maxRadius = 0;
    }
    rebuild(units) {
        this.cells.clear();
        this.byId.clear();
        this.sides = {
            a: [],
            b: [],
            c: []
        };
        this.maxRadius = 0;
        for (const u of units) {
            this.byId.set(u.id, u);
            if (!u.alive || u.docked) continue;
            this.sides[u.side]?.push(u);
            const r = extent(u);
            this.maxRadius = Math.max(this.maxRadius, r);
            const key = u.position.map(x => Math.floor(x / this.cellSize)).join(",");
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push(u);
        }
    }
    nearby(p, r) {
        r += this.maxRadius;
        const min = p.map(x => Math.floor((x - r) / this.cellSize)), max = p.map(x => Math.floor((x + r) / this.cellSize)), result = [];
        const volume = (max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1);
        if (volume > this.cells.size * 4) return [ ...this.byId.values() ].filter(u => u.alive && !u.docked && distance(u.position,p) <= r);
        for (let x = min[0]; x <= max[0]; x++) for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) for (const u of this.cells.get([ x, y, z ].join(",")) || []) if (distance(u.position,p) <= r) result.push(u);
        return result;
    }
    segment(from, to, padding = 0) {
        const center = from.map((x, i) => (x + to[i]) * .5), radius = distance(to,from) * .5 + padding;
        return this.nearby(center, radius).filter(u => intersects(from,to,u.position,extent(u)+padding));
    }
}
