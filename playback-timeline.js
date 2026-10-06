// Playback only: cursor over immutable recorded events. Never recalculates battle outcomes.
const upper = (rows, time) => {
    let a = 0, b = rows.length;
    while (a < b) {
        const mid = a + b >> 1;
        if (rows[mid].t <= time) a = mid + 1; else b = mid;
    }
    return a;
};

export class PlaybackTimeline {
    constructor(record) {
        this.events = record.events || [];
        this.effects = record.effects || [];
        this.reset();
    }
    reset() {
        this.time = -1;
        this.eventEnd = 0;
        this.effectStart = 0;
        this.effectEnd = 0;
        this.log = [];
    }
    at(time) {
        const reverse = time < this.time;
        if (reverse) {
            this.eventEnd = upper(this.events, time);
            this.effectEnd = upper(this.effects, time);
            this.effectStart = upper(this.effects, time - 10 - 1e-9);
        } else {
            while (this.eventEnd < this.events.length && this.events[this.eventEnd].t <= time) this.eventEnd++;
            while (this.effectEnd < this.effects.length && this.effects[this.effectEnd].t <= time) this.effectEnd++;
            while (this.effectStart < this.effectEnd && this.effects[this.effectStart].t < time - 10) this.effectStart++;
        }
        if (reverse || this.end !== this.eventEnd) {
            this.log = this.events.slice(Math.max(0, this.eventEnd - 4e3), this.eventEnd);
            this.end = this.eventEnd;
        }
        this.time = time;
        return {
            events: this.log,
            effects: this.effects.slice(this.effectStart, this.effectEnd).filter(e => e.t + e.life >= time)
        };
    }
}
