// Each practice problem matches the skill tested at the same original index.
const practiceBank=[
 ['Числа','Продолжите ряд','4 · 8 · 14 · 22 · ?', ['28','30','32'],2,'Разницы растут на два. После +8 следует +10.'],
 ['Фигуры','Какая фигура следующая?','◆ ○ ○ ◆ ○ ○ ?', ['○','◆','□'],1,'Повторяется блок из ромба и двух кругов.'],
 ['Логика','Кто выше всех?','Оля выше Маши. Лиза ниже Маши.', ['Лиза','Оля','Маша'],1,'Маша ниже Оли, а Лиза ещё ниже.'],
 ['Числа','Какое число пропущено?','81 · 27 · 9 · ? · 1', ['2','6','3'],2,'Каждый раз число делят на три.'],
 ['Фигуры','Куда повернёт стрелка?','↑ · ← · ↓ · ?', ['→','←','↑'],0,'Поворот каждый раз на четверть оборота против часовой стрелки.'],
 ['Логика','Где точно нет ключа?','Все ключи в красных пакетах. На столе лежат белый пакет и красный.', ['В красном','В белом','В обоих'],1,'Белый пакет исключён условием про цвет.'],
 ['Числа','Продолжите последовательность','2 · 5 · 7 · 12 · 19 · ?', ['31','26','33'],0,'Сложите два предыдущих числа: 12 + 19 = 31.'],
 ['Фигуры','Прочтите узор справа налево','▲ ◆ ■ ○', ['○ ◆ ■ ▲','○ ■ ◆ ▲','▲ ■ ◆ ○'],1,'С правого края идут круг, квадрат, ромб и треугольник.'],
 ['Логика','Какая надпись верна?','Приз в одной из двух коробок. На А написано «Приз в Б», на Б — «Приз не в А».', ['Только одна','Обе или ни одна','Всегда обе'],1,'Обе надписи утверждают одно и то же. Их истинность совпадает.']
];
const advancedBank=[
 ['Числа','Продолжите ряд','2 · 5 · 11 · 23 · ?', ['45','46','47'],2,'Удваиваем число и прибавляем единицу: 23 × 2 + 1 = 47.'],
 ['Фигуры','Какая стрелка будет следующей?','↑ · → · ← · ↑ · ↓ · ?', ['→','←','↓'],1,'Чередуются повороты на 90 и 180 градусов по часовой стрелке. После ↓ идёт ←.'],
 ['Логика','Кто говорит правду?','Аня говорит «Боря лжёт». Боря говорит «Мы оба лжём».', ['Аня','Боря','Оба'],0,'Если Боря прав, он одновременно лжёт. Значит, он лжёт, а Аня права.']
];
function exerciseView(tasks,answers,baseline){
  const complete=Array.isArray(answers);
  const sections={};
  const items=tasks.map(([kind,title,pattern,options,key,why],i)=>{
    const r={kind,title,pattern,options};
    if(complete){
      Object.assign(r,{chosen:options[answers[i]],expected:options[key],why,correct:answers[i]===key});
      const section=sections[kind]??={score:0,total:0};
      section.total++;section.score+=Number(r.correct);
    }
    return r;
  });
  return {items,complete,sections,score:complete?items.filter(i=>i.correct).length:null,baseline};
}
function validExercises(tasks,answers){
  return Array.isArray(answers)&&answers.length===tasks.length&&answers.every((a,i)=>Number.isInteger(a)&&a>=0&&a<tasks[i][3].length);
}
async function benefitSession(db,id,s,result,form,now){
  if(!s.training || (s.accessUntil!==null && s.accessUntil<=now)) return json({error:'Срок доступа завершён.'},403);
  const mode=form.mode??s.benefit;
  if(typeof mode!=='string' || !Object.hasOwn(s.claimed,mode)) return json({error:'Это предложение не подключено.'},403);
  if(mode==='duo'){
    await db.prepare('INSERT OR IGNORE INTO guest_passes(owner,token) VALUES(?,?)').bind(id,crypto.randomUUID()).run();
    const pass=await db.prepare('SELECT token,recipient FROM guest_passes WHERE owner=?').bind(id).first();
    return json({invite:pass.token,claimed:Boolean(pass.recipient)});
  }
  let slot=mode,tasks;
  if(mode==='practice'){
    tasks=practiceBank.filter((_,i)=>result.review?.[i]&&!result.review[i].correct);
    if(!tasks.length) tasks=advancedBank;
  } else if(mode==='advanced'){
    tasks=advancedBank;
  } else if(mode==='daily'){
    const day=Math.floor(now/subDay);
    slot='daily-'+day;tasks=[practiceBank[day%practiceBank.length]];
  } else if(mode==='retest'){
    if(now<s.claimed[mode]+7*subDay) return json({unlocks:s.claimed[mode]+7*subDay});
    tasks=practiceBank;
  } else return json({error:'Это предложение не подключено.'},403);
  if(form.answers!==undefined){
    if(!validExercises(tasks,form.answers)) return json({error:'Ответьте на каждую задачу.'},400);
    await db.prepare('INSERT OR IGNORE INTO benefit_sessions(owner,slot,answers) VALUES(?,?,?)').bind(id,slot,JSON.stringify(form.answers)).run();
  }
  const saved=await db.prepare('SELECT answers FROM benefit_sessions WHERE owner=? AND slot=?').bind(id,slot).first();
  return json(exerciseView(tasks,saved&&JSON.parse(saved.answers),mode==='retest'?{score:result.score,sections:result.breakdown}:null));
}
async function guestExercise(request,db){
  const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1];
  const lookup=()=>db.prepare(`SELECT g.* FROM guest_passes g WHERE token=? AND NOT EXISTS
    (SELECT 1 FROM cancel_flows WHERE attempt=g.owner AND outcome='cancel' AND effective<=?)`).bind(token,Date.now()).first();
  let pass=token&&await lookup();
  if(!pass) return json({error:'Приглашение недоступно.'},404);
  const session=request.headers.get('Cookie')?.match(/(?:^|;\s*)lg_guest=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if(pass.recipient && pass.recipient!==session) return json({error:'Этим приглашением уже воспользовались.'},409);
  if(request.method==='POST'){
    const f=await readForm(request);
    if(f instanceof Response) return f;
    if(!validExercises(questions,f?.answers)) return json({error:'Ответьте на все задачи.'},400);
    if(!pass.recipient){
      const recipient=crypto.randomUUID();
      const saved=await db.prepare('UPDATE guest_passes SET recipient=?,answers=? WHERE token=? AND recipient IS NULL RETURNING answers').bind(recipient,JSON.stringify(f.answers),token).first();
      if(!saved) return json({error:'Приглашение уже использовано.'},409);
      const response=json(exerciseView(questions,f.answers,null));
      response.headers.set('Set-Cookie',cookie(recipient,request).replace('lg_attempt=','lg_guest='));
      return response;
    }
  }
  return json(exerciseView(questions,pass.answers&&JSON.parse(pass.answers),null));
}
