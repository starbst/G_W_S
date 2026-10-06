import {issuePlayerCommand} from './command.js';
import {playerPauseEvents} from './command-pause.js';
import { Battle } from "./simulation.js";

import { RecordingWriter } from "./recording-codec.js";

let battle = null, writer = null, awaiting = null, finalizePending = false;

self.onmessage = ({data: data}) => {
    try {
        if (data.type === "ack") {
            if (data.index === awaiting) {
                awaiting = null;
                if (finalizePending) {
                    finalizePending = false;
                    self.onmessage({
                        data: {
                            type: "finalize"
                        }
                    });
                }
            }
            return;
        }
        if (data.type === "init") {
            finalizePending = false;
            awaiting = null;
            battle = new Battle(data.catalog, data.scenario, data.seed);
            writer = new RecordingWriter({...data.recordMeta,seed:data.seed,startConditions:{version:1,scenario:{...structuredClone(battle.scenario),seed:data.seed}}}, battle.snapshot());
            writer?.observe(battle.events);
            writer?.capture(battle.snapshot());
            self.postMessage({
                type: "state",
                snapshot: battle.snapshot(),
                events: battle.events.splice(0),
                frames: writer ? [] : [ battle.snapshot() ],
                recordHeader: writer?.header
            });
            return;
        }
        if(data.type==='command'&&battle){
            try{
                issuePlayerCommand(battle,'a',data.command);
                writer?.observe(battle.events);
                self.postMessage({type:'command-state',requestId:data.requestId,snapshot:battle.snapshot(),events:battle.events.splice(0)});
            }catch(error){self.postMessage({type:'command-rejected',requestId:data.requestId,message:error.message});}
            return;
        }
        if (data.type === "finalize" && awaiting !== null) {
            finalizePending = true;
            return;
        }
        if ((data.type === "advance" || data.type === "finalize") && battle && awaiting === null) {
            const frames = [], effects = [], count = data.type === "finalize" ? 0 : Math.max(1, Math.min(8, Number(data.steps) || 1));
            const batchStarted=performance.now();
            for (let i = 0; i < count && !battle.result; i++) {
                battle.step();
                const fresh = battle.effects.filter(e => e.t === battle.t);
                effects.push(...fresh);
                writer?.observe(battle.events.filter(e => e.t === battle.t), fresh);
                if (battle.tick % 4 === 0 || battle.result) {
                    const frame = battle.snapshot();
                    if (writer) writer.capture(frame); else frames.push(frame);
                }
                if(playerPauseEvents(battle.events,data.mode||'auto',data.focus).length)break;
                if (performance.now()-batchStarted>=12)break;
                if (writer?.frames.length >= writer.blockSize || battle.events.some(e => [ "decision", "strategy", "strategy-roll", "interruption", "guard-break", "defense", "warning", "reaction" ].includes(e.type))) break;
            }
            if (data.type === "finalize") {
                battle.result = {
                    reason: "aborted",
                    winner: null,
                    t: battle.t
                };
                writer?.capture(battle.snapshot());
            }
            const chunk = battle.result ? writer?.finish(battle.result) : writer?.flush();
            if (chunk) awaiting = chunk.index;
            self.postMessage({
                type: "state",
                snapshot: battle.snapshot(),
                events: battle.events.splice(0),
                frames: frames,
                effects: effects,
                chunk: chunk,
                recordHeader: writer ? {
                    ...writer.header
                } : null
            });
        }
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error.message
        });
    }
};
