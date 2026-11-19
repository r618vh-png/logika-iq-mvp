import {renewalScreen} from '../src/exit-survey.mjs';
// A reproducible one-week example, populated only in its own in-memory database.
export function populateDemo(db) {
  if (db.prepare('PRAGMA database_list').all().some(source=>source.file)) {
    throw new Error('The demonstration requires an in-memory database');
  }
  const names=['anna','daniil','elena','ivan','maria','pavel','irina','roman','olga','timur','vera','nikita','alina','artem','sofia','maksim'];
  const surnames=['sokol','volkov','mir','orlov','belov','moroz','novik','vetrov','lake','north','lime'];
  const stageSizes=[49,36,22,14,32,23,8,29,27];
  const stages=stageSizes.flatMap((count,stage)=>Array(count).fill(stage));
  let seed=92;
  const random=n=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return Math.floor(seed*n/4294967296);
  };
  for(let i=stages.length-1;i>0;i--){
    const j=random(i+1);
    [stages[i],stages[j]]=[stages[j],stages[i]];
  }
  const journey=db.prepare('INSERT INTO journeys(id,started,question,touched) VALUES(?,?,?,?)');
  const attempt=db.prepare(`INSERT INTO attempts(id,journey,answers,result,created_at,email,consent_at,offer_at,checkout_at,paid_at,report_at,training_at,status,reminder_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const firstDay=Date.parse('2026-11-12T00:00:00+03:00');
  const daily=[24,27,39,43,33,35,39];
  const days=daily.flatMap((count,day)=>Array(count).fill(day));
  let contacts=0,person=0;
  db.exec('BEGIN');
  try {
    stages.forEach((stage,i)=>{
      const start=firstDay+days[i]*86400000+(8*60+random(13*60))*60000;
      const question=stage===0?0:stage===1?1+random(9):9;
      const finish=start+150000+random(120000);
      const id='demo-'+(i+1);
      journey.run(id,start,question,question?start+question*8000:start);
      if(stage<2) return;
      let email=null;
      if(stage>=3){
        contacts++;
        if(contacts%13!==0) person++;
        const n=person-1;
        email=names[n%names.length]+'.'+surnames[Math.floor(n/names.length)]+'@example.test';
      }
      const at=step=>stage>=step?finish+(step-2)*18000:null;
      const score=2+random(8);
      attempt.run(id,id,'[]',JSON.stringify({score,total:9}),finish,email,at(3),at(4),at(5),at(6),at(7),at(8),
        stage>=6?'paid':'pending',email && random(4)!==0?at(3):null);
    });
    const destinations=[1,2,3,4,5,6,7,8,9,10,0,0,1,4,2,8,10,0];
    const save=db.prepare(`INSERT INTO cancel_flows(id,attempt,started,outcome,decided,effective,period_end,offer_path,offer_code,exit_step,choice,survey_answers)
      VALUES(?,?,?,?,?,?,?,1,?,?,?,?)`);
    db.prepare("SELECT id,paid_at FROM attempts WHERE status='paid' ORDER BY paid_at LIMIT 18").all().forEach((a,i)=>{
      const dest=destinations[i], step=dest || [3,5,8][i%3], start=a.paid_at+1800000;
      const outcome=!dest?null:dest===10?(i===9?'keep':'cancel'):[1,4].includes(dest)?'discount':dest===2?'pause':'keep';
      const key=dest>0 && outcome!=='cancel'?renewalScreen(dest).offer:null;
      const history=Array.from({length:dest?step:step-1},(_,index)=>{
        const number=index+1,q=renewalScreen(number),code=number===dest?(key||outcome):'continue';
        return {number,title:q.title,code,label:q.options[code]};
      });
      const end=a.paid_at+7*86400000, decided=outcome?start+step*4000:null;
      save.run('flow-'+a.id,a.id,start,outcome,decided,outcome==='pause'?decided+30*86400000:['discount','cancel'].includes(outcome)?end:null,
        key==='fortnight'?end+14*86400000:key==='bonus'?end+7*86400000:key==='pause30'?end+30*86400000:null,key,step,history.at(-1)?.code??null,JSON.stringify(history));
    });
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
