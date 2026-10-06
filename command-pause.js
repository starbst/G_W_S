// Shared by the worker and UI: player handoff is distinct from synchronous AI work.
export function playerPauseEvents(events,mode,focus='overall'){
 if(mode==='auto')return [];
 const concerned=e=>focus==='overall'||focus==='a'?e.actor?.startsWith('a-')||e.target?.startsWith('a-')||e.ally?.startsWith('a-'):e.actor===focus||e.target===focus||e.ally===focus;
 return events.filter(e=>concerned(e)&&(mode==='hard'?['command','decision','lost','warning','hit','destroyed','captured','phase-down','disabled'].includes(e.type)&&e.source!=='player':['lost','hit','destroyed','captured','phase-down','disabled'].includes(e.type)||e.type==='command'&&e.source==='ai'&&e.command==='escort'));
}
