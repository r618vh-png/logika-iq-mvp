import './build.mjs';
import {populateDemo} from './demo-data.mjs';
import {reminderDelivery} from './reminders.mjs';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {mkdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
export function database(path=':memory:'){
  const db=new DatabaseSync(path);
  db.exec(readFileSync('drizzle/0000_attempts.sql','utf8'));
  db.exec(readFileSync('drizzle/0001_report_links.sql','utf8'));
  db.exec('BEGIN IMMEDIATE');
  try {
    if(!db.prepare("SELECT 1 FROM pragma_table_info('attempts') WHERE name='email'").get()){
      db.exec(readFileSync('drizzle/0002_checkout_contacts.sql','utf8'));
    }
    if(!db.prepare("SELECT 1 FROM pragma_table_info('attempts') WHERE name='journey'").get()) db.exec(readFileSync('drizzle/0003_funnel.sql','utf8'));
    db.exec(readFileSync('drizzle/0004_retention.sql','utf8'));
    if(!db.prepare("SELECT 1 FROM pragma_table_info('cancel_flows') WHERE name='second_offer_at'").get()) db.exec(readFileSync('drizzle/0005_second_offer.sql','utf8'));
    if(!db.prepare("SELECT 1 FROM pragma_table_info('cancel_flows') WHERE name='exit_step'").get()) db.exec(readFileSync('drizzle/0006_cancel_steps.sql','utf8'));
    if(!db.prepare("SELECT 1 FROM pragma_table_info('cancel_flows') WHERE name='survey_answers'").get()) db.exec(readFileSync('drizzle/0007_exit_survey.sql','utf8'));
    if(!db.prepare("SELECT 1 FROM pragma_table_info('cancel_flows') WHERE name='offer_path'").get()) db.exec(readFileSync('drizzle/0008_renewal_offers.sql','utf8'));
    // Move unfinished questionnaires onto the offer path, preserving recorded choices.
    db.exec(`UPDATE cancel_flows SET offer_path=1, exit_step=min(10,coalesce(json_array_length(survey_answers),0)+1),
      survey_answers=coalesce(survey_answers,'[]') WHERE offer_path=0 AND outcome IS NULL`);
    if(db.prepare("SELECT count(*) AS n FROM pragma_index_info('cancel_flow_retained')").get().n===1) db.exec(readFileSync('drizzle/0009_repeat_flow.sql','utf8'));
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  return {raw:db,DB:{prepare(sql){return {bind(...args){return {first:()=>db.prepare(sql).get(...args),all:()=>({results:db.prepare(sql).all(...args)}),run:()=>db.prepare(sql).run(...args)};}};}}};
}
export const worker=(await import('../dist/server/index.js')).default;
if(process.argv[1]?.endsWith('/local.mjs')){
  mkdirSync('data',{recursive:true});
  const {DB,raw}=database('data/logika.sqlite');
  const demo=database();
  populateDemo(demo.raw);
  const deliver=reminderDelivery(raw,{from:process.env.MAIL_FROM,config:process.env.SMTP_CONFIG});
  if(deliver) setInterval(()=>deliver().catch(()=>console.error('Reminder queue unavailable')),5000).unref();
  const port=Number(process.env.PORT||3000);
  const fallbackOrigin = 'http://127.0.0.1:'+port;
  const origin = new URL(process.env.PUBLIC_ORIGIN || fallbackOrigin).origin;
  const bindHost = process.env.BIND_HOST || '127.0.0.1';
  createServer(async(req,res)=>{
    try{
      const options={method:req.method,headers:req.headers};
      if(req.method==='POST'){options.body=Readable.toWeb(req);options.duplex='half';}
      const out=await worker.fetch(new Request(origin+(req.url?.startsWith('/') ? req.url : '/'),options),{DB, DEMO_DB:demo.DB, MAIL_READY:Boolean(deliver), ADMIN_AUTH_SHA256:process.env.ADMIN_AUTH_SHA256});
      res.writeHead(out.status,Object.fromEntries(out.headers));
      if(out.body) Readable.fromWeb(out.body).pipe(res);else res.end();
    }catch{res.writeHead(500).end();}
  }).listen(port,bindHost,()=>console.log('Listening on '+bindHost+':'+port+' for '+origin));
}
