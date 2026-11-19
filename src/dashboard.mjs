const stageNames=['Главная','Вопросы теста','Тест завершён','Почта сохранена','Предложение открыто','Экран демооплаты','Демооплата пройдена','Отчёт открыт','Тренировка начата'];
const reminderSubject='Ваш разбор в «Логике» готов';
const reminderBody=origin=>'Вы разрешили один раз напомнить о результате теста. Чтобы посмотреть свой разбор, откройте ссылку в браузере, где проходили тест.\n\n'+origin+'/#offer\n\nДемооплата — 0 ₽, карта не нужна.\nКоманда «Логики»';
const h=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=(n,d)=>d?(100*n/d).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'—';
const fmtTime=value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'}).format(value);
const sections={overview:'Обзор',attempts:'Прохождения',people:'Пользователи',subscriptions:'Отмены',mail:'Рассылка'};
function adminPage(view,content,hasDemo,demo) {
  const source=hasDemo?`<div class="source-tabs" aria-label="Источник данных"><a href="/admin?view=${view}" ${demo?'aria-current="true"':''}>Демоданные</a><a href="/admin/live?view=${view}" ${demo?'':'aria-current="true"'}>Реальные данные</a></div>`:'';
  const links=Object.entries(sections).map(([key,name])=>`<a href="?view=${key}" ${key===view?'aria-current="page"':''}>${name}</a>`).join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${sections[view]} · Логика</title><link rel="stylesheet" href="/style.css"><script src="/admin-mail.js" defer></script>
  <header class="board-head"><div><b>логика<span>.</span></b><small>Кабинет администратора</small></div><nav>${links}</nav></header><main class="board">${source}${content}</main></html>`;
}
function pages(page,more,url) {
  const path=new URL(url);
  const link=(n,label)=>{path.searchParams.set('page',n);return `<a href="${h(path.pathname+path.search)}">${label}</a>`;};
  return `<nav class="paging">${page>1?link(page-1,'← Назад'):''}<span>Страница ${page}</span>${more?link(page+1,'Далее →'):''}</nav>`;
}
async function overview(db,demo){
  const totals=await db.prepare(`SELECT count(*) AS finished,count(email) AS contacts,count(CASE WHEN email IS NOT NULL AND status='paid' THEN 1 END) AS contactsPaid,sum(status='paid') AS paid,count(DISTINCT lower(trim(email))) AS users FROM attempts`).bind().first();
  const unpaid=await db.prepare('SELECT count(*) AS n FROM unpaid_contacts').bind().first();
  const {results}=await db.prepare('SELECT stage,count(*) AS n FROM funnel_rows WHERE tracked=1 GROUP BY stage').bind().all();
  const counts=stageNames.map((_,i)=>results.reduce((n,r)=>n+(r.stage>=i?r.n:0),0));
  const steps=stageNames.map((name,i)=>`<a class="funnel-row" href="?view=attempts&amp;tracked=1&amp;min=${i}">
    <span>${name}</span><b>${counts[i]}</b><progress value="${counts[i]}" max="${counts[0]||1}" aria-label="${name}"></progress><small>${i===0?'Старт':percent(counts[i],counts[i-1])+' с шага выше'}</small></a>`).join('');
  const losses=counts.slice(0,-1).map((n,i)=>n-counts[i+1]);
  const loss=Math.max(...losses), index=losses.indexOf(loss);
  const insight=loss?`Самое большое снижение по числу прохождений — между этапами «${stageNames[index]}» и «${stageNames[index+1]}» (${loss}).`:'';
  let activity='';
  if(demo){
    const {results:days}=await db.prepare("SELECT strftime('%d.%m',started/1000,'unixepoch','+3 hours') AS day,count(*) AS n FROM journeys GROUP BY day ORDER BY min(started)").bind().all();
    const peak=Math.max(1,...days.map(d=>d.n));
    activity=`<section class="sheet demo-days"><h2>Стартов по дням</h2><div>${days.map(d=>`<p><small>${d.day}</small><progress max="${peak}" value="${d.n}" aria-label="Стартов ${d.day}"></progress><b>${d.n}</b></p>`).join('')}</div></section>`;
  }
  return `<div class="board-title"><div><p>${demo?'Демоданные · 12–18 ноября 2026':'Аналитика · За всё время'}</p><h1>Обзор воронки</h1></div></div>
  <div class="metrics"><article><span>Тест завершён</span><strong>${totals.finished}</strong><small>прохождений</small></article>
  <article><span>Демооплата пройдена</span><strong>${totals.paid||0}</strong><small>${percent(totals.paid,totals.finished)} завершённых тестов</small></article>
  <article><span>Оставили почту</span><strong>${totals.users}</strong><small>адресов · ${totals.contacts} попыток</small></article></div>
  <section class="board-summary"><div><h2>От почты до демооплаты</h2><p>${totals.contacts?'Из '+totals.contacts+' попыток с почтой демооплату подтвердили '+totals.contactsPaid+'. Ещё '+(totals.contacts-totals.contactsPaid)+' остались без подтверждения.':'Сохранённых адресов пока нет.'}</p></div><strong>${percent(totals.contactsPaid,totals.contacts)}</strong></section>
  <div class="board-grid"><section class="sheet"><h2>Путь по экранам</h2><p class="muted">${demo?'Все девять этапов на примере '+counts[0]+' вымышленных прохождений.':'Новые прохождения с момента включения аналитики.'} Нажмите на этап, чтобы увидеть, кто до него дошёл.</p><div class="funnel">${steps}</div>
  <p class="footnote">${insight||'Каждая полоса показывает, сколько прохождений дошло как минимум до этого этапа.'}</p></section>
  <div class="board-aside"><aside class="sheet return-box"><h2>Почта без демооплаты</h2><strong>${unpaid.n}</strong><p>Уникальные адреса без демооплаты во всех попытках.</p><a class="btn" href="?view=mail">Посмотреть аудиторию →</a></aside>${activity}</div></div>
  ${demo?'':'<p class="footnote">Итоги сверху включают старые попытки. Для них доступны сохранённые ответы, почта и статус демооплаты. Тестовые прохождения входят в цифры.</p>'}`;
}
async function attemptsView(db,url,page){
  const q=url.searchParams;
  const tracked=q.get('tracked')==='1';
  const stage=q.get('stage'),min=q.get('min');
  const where=[],params=[];
  if(tracked) where.push('tracked=1');
  for(const [value,op] of [[stage,'='],[min,'>=']]) if(value!==null && /^[0-8]$/.test(value)){where.push('stage'+op+'?');params.push(Number(value));}
  const {results}=await db.prepare('SELECT * FROM funnel_rows '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY touched DESC,number DESC LIMIT 51 OFFSET ?').bind(...params,(page-1)*50).all();
  const list=results.slice(0,50).map(r=>`<li><div><b>${h(r.email||'Без почты')}</b><small>${fmtTime(r.touched)} МСК</small></div><span class="stage-chip">${r.stage===1?'Вопрос '+r.question+' из 9':stageNames[r.stage]}</span></li>`).join('');
  const filters=stageNames.map((name,i)=>`<a href="?view=attempts&amp;stage=${i}" ${stage===String(i)?'aria-current="true"':''}>${name}</a>`).join('');
  return `<h1>Прохождения</h1><p class="muted">Последний известный этап каждой попытки. До ввода почты прохождение анонимно.</p>
  <details class="sheet"><summary>Фильтр по последнему этапу</summary><div class="chips"><a href="?view=attempts">Все</a>${filters}</div></details>
  <section class="sheet"><h2>${min!==null && /^[0-8]$/.test(min)?'Дошли до этапа «'+stageNames[min]+'»':stage!==null && /^[0-8]$/.test(stage)?stageNames[stage]:'Все этапы'}</h2>
  <ul class="attempt-list">${list||'<li>Прохождений пока нет.</li>'}</ul>${pages(page,results.length>50,url)}</section>`;
}
async function mailAudience(db) {
  const {results}=await db.prepare(`SELECT address FROM unpaid_contacts WHERE reminder_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM reminders WHERE email=address) ORDER BY address LIMIT 51`).bind().all();
  return results.map(r=>r.address);
}
async function mailPanel(db,env,url,page){
  const stats=await db.prepare(`SELECT count(*) AS unpaid,count(reminder_at) AS consent FROM unpaid_contacts`).bind().first();
  const {results:audience}=await db.prepare(`SELECT address,reminder_at,r.state FROM unpaid_contacts u
    LEFT JOIN reminders r ON r.email=u.address ORDER BY address LIMIT 51 OFFSET ?`).bind((page-1)*50).all();
  const {results:states}=await db.prepare('SELECT state,count(*) AS n FROM reminders GROUP BY state').bind().all();
  const labels={queued:'В очереди',sending:'Передаются',sent:'Приняты почтовым сервисом',unknown:'Требуют проверки доставки',skipped:'Исключены перед отправкой',draft:'Подготовлены для ручной отправки'};
  const addresses=await mailAudience(db), batch=addresses.slice(0,50);
  const token=await adminSignature(env.ADMIN_AUTH_SHA256,(env.DEMO_MODE?'demo-mail:':'mail:')+JSON.stringify(batch));
  return `<h1>Напоминание о разборе</h1><div class="metrics"><article><span>Без демооплаты</span><strong>${stats.unpaid}</strong><small>уникальных адресов</small></article>
  <article><span>Разрешили напомнить</span><strong>${stats.consent}</strong><small>из неоплативших</small></article></div>
  <details class="sheet" ${page>1?'open':''}><summary>Все адреса без демооплаты · ${stats.unpaid}</summary><ul class="attempt-list">${audience.slice(0,50).map(r=>`<li><b>${h(r.address)}</b><span class="stage-chip">${r.state?h(labels[r.state]||r.state):r.reminder_at?'Можно напомнить':'Согласие на напоминание отсутствует'}</span></li>`).join('')||'<li>Адресов пока нет.</li>'}</ul>${page>1||audience.length>50?pages(page,audience.length>50,url):''}</details>
  <section class="sheet"><h2>Получатели письма · ${batch.length}</h2><p class="muted">Одно напоминание на адрес. Учитываем согласие при последнем сохранении почты и демооплату в любой попытке.</p>
  ${batch.length?`<details><summary>Показать адреса</summary><ul>${batch.map(e=>'<li>'+h(e)+'</li>').join('')}</ul></details>`:'<p>Сейчас подходящих получателей нет.</p>'}
  ${addresses.length>50?'<p>В этой партии первые 50 адресов.</p>':''}</section>
  <section class="sheet"><h2>Предпросмотр письма</h2><article class="letter"><b>${reminderSubject}</b><p>${h(reminderBody(url.origin))}</p></article>
  <p class="muted">${env.DEMO_MODE?'Проверьте рассылку на вымышленных адресах. Сервис покажет, сколько участников получило бы письмо.':env.MAIL_READY?'Письма уйдут по одному через подключённый почтовый сервис.':'Почтовый сервис не подключён. Можно открыть черновик в почтовой программе и отправить его со своей почты. Адреса будут в скрытой копии.'}</p>
  <div id="mail-tools" data-source="${env.DEMO_MODE?'demo':'live'}" data-token="${token}"><button type="button" class="btn" id="${env.DEMO_MODE?'simulate-mail':'make-draft'}" ${batch.length?'':'disabled'}>${env.DEMO_MODE?'Проверить деморассылку':'Скачать черновик (.eml)'}</button>
  ${env.MAIL_READY?`<button type="button" class="btn" id="send-mail" ${batch.length?'':'disabled'}>Отправить ${batch.length} писем</button>`:''}</div><p role="status" id="mail-state"></p></section>
  ${states.length?`<section class="sheet"><h2>Статусы напоминаний</h2><ul>${states.map(s=>'<li>'+h(labels[s.state]||s.state)+' · '+s.n+'</li>').join('')}</ul></section>`:''}`;
}
async function prepareMail(request,env) {
  const reply=(text,status)=>new Response(text,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  const url=new URL(request.url);
  if(request.method!=='POST' || request.headers.get('Origin')!==url.origin) return reply('Запрос отклонён.',403);
  const mode=request.headers.get('X-Mail-Action');
  if(env.DEMO_MODE ? mode!=='simulate' : !['draft','send'].includes(mode)) return reply('Неизвестное действие.',400);
  if(mode==='send' && !env.MAIL_READY) return reply('Почтовый сервис не подключён.',409);
  const batch=(await mailAudience(env.DB)).slice(0,50);
  const token=await adminSignature(env.ADMIN_AUTH_SHA256,(env.DEMO_MODE?'demo-mail:':'mail:')+JSON.stringify(batch));
  if(!batch.length || !sameSignature(token,request.headers.get('X-Mail-Preview')||'')) return reply('Аудитория изменилась. Обновите предпросмотр.',409);
  if(env.DEMO_MODE) return reply('Проверка завершена. Получателей: '+batch.length+'. Писем отправлено: 0.',200);
  const body=reminderBody(url.origin);
  const {results}=await env.DB.prepare(`INSERT OR IGNORE INTO reminders(email,state,created,subject,body)
    SELECT address,?,?,?,? FROM unpaid_contacts WHERE reminder_at IS NOT NULL AND address IN (SELECT value FROM json_each(?))
    RETURNING email`).bind(mode==='draft'?'draft':'queued',Date.now(),reminderSubject,body,JSON.stringify(batch)).all();
  if(!results.length) return reply('Эта партия уже обработана.',409);
  if(mode==='send') return reply('В очереди: '+results.length+'.',202);
  const base64=s=>btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
  const draft=['X-Unsent: 1','MIME-Version: 1.0','Bcc: '+results.map(r=>r.email).join(',\r\n '),
    'Subject: =?UTF-8?B?'+base64(reminderSubject)+'?=','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
    base64(body).match(/.{1,76}/g).join('\r\n'),''].join('\r\n');
  return new Response(draft,{headers:{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename="logika-reminder.eml"','Cache-Control':'no-store'}});
}

async function retentionView(db,url,page){
  const outcomes={open:'В процессе',cancel:'Отменили продление',keep:'Оставили прежние условия',...Object.fromEntries(renewalOffers.map(([code,label])=>[code,label]))};
  const decision="coalesce(f.offer_code,case f.outcome when 'discount' then 'month149' when 'pause' then 'pause30' else f.outcome end,'open')";
  const {results:counts}=await db.prepare(`SELECT ${decision} AS name,count(*) AS n FROM cancel_flows f GROUP BY name`).bind().all();
  const totals=Object.fromEntries(counts.map(r=>[r.name,r.n]));
  const filter=url.searchParams.get('outcome'), filtered=Object.hasOwn(outcomes,filter);
  const {results:rows}=await db.prepare(`SELECT a.email,f.*,${decision} AS decision FROM cancel_flows f JOIN attempts a ON a.id=f.attempt
    ${filtered?`WHERE ${decision}=?`:''} ORDER BY coalesce(f.decided,f.started) DESC,f.id DESC LIMIT 51 OFFSET ?`).bind(...(filtered?[filter]:[]),(page-1)*50).all();
  const metric=k=>`<article><a href="?view=subscriptions&amp;outcome=${k}">${outcomes[k]}</a><strong>${totals[k]||0}</strong></article>`;
  const row=r=>{
    const answers=JSON.parse(r.survey_answers||'[]');
    const pending=r.offer_path?renewalOffers[r.exit_step-1][1]:'Прежний сценарий отмены';
    const description=r.decision==='open'?'Текущий экран · '+pending:r.offer_code||['discount','pause'].includes(r.outcome)?'Принято предложение · '+outcomes[r.decision]:outcomes[r.decision];
    return `<li><div><b>${h(r.email||'Без почты')}</b><small>${fmtTime(r.decided||r.started)} МСК</small><p>${h(description)}</p>
      ${answers.length?`<details><summary>История выбора</summary><ul>${answers.map(a=>'<li>'+h(a.title)+' — '+h(a.label)+'</li>').join('')}</ul></details>`:''}</div>
      <span class="stage-chip">${r.decision==='open'?'В процессе':r.outcome==='cancel'?'Отменено':'Остался'}</span></li>`;
  };
  return `<h1>Отмена продления</h1><p class="muted">Начали отмену · ${counts.reduce((n,r)=>n+r.n,0)} обращений</p>
    <div class="metrics">${['open','cancel','keep'].map(metric).join('')}</div><section class="sheet"><h2>На каких предложениях остались</h2>
    <div class="metrics">${renewalOffers.map(([code])=>metric(code)).join('')}</div></section>
    <section class="sheet"><h2>${filtered?outcomes[filter]:'История решений'}</h2>${filtered?'<a href="?view=subscriptions">Все решения</a>':''}
    <ul class="attempt-list">${rows.slice(0,50).map(row).join('')||'<li>Обращений пока нет.</li>'}</ul>${pages(page,rows.length>50,url)}</section>`;
}
