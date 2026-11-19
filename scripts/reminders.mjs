import {accessSync,constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {submitMail} from './report-mail.mjs';

export function reminderDelivery(db,{from,config,deliver=submitMail}){
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(from||'') || !config) return null;
  try {accessSync(config,constants.R_OK);} catch {return null;}
  // A process may have stopped after SMTP accepted a message. Never retry that handoff blindly.
  db.prepare("UPDATE reminders SET state='unknown' WHERE state='sending'").run();
  let running=false;
  return async ()=>{
    if(running) return;
    running=true;
    try {
      db.prepare(`UPDATE reminders SET state='skipped' WHERE state='queued' AND NOT EXISTS(
        SELECT 1 FROM unpaid_contacts WHERE address=email AND reminder_at IS NOT NULL)`).run();
      const item=db.prepare(`UPDATE reminders SET state='sending' WHERE email=(
        SELECT r.email FROM reminders r JOIN unpaid_contacts u ON u.address=r.email
        WHERE r.state='queued' AND u.reminder_at IS NOT NULL ORDER BY created,email LIMIT 1)
        RETURNING email,subject,body`).get();
      if(!item) return;
      let state='sent';
      try {await deliver({from,config,to:item.email,subject:item.subject,text:item.body,id:randomUUID()});}
      catch {state='unknown';}
      db.prepare('UPDATE reminders SET state=? WHERE email=?').run(state,item.email);
    } finally {running=false;}
  };
}
