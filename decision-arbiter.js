import {judgmentQuality} from './pilot-judgment.js';
// One arbitration point: invalid plans expire, emergencies preempt, useful actions finish.
export function arbitrateStrategy(b,u,choices,c){
 choices.sort((a,z)=>z.priority-a.priority||z.score-a.score);
 let best=choices[0];if(!best)return null;
 const previous=u.operationalPlan,same=previous&&choices.find(x=>x.id===previous.id);
 if(same){
  const quality=judgmentQuality(u),holding=b.t<previous.until;
  const committed=u.weapons?.some(w=>(w.attack?.targetId===u.targetId&&w.attack.at-b.t<=1.2)||(w.salvo?.targetId===u.targetId&&w.salvo.remaining>0))||u.swing?.until>b.t;
  const inContact=['follow','rush'].includes(same.mode)&&u.bladeFollowUp?.targetId===u.targetId&&u.bladeFollowUp.until>b.t;
  // A higher defensive or mission tier always wins. Minor pressure cannot waste a
  // nearly finished windup unless its payoff is substantially better.
  const minorPreemption=committed&&best.priority<2&&same.priority===0&&best.priority===1;
  if(best.priority<=same.priority||minorPreemption){
   const relative=holding ? .16+.14*quality : .08,margin=Math.max(c.planSwitchMargin||0,Math.abs(same.score)*relative);
   const executionMargin=committed||inContact?Math.abs(same.score)*(.28+.12*quality):0;
   if(best.score-same.score<=Math.max(margin,executionMargin))return same;
  }
 }
 const near=choices.filter(x=>x.priority===best.priority&&x.score>=best.score-c.strategyTieMargin);
 if(near.length>1)best=near[Math.min(near.length-1,Math.floor(b.random()*near.length))];
 return best;
}
