(function () {
  'use strict';

  const api = window.GraphApi;
  const state = { graph: null, me: null, personById: new Map(), masters: new Map(), disciples: new Map() };
  const $ = selector => document.querySelector(selector);

  function setStatus(selector, message, type = '') {
    const element = $(selector);
    element.textContent = message;
    element.className = type ? `notice ${type}` : 'status-line';
  }

  function person(id) { return state.personById.get(Number(id)); }
  function names(ids) { return ids.map(id => person(id)?.name).filter(Boolean); }

  function rebuildIndexes() {
    state.personById = new Map(state.graph.persons.map(item => [item.id, item]));
    state.masters = new Map(state.graph.persons.map(item => [item.id, []]));
    state.disciples = new Map(state.graph.persons.map(item => [item.id, []]));
    for (const relation of state.graph.relationships) {
      state.masters.get(relation.disciple_id).push(relation.master_id);
      state.disciples.get(relation.master_id).push(relation.disciple_id);
    }
  }

  function descendantsOf(id) {
    const visited = new Set();
    const stack = [...(state.disciples.get(id) || [])];
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(state.disciples.get(current) || []));
    }
    return visited;
  }

  function addOptions(select, people, selectedIds = []) {
    select.replaceChildren();
    const selected = new Set(selectedIds.map(Number));
    for (const item of [...people].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
      const option = new Option(`${item.name}${item.category ? ` · ${item.category}` : ''}`, String(item.id));
      option.selected = selected.has(item.id);
      select.appendChild(option);
    }
  }

  function refreshEditorOptions(editingId = null, selectedMasters = []) {
    const excluded = editingId === null ? new Set() : descendantsOf(editingId);
    if (editingId !== null) excluded.add(editingId);
    const available = state.graph.persons.filter(item => !excluded.has(item.id));
    addOptions($('#person-masters'), available, selectedMasters);
  }

  function refreshRelationshipOptions() {
    addOptions($('#relationship-master'), state.graph.persons);
    addOptions($('#relationship-disciple'), state.graph.persons);
  }

  function renderPersonTable() {
    const filter = $('#person-filter').value.trim().toLocaleLowerCase('zh-CN');
    const people = state.graph.persons.filter(item => !filter || `${item.name} ${item.category}`.toLocaleLowerCase('zh-CN').includes(filter));
    $('#person-count').textContent = `${state.graph.persons.length} 人`;
    const tbody = $('#person-table');
    if (!people.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">没有匹配的人员</td></tr>';
      return;
    }
    tbody.innerHTML = people.map(item => {
      const masters = names(state.masters.get(item.id) || []);
      const disciples = names(state.disciples.get(item.id) || []);
      return `<tr>
        <td><div class="person-name">${api.escapeHtml(item.name)}</div><span class="id-badge">#${item.id}</span>${item.category ? `<span class="muted"> · ${api.escapeHtml(item.category)}</span>` : ''}</td>
        <td class="master-summary">${masters.length ? masters.map(api.escapeHtml).join('、') : '<span class="muted">无（根节点）</span>'}</td>
        <td class="master-summary">${disciples.length ? disciples.map(api.escapeHtml).join('、') : '<span class="muted">无（叶节点）</span>'}</td>
        <td><div class="table-actions"><button class="button small" data-edit="${item.id}" type="button">编辑</button><button class="button small danger" data-delete="${item.id}" type="button">删除</button></div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => startEdit(Number(button.dataset.edit))));
    tbody.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deletePerson(Number(button.dataset.delete))));
  }

  function renderRelationships() {
    $('#relationship-count').textContent = `${state.graph.relationships.length} 条`;
    const list = $('#relationship-list');
    if (!state.graph.relationships.length) {
      list.innerHTML = '<div class="empty-state">暂无师徒关系</div>';
      return;
    }
    list.innerHTML = state.graph.relationships.map(relation => `<div class="relationship-row">
      <span>${api.escapeHtml(person(relation.master_id)?.name || `#${relation.master_id}`)}</span><span class="relationship-arrow">→</span><span>${api.escapeHtml(person(relation.disciple_id)?.name || `#${relation.disciple_id}`)}</span>
      <button class="button small danger" data-remove-relation="${relation.id}" type="button">删除关系</button>
    </div>`).join('');
    list.querySelectorAll('[data-remove-relation]').forEach(button => button.addEventListener('click', () => deleteRelationship(Number(button.dataset.removeRelation))));
  }

  function clearEditor() {
    $('#person-form').dataset.mode = 'add';
    $('#person-id').value = '';
    $('#person-name').value = '';
    $('#person-category').value = '';
    $('#person-avatar').value = '';
    $('#person-description').value = '';
    $('#editor-title').textContent = '新增人员';
    $('#save-person').textContent = '添加人员';
    $('#cancel-edit').classList.add('hidden');
    setStatus('#person-status', '');
    refreshEditorOptions();
  }

  function startEdit(id) {
    const item = person(id);
    if (!item) return;
    $('#person-form').dataset.mode = 'edit';
    $('#person-id').value = String(id);
    $('#person-name').value = item.name;
    $('#person-category').value = item.category || '';
    $('#person-avatar').value = item.avatar || '';
    $('#person-description').value = item.description || '';
    $('#editor-title').textContent = `编辑人员：${item.name}`;
    $('#save-person').textContent = '保存人员';
    $('#cancel-edit').classList.remove('hidden');
    setStatus('#person-status', '可同时调整多位师傅（上游）。');
    refreshEditorOptions(id, state.masters.get(id) || []);
    $('#person-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function savePerson(event) {
    event.preventDefault();
    const form = $('#person-form');
    const id = $('#person-id').value;
    const masterIds = [...$('#person-masters').selectedOptions].map(option => Number(option.value));
    const body = {
      name: $('#person-name').value,
      category: $('#person-category').value,
      avatar: $('#person-avatar').value,
      description: $('#person-description').value,
      master_ids: masterIds
    };
    const editing = form.dataset.mode === 'edit' && id;
    const button = $('#save-person');
    button.disabled = true;
    setStatus('#person-status', editing ? '正在保存…' : '正在添加…');
    try {
      await api.request(editing ? `/api/persons/${id}` : '/api/persons', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
      api.showToast(editing ? '人员信息已保存。' : '人员已添加。', 'success');
      await loadGraph();
      clearEditor();
    } catch (error) {
      setStatus('#person-status', error.message, 'error');
      api.showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deletePerson(id) {
    const item = person(id);
    if (!item) return;
    const incoming = (state.masters.get(id) || []).length;
    const outgoing = (state.disciples.get(id) || []).length;
    const confirmed = window.confirm(`确定删除“${item.name}”？\n\n将删除本人、${incoming} 条入边（师傅 → 此人）和 ${outgoing} 条出边（此人 → 徒弟）。其他人员及后代不会被级联删除。`);
    if (!confirmed) return;
    try {
      const result = await api.request(`/api/persons/${id}`, { method: 'DELETE' });
      api.showToast(`已删除 ${item.name}，移除 ${result.removedRelationships.total} 条关系。`, 'success');
      if (Number($('#person-id').value) === id) clearEditor();
      await loadGraph();
    } catch (error) {
      api.showToast(error.message, 'error');
    }
  }

  async function addRelationship(event) {
    event.preventDefault();
    const masterId = Number($('#relationship-master').value);
    const discipleId = Number($('#relationship-disciple').value);
    try {
      await api.request('/api/relationships', { method: 'POST', body: JSON.stringify({ master_id: masterId, disciple_id: discipleId }) });
      setStatus('#relationship-status', '关系已添加。', 'success');
      api.showToast('师徒关系已添加。', 'success');
      await loadGraph();
    } catch (error) {
      setStatus('#relationship-status', error.message, 'error');
      api.showToast(error.message, 'error');
    }
  }

  async function deleteRelationship(id) {
    const relation = state.graph.relationships.find(item => item.id === id);
    if (!relation) return;
    const master = person(relation.master_id)?.name || `#${relation.master_id}`;
    const disciple = person(relation.disciple_id)?.name || `#${relation.disciple_id}`;
    if (!window.confirm(`确定删除关系“${master} → ${disciple}”？\n\n这只会删除关系，不会删除任何人员。`)) return;
    try {
      await api.request(`/api/relationships/${id}`, { method: 'DELETE' });
      api.showToast('师徒关系已删除。', 'success');
      await loadGraph();
    } catch (error) {
      api.showToast(error.message, 'error');
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    const username = $('#account-username').value.trim();
    const newPassword = $('#account-password').value;
    const body = {};
    if (username) body.username = username;
    if (newPassword) body.newPassword = newPassword;
    try {
      const result = await api.request('/api/account', { method: 'POST', body: JSON.stringify(body) });
      $('#account-username').value = '';
      $('#account-password').value = '';
      if (result.requiresReauthentication) {
        api.redirectToLogin(true);
        return;
      }
      setStatus('#account-status', `账号已更新：${result.username}`, 'success');
      api.showToast('账号设置已保存。', 'success');
      $('#admin-subtitle').textContent = `已登录：${result.username}`;
    } catch (error) {
      setStatus('#account-status', error.message, 'error');
      api.showToast(error.message, 'error');
    }
  }

  async function loadGraph() {
    state.graph = await api.request('/api/graph');
    rebuildIndexes();
    renderPersonTable();
    renderRelationships();
    refreshRelationshipOptions();
    const editingId = $('#person-id').value ? Number($('#person-id').value) : null;
    refreshEditorOptions(editingId, editingId ? (state.masters.get(editingId) || []) : []);
  }

  async function init() {
    try {
      state.me = await api.request('/api/me');
      $('#admin-subtitle').textContent = `已登录：${state.me.username}`;
      await loadGraph();
    } catch (error) {
      $('#admin-subtitle').textContent = error.message;
    }
  }

  $('#person-form').addEventListener('submit', savePerson);
  $('#cancel-edit').addEventListener('click', clearEditor);
  $('#relationship-form').addEventListener('submit', addRelationship);
  $('#account-form').addEventListener('submit', saveAccount);
  $('#person-filter').addEventListener('input', renderPersonTable);
  $('#logout').addEventListener('click', () => api.redirectToLogin());
  init();
}());
