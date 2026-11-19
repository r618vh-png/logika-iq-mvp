const token = location.hash.slice(1);
const form = document.getElementById('login');
const message = document.getElementById('message');
if (/^[0-9a-f]{64}$/.test(token)) {
  document.getElementById('login-box').hidden = false;
  message.textContent = 'Введите логин и пароль.';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button');
    submit.disabled = true;
    try {
      const credentials = form.elements.username.value + ':' + form.elements.password.value;
      const auth = btoa(Array.from(new TextEncoder().encode(credentials),byte=>String.fromCharCode(byte)).join(''));
      const result = await fetch('/admin/login', {method:'POST',headers:{Authorization:'Basic '+auth,'X-Admin-Link':token}});
      if (result.ok) {
        location.replace('/admin');
        return;
      }
      message.textContent = 'Проверьте логин, пароль и личную ссылку.';
    } catch {
      message.textContent = 'Не удалось подключиться. Попробуйте ещё раз.';
    }
    submit.disabled = false;
  });
}
