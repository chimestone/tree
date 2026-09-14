(function () {
  'use strict';
  const api = window.GraphApi;
  const form = document.getElementById('login-form');
  const message = document.getElementById('login-message');
  const params = new URLSearchParams(window.location.search);
  if (params.get('expired') === '1') {
    message.textContent = '登录状态已过期，请重新登录。';
    message.className = 'notice error';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message.textContent = '';
    message.className = 'status-line';
    try {
      const result = await api.request('/api/login', {
        method: 'POST',
        skipAuthRedirect: true,
        body: JSON.stringify({
          username: form.username.value,
          password: form.password.value
        })
      });
      window.localStorage.setItem(api.TOKEN_KEY, result.token);
      const next = params.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin.html';
      window.location.href = safeNext;
    } catch (error) {
      message.textContent = error.message;
      message.className = 'notice error';
      submit.disabled = false;
    }
  });
}());
