import test from 'node:test';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import { database, worker } from './local.mjs';

test('stored attempt reveals its report only after idempotent demo payment', async () => {
  const { DB, raw } = database();
  const origin = 'https://logika.example';
  let cookie = '';
  const request = (path, method='GET', body, auth=true) => worker.fetch(new Request(origin+path,{
    method,
    headers:{Origin:origin,'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  }),{DB});
  const questions = await (await request('/api/questions')).json();
  assert.equal(questions.length,9);
  assert.deepEqual(Object.keys(questions[0]),['kind','title','pattern','options']);
  assert.equal((await request('/api/attempt','POST',{answers:[1]})).status,400);
  assert.equal((await request('/api/result')).status,404);
  assert.deepEqual(await (await request('/api/stats')).json(),{completed:0});
  const saved=await request('/api/attempt','POST',{answers:[2,0,3,1,0,0,3,0,0]});
  assert.equal(saved.status,201);
  cookie=saved.headers.get('set-cookie').split(';')[0];
  assert.match(saved.headers.get('set-cookie'),/HttpOnly.*Secure/);
  const pending=await saved.json();
  assert.deepEqual(Object.keys(pending),['status','preview']);
  assert.equal(pending.status,'pending');
  assert.match(pending.preview.text,/Числа/);
  assert.deepEqual(await (await request('/api/attempt')).json(),pending);
  assert.equal((await request('/api/result')).status,402);
  assert.equal((await request('/api/checkout','POST',undefined,false)).status,404);
  const snapshot=await (await request('/api/attempt/answers')).json();
  const revised=[...snapshot.answers];
  revised[8]=1;
  const revision={previousAnswers:snapshot.answers,answers:revised};
  assert.equal((await request('/api/attempt/answers','GET',undefined,false)).status,404);
  assert.equal((await request('/api/attempt/answers','POST',revision)).status,200);
  assert.equal((await request('/api/attempt/answers','POST',revision)).status,409);
  assert.deepEqual(await (await request('/api/attempt/answers')).json(),{answers:revised});
  const contact={email:'demo@example.org',dataConsent:true,termsAccepted:true};
  for(const invalid of [undefined,{...contact,email:'oops'},{...contact,dataConsent:false},{...contact,termsAccepted:false}]){
    assert.equal((await request('/api/checkout','POST',invalid)).status,400);
  }
  assert.equal(raw.prepare('SELECT email FROM attempts').get().email,null);
  assert.equal((await request('/api/contacts','POST',{email:contact.email,dataConsent:true})).status,200);
  assert.equal((await request('/api/result')).status,402);
  assert.equal((await (await request('/api/attempt')).json()).contact.email,contact.email);
  assert.equal(raw.prepare('SELECT paid_at FROM attempts').get().paid_at,null);
  assert.equal((await request('/api/checkout','POST',{termsAccepted:true})).status,200);
  assert.deepEqual({...raw.prepare('SELECT email, phone, consent_at<=paid_at AS consent FROM attempts').get()},{email:contact.email,phone:null,consent:1});
  const first=raw.prepare('SELECT status, paid_at FROM attempts').get();
  assert.equal(first.status,'paid');
  assert.ok(first.paid_at);
  assert.equal((await request('/api/checkout','POST')).status,200);
  assert.deepEqual(raw.prepare('SELECT status, paid_at FROM attempts').get(),first);
  assert.deepEqual(await (await request('/api/stats','GET',undefined,false)).json(),{completed:1});
  const result=await (await request('/api/result')).json();
  assert.equal(result.score,6);
  assert.equal((await request('/api/attempt/answers','POST',{previousAnswers:revised,answers:snapshot.answers})).status,409);
  assert.equal(result.email,undefined);
  assert.equal(result.review.length,9);
  assert.equal(result.training.length,3);
  assert.equal((await request('/api/result','GET',undefined,false)).status,404);
});

test('free preview names tied categories and uses actual scores',async()=>{
  const {DB}=database();
  const submit=async answers=>{
    const response=await worker.fetch(new Request('https://logika.example/api/attempt',{
      method:'POST',headers:{Origin:'https://logika.example','Content-Type':'application/json'},body:JSON.stringify({answers})
    }),{DB});
    assert.equal(response.status,201);
    return (await response.json()).preview;
  };
  const tied=await submit(Array(9).fill(0));
  assert.match(tied.text,/Фигуры/);
  assert.match(tied.text,/Логика/);
  assert.match(tied.detail,/1 из 3/);
  const equal=await submit([2,0,3,1,2,0,3,1,2]);
  assert.match(equal.detail,/по 3 из 3/);
});

test('only the administrator can read the paginated email directory', async () => {
  const {DB,raw}=database();
  const url='https://logika.example/admin';
  const login='admin:unit-test-only';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(login));
  const env={DB,ADMIN_AUTH_SHA256:Buffer.from(digest).toString('hex')};
  const link=createHmac('sha256',env.ADMIN_AUTH_SHA256).update('login-link:v1').digest('hex');
  const signin=(token=link,auth='admin:admin',origin='https://logika.example')=>worker.fetch(new Request(url+'/login',{
    method:'POST',headers:{Origin:origin,'X-Admin-Link':token,Authorization:'Basic '+btoa(auth)}
  }),env);
  assert.equal((await worker.fetch(new Request(url),{DB})).status,503);
  assert.equal((await worker.fetch(new Request(url),env)).status,401);
  assert.equal((await signin('')).status,401);
  assert.equal((await signin(link,'admin:wrong')).status,401);
  assert.equal((await signin(link,'admin:admin','https://other.example')).status,403);
  const signed=await signin();
  assert.equal(signed.status,204);
  const cookie=signed.headers.get('Set-Cookie').split(';')[0];
  const request=(suffix='',value=cookie)=>worker.fetch(new Request(url+suffix,{headers:{Cookie:value}}),env);
  assert.equal((await request('',cookie+'x')).status,401);
  const insert=raw.prepare('INSERT INTO attempts(id,email,created_at,answers,result,status) VALUES(?,?,?,\'[]\',?,?)');
  const row=(email,time,score,status)=>insert.run(crypto.randomUUID(),email,time,JSON.stringify({score,total:9}),status);
  row('Demo@example.org',1,2,'pending');
  row('demo@example.org',2,7,'paid');
  row(null,3,1,'pending');
  const response=await request('?view=people');
  assert.equal(response.status,200);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
  const html=await response.text();
  assert.match(html,/Попыток: 2 · Балл: 7 из 9/);
  assert.match(html,/Демооплата пройдена/);
  assert.match(html,/С почтой: <b>1<\/b>. Попыток без почты: <b>1/);
  for(let i=0;i<50;i++) row('viewer'+i+'@example.org',10+i,0,'pending');
  assert.match(await (await request('?view=people')).text(),/Далее →/);
  assert.match(await (await request('?view=people&page=2')).text(),/demo@example.org/);
  assert.equal((await request('?page=-1')).status,400);
});

test('dashboard links anonymous progress to the saved attempt and one-time unpaid reminder',async()=>{
  const {DB,raw}=database();
  const origin='https://logika.example';
  const secret='f'.repeat(64);
  const env={DB,ADMIN_AUTH_SHA256:secret,MAIL_READY:true};
  const key=msg=>createHmac('sha256',secret).update(msg).digest('hex');
  let attempt='';
  const post=(path,data)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:attempt,'Content-Type':'application/json'},body:JSON.stringify(data)}),env);
  const expires=Math.floor(Date.now()/1000)+3500;
  const adminCookie='__Host-lg_admin='+expires+'.'+key('session:'+expires);
  const admin=(path='/admin')=>worker.fetch(new Request(origin+path,{headers:{Cookie:adminCookie}}),env);
  const journey=crypto.randomUUID();
  for(const question of [0,5,2]) assert.equal((await post('/api/visit',{journey,question})).status,200);
  assert.equal(raw.prepare('SELECT question FROM funnel_rows').get().question,5);
  const finish=await post('/api/attempt',{journey,answers:Array(9).fill(0)});
  attempt=finish.headers.get('Set-Cookie').split(';')[0];
  assert.deepEqual({...raw.prepare('SELECT count(*) AS n,max(stage) AS stage FROM funnel_rows').get()},{n:1,stage:2});
  const save=async(email,reminderConsent)=>post('/api/contacts',{email,reminderConsent,dataConsent:true});
  assert.equal((await save('mail@example.org',true)).status,200);
  await post('/api/screen',{screen:'checkout'});
  await post('/api/screen',{screen:'offer'});
  await post('/api/screen',{screen:'report'});
  assert.equal(raw.prepare('SELECT stage FROM funnel_rows').get().stage,5);
  assert.match(await (await admin('/admin?view=attempts&stage=5')).text(),/mail@example.org/);
  assert.match(await (await admin()).text(),/Из 1 попыток с почтой/);
  const token=async()=> (await (await admin('/admin?view=mail')).text()).match(/data-token="([a-f0-9]+)"/)[1];
  const send=(t,mode='send',cookie=adminCookie)=>worker.fetch(new Request(origin+'/admin/mailing',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-Mail-Action':mode,'X-Mail-Preview':t}}),env);
  let t=await token();
  assert.equal((await send(t,'send','')).status,401);
  await save('mail@example.org',false);
  assert.equal((await send(t)).status,409);
  await save('mail@example.org',true);
  assert.equal((await send(t)).status,202);
  assert.equal((await send(t)).status,409);
  const {reminderDelivery}=await import('./reminders.mjs');
  let deliveries=0;
  const pump=reminderDelivery(raw,{from:'hello@example.org',config:'package.json',deliver:async()=>{deliveries++;}});
  await post('/api/checkout',{termsAccepted:true});
  await pump();
  assert.equal(deliveries,0);
  assert.equal(raw.prepare('SELECT state FROM reminders').get().state,'skipped');
  const make=async(email)=>{
    const res=await post('/api/attempt',{answers:Array(9).fill(0)});
    attempt=res.headers.get('Set-Cookie').split(';')[0];
    await save(email,true);
  };
  await make('MAIL@example.org'); // Prior payment on another attempt excludes the address.
  await make('two@example.org');
  await make('TWO@example.org');
  t=await token();
  const file=await send(t,'draft');
  assert.equal(file.status,200);
  const body=await file.text();
  assert.match(body,/Bcc: two@example.org\r\n/);
  assert.doesNotMatch(body,/mail@example.org/i);
  assert.equal((await send(t,'draft')).status,409);
  await make('three@example.org');
  assert.equal((await send(await token())).status,202);
  await Promise.all([pump(),pump()]);
  assert.equal(deliveries,1);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM reminders WHERE state='sent'").get().n,1);
});

test('demo funnel is populated and mailing simulations leave both databases untouched',async()=>{
  const demo=database(),live=database();
  const {populateDemo}=await import('./demo-data.mjs');
  populateDemo(demo.raw);
  const secret='e'.repeat(64),expires=Math.floor(Date.now()/1000)+600;
  const signature=createHmac('sha256',secret).update('session:'+expires).digest('hex');
  const origin='https://logika.example';
  const env={DB:live.DB,DEMO_DB:demo.DB,MAIL_READY:true,ADMIN_AUTH_SHA256:secret};
  const call=(path,options={})=>worker.fetch(new Request(origin+path,{...options,headers:{Cookie:'__Host-lg_admin='+expires+'.'+signature,Origin:origin,...options.headers}}),env);
  assert.equal(demo.raw.prepare('SELECT count(*) n FROM journeys').get().n,240);
  assert.equal(demo.raw.prepare('SELECT count(DISTINCT stage) n FROM funnel_rows').get().n,9);
  assert.match(await (await call('/admin')).text(),/240 вымышленных прохождений/);
  assert.doesNotMatch(await (await call('/admin/live')).text(),/240 вымышленных прохождений/);
  assert.equal(live.raw.prepare('SELECT count(*) n FROM journeys').get().n,0);
  const preview=await (await call('/admin?view=mail')).text();
  const token=preview.match(/data-token="([a-f0-9]+)"/)[1];
  const post=(source,action)=>call('/admin/mailing',{method:'POST',headers:{'X-Mail-Source':source,'X-Mail-Action':action,'X-Mail-Preview':token}});
  assert.equal((await post('demo','send')).status,400);
  assert.equal((await post('live','send')).status,409);
  assert.match(await (await post('demo','simulate')).text(),/Получателей: [1-9]\d*\. Писем отправлено: 0/);
  for(const db of [demo,live]) assert.equal(db.raw.prepare('SELECT count(*) n FROM reminders').get().n,0);
});

test('paid subscription stores reasons, enforces one offer and applies pause and cancellation access',async()=>{
  const {DB,raw}=database(), origin='https://logika.example';
  const insert=raw.prepare("INSERT INTO attempts(id,status,paid_at,created_at,email,answers,result) VALUES(?,'paid',?,?,?,'[]',?)");
  const pay=()=>{const id=crypto.randomUUID(),now=Date.now();insert.run(id,now,now,'test@example.test',JSON.stringify({score:5,total:9}));return id;};
  const req=(id,path='/api/subscription',data,extra={})=>worker.fetch(new Request(origin+path,{method:data?'POST':'GET',
    headers:{Origin:origin,Cookie:'lg_attempt='+id,'Content-Type':'application/json',...extra},body:data?JSON.stringify(data):undefined}),{DB});
  const post=async(id,data)=>{const r=await req(id,undefined,data);assert.equal(r.status,200);return r.json();};
  assert.equal((await req(crypto.randomUUID())).status,404);
  const run=async(id,reason,decisions)=>{
    raw.prepare("INSERT INTO cancel_flows(id,attempt,started,exit_step,survey_answers) VALUES(?,?,?,1,'[]')").run(crypto.randomUUID(),id,Date.now());
    let s=await post(id,{action:'begin'});
    const first=s,flow=s.open.id;
    let clicks=0,last;
    const planned=[reason,decisions[0],'skills','short',decisions[1],'right','logic','clear','once',decisions[2]];
    const titles=new Set();
    assert.equal((await req(id,undefined,{action:'answer',choice:'cancel',number:10,id:flow})).status,409);
    while(s.open){
      const q=s.open.question;
      assert.equal(q.number,clicks+1);assert.ok(!titles.has(q.title));titles.add(q.title);
      if(q.number===1) assert.equal(Object.keys(q.options).length,2);
      let choice=planned[clicks];
      if(!q.offer && (q.number===2 || q.number===5)) choice=Object.keys(q.options)[0];
      assert.ok(Object.hasOwn(q.options,choice));
      last={action:'answer',choice,number:q.number,id:flow};
      s=await post(id,last);clicks++;
      if(s.open) {
        assert.deepEqual((await (await req(id)).json()).open.question,s.open.question);
        assert.deepEqual((await post(id,last)).open.question,s.open.question);
      }
    }
    await post(id,last);
    const row=raw.prepare('SELECT * FROM cancel_flows WHERE id=?').get(flow);
    assert.equal(row.exit_step,clicks);assert.equal(JSON.parse(row.survey_answers).length,clicks);
    return {s,first,row,clicks};
  };
  for(const [reason,decisions,outcome] of [
    ['price',['discount'],'discount'], ['time',['pause'],'pause'],
    ['price',['continue','pause'],'pause'], ['time',['continue','discount'],'discount'],
    ['time',['continue','continue','cancel'],'cancel'], ['price',['continue','continue','keep'],'keep']]){
    const id=pay(),{s,first,row,clicks}=await run(id,reason,decisions);
    assert.equal(row.outcome,outcome);
    assert.equal(Boolean(row.second_offer_at),decisions[0]==='continue');
    assert.equal((await req('',undefined,undefined,{Authorization:'Bearer '+s.key})).status,200);
    if(outcome==='discount'){
      assert.equal(s.price,149);assert.equal(s.next,first.next);
      raw.prepare('UPDATE cancel_flows SET effective=? WHERE id=?').run(Date.now()-1,row.id);
      assert.equal((await (await req(id)).json()).price,299);
      const later=await run(id,'time',['continue','continue','cancel']);
      assert.equal(later.clicks,10);
    }
    if(outcome==='pause'){
      assert.equal(s.status,'paused');assert.equal(s.next,first.next+30*86400000);
      assert.deepEqual((await (await req(id,'/api/result')).json()).training,[]);
      raw.prepare('UPDATE cancel_flows SET effective=? WHERE id=?').run(Date.now()-1,row.id);
      assert.equal((await (await req(id,'/api/result')).json()).training.length,3);
    }
    if(outcome==='cancel'){
      assert.equal(clicks,10);assert.equal(s.accessUntil,first.next);
      raw.prepare('UPDATE cancel_flows SET effective=? WHERE id=?').run(Date.now()-1,row.id);
      assert.equal((await req(id,'/api/result')).status,410);
      assert.equal((await post(id,{action:'begin'})).open,null);
    }
  }
});

test('new offer path persists every decision and delivers the accepted benefit',async()=>{
  const {DB,raw}=database(),origin='https://logika.test';
  const request=(path,cookie,data,token)=>worker.fetch(new Request(origin+'/api/'+path,{method:data?'POST':'GET',
    headers:{Origin:origin,Cookie:cookie||'','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:data?JSON.stringify(data):undefined}),{DB});
  for(const destination of ['month149','pause30','practice','month99','duo','daily','retest','bonus','advanced','fortnight','cancel']){
    const id=crypto.randomUUID(),now=Date.now(),cookie='lg_attempt='+id;
    const result={score:6,total:9,review:Array.from({length:9},(_,i)=>({correct:i<6})),breakdown:{Числа:{score:2,total:3}}};
    raw.prepare("INSERT INTO attempts(id,status,paid_at,created_at,answers,result) VALUES(?,'paid',?,?,'[]',?)").run(id,now,now,JSON.stringify(result));
    const action=async(data)=>{const res=await request('subscription',cookie,data);assert.equal(res.status,200);return res.json();};
    let state=await action({action:'begin'}), first=state, history=[];
    while(state.open){
      const {question:q,id:flow}=state.open;
      assert.equal(q.number,history.length+1);
      assert.ok(!q.title.includes('?'));assert.equal(Object.keys(q.options).length,2);
      assert.equal(q.options[q.number===10?'cancel':'continue'],'Всё равно отменить');
      const choice=Object.hasOwn(q.options,destination)?destination:'continue';
      history.push(choice);
      const msg={action:'answer',id:flow,number:q.number,choice};
      state=await action(msg);assert.deepEqual((await action(msg)).open,state.open);
    }
    const row=raw.prepare('SELECT * FROM cancel_flows WHERE attempt=?').get(id);
    assert.equal(JSON.parse(row.survey_answers).length,history.length);
    assert.equal(row.offer_code,['cancel','keep'].includes(destination)?null:destination);
    if(['month149','month99'].includes(destination)) assert.equal(state.price,Number(destination.slice(5)));
    if(destination==='fortnight') assert.equal(state.next,first.next+14*86400000);
    if(destination==='bonus') assert.equal(state.next,first.next+7*86400000);
    if(destination==='pause30') {assert.equal(state.training,false);assert.equal(state.next,first.next+30*86400000);}
    if(destination==='cancel'){assert.equal(history.length,10);assert.equal(state.status,'cancelled');assert.equal(state.accessUntil,first.next);}
    if(destination==='retest'){
      assert.ok((await action({action:'benefit'})).unlocks>now);
      raw.prepare('UPDATE cancel_flows SET decided=? WHERE id=?').run(now-8*86400000,row.id);
    }
    if(['advanced','practice','daily','retest'].includes(destination)){
      const data=await action({action:'benefit'});assert.equal(data.items.length,{advanced:3,practice:3,daily:1,retest:9}[destination]);
      assert.ok(data.items.every(i=>i.expected===undefined));
      const saved=await action({action:'benefit',answers:data.items.map(()=>0)});assert.equal(saved.complete,true);
      assert.deepEqual(await action({action:'benefit'}),saved);
    }
    if(destination==='duo'){
      const {invite}=await action({action:'benefit'});assert.ok(invite);
      const guest=(await (await request('guest','',null,invite)).json());assert.equal(guest.items.length,9);
      const res=await request('guest','',{answers:guest.items.map(()=>0)},invite);assert.equal(res.status,200);
      assert.equal((await request('guest','',null,invite)).status,409);
      assert.equal((await (await request('guest',res.headers.get('Set-Cookie').split(';')[0],null,invite)).json()).complete,true);
    }
    if(row.offer_code){
      let again=await action({action:'begin'});const flow=again.open.id;
      // A stale release could have written step ten before the user gave any answers.
      raw.prepare('UPDATE cancel_flows SET exit_step=10 WHERE id=?').run(flow);
      assert.equal((await action()).open.question.number,1);
      assert.equal((await request('subscription',cookie,{action:'answer',id:flow,number:10,choice:'cancel'})).status,409);
      if(destination==='month149'){
        await action({action:'answer',id:flow,number:1,choice:'continue'});
        const paused=await action({action:'answer',id:flow,number:2,choice:'pause30'});
        assert.equal(paused.status,'paused');assert.equal(paused.price,149);assert.equal(paused.next,first.next+30*86400000);
        again=await action({action:'begin'});
      }
      for(let number=1;number<=10;number++){
        assert.equal(again.open.question.number,number);assert.notEqual(again.status,'cancelled');
        const message={action:'answer',id:again.open.id,number,choice:number===10?'cancel':'continue'};
        again=await action(message);
        assert.deepEqual((await action(message)).open,again.open);
      }
      assert.equal(again.status,'cancelled');assert.equal(again.open,null);
      assert.equal((await action({action:'begin'})).status,'cancelled');
    }
  }
});

test('a discount and pause created in the same millisecond preserve the discounted renewal',async()=>{
  const {DB,raw}=database(),id=crypto.randomUUID(),now=Date.now(),day=86400000;
  raw.prepare("INSERT INTO attempts(id,status,paid_at,created_at,answers,result) VALUES(?,'paid',?,?,'[]',?)")
    .run(id,now,now,JSON.stringify({score:5,total:9}));
  const save=raw.prepare(`INSERT INTO cancel_flows(id,attempt,started,decided,outcome,offer_code,effective,period_end)
    VALUES(?,?,?,?,?,?,?,?)`);
  save.run('z-first',id,now,now,'discount','month149',now+7*day,null);
  save.run('a-second',id,now,now,'pause','pause30',now+30*day,now+37*day);
  const request=new Request('https://logika.test/api/subscription',{headers:{Cookie:'lg_attempt='+id}});
  const res=await worker.fetch(request,{DB});
  assert.equal(res.status,200);
  const subscription=await res.json();
  assert.equal(subscription.status,'paused');
  assert.equal(subscription.price,149);
  assert.equal(subscription.next,now+37*day);
  raw.close();
});

test('retrying the last quiz submission creates one attempt and restores its saved state',async()=>{
  const {DB,raw}=database(),origin='https://logika.example';
  const call=(path,body,cookie='')=>worker.fetch(new Request(origin+'/api/'+path,{
    method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined
  }),{DB});
  const getCookie=response=>response.headers.get('Set-Cookie').split(';')[0];
  const browser=getCookie(await call('questions'));
  const submission={journey:crypto.randomUUID(),answers:[2,0,3,1,0,0,3,0,0]};
  const replies=await Promise.all([call('attempt',submission,browser),call('attempt',submission,browser)]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,201]);
  const attempt=getCookie(replies[0]);assert.equal(attempt,getCookie(replies[1]));
  assert.equal((await (await call('stats')).json()).completed,1);
  assert.equal((await call('contacts',{email:'retry@example.test',dataConsent:true},attempt)).status,200);
  const replay=await call('attempt',submission,browser);
  assert.equal((await replay.json()).contact.email,'retry@example.test');
  assert.equal((await call('checkout',{termsAccepted:true},attempt)).status,200);
  assert.equal((await (await call('attempt',submission,browser)).json()).status,'paid');
  // A legitimate new quiz in the same browser has its own journey and attempt.
  assert.equal((await call('attempt',{...submission,journey:crypto.randomUUID()},browser)).status,201);
  const anotherBrowser=getCookie(await call('questions'));
  assert.notEqual(getCookie(await call('attempt',submission,anotherBrowser)),attempt);
  raw.close();
});
