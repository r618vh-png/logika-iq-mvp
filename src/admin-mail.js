const tools = document.getElementById('mail-tools');
if (tools) {
  const status = document.getElementById('mail-state');
  const buttons = Array.from(tools.querySelectorAll('button'));
  tools.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button || button.disabled) return;
    const send=button.id==='send-mail';
    const simulate=button.id==='simulate-mail';
    if(send && !window.confirm('Отправить показанное письмо выбранным получателям?')) return;
    buttons.forEach(b=>b.disabled=true);
    try {
      const res=await fetch('/admin/mailing',{method:'POST',headers:{'X-Mail-Source':tools.dataset.source,'X-Mail-Action':simulate?'simulate':send?'send':'draft','X-Mail-Preview':tools.dataset.token}});
      if(!res.ok) throw new Error(res.status===401?'Сессия закончилась. Войдите снова.':await res.text());
      if(simulate){status.textContent=await res.text();button.disabled=false;return;}
      if(send) status.textContent=await res.text();
      else {
        const link=document.createElement('a');
        link.href=URL.createObjectURL(await res.blob());link.download='logika-reminder.eml';
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),30000);
        status.textContent='Черновик подготовлен. Откройте его в почтовой программе для отправки.';
      }
      const refresh=document.createElement('a');refresh.href='?view=mail';refresh.textContent='Обновить аудиторию';
      status.append(' ',refresh);
    } catch (error) {status.textContent=error.message;buttons.forEach(b=>b.disabled=false);}
  });
}
