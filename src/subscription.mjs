const subDay=86400000;
// Keep the original UTC day of month, clamping to the last day in shorter months.
function cycleBoundary(anchor,now) {
  if(anchor>now) return anchor;
  const a=new Date(anchor),n=new Date(now);
  let offset=(n.getUTCFullYear()-a.getUTCFullYear())*12+n.getUTCMonth()-a.getUTCMonth();
  for(;;offset++){
    const d=new Date(anchor);
    d.setUTCDate(1);d.setUTCMonth(a.getUTCMonth()+offset+1,0);
    d.setUTCDate(Math.min(a.getUTCDate(),d.getUTCDate()));
    if(+d>now) return +d;
  }
}
function surveyHistory(row,usedOffer){
  if(row.survey_answers!==null) return JSON.parse(row.survey_answers);
  // Only import answers already confirmed in an unfinished legacy flow.
  const history=[];
  if(['price','time'].includes(row.reason) && (row.exit_step>=3 || row.second_offer_at)){
    const codes=[row.reason];
    if(row.second_offer_at && !usedOffer) codes.push('continue');
    for(const code of codes){
      const q=exitQuestion(history.length+1,row.reason,usedOffer);
      history.push({title:q.title,code,label:q.options[code]});
    }
  }
  return history;
}
async function subscriptionState(db,id,paid,now){
  // Multiple decisions can share a millisecond. Replay them in insertion order.
  const {results}=await db.prepare('SELECT * FROM cancel_flows WHERE attempt=? ORDER BY rowid').bind(id).all();
  const pending=results.find(r=>!r.outcome);
  const cancel=results.find(r=>r.outcome==='cancel');
  const claimed={};
  let anchor=paid+7*subDay, resume=null, discountedAt=null, discount=299, benefit=null;
  for(const row of results){
    const code=row.offer_code || ({discount:'month149',pause:'pause30'})[row.outcome];
    if(!code) continue;
    claimed[code]=row.decided;
    benefit=code;
    if(row.period_end){
      if(discountedAt===cycleBoundary(anchor,row.decided)) discountedAt=row.period_end;
      anchor=row.period_end;
    }
    if(row.outcome==='pause') resume=row.effective;
    if(row.outcome==='discount'){
      const rate=code==='month99'?99:149;
      discount=discountedAt===row.effective?Math.min(discount,rate):rate;
      discountedAt=row.effective;
    }
  }
  const paused=resume!==null && now<resume;
  const next=cycleBoundary(anchor,now),price=next===discountedAt?discount:299;
  const usedOffer=Boolean(benefit);
  const number=pending?surveyHistory(pending,usedOffer).length+1:null;
  const question=pending?.offer_path?renewalScreen(number,claimed,price):pending?exitQuestion(number,pending.reason,usedOffer):null;
  return {
    status:cancel?'cancelled':paused?'paused':'active',
    accessUntil:cancel?.effective??null, resume:paused&&!cancel?resume:null,
    pausePreview:now+30*subDay,cancelUntil:paused?next-(resume-now):next,
    next:cancel?null:next, price,
    benefit,claimed,activated:claimed[benefit]??null,usedOffer,training:cancel?now<cancel.effective:!paused,
    open:pending?{id:pending.id,offerPath:Boolean(pending.offer_path),question}:null
  };
}
async function manageSubscription(request,db,current){
  const bearer=request.headers.get('Authorization');
  let id=current;
  if(bearer){
    const token=bearer.match(/^Bearer ([0-9a-f-]{36})$/)?.[1];
    id=token && (await db.prepare('SELECT attempt FROM subscription_keys WHERE token=?').bind(token).first())?.attempt;
  }
  const a=id && await db.prepare("SELECT coalesce(paid_at,created_at) AS paid,result FROM attempts WHERE id=? AND status='paid'").bind(id).first();
  if(!a) return json({error:'Откройте личную ссылку или войдите из браузера, где проходили демооплату.'},404);
  const now=Date.now();
  const get=()=>subscriptionState(db,id,a.paid,now);
  if(request.method==='POST'){
    const f=await readForm(request);
    if(f instanceof Response) return f;
    const s=await get();
    if(f?.action==='report'){
      if(s.accessUntil!==null && s.accessUntil<=now) return json({error:'Срок доступа завершён.'},410);
      return json(JSON.parse(a.result));
    }
    if(f?.action==='benefit') return benefitSession(db,id,s,JSON.parse(a.result),f,now);
    if(f?.action==='begin'){
      if(s.status!=='cancelled') await db.prepare(`INSERT OR IGNORE INTO cancel_flows(id,attempt,started,exit_step,survey_answers,offer_path)
        SELECT ?,?,?,1,'[]',1 WHERE NOT EXISTS(SELECT 1 FROM cancel_flows WHERE attempt=? AND outcome='cancel')`).bind(crypto.randomUUID(),id,now,id).run();
    } else {
      const row=typeof f?.id==='string' && await db.prepare('SELECT * FROM cancel_flows WHERE attempt=? AND id=?').bind(id,f.id).first();
      if(!row || f.action!=='answer' || !Number.isInteger(f.number) || f.number<1 || f.number>10) return json({error:'Обновите страницу подписки.'},409);
      const answers=surveyHistory(row,s.usedOffer);
      const previous=row.offer_path?answers.find(v=>v.number===f.number):answers[f.number-1];
      if(!previous || previous.code!==f.choice){
        if(row.outcome || f.number!==answers.length+1) return json({error:'Вопрос изменился. Обновите страницу.'},409);
        const q=row.offer_path?renewalScreen(f.number,s.claimed,s.price):exitQuestion(f.number,row.reason,s.usedOffer);
        if(typeof f.choice!=='string' || !Object.hasOwn(q.options,f.choice)) return json({error:'Выберите один из ответов.'},400);
        const reason=!row.offer_path && f.number===1?f.choice:row.reason;
        const accepted=row.offer_path && q.offer && f.choice===q.offer?q.offer:null;
        const outcome=accepted?(accepted.startsWith('month')?'discount':accepted==='pause30'?'pause':'keep'):(q.offer && f.choice===q.offer || f.choice==='keep' || f.number===10)?f.choice:null;
        const second=!row.offer_path && f.number===2 && q.offer && f.choice==='continue'?now:row.second_offer_at;
        let effective=null,end=null;
        if(outcome==='pause'){effective=now+30*subDay;end=s.next+30*subDay;}
        if(outcome==='discount') effective=s.next;
        if(accepted==='bonus' || accepted==='fortnight') end=s.next+(accepted==='bonus'?7:14)*subDay;
        if(outcome==='cancel') effective=s.cancelUntil;
        answers.push({number:f.number,title:q.title,code:f.choice,label:q.options[f.choice]});
        const saved=await db.prepare(`UPDATE cancel_flows SET exit_step=?,survey_answers=?,choice=?,reason=?,second_offer_at=?,outcome=?,decided=?,effective=?,period_end=?,offer_code=?
          WHERE id=? AND attempt=? AND outcome IS NULL AND survey_answers IS ? RETURNING id`)
          .bind(outcome?f.number:f.number+1,JSON.stringify(answers),f.choice,reason,second,outcome,outcome?now:null,effective,end,accepted,row.id,id,row.survey_answers).first();
        if(!saved) return json({error:'Ответ уже изменился. Обновите страницу.'},409);
      }
    }
  }
  await db.prepare('INSERT OR IGNORE INTO subscription_keys(attempt,token) VALUES(?,?)').bind(id,crypto.randomUUID()).run();
  const key=await db.prepare('SELECT token FROM subscription_keys WHERE attempt=?').bind(id).first();
  return json({...await get(),key:key.token,score:JSON.parse(a.result).score});
}
