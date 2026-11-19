const adminLifetime = 8 * 60 * 60;
async function adminSignature(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = await crypto.subtle.sign('HMAC',key,encoder.encode(message));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function sameSignature(actual, expected) {
  if(actual.length!==expected.length) return false;
  let difference=0;
  for(let i=0;i<actual.length;i++) difference |= actual.charCodeAt(i)^expected.charCodeAt(i);
  return difference===0;
}

export async function adminUsers(request, env) {
  const headers = {
    'Cache-Control':'private, no-store', 'Vary':'Cookie', 'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow',
    'Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  };
  const response = (body, status, extra={}) => new Response(body,{status,headers:{...headers,...extra}});
  const url=new URL(request.url);
  const secret=env.ADMIN_AUTH_SHA256;
  if(!/^[0-9a-f]{64}$/.test(secret || '')) return response('Кабинет не настроен.',503);
  const now=Math.floor(Date.now()/1000);
  if(url.pathname==='/admin/login') {
    if(request.method!=='POST') return response(null,405,{Allow:'POST'});
    if(request.headers.get('Origin')!==url.origin) return response(null,403);
    const token=request.headers.get('X-Admin-Link') || '';
    if(!sameSignature(token,await adminSignature(secret,'login-link:v1')) ||
       request.headers.get('Authorization')!=='Basic '+btoa('admin:admin')) return response(null,401);
    const expires=now+adminLifetime;
    const signature=await adminSignature(secret,'session:'+expires);
    return response(null,204,{'Set-Cookie':`__Host-lg_admin=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${adminLifetime}`});
  }
  if(request.method!=='GET' && url.pathname!=='/admin/mailing') return response(null,405,{Allow:'GET'});
  const session=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-lg_admin=(\d{10})\.([0-9a-f]{64})(?:;|$)/);
  if(!session || Number(session[1])<=now || Number(session[1])>now+adminLifetime ||
     !sameSignature(session[2],await adminSignature(secret,'session:'+session[1]))) {
    return response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Вход · Логика</title><link rel="stylesheet" href="/style.css"><script src="/admin-login.js" defer></script>
      <main class="shell admin-directory"><h1>Вход в кабинет</h1><p id="message" role="status">Откройте личную ссылку администратора.</p>
      <div id="login-box" hidden><form id="login" class="contacts" method="post"><label>Логин<input name="username" autocomplete="username" required></label>
      <label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn" type="submit">Войти</button></form></div></main></html>`,401,{'Content-Type':'text/html; charset=utf-8'});
  }
  const page = Number(new URL(request.url).searchParams.get('page') || 1);
  if(!Number.isSafeInteger(page) || page<1 || page>1e7) return response('Неверный номер страницы.',400);

  const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'});
  try {
    const mailing=url.pathname==='/admin/mailing';
    const source=mailing?request.headers.get('X-Mail-Source'):(url.pathname==='/admin/live'?'live':'demo');
    if(mailing && env.DEMO_DB && !['demo','live'].includes(source)) return response('Укажите источник аудитории.',400);
    const hasDemo=Boolean(env.DEMO_DB);
    if(mailing && source==='demo' && !hasDemo) return response('Демо недоступно.',404);
    const demo=hasDemo && source==='demo';
    if(demo) env={...env,DB:env.DEMO_DB,MAIL_READY:false,DEMO_MODE:true};
    if(mailing) return await prepareMail(request,env);
    const view=url.searchParams.get('view')||'overview';
    const pageResponse=content=>response(adminPage(view,content,hasDemo,demo),200,{'Content-Type':'text/html; charset=utf-8'});
    if(view==='overview') return pageResponse(await overview(env.DB,demo));
    if(view==='attempts') return pageResponse(await attemptsView(env.DB,url,page));
    if(view==='subscriptions') return pageResponse(await retentionView(env.DB,url,page));
    if(view==='mail') return pageResponse(await mailPanel(env.DB,env,url,page));
    if(view!=='people') return response('Раздел не найден.',404);
    const stats = await env.DB.prepare(`SELECT COUNT(DISTINCT NULLIF(lower(trim(email)),'')) AS users,
      COUNT(*) FILTER (WHERE NULLIF(trim(email),'') IS NULL) AS anonymous FROM attempts`).bind().first();
    const {results} = await env.DB.prepare(`WITH ranked AS (
      SELECT rowid AS attempt_number,email, created_at, result, status, row_number() OVER recent AS position,
        count(*) OVER (PARTITION BY lower(trim(email))) AS attempts
      FROM attempts WHERE NULLIF(trim(email),'') IS NOT NULL
      WINDOW recent AS (PARTITION BY lower(trim(email)) ORDER BY created_at DESC, id DESC)
    ) SELECT email, created_at, status, attempts, (SELECT stage FROM funnel_rows WHERE number=attempt_number) AS stage, json_extract(result,'$.score') AS score,
      json_extract(result,'$.total') AS total FROM ranked WHERE position=1
      ORDER BY created_at DESC, lower(trim(email)) LIMIT 51 OFFSET ?`).bind((page-1)*50).all();
    const rows = results.slice(0,50).map(user=>`<li><div class="user-header"><strong>${escapeHtml(user.email)}</strong>
      <span>${user.status==='paid'?'Демооплата пройдена':'Без демооплаты'}</span></div>
      <p>Последний этап — ${stageNames[user.stage]}.</p><p>Попыток: ${user.attempts} · Балл: ${user.score} из ${user.total}</p>
      <small>Последняя попытка · ${date.format(user.created_at)} МСК</small></li>`).join('');
    return pageResponse(`<h1>Пользователи</h1><section class="sheet"><p>С почтой: <b>${stats.users}</b>. Попыток без почты: <b>${stats.anonymous}</b>.</p>
      <p class="muted">Балл и демооплата показаны для последней попытки каждого пользователя.</p>
      <ul class="people-list">${rows}</ul>${rows?'':'<p>На этой странице пользователей пока нет.</p>'}
      ${pages(page,results.length>50,url)}</section>`);
  } catch {
    return response('Не удалось загрузить список. Попробуйте ещё раз.',503);
  }
}
