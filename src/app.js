
const root = document.querySelector('#app');
const state = {questions:[], answers:[], index:0, attempt:null, result:null, trainingAnswers:[]};
const plan = {intro:49, days:7, monthly:299};
const renewal = `Затем ${plan.monthly} ₽ в месяц с автопродлением.`;
const draftKey = 'logika-draft-v1';
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button = (label, id, variant='') => `<button class="btn ${variant}" id="${id}" type="button">${label}</button>`;
const bind = (id, action) => document.getElementById(id)?.addEventListener('click', action);
const title = text => `<h1 tabindex="-1">${text}</h1>`;

function show(html, focus=true) {
  root.innerHTML = html;
  if (focus) {
    window.scrollTo(0,0);
    root.querySelector('h1')?.focus({preventScroll:true});
  }
}
function go(page) {
  if (location.hash === '#'+page) render(page);
  else location.hash = page;
}
function panel(html, variant = '') {
  return `<section class="panel stack ${variant}">${html}</section>`;
}
async function api(path, options) {
  const response = await fetch('/api/'+path,options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Попробуйте ещё раз.'),{status:response.status});
  return data;
}
let journey;
function newJourney() {
  journey=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('');
  try {sessionStorage.setItem('lg-journey',journey);} catch {}
}
try {journey=sessionStorage.getItem('lg-journey');} catch {}
if(!journey) newJourney();
function record(path,data) {
  api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true}).catch(()=>{});
}
function draft() {
  try { localStorage.setItem(draftKey,JSON.stringify({answers:state.answers,index:state.index})); } catch {}
}
function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey));
    if (saved?.answers?.length !== state.questions.length) return;
    state.answers = saved.answers.map((answer,i)=>Number.isInteger(answer)&&answer>=0&&answer<state.questions[i].options.length?answer:null);
    state.index = Math.max(0,Math.min(Number.isInteger(saved.index)?saved.index:0,state.answers.length-1));
  } catch {}
}
function clearDraft() {
  try { localStorage.removeItem(draftKey); } catch {}
}
function reset() {
  newJourney();
  state.answers = Array(state.questions.length).fill(null);
  state.index = 0;
  state.trainingAnswers = [];
  clearDraft();
  go('quiz');
}
let refreshingCount = false;
async function refreshCount() {
  const counter = document.getElementById('completion-count');
  if (!counter || document.hidden || refreshingCount) return;
  refreshingCount = true;
  try {
    const {completed} = await api('stats');
    const unit = new Intl.PluralRules('ru').select(completed) === 'few' ? 'раза' : 'раз';
    counter.textContent = 'Тест пройден ' + completed.toLocaleString('ru-RU') + ' ' + unit;
  } catch {
    // Keep the last successful count if the connection drops.
  } finally {
    refreshingCount = false;
  }
}
window.setInterval(refreshCount, 15000);
document.addEventListener('visibilitychange', refreshCount);

