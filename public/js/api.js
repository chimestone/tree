(function () {
  'use strict';

  const TOKEN_KEY = 'shitu-dag-token';

  function token() {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  }

  function redirectToLogin(passwordChanged = false) {
    window.localStorage.removeItem(TOKEN_KEY);
    const next = `${window.location.pathname}${window.location.search}`;
    if (!window.location.pathname.endsWith('/login.html')) {
      window.location.href = `/login.html?next=${encodeURIComponent(next)}${passwordChanged ? '&passwordChanged=1' : ''}`;
    }
  }

  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const currentToken = token();
    if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
    const response = await fetch(url, { ...options, headers });
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

  window.GraphApi = { TOKEN_KEY, token, request, redirectToLogin, showToast, escapeHtml };
}());
