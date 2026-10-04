(function () {
  'use strict';

  const BASE_URL = new URL('.', window.location.href);
  const TOKEN_KEY = BASE_URL.pathname === '/' ? 'shitu-dag-token' : `shitu-dag-token:${BASE_URL.pathname}`;

  function safeNext(value) {
    const fallback = new URL('admin.html', BASE_URL).pathname;
    if (!value) return fallback;
    try {
      const target = new URL(value, window.location.origin);
      if (target.origin === window.location.origin && target.pathname.startsWith(BASE_URL.pathname) && !target.pathname.endsWith('/login.html')) {
        return `${target.pathname}${target.search}${target.hash}`;
      }
    } catch {
      // Invalid or external return addresses fall back to this app's admin page.
    }
    return fallback;
  }

  function token() {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  }

  function redirectToLogin(passwordChanged = false) {
    window.localStorage.removeItem(TOKEN_KEY);
    const next = `${window.location.pathname}${window.location.search}`;
    if (!window.location.pathname.endsWith('/login.html')) {
      const login = new URL('login.html', BASE_URL);
      login.searchParams.set('next', next);
      if (passwordChanged) login.searchParams.set('passwordChanged', '1');
      window.location.href = login.href;
    }
  }

  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const currentToken = token();
    if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
    const target = new URL(url.replace(/^\/+/, ''), BASE_URL);
    if (target.origin !== BASE_URL.origin) throw new Error('不允许向外站发送管理请求。');
    const response = await fetch(target, { ...options, headers });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      if (response.status === 401 && !options.skipAuthRedirect) redirectToLogin();
      const message = payload?.error?.message || payload?.error || `请求失败（${response.status}）。`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.error?.code;
      error.payload = payload;
      throw error;
    }
    return payload?.data ?? payload;
  }

  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast visible${type ? ` ${type}` : ''}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.className = 'toast'; }, 3200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  window.GraphApi = { TOKEN_KEY, token, request, redirectToLogin, safeNext, showToast, escapeHtml };
}());