function home() {
  record('visit',{journey,question:0});
  const resumable = state.index > 0 || state.answers.slice(1).some(answer => answer !== null);
  const q = state.questions[0];
  const tiles = q.pattern.split(' · ').map(value => '<span>' + escape(value) + '</span>').join('');
  const choices = q.options.map((label, index) =>
    '<button type="button" class="btn" aria-pressed="' + (state.answers[0] === index) + '" data-answer="' + index + '">' + escape(label) + '</button>'
  ).join('');
  show(`<section class="challenge">
    <div class="challenge-intro">
      <p id="completion-count" class="completion-count" aria-live="off"></p>
      ${title('У Илона Маска IQ 160. <span>А у тебя?</span>')}
      <p class="fine">Цифра 160 не подтверждена. В этом тесте вы узнаете свой игровой балл за 9 задач.</p>
    </div>
    ${resumable ? `<div class="challenge-resume">
      <p>Вы остановились на вопросе ${state.index + 1} из ${state.questions.length}.</p>
      ${button('Продолжить тест','resume')}
    </div>` : `<div class="challenge-task">
      <div class="challenge-meta"><span>IQ-тест · около 4 минут</span><span>1 из ${state.questions.length}</span></div>
      <h2 id="opening-question">${escape(q.title)}</h2>
      <div class="hero-plate"><div class="sample-series" aria-label="${escape(q.pattern)}">${tiles}</div></div>
      <div class="challenge-options" role="group" aria-labelledby="opening-question">${choices}</div>
    </div>
    ${button(state.answers[0] === null ? 'Начать тест' : 'Далее','start','full')}`}
    ${state.attempt ? '<a href="'+(state.attempt.status==='paid'?'#result':'#offer')+'">Открыть последнюю попытку</a>' : ''}
    <aside class="demo-rating" aria-label="Пример рейтинга">
      <span class="rating-stars" aria-hidden="true">★★★★★</span><strong>4,9 из 5</strong>
      <p>Демопример на основе 100 590 условных оценок</p>
    </aside>
    <section class="home-benefits"><h2>Что вы получите</h2>
      <dl><dt>Сертификат с вашим баллом</dt><dd>Сохраните результат на память или распечатайте сертификат.</dd>
      <dt>Урок «Вижу закономерность»</dt><dd>Попробуйте три новых задачи на числа, фигуры и логику.</dd>
      <dt>Разбор каждого ответа</dt><dd>Узнайте, как найти решение и где легко ошибиться.</dd></dl>
    </section>
  </section>`);
  refreshCount();
  bind('start', () => {
    state.index = state.answers[0] === null ? 0 : 1;
    draft();
    go('quiz');
  });
  bind('resume', () => go('quiz'));
  const openingChoices = root.querySelectorAll('[data-answer]');
  openingChoices.forEach(choice => {
    choice.addEventListener('click', () => {
      state.answers[0] = Number(choice.dataset.answer);
      openingChoices.forEach(item => item.setAttribute('aria-pressed', String(item === choice)));
      document.getElementById('start').textContent = 'Далее';
      draft();
    });
  });
}
function scoreBars(groups) {
  return `<div class="scores">${Object.entries(groups).map(([kind,group])=>`<div class="skill">
    <div class="score-row"><span>${escape(kind)}</span><strong>${group.score} из ${group.total}</strong></div>
    <progress class="progress" aria-label="${escape(kind)}" value="${group.score}" max="${group.total}"></progress>
    </div>`).join('')}</div>`;
}
const shapeNames = {
  '○':'контур круга','△':'контур треугольника','□':'контур квадрата','◇':'контур ромба',
  '●':'круг','■':'квадрат','▲':'треугольник','◆':'ромб',
  '↑':'стрелка вверх','→':'стрелка вправо','↓':'стрелка вниз','←':'стрелка влево','?':'пропуск'
};
function shapes(sequence) {
  const symbols = sequence.split(/[·\s]+/).filter(Boolean);
  return `<span class="shape-sequence" role="img" aria-label="${escape(symbols.map(symbol=>shapeNames[symbol]||symbol).join(', '))}">
    ${symbols.map(symbol=>`<span class="shape-tile ${symbol==='?'?'shape-missing':''}" aria-hidden="true">${escape(symbol)}</span>`).join('')}
  </span>`;
}
function options(items,index,name,visual=false) {
  return items.map((option,i)=>`<label class="option ${visual?'visual-option':''}"><input type="radio" name="${name}" value="${i}" ${index===i?'checked':''}>${visual?shapes(option):`<span>${escape(option)}</span>`}</label>`).join('');
}
function quizSteps(index, answers) {
  return `<nav class="quiz-steps" aria-label="Вопросы теста">${answers.map((answer,i)=>{
    const label=answer===null?'Без ответа':'Ответ сохранён';
    return `<button type="button" data-step="${i}" aria-label="Вопрос ${i+1}: ${label}" ${i===index?'aria-current="step"':''} ${i!==index && answer===null?'disabled':''} class="${answer===null?'':'answered'}"><span aria-hidden="true">${i+1}</span></button>`;
  }).join('')}</nav>`;
}
async function busy(action) {
  const controls = [...root.querySelectorAll('button')].filter(control=>!control.disabled);
  controls.forEach(control=>control.disabled=true);
  const error = root.querySelector('.error');
  if (error) error.textContent='';
  try { await action(); }
  catch (failure) { if(error) error.textContent=failure.message; }
  finally { controls.forEach(control=>control.disabled=false); }
}
function quiz() {
  const editing = location.hash === '#edit-quiz';
  const session = editing ? state.edit : state;
  const saveDraft = () => { if (!editing) draft(); };
  const index=session.index;
  if(!editing) record('visit',{journey,question:index+1});
  const q=state.questions[index];
  const count=state.questions.length;
  const last=index===count-1;
  show(panel(`<div class="step"><span class="eyebrow">${escape(q.kind)}</span><span class="question-count">${index+1} из ${count}</span></div>
    ${quizSteps(index,session.answers)}
    ${title(escape(q.title))}
    <div class="prompt ${q.kind==='Логика'?'':'pattern'}">${q.kind==='Фигуры'?shapes(q.pattern):escape(q.pattern)}</div>
    <fieldset class="options quiz-options ${q.kind==='Фигуры'?'visual-options':''}"><legend class="visually-hidden">Варианты ответа</legend>${options(q.options,session.answers[index],'question',q.kind==='Фигуры')}</fieldset>
    <p class="error" role="alert"></p>
    <div class="actions"><button class="btn secondary" id="back" type="button">Назад</button>
    <button class="btn" id="next" type="button" ${session.answers[index]===null?'disabled':''}>${last?'Завершить тест':'Далее'}</button></div>`));
  const field = root.querySelector('fieldset');
  const next = document.getElementById('next');
  const steps = root.querySelector('.quiz-steps');
  steps.addEventListener('click',event=>{
    const step=event.target.closest('button[data-step]');
    if(step && !step.disabled){
      session.index=Number(step.dataset.step);
      saveDraft();
      quiz();
    }
  });
  const advance = ()=>{session.index++;saveDraft();quiz();};
  field.addEventListener('change', event=>{
    session.answers[index]=Number(event.target.value);
    next.disabled=false;
    const currentStep=steps.querySelector('[aria-current]');
    currentStep.classList.add('answered');
    currentStep.setAttribute('aria-label','Вопрос '+(index+1)+': Ответ сохранён');
    saveDraft();
  });
  bind('back',()=>{
    if(index===0) return go(editing ? 'email' : 'home');
    session.index--;saveDraft();quiz();
  });
  bind('next',()=>{
    if(!last){advance();return;}
    busy(async()=>{
      const missing=session.answers.indexOf(null);
      if(missing>=0){session.index=missing;quiz();return;}
      if(editing){
        const saved=await api('attempt/answers',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({answers:session.answers,previousAnswers:session.previousAnswers})});
        Object.assign(state.attempt,saved);
        state.edit=null;
        if(location.hash==='#edit-quiz') go('email');
        return;
      }
      const saved = await api('attempt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:session.answers,journey})});
      if(location.hash!=='#quiz') return;
      state.emailDraft=null;
      state.edit=null;
      state.attempt=saved;
      state.result=null;
      state.trainingAnswers=[];
      session.answers=Array(count).fill(null);
      session.index=0;
      clearDraft();
      newJourney();
      go('email');
    });
  });
}
async function editQuiz() {
  if(!state.attempt) return go('home');
  if(state.attempt.status==='paid') return go('result');
  if(!state.edit){
    show(panel(title('Открываем ответы…')));
    try {
      const {answers}=await api('attempt/answers');
      if(location.hash!=='#edit-quiz') return;
      state.edit={answers:[...answers],previousAnswers:answers,index:answers.length-1};
    } catch(error) {
      if(location.hash==='#edit-quiz') show(panel(`${title('Не удалось открыть ответы')}<p role="alert">${escape(error.message)}</p><a href="#email">Вернуться к почте</a>`));
      return;
    }
  }
  quiz();
}
async function calculating() {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stages = ['Числовые закономерности','Фигуры и узоры','Логические связи'];
  show(panel(`<section class="card calculation stack">
    <p class="eyebrow">9 ответов получено</p>
    ${title('Считаем ваши баллы')}
    <div class="dial">
      <div class="dial-center"><strong id="percent">0%</strong><span>готовность отчёта</span></div>
    </div>
    <progress class="progress calc-progress" value="0" max="100" aria-label="Готовность отчёта"></progress>
    <ol class="calc-checklist" aria-label="Этапы расчёта">
      ${stages.map((stage,i)=>`<li><span class="stage-index" aria-hidden="true">${i+1}</span><strong>${stage}</strong><span class="stage-state">В очереди</span></li>`).join('')}
    </ol>
    <p class="fine calc-caption">От простых закономерностей к сложным связям</p>
  </section>`));
  const screen = root.querySelector('.calculation');
  const rows = [...screen.querySelectorAll('li')];
  const meter = screen.querySelector('progress');
  const percent = screen.querySelector('#percent');
  const dial = screen.querySelector('.dial');
  const duration = 900;
  await new Promise(resolve=>{
    const start = performance.now();
    function frame(now) {
      if(!screen.isConnected){resolve();return;}
      const progress = Math.min(1,(now-start)/duration);
      const value = Math.floor(progress*100);
      if(meter.value!==value){
        meter.value=value;
        percent.textContent=value+'%';
        dial.style.setProperty('--angle',value*3.6+'deg');
      }
      rows.forEach((row,index)=>{
        const status = progress>=(index+1)/rows.length ? 'done' : progress>=index/rows.length ? 'active' : 'waiting';
        if(row.dataset.state===status) return;
        row.dataset.state=status;
        row.querySelector('.stage-index').textContent=status==='done'?'✓':index+1;
        row.querySelector('.stage-state').textContent={done:'Готово',active:'Считаем',waiting:'В очереди'}[status];
      });
      if(progress<1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
function emailStep() {
  if(!state.attempt) return go('home');
  if(state.attempt.status==='paid') return go('result');
  const contact=state.emailDraft ?? state.attempt.contact;
  show(panel(`<div class="step"><span class="eyebrow">Почта</span><span class="question-count">Последний шаг</span></div>
    ${title('Какая у вас почта?')}
    <form id="email-form" class="stack">
      <div class="contacts prompt"><label for="demo-email">Адрес электронной почты</label>
        <input id="demo-email" name="email" type="email" autocomplete="email" required pattern=".+@.+[.].+" maxlength="254" placeholder="name@example.ru" value="${escape(contact?.email||'')}">
      </div>
      <label class="consent"><input id="data-consent" type="checkbox" required ${(contact?.dataConsent ?? Boolean(state.attempt.contact))?'checked':''}><span>Согласен на обработку и хранение моей почты для доступа к результату.</span></label>
      <label class="consent"><input id="reminder-consent" type="checkbox" ${contact?.reminderConsent?'checked':''}><span>Можно один раз напомнить мне по почте, если я не открою полный разбор.</span></label>
      <p class="error" role="alert"></p>
      <div class="actions">${button('Назад','email-back','secondary')}<button type="submit" class="btn" disabled>Далее</button></div>
    </form>`));
  const form=document.getElementById('email-form');
  const email=form.elements.email;
  const submit=form.querySelector('button[type=submit]');
  const consent=form.querySelector('#data-consent');
  function updateForm() {
    submit.disabled=!(email.validity.valid && consent.checked);
    state.emailDraft={email:email.value,dataConsent:consent.checked,reminderConsent:form.querySelector('#reminder-consent').checked};
  }
  form.addEventListener('input',updateForm);
  form.addEventListener('change',updateForm);
  updateForm();
  bind('email-back',()=>{state.edit=null;go('edit-quiz');});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const contact={
      email:email.value.trim(),
      reminderConsent:form.querySelector('#reminder-consent').checked,
      dataConsent:form.querySelector('#data-consent').checked
    };
    busy(async()=>{
      submit.textContent='Сохраняем адрес…';
      try {
        const saved=await api('contacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(contact)});
        Object.assign(state.attempt,saved);
        state.emailDraft=null;
      } finally {
        submit.textContent='Далее';
      }
      if(location.hash!=='#email') return;
      if(state.attempt.status==='paid') return go('result');
      await calculating();
      if(location.hash==='#email') go('offer');
    });
  });
}
function offer() {
  if(!state.attempt) return go('home');
  if(state.attempt.status==='paid') return go('result');
  const {text,detail,stat}=state.attempt.preview;
  if(!state.attempt.contact) return go('email');
  show(panel(`<section class="pay-reveal stack">
    <p class="eyebrow">Тест завершён · 9 из 9</p>
    ${title('Ваш результат <em>готов</em>')}
    <div class="portrait-gallery" aria-label="Галерея со скрытым результатом">
      <figure><img src="/portraits/chanel.webp" alt=""><figcaption><strong>IQ 113*</strong><span>Коко Шанель</span></figcaption></figure>
      <figure class="your-portrait"><img src="/portraits/you.webp" alt=""><figcaption><strong>Вы · ???</strong><span>Скрытый результат</span></figcaption></figure>
      <figure><img class="musk-portrait" src="/portraits/musk-royal.webp" alt="" title="Дебби Роу / The Royal Society"><figcaption><strong>IQ 160*</strong><span>Илон Маск</span></figcaption></figure>
    </div>
    <div class="offer-action">
      <button class="btn full portrait-cta" type="submit" form="offer-form" aria-describedby="offer-terms">Получить результат за ${plan.intro}&nbsp;₽</button>
      <label class="consent"><input id="terms-accepted" form="offer-form" aria-describedby="offer-terms" type="checkbox" required><span>Принимаю <a href="#offer-terms" id="read-terms">условия демоподписки</a>.</span></label>
      <p class="fine checkout-note">Демооплата · 0 ₽ · Без списаний</p>
    </div>
    <p class="gallery-note">*Баллы знаменитостей приведены для примера. IQ Илона Маска публично не подтверждён. Ваш IQ-балл в отчёте — игровая оценка за 9 задач.</p>
    <div class="insight"><p class="eyebrow">Ваш бесплатный вывод</p><h2>${escape(text)}</h2>${stat?'<strong class="stat">'+escape(stat)+'</strong>':''}<p>${escape(detail)}</p></div>
  </section>
  <form id="offer-form" class="card paycard stack">
    <details class="offer-includes" open><summary>Что входит в подписку</summary>
      <ul class="included-list">
        <li>Сертификат с игровым IQ-баллом и профиль по трём типам задач</li>
        <li>Разбор всех 9 ответов с объяснениями</li>
        <li>Первая тренировка из 3 задач</li>
      </ul>
    </details>
  </form>
  <small class="photo-credit">Портрет Маска · <a href="https://commons.wikimedia.org/wiki/File:Elon_Musk_Royal_Society_crop_(cropped).jpg">Дебби Роу / The Royal Society</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, кадрирование.</small>
  <p class="terms offer-footer-terms" id="offer-terms" tabindex="-1">Первые ${plan.days} дней — ${plan.intro}&nbsp;₽. Затем ${plan.monthly}&nbsp;₽ в месяц до отмены.</p>`,'offer-layout'));
  record('screen',{screen:'offer'});
  document.getElementById('read-terms').addEventListener('click',event=>{
    event.preventDefault();
    document.getElementById('offer-terms').focus();
  });
  document.getElementById('offer-form').addEventListener('submit',event=>{
    event.preventDefault();
    history.pushState({acceptedOffer:true},'', '#checkout');
    checkout();
  });
}
function checkout() {
  if(!state.attempt) return go('home');
  if(state.attempt.status==='paid') return go('result');
  if(!state.attempt.contact) return go('email');
  if(!history.state?.acceptedOffer) return go('offer');
  show(panel(`<section class="card stack demo-confirm">
    <p class="eyebrow">Отчёт и первая тренировка</p>
    ${title('Подтвердите демооплату')}
    <div class="offer-total"><strong>К оплате</strong><b>0 ₽</b></div>
    <p>Карта не нужна. После подтверждения откроется ваш разбор.</p>
    <p class="error" role="alert"></p>
    ${button('Подтвердить демооплату · 0 ₽','confirm-demo','full')}
    <a href="#offer">Назад</a>
  </section>`));
  record('screen',{screen:'checkout'});
  bind('confirm-demo',()=>busy(async()=>{
    const confirm=document.getElementById('confirm-demo');
    const label=confirm.textContent;
    confirm.textContent='Открываем ваш разбор…';
    try {
      await api('checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({termsAccepted:true})});
    } finally {
      confirm.textContent=label;
    }
    state.attempt.status='paid';
    delete state.attempt.contact;
    go('result');
  }));
}
// Game scoring for this nine-question quiz, including previously saved attempts.
function gameIq(result) {
  return 80 + 5 * result.score;
}
function resultScore(r) {
  return `<section class="result-hero">
      <p class="result-label">Ваш игровой IQ-балл</p>
      <strong class="result-number">${gameIq(r)}</strong>
      <p class="result-count"><b>${r.score} из ${r.total}</b> верных ответов</p>
      <div class="result-strip" aria-hidden="true">${r.review.map(q=>`<span class="${q.correct?'hit':''}">${q.correct?'✓':'−'}</span>`).join('')}</div>
      <p class="result-scale">80 стартовых баллов и ещё 5 за каждый верный ответ. Это игровая оценка по итогам теста.</p>
    </section>
    <section class="result-skills"><h2>По категориям</h2>${scoreBars(r.breakdown)}</section>`;
}
function answerReview(r) {
  const firstExample = Math.max(0, r.review.findIndex(q=>!q.correct));
  return `<section class="result-review"><h2>Разбор ответов</h2>${r.review.map((q,i)=>`
    <details class="review" ${i===firstExample?'open':''}><summary>
      <small>${i+1} из ${r.total} · ${escape(q.kind)} · ${q.correct?'Верно':'Ошибка'}</small>
      <strong>${escape(q.title)}</strong></summary>
      <p class="review-prompt">${escape(q.pattern)}</p>
      <p>Ваш ответ — <b>${escape(q.chosen)}</b></p>
      ${q.correct?'':`<p>Верный ответ — <b>${escape(q.expected)}</b></p>`}
      <p>${escape(q.why)}</p></details>`).join('')}</section>`;
}
async function sharedReport(page) {
  show(panel(title('Открываем разбор…')));
  try {
    const r=await api('shared-report',{headers:{Authorization:'Bearer '+page.slice(7)},credentials:'omit'});
    if(location.hash!=='#'+page) return;
    show(panel(`${title('Ваш полный разбор')}${resultScore(r)}${answerReview(r)}<a href="#home">К началу теста</a>`));
  } catch(error) {
    if(location.hash!=='#'+page) return;
    show(panel(`${title('Не удалось открыть разбор')}<p role="alert">${escape(error.message)}</p><a href="#home">К началу теста</a>`));
  }
}
async function report() {
  if(!state.attempt) return go('home');
  if(state.attempt.status!=='paid') return go('offer');
  show(panel(title('Загружаем отчёт…')));
  try { state.result = await api('result'); }
  catch(error) {
    if(location.hash!=='#result') return;
    state.result=null;
    show(panel(`${title('Отчёт пока недоступен')}<a href="#subscription">Моя подписка</a><p role="alert">${escape(error.message)}</p>${button('Повторить','retry-report')}`));
    bind('retry-report',report);
    return;
  }
  if(location.hash!=='#result') return;
  const r=state.result;
  const {first, hint} = lessonPlan(r);
  show(panel(`<p class="eyebrow">✓ Демо-оплата подтверждена · 0 ₽</p>${title('Ваш полный разбор')}
    ${resultScore(r)}<a href="#subscription">Моя подписка</a>
    <section class="card course stack"><p class="eyebrow">Курс «Вижу закономерность»</p><h2>Ваша первая тренировка</h2><p>${escape(hint)}</p>
      ${r.trainingPaused?'<a href="#subscription">Тренировки на паузе · Моя подписка</a>':button('Начать первый урок','training')}<p class="fine">3 задачи · Первая категория — ${escape(first)}</p></section>
    ${answerReview(r)}
    <section class="certificate"><p class="eyebrow">Логика · Тест на мышление</p>
      <h2>Сертификат о прохождении</h2>
      <p>Игровой IQ-балл</p><strong>${gameIq(r)}</strong><p>Верных ответов: ${r.score} из ${r.total}</p>
      ${button('Сохранить или распечатать','print-certificate','secondary')}</section>
    ${button('Пройти тест заново','restart','secondary')}`));
  record('screen',{screen:'report'});
  bind('print-certificate',()=>window.print());
  bind('training',()=>go('training'));
  bind('restart',reset);
}
function lessonPlan(result) {
  // The server sends one exercise for each quiz category in this order.
  const categories = ['Числа','Фигуры','Логика'];
  const ranked = [...categories].sort((a,b)=>result.breakdown[a].score-result.breakdown[b].score);
  const hasWeakest = result.breakdown[ranked[0]].score < result.breakdown[ranked[1]].score;
  const order = hasWeakest ? ranked : categories;
  return {
    first:order[0],
    hint:hasWeakest
      ? 'Начнём с категории, в которой было меньше всего верных ответов.'
      : 'Решите по одной новой задаче из каждой категории и сравните подходы.',
    tasks:order.map(kind=>result.training[categories.indexOf(kind)])
  };
}
async function training() {
  try { state.result=await api('result'); } catch {if(location.hash==='#training') go('result');return;}
  if(location.hash!=='#training') return;
  if(state.result.trainingPaused) return go('subscription');
  record('screen',{screen:'training'});
  const {tasks}=lessonPlan(state.result);
  const index=state.trainingAnswers.length;
  if(index===tasks.length){
    const score=tasks.filter((task,i)=>task.key===state.trainingAnswers[i]).length;
    show(panel(`${title('Тренировка завершена')}<p class="score">${score} из ${tasks.length}</p><div class="actions"><a class="btn secondary" href="#result">К отчёту</a>${button('Повторить','repeat')}</div>`));
    bind('repeat',()=>{state.trainingAnswers=[];training();});
    return;
  }
  const task=tasks[index];
  show(panel(`<p class="eyebrow">Тренировка · ${index+1} из ${tasks.length}</p>${title(escape(task.prompt))}
    <fieldset class="options"><legend class="visually-hidden">Варианты ответа</legend>${options(task.options,null,'training')}</fieldset>
    <div id="feedback" role="status"></div><div class="actions"><a class="btn secondary" href="#result">К отчёту</a><button id="check" type="button" class="btn" disabled>Проверить</button></div>`));
  const field=root.querySelector('fieldset');
  const check=document.getElementById('check');
  field.addEventListener('change',()=>check.disabled=false);
  check.addEventListener('click',()=>{
    if(field.disabled){training();return;}
    const choice=Number(field.querySelector(':checked').value);
    state.trainingAnswers.push(choice);
    field.disabled=true;
    document.getElementById('feedback').innerHTML=`<p class="ok">${choice===task.key?'Верно.':'Ответ: '+escape(task.options[task.key])+'.'}</p><p>${escape(task.why)}</p>`;
    check.textContent=index+1===tasks.length?'Завершить':'Дальше';
  });
}
function render(page=location.hash.slice(1)) {
  if(page.startsWith('invite/')) return guestScreen(page);
  if(page==='subscription' || page.startsWith('subscription/')) return subscriptionScreen(page);
  if(page.startsWith('report/')) return sharedReport(page);
  ({home,quiz,'edit-quiz':editQuiz,email:emailStep,offer,checkout,result:report,training}[page]||home)();
}
async function start() {
  try {
    state.questions=await api('questions');
    state.answers=Array(state.questions.length).fill(null);
    restoreDraft();
    try { state.attempt=await api('attempt'); } catch(error) { if(error.status!==404) throw error; }
    window.addEventListener('hashchange',()=>render());
    render();
  } catch(error) {
    show(panel(`${title('Не удалось загрузить тест')}<p role="alert">${escape(error.message)}</p>${button('Повторить','retry')}`));
    bind('retry',start);
  }
}
start();

