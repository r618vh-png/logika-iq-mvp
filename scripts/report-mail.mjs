import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

export function createReportMailer(db,{from,config,deliver=submitMail}) {
  if(!from || !config) return;
  db.exec(`CREATE TABLE IF NOT EXISTS report_mail (
    attempt TEXT PRIMARY KEY, recipient_hash TEXT NOT NULL, token TEXT NOT NULL,
    started INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`);
  return async function sendReport(id,to,result) {
    if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(to)||to.length>254) {
      return {status:400,error:'Проверьте адрес электронной почты.'};
    }
    const now=Date.now();
    const key=createHash('sha256').update(to.toLowerCase()).digest('hex');
    const token=randomUUID();
    // All reservation statements are synchronous on this server's SQLite connection.
    db.exec('BEGIN IMMEDIATE');
    let reason;
    try {
      const existing=db.prepare('SELECT * FROM report_mail WHERE attempt=?').get(id);
      if(existing?.sent && existing.recipient_hash===key) reason={status:200};
      else if(existing?.sent) reason={status:409,error:'Отчёт уже отправлен на выбранный ранее адрес.'};
      else if(existing && now-existing.started<120000) reason={status:429,error:'Письмо обрабатывается. Попробуйте через две минуты.'};
      else {
        const counts=db.prepare('SELECT count(*) AS total, count(CASE WHEN recipient_hash=? THEN 1 END) AS recipient FROM report_mail WHERE started>?').get(key,now-3600000);
        if(counts.total>=50 || counts.recipient>=3) reason={status:429,error:'Лимит писем за час исчерпан. Попробуйте позже.'};
        else db.prepare('INSERT OR REPLACE INTO report_mail(attempt,recipient_hash,token,started) VALUES(?,?,?,?)').run(id,key,token,now);
      }
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
    if(reason) return reason;
    const text=[
      'Ваш результат — '+result.score+' из '+result.total+'.',
      ...Object.entries(result.breakdown).map(([kind,g])=>kind+' — '+g.score+' из '+g.total),
      '', 'Разбор ответов', ...result.review.map((q,i)=>
        [String(i+1)+'. '+q.title,q.pattern,'Ваш ответ: '+q.chosen,'Верный ответ: '+q.expected,q.why,''].join('\n'))
    ].join('\n');
    try {
      await deliver({from,to,text,id,config});
    } catch {
      return {status:503,error:'Почтовый сервис пока не подтвердил отправку. Попробуйте через две минуты.'};
    }
    db.prepare('UPDATE report_mail SET sent=1 WHERE attempt=? AND token=?').run(id,token);
    return {status:200};
  };
}

export function submitMail({from,to,text,id,config,subject='Ваш результат теста «Логика»'}) {
  const header=Buffer.from(subject).toString('base64');
  const encoded=Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n');
  const message=[
    'From: '+from,'To: '+to,'Date: '+new Date().toUTCString(),
    'Message-ID: <'+id+'@'+from.split('@')[1]+'>','Subject: =?UTF-8?B?'+header+'?=',
    'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encoded,''
  ].join('\r\n');
  return new Promise((resolve,reject)=>{
    const child=spawn('curl',['--disable','--config',config,'--proto','=smtp,smtps','--ssl-reqd','--max-time','20','--silent','--mail-from',from,'--mail-rcpt',to,'--upload-file','-'],{stdio:['pipe','ignore','ignore']});
    child.once('error',reject);
    child.once('close',code=>code===0?resolve():reject(new Error('SMTP unavailable')));
    child.stdin.on('error',reject);
    child.stdin.end(message);
  });
}
