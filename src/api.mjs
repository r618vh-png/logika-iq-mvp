import { adminUsers } from './admin.mjs';
import { questions } from './questions.mjs';
import { training } from './training.mjs';
import { html, css, js, adminLoginJs, adminMailJs, subscriptionJs, images } from './assets.mjs';
const base = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json = (data,status=200) => Response.json(data,{status,headers:base});
const publicQuestions = questions.map(([kind,title,pattern,options])=>({kind,title,pattern,options}));
async function readForm(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Ожидаются данные формы.'},415);
  const reader=request.body?.getReader();
  if(!reader) return json({error:'Заполните форму.'},400);
  let body='',size=0;
  const decoder=new TextDecoder();
  for(;;){
    const {done,value}=await reader.read();
    if(done) break;
    size+=value.byteLength;
    if(size>2048){await reader.cancel();return json({error:'Запрос слишком большой.'},413);}
    body+=decoder.decode(value,{stream:true});
  }
  try{return JSON.parse(body+decoder.decode());}catch{return json({error:'Неверный формат данных.'},400);}
}
function preview(result) {
  const groups = Object.entries(result.breakdown).sort((a,b) => b[1].score-a[1].score);
  const [kind, best] = groups[0];
  const stat=best.score+'/'+best.total;
  if(best.score > groups[1][1].score) return {stat,text:'Больше всего верных ответов — в разделе «'+kind+'».',detail:best.score+' из '+best.total+' в этой категории.'};
  if(groups.every(([,group])=>group.score===best.score)) return {
    stat,text:'Во всех трёх категориях у вас одинаковый результат.',
    detail:'Числа, фигуры и логика — по '+best.score+' из '+best.total+'.'
  };
  return {stat,text:'Лучше всего вам дались «'+kind+'» и «'+groups[1][0]+'».',detail:'В каждой из этих категорий — '+best.score+' из '+best.total+' верных ответов.'};
}
const cookie = (id,request,name='lg_attempt') => name+'='+id+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000'+(new URL(request.url).protocol==='https:'?'; Secure':'');
function attemptSummary(row){
  const summary={status:row.status,preview:preview(JSON.parse(row.result))};
  if(row.status==='pending' && row.consent_at) summary.contact={email:row.email,phone:row.phone||'',reminderConsent:Boolean(row.reminder_at)};
  return summary;
}
async function quizSubmissionId(browser,journey){
  // The journey is also used for analytics. Bind the retry key to a private browser cookie.
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(browser+'/'+journey));
  const hex=Array.from(new Uint8Array(hash,0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
const assets = {'/subscription.js':[subscriptionJs,'text/javascript'],'/admin-mail.js':[adminMailJs,'text/javascript'],'/admin-login.js':[adminLoginJs,'text/javascript'],'/':[html,'text/html'],'/style.css':[css,'text/css'],'/app.js':[js,'text/javascript']};
export default {
  async fetch(request,env){
    const {pathname,origin} = new URL(request.url);
    if(pathname==='/admin' || pathname==='/admin/' || pathname==='/admin/live' || pathname==='/admin/login' || pathname==='/admin/mailing') return adminUsers(request,env);
    const method = request.method;
    if(method==='GET' && Object.hasOwn(images,pathname)){
      return new Response(Uint8Array.from(atob(images[pathname]),char=>char.charCodeAt(0)),{
        headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}
      });
    }
    if(method==='GET' && Object.hasOwn(assets,pathname)){
      const [body,type] = assets[pathname];
      return new Response(body,{headers:{...base,'Content-Type':type+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
    }
    const browser=request.headers.get('Cookie')?.match(/(?:^|;\s*)lg_quiz_browser=([0-9a-f-]{36})(?:;|$)/)?.[1];
    if(method==='GET' && pathname==='/api/questions'){
      const response=json(publicQuestions);
      if(!browser) response.headers.set('Set-Cookie',cookie(crypto.randomUUID(),request,'lg_quiz_browser'));
      return response;
    }
    if(!['/api/guest','/api/subscription','/api/visit','/api/screen','/api/stats','/api/attempt','/api/attempt/answers','/api/checkout','/api/result','/api/shared-report','/api/contacts'].includes(pathname)) return json({error:'Страница не найдена.'},404);
    const allowed = {'/api/guest':['GET','POST'],'/api/subscription':['GET','POST'],'/api/visit':['POST'],'/api/screen':['POST'],'/api/stats':['GET'],'/api/attempt/answers':['GET','POST'],'/api/attempt':['GET','POST'],'/api/checkout':['POST'],'/api/result':['GET'],'/api/shared-report':['GET'],'/api/contacts':['POST']};
    if(!allowed[pathname].includes(method)) return json({error:'Метод недоступен.'},405);
    if(method==='POST' && request.headers.get('Origin')!==origin) return json({error:'Запрос отклонён.'},403);
    const db=env.DB;
    const current=request.headers.get('Cookie')?.match(/(?:^|;\s*)lg_attempt=([0-9a-f-]{36})(?:;|$)/)?.[1];
    try{
      if(pathname==='/api/guest') return await guestExercise(request,db);
      if(pathname==='/api/subscription') return await manageSubscription(request,db,current);
      if(pathname==='/api/visit' || pathname==='/api/screen'){
        const event=await readForm(request);
        if(event instanceof Response) return event;
        if(pathname==='/api/visit'){
          if(!/^[0-9a-f-]{36}$/.test(event?.journey||'') || !Number.isInteger(event.question) || event.question<0 || event.question>9) return json({error:'Неверный этап.'},400);
          const now=Date.now();
          await db.prepare(`INSERT INTO journeys(id,started,question,touched) VALUES(?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET question=max(question,excluded.question),touched=excluded.touched WHERE excluded.question>question`).bind(event.journey,now,event.question,now).run();
        } else {
          const fields={offer:'offer_at',checkout:'checkout_at',report:'report_at',training:'training_at'};
          if(!current || !Object.hasOwn(fields,event?.screen)) return json({error:'Неверный этап.'},400);
          const col=fields[event.screen];
          const condition=['report','training'].includes(event.screen)?"status='paid'":"email IS NOT NULL";
          await db.prepare(`UPDATE attempts SET ${col}=? WHERE id=? AND ${col} IS NULL AND ${condition}`).bind(Date.now(),current).run();
        }
        return json({ok:true});
      }
      if(pathname==='/api/stats'){
        const counts=await db.prepare('SELECT COUNT(*) AS completed FROM attempts').bind().first();
        return json(counts);
      }
      const revising = pathname === '/api/attempt/answers';
      if(revising && !current) return json({error:'Сначала завершите тест.'},404);
      if(revising && method==='GET'){
        const row=await db.prepare("SELECT answers FROM attempts WHERE id=? AND status='pending'").bind(current).first();
        return row ? json({answers:JSON.parse(row.answers)}) : json({error:'Ответы уже нельзя изменить.'},409);
      }
      if((pathname==='/api/attempt' || revising) && method==='POST'){
        const payload=await readForm(request);
        if(payload instanceof Response) return payload;
        const answers=payload?.answers;
        if(!Array.isArray(answers)||answers.length!==questions.length||!answers.every((a,i)=>Number.isInteger(a)&&a>=0&&a<questions[i][3].length)) return json({error:'Ответьте на все вопросы.'},400);
        const breakdown={};
        const review=questions.map(([kind,title,pattern,options,key,why],i)=>{
          const correct=answers[i]===key;
          const section=breakdown[kind]??={score:0,total:0};
          section.total++;section.score+=Number(correct);
          return {kind,title,pattern,correct,chosen:options[answers[i]],expected:options[key],why};
        });
        const result={score:review.filter(q=>q.correct).length,total:review.length,breakdown,review};
        if(revising){
          const row=await db.prepare("UPDATE attempts SET answers=?, result=? WHERE id=? AND answers=? AND status='pending' RETURNING id")
            .bind(JSON.stringify(answers),JSON.stringify(result),current,JSON.stringify(payload.previousAnswers ?? null)).first();
          return row ? json({preview:preview(result)}) : json({error:'Попытка изменилась. Обновите страницу.'},409);
        }
        const journey=/^[0-9a-f-]{36}$/.test(payload?.journey||'')?payload.journey:null;
        const prior=!browser && current && journey && await db.prepare('SELECT id FROM attempts WHERE id=? AND journey=?').bind(current,journey).first();
        const id=prior?.id || (browser && journey?await quizSubmissionId(browser,journey):crypto.randomUUID());
        const inserted=await db.prepare("INSERT INTO attempts(id,answers,result,created_at,journey) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id")
          .bind(id,JSON.stringify(answers),JSON.stringify(result),Date.now(),journey).first();
        let out;
        if(inserted) out=json({status:'pending',preview:preview(result)},201);
        else {
          const saved=await db.prepare('SELECT status,result,answers,email,phone,consent_at,reminder_at FROM attempts WHERE id=?').bind(id).first();
          if(saved.answers!==JSON.stringify(answers)) return json({error:'Эта попытка уже сохранена. Обновите страницу, чтобы открыть её.'},409);
          out=json(attemptSummary(saved));
        }
        out.headers.set('Set-Cookie',cookie(id,request));
        return out;
      }
      if(pathname==='/api/shared-report'){
        const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1];
        const entry=token && await db.prepare(
          "SELECT a.result FROM report_links l JOIN attempts a ON a.id=l.attempt_id WHERE l.token=? AND a.status='paid' AND NOT EXISTS(SELECT 1 FROM cancel_flows WHERE attempt=a.id AND outcome='cancel' AND effective<=?)"
        ).bind(token,Date.now()).first();
        return entry?json(JSON.parse(entry.result)):json({error:'Проверьте, что ссылка из письма скопирована целиком.'},404);
      }
      if(!current) return json({error:'Сначала завершите тест.'},404);
      const attempt=await db.prepare('SELECT status, result, email, phone, consent_at, reminder_at,coalesce(paid_at,created_at) AS activated FROM attempts WHERE id = ?').bind(current).first();
      if(!attempt) return json({error:'Попытка не найдена.'},404);
      if(pathname==='/api/contacts' || pathname==='/api/checkout'){
        const savingContacts=pathname==='/api/contacts';
        if(attempt.status==='paid') return json({status:'paid'});
        const form=await readForm(request);
        if(form instanceof Response) return form;
        if(!savingContacts && form?.termsAccepted!==true) return json({error:'Подтвердите условия демоподписки.'},400);
        if(!savingContacts && attempt.consent_at){
          await db.prepare("UPDATE attempts SET status='paid', paid_at=? WHERE id=? AND status='pending' AND consent_at IS NOT NULL").bind(Date.now(),current).run();
          return json({status:'paid'});
        }
        const email=typeof form?.email==='string'?form.email.trim():'';
        if(email.length>254 || !/^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/u.test(email)) return json({error:'Введите адрес электронной почты.'},400);
        if(form.reminderConsent===true && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(email)) return json({error:'Проверьте почту для напоминания или снимите отметку.'},400);
        const phone=form.phone??'';
        if(typeof phone!=='string' || phone.length>24 || (phone && (!/^[+0-9() -]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g,''))))) return json({error:'Проверьте номер телефона.'},400);
        if(form.dataConsent!==true) return json({error:'Подтвердите согласие на обработку контактов.'},400);
        const now=Date.now();
        if(savingContacts){
          await db.prepare("UPDATE attempts SET email=?, phone=?, consent_at=?, reminder_at=? WHERE id=? AND status='pending'").bind(email,phone||null,now,form.reminderConsent===true?now:null,current).run();
          return json({status:'pending',contact:{email,phone,reminderConsent:form.reminderConsent===true}});
        }
        await db.prepare("UPDATE attempts SET email=?, phone=?, consent_at=?, status='paid', paid_at=? WHERE id=? AND status='pending'").bind(email,phone||null,now,now,current).run();
        return json({status:'paid'});
      }
      if(pathname==='/api/attempt') return json(attemptSummary(attempt));
      if(attempt.status!=='paid') return json({error:'Отчёт ещё закрыт.'},402);
      const result=JSON.parse(attempt.result);
      const sub=await subscriptionState(db,current,attempt.activated,Date.now());
      if(sub.accessUntil!==null && sub.accessUntil<=Date.now()) return json({error:'Срок доступа к отчёту закончился.'},410);
      return json({...result,training:sub.training?training:[],trainingPaused:!sub.training});
    }catch(e){console.error('Database request failed',e.message);return json({error:'Сервис временно недоступен. Попробуйте ещё раз.'},503);}
  }
};
