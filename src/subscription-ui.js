const formatSubDate=value=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
async function subscriptionScreen(page){
  const parts=page.split('/').slice(1);
  let key=/^[0-9a-f-]{36}$/.test(parts[0]||'')?parts.shift():null;
  const base=key?'subscription/'+key:'subscription';
  const step=parts[0];
  const active=()=>location.hash==='#'+page;
  const call=body=>api('subscription',{
    method:body?'POST':'GET',headers:{...(key?{Authorization:'Bearer '+key}:{}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const draw=html=>show(panel(html+'<p class="error" role="alert"></p>','sub-panel'));
  let s;
  try {
    try {s=await call();}
    catch(error){
      if(key || error.status!==404) throw error;
      try {key=localStorage.getItem('lg-management-key');} catch {}
      if(!key) throw error;
      s=await call();
    }
    if(!active()) return;
    if(!base.includes('/')) {try {localStorage.setItem('lg-management-key',s.key);} catch {}}
  } catch(error){
    if(active()) draw(title('Моя подписка')+'<p>'+escape(error.message)+'</p><a href="#home">К тесту</a>');
    return;
  }
  const caption='<p class="sub-caption">Демо · списаний нет</p>';
  if(step==='report'){
    try {const r=await call({action:'report'});if(active()) draw(title('Ваш полный разбор')+resultScore(r)+answerReview(r)+'<a href="#'+base+'">К подписке</a>');}
    catch(e){if(active()) draw(title('Ваш разбор')+'<p>'+escape(e.message)+'</p>');}return;
  }
  if(step==='benefit'){
    const mode=parts[1]||s.benefit;
    try {await showBenefit(()=>active(),base,{...s,benefit:mode},form=>call({action:'benefit',mode,...form}));}
    catch(error){if(active()) draw(title('Моя подписка')+'<p>'+escape(error.message)+'</p><a href="#'+base+'">К подписке</a>');}
    return;
  }
  if(step && s.open){
    const {id,question:q}=s.open;
    let body='';
    if(q.offer==='discount') body=`<section class="sub-offer"><p>Следующий месяц</p><strong>149 ₽</strong><del>299 ₽</del><p>С ${formatSubDate(s.next)}. Через месяц — 299 ₽ в месяц до отмены.</p></section>`;
    if(q.offer==='pause') body=`<section class="sub-offer"><p>Перерыв в тренировках</p><strong>30 дней</strong><p>Доступ возобновится ${formatSubDate(s.pausePreview)}. Оставшиеся дни сохранятся. Следующее демопродление за ${s.price} ₽ — ${formatSubDate(s.next+30*86400000)}.</p></section>`;
    if(q.number===10) body=`<p class="lead">После отмены разбор и тренировки останутся доступны до ${formatSubDate(s.cancelUntil)}.</p>`;
    if(s.open.offerPath) body=q.existing?`<section class="sub-offer renewal-card"><p>${escape(q.existing)}</p><strong>${s.price} ₽</strong><p>Условия уже учтены. Ближайшее демопродление — ${formatSubDate(s.next)}.</p></section>`:offerCard(q.number,s);
    draw(`<a href="#${base}">← К подписке</a>${caption}${title(escape(q.title))}${body}
      <div class="reason-list ${s.open.offerPath?'renewal-choices':''}">${Object.entries(q.options).map(([v,label])=>`<button type="button" data-answer="${escape(v)}">${escape(label)}<span aria-hidden="true">→</span></button>`).join('')}</div>${s.open.offerPath && q.number<10?'<small>При отказе откроется следующее предложение.</small>':''}`);
    root.querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>busy(async()=>{
      const updated=await call({action:'answer',id,number:q.number,choice:b.dataset.answer});
      if(active()){state.result=null;go(updated.open?base+'/steps':base);}
    })));
    return;
  }
  const cancelled=s.status==='cancelled',paused=s.status==='paused';
  const heading=cancelled?'Продление отменено':paused?'Подписка на паузе':s.price<299?'Скидка применена':'Моя подписка';
  let details=cancelled?`Доступ к разбору и тренировкам до ${formatSubDate(s.accessUntil)}. Автопродление отключено.`:
    paused?`Тренировки возобновятся ${formatSubDate(s.resume)}. Разбор уже доступен.`:
    s.price<299?'Скидка действует один месяц. Затем — 299 ₽ в месяц до отмены.':'Ваш разбор, сертификат и тренировки доступны по демоподписке.';
  const benefitActions={advanced:'Открыть сложные задачи',practice:'Открыть персональные задачи',duo:'Открыть приглашение',daily:'Открыть задачу дня',retest:'Открыть повторный тест'};
  const benefitNames={advanced:'Сложные задачи открыты',fortnight:'Добавлены 14 дней',practice:'Подключены персональные задачи',duo:'Подключён доступ для двоих',daily:'Подключена задача дня',retest:'Повторный тест добавлен',bonus:'Добавлены 7 дней'};
  draw(`${caption}${title(!cancelled&&benefitNames[s.benefit]||heading)}<p class="lead">${details}</p>
    ${cancelled?'':`<section class="sub-offer"><p>Следующее демопродление</p><strong>${s.price} ₽</strong><p>${formatSubDate(s.next)}</p></section>`}
    ${s.training?Object.keys(s.claimed).filter(code=>benefitActions[code]).map(code=>`<a class="btn" href="#${base}/benefit/${code}">${benefitActions[code]}</a>`).join(''):''}
    ${cancelled&&Date.now()<s.accessUntil?`<a class="btn" href="#${base}/report">Открыть мой результат</a>`:''}
    ${cancelled?'':button(s.open?'Продолжить отмену':'Отменить продление','start-cancel','secondary')}
    <button class="sub-link" id="copy-manage">Скопировать личную ссылку</button><span role="status" id="copy-status"></span>
    <a href="#home">На главную</a>`);
  bind('start-cancel',()=>busy(async()=>{const updated=await call({action:'begin'});if(active()) go(updated.open?base+'/steps':base);}));
  bind('copy-manage',async()=>{
    const link=location.origin+location.pathname+'#subscription/'+s.key;
    const status=document.getElementById('copy-status');
    try {await navigator.clipboard.writeText(link);status.textContent='Личная ссылка скопирована.';}
    catch {const field=document.createElement('input');field.readOnly=true;field.value=link;field.setAttribute('aria-label','Личная ссылка');status.replaceChildren(field);field.select();}
  });
}

function offerCard(number,s){
  const day=86400000, date=formatSubDate;
  const price=number===1?149:99;
  let card;
  if(number===1 || number===4) card=['Следующий месяц',price+' ₽',`Вместо 299 ₽ при продлении ${date(s.next)}. Затем 299 ₽ в месяц до отмены.`];
  else card={
    2:['Пауза в тренировках','30 дней',`Разбор останется открыт. Тренировки возобновятся ${date(s.pausePreview)}, продление за ${s.price} ₽ — ${date(s.next+30*day)}.`],
    3:['Персональная тренировка',s.score===9?'Сложные задачи':'По вашим ошибкам',s.score===9?'Вы решили все девять задач. Откроем более сложные задачи с объяснениями.':'Для каждого неверного ответа откроем похожую задачу. После тренировки покажем ход решения.'],
    5:['Одно личное приглашение','Для двоих','Отправьте ссылку близкому человеку. Он пройдёт девять задач и получит собственный разбор без доплаты.'],
    6:['Короткая тренировка','Задача дня','Каждый день в подписке открывается одна задача. Решите её в удобное время и сразу посмотрите объяснение.'],
    7:['Повторная попытка','Через неделю',`С ${date(Date.now()+7*day)} откроются девять новых задач. Сравните первый и второй результат по трём категориям.`],
    8:['Следующее продление','+7 дней',`Перенесём продление за ${s.price} ₽ с ${date(s.next)} на ${date(s.next+7*day)}. Разбор и тренировки будут доступны всю неделю.`],
    9:['Тренировка с разбором','3 задачи','Решите по одной задаче на числа, фигуры и логику. В конце получите объяснение каждого решения.'],
    10:['Две недели в подарок','+14 дней',`Ближайшее продление за ${s.price} ₽ сдвинется с ${date(s.next)} на ${date(s.next+14*day)}. Если отмените, доступ сохранится до ${date(s.cancelUntil)}.`]
  }[number];
  const regular=[3,5,6,7,9].includes(number)?`<p>Следующее продление — ${s.price} ₽. Затем 299 ₽ в месяц до отмены.</p>`:'';
  return `<section class="sub-offer renewal-card"><p>${card[0]}</p><strong>${card[1]}</strong><p>${card[2]}</p>${regular}</section>`;
}
async function showBenefit(active,base,s,call){
  const data=await call({});
  if(!active()) return;
  const back=`<a href="#${base}">← К подписке</a>`;
  if(data.invite){
    const link=location.origin+location.pathname+'#invite/'+data.invite;
    show(panel(back+title('Приглашение для близкого')+(data.claimed?'<p>Гость уже получил свой разбор.</p>':`<label>Личная ссылка<input id="invite-link" readonly value="${escape(link)}"></label>${button('Скопировать ссылку','invite-copy')}`),'sub-panel'));
    bind('invite-copy',async()=>{const el=document.getElementById('invite-link');try {await navigator.clipboard.writeText(link);el.value='Ссылка скопирована';}catch{el.select();}});
  } else if(data.unlocks){
    show(panel(back+title('Повторный тест')+'<p>Новые задачи откроются '+formatSubDate(data.unlocks)+'. Сравним оба результата по числам, фигурам и логике.</p>','sub-panel'));
  } else {
    exerciseScreen(data,call,active,back,{advanced:'Задачи повышенной сложности',daily:'Задача дня',retest:'Повторный тест',practice:'Персональная тренировка'}[s.benefit]);
  }
}
async function guestScreen(page){
  const token=page.slice(7);
  const active=()=>location.hash==='#'+page;
  const call=form=>api('guest',{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},method:form?'POST':'GET',body:form?JSON.stringify(form):undefined});
  try {const data=await call();if(active()) exerciseScreen(data,call,active,'<a href="#home">На главную</a>','Тест по приглашению');}
  catch(e){if(active()) show(panel(title('Приглашение')+'<p>'+escape(e.message)+'</p>'));}
}
function exerciseScreen(initial,call,active,back,heading){
  const answers=[];
  const draw=data=>{
    if(!active()) return;
    if(data.complete){
      const compare=Object.entries(data.sections).map(([kind,v])=>{
        const prev=data.baseline?.sections?.[kind];
        return `<li>${escape(kind)} · ${prev?prev.score+' из '+prev.total+' → ':''}${v.score} из ${v.total}</li>`;
      }).join('');
      show(panel(back+title(heading)+`<section class="sub-offer renewal-card"><p>Верных ответов</p><strong>${data.score} из ${data.items.length}</strong>${data.baseline?'<p>Первый результат — '+data.baseline.score+' из 9.</p>':''}</section><ul>${compare}</ul>`+data.items.map(i=>`<article class="sub-offer"><p>${escape(i.title)}</p><p>${escape(i.pattern)}</p><p>Ваш ответ — ${escape(i.chosen)}. Верный — ${escape(i.expected)}.</p><p>${escape(i.why)}</p></article>`).join(''),'sub-panel'));
      return;
    }
    const i=answers.length,q=data.items[i];
    show(panel(back+`<p class="sub-caption">${heading} · ${i+1} из ${data.items.length}</p>`+title(escape(q.title))+`<section class="sub-offer"><p>${escape(q.pattern)}</p></section><div class="reason-list">${q.options.map((v,n)=>`<button type="button" data-pick="${n}">${escape(v)}</button>`).join('')}</div><p class="error" role="alert"></p>`,'sub-panel'));
    root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>busy(async()=>{
      const pick=Number(b.dataset.pick);
      if(i+1===data.items.length) draw(await call({answers:[...answers,pick]}));
      else {answers.push(pick);draw(data);}
    }));
  };
  draw(initial);
}
