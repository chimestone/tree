(function () {
  'use strict';

  const api = window.GraphApi;
  const NS = 'http://www.w3.org/2000/svg';
  const state = {
    graph: null,
    personById: new Map(),
    mastersByDisciple: new Map(),
    disciplesByMaster: new Map(),
    positions: new Map(),
    nodeElements: new Map(),
    linkElements: [],
    world: { width: 1200, height: 800 },
    transform: { x: 0, y: 0, scale: 1 },
    selectedId: null,
    pointer: null,
    draggingNode: null,
    initialized: false
  };

  const svg = document.getElementById('graph-svg');
  const viewport = document.getElementById('viewport');
  const linksLayer = document.getElementById('links-layer');
  const nodesLayer = document.getElementById('nodes-layer');
  const panel = document.getElementById('info-panel');
  const panelContent = document.getElementById('info-content');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const loading = document.getElementById('loading');
  const status = document.getElementById('graph-status');

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function byId(value) { return state.personById.get(Number(value)); }

  function gradeLabel(person) {
    const grade = state.graph.gradeById?.[person.id] ?? person.grade;
    return Number.isSafeInteger(grade) ? `${grade}级` : '级别未设置';
  }

  function makeIndexes() {
    for (const person of state.graph.persons) {
      state.personById.set(person.id, person);
      state.mastersByDisciple.set(person.id, []);
      state.disciplesByMaster.set(person.id, []);
    }
    for (const relation of state.graph.relationships) {
      state.mastersByDisciple.get(relation.disciple_id).push(relation.master_id);
      state.disciplesByMaster.get(relation.master_id).push(relation.disciple_id);
    }
  }

  function layout() {
    const layers = new Map();
    for (const person of state.graph.persons) {
      const generation = Number(state.graph.generationById[person.id] || 1);
      if (!layers.has(generation)) layers.set(generation, []);
      layers.get(generation).push(person);
    }
    const sortedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0]);
    const horizontalGap = 152;
    const verticalGap = 155;
    const maxLayerSize = Math.max(1, ...sortedLayers.map(([, people]) => people.length));
    const width = Math.max(1100, (maxLayerSize - 1) * horizontalGap + 220);
    const height = Math.max(720, (sortedLayers.length - 1) * verticalGap + 190);
    state.world = { width, height };
    state.positions.clear();
    for (const [index, [, people]] of sortedLayers.entries()) {
      const rowWidth = (people.length - 1) * horizontalGap;
      people.forEach((person, personIndex) => {
        state.positions.set(person.id, {
          x: (width - rowWidth) / 2 + personIndex * horizontalGap,
          y: 80 + index * verticalGap,
          radius: Math.max(14, Math.min(23, 13 + Math.sqrt((state.mastersByDisciple.get(person.id).length + state.disciplesByMaster.get(person.id).length) * 2)))
        });
      });
    }
  }

  function setTransform() {
    const { x, y, scale } = state.transform;
    viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }

  function fitGraph() {
    const rect = svg.getBoundingClientRect();
    const padding = 50;
    const scale = Math.min((rect.width - padding * 2) / state.world.width, (rect.height - padding * 2) / state.world.height);
    state.transform.scale = Math.max(.35, Math.min(1.25, Number.isFinite(scale) ? scale : .7));
    state.transform.x = (rect.width - state.world.width * state.transform.scale) / 2;
    state.transform.y = (rect.height - state.world.height * state.transform.scale) / 2;
    setTransform();
  }

  function pathFor(relation) {
    const source = state.positions.get(relation.master_id);
    const target = state.positions.get(relation.disciple_id);
    if (!source || !target) return '';
    const startY = source.y + source.radius;
    const endY = target.y - target.radius;
    const bend = Math.max(30, (endY - startY) * .42);
    return `M ${source.x} ${startY} C ${source.x} ${startY + bend}, ${target.x} ${endY - bend}, ${target.x} ${endY}`;
  }

  function updateLinkGeometry() {
    for (const item of state.linkElements) item.element.setAttribute('d', pathFor(item.relation));
  }

  function firstLetter(person) {
    return Array.from(person.name.trim())[0] || '?';
  }

  function draw() {
    linksLayer.replaceChildren();
    nodesLayer.replaceChildren();
    state.linkElements = [];
    state.nodeElements.clear();

    for (const relation of state.graph.relationships) {
      const path = svgElement('path', { class: 'link', 'data-relation-id': relation.id, d: pathFor(relation) });
      linksLayer.appendChild(path);
      state.linkElements.push({ relation, element: path });
    }

    for (const person of state.graph.persons) {
      const position = state.positions.get(person.id);
      const group = svgElement('g', { class: 'node', 'data-person-id': person.id, transform: `translate(${position.x} ${position.y})`, role: 'button', tabindex: '0', 'aria-label': `查看 ${person.name} 的关系详情` });
      const hitArea = svgElement('circle', { class: 'node-hit', r: position.radius + 10, fill: 'transparent' });
      const circle = svgElement('circle', { r: position.radius, fill: state.graph.colorById[person.id] || state.graph.rootColor });
      const letter = svgElement('text', { y: 5, 'font-size': Math.min(18, position.radius), 'font-weight': '700' });
      letter.textContent = firstLetter(person);
      const label = svgElement('text', { y: position.radius + 17 });
      label.textContent = person.name;
      const badge = svgElement('text', { class: 'generation-badge', y: position.radius + 31 });
      badge.textContent = gradeLabel(person);
      const title = svgElement('title');
      title.textContent = `${person.name}，${gradeLabel(person)}`;
      group.append(hitArea, circle, letter, label, badge, title);
      group.addEventListener('click', event => {
        event.stopPropagation();
        selectPerson(person.id, true);
      });
      group.addEventListener('pointerdown', event => startNodeDrag(event, person.id));
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectPerson(person.id, true);
        }
      });
      nodesLayer.appendChild(group);
      state.nodeElements.set(person.id, group);
    }
    updateLinkGeometry();
    updateHighlights();
  }

  function collect(startIds, adjacency) {
    const visited = new Set();
    const stack = [...startIds];
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push(...(adjacency.get(id) || []));
    }
    return visited;
  }

  function updateHighlights() {
    const ancestors = state.selectedId === null ? new Set() : collect(state.mastersByDisciple.get(state.selectedId) || [], state.mastersByDisciple);
    const descendants = state.selectedId === null ? new Set() : collect(state.disciplesByMaster.get(state.selectedId) || [], state.disciplesByMaster);
    const related = new Set([state.selectedId, ...ancestors, ...descendants]);
    for (const [id, element] of state.nodeElements) {
      element.classList.toggle('selected', id === state.selectedId);
      element.classList.toggle('ancestor', ancestors.has(id));
      element.classList.toggle('descendant', descendants.has(id));
      element.classList.toggle('dim', state.selectedId !== null && !related.has(id));
    }
    for (const item of state.linkElements) {
      const source = item.relation.master_id;
      const target = item.relation.disciple_id;
      item.element.classList.toggle('highlight', state.selectedId !== null && (source === state.selectedId || target === state.selectedId || (ancestors.has(source) && ancestors.has(target)) || (descendants.has(source) && descendants.has(target))));
      item.element.classList.toggle('dim', state.selectedId !== null && !related.has(source) && !related.has(target));
    }
  }

  function renderPanel(person) {
    const masters = (state.mastersByDisciple.get(person.id) || []).map(byId).filter(Boolean);
    const disciples = (state.disciplesByMaster.get(person.id) || []).map(byId).filter(Boolean);
    const ancestorCount = collect(state.mastersByDisciple.get(person.id) || [], state.mastersByDisciple).size;
    const descendantCount = collect(state.disciplesByMaster.get(person.id) || [], state.disciplesByMaster).size;
    const avatar = person.avatar
      ? `<img src="${api.escapeHtml(person.avatar)}" alt="${api.escapeHtml(person.name)}" referrerpolicy="no-referrer">`
      : api.escapeHtml(firstLetter(person));
    const chips = people => people.length
      ? people.map(item => `<button class="relation-chip" data-jump-id="${item.id}">${api.escapeHtml(item.name)}</button>`).join('')
      : '<span class="muted">暂无</span>';
    panelContent.innerHTML = `
      <div class="person-heading">
        <div class="person-avatar" style="background:${api.escapeHtml(state.graph.colorById[person.id] || state.graph.rootColor)}">${avatar}</div>
        <div><h2>${api.escapeHtml(person.name)}</h2><p>${api.escapeHtml(person.category || '未分类')} · ${gradeLabel(person)}</p></div>
      </div>
      <section class="panel-section"><h3>简介</h3><p class="panel-description">${api.escapeHtml(person.description || '暂无简介')}</p></section>
      <section class="panel-section"><h3>师傅（上游，可多位）</h3><div class="relation-list">${chips(masters)}</div></section>
      <section class="panel-section"><h3>徒弟（下游）</h3><div class="relation-list">${chips(disciples)}</div></section>
      <section class="panel-section"><h3>关系统计</h3><div class="panel-stats">
        <div class="panel-stat"><strong>${masters.length}</strong><span>直接师傅</span></div>
        <div class="panel-stat"><strong>${disciples.length}</strong><span>直接徒弟</span></div>
        <div class="panel-stat"><strong>${ancestorCount}</strong><span>全部祖先</span></div>
        <div class="panel-stat"><strong>${descendantCount}</strong><span>全部后代</span></div>
      </div></section>`;
    panelContent.querySelectorAll('[data-jump-id]').forEach(button => button.addEventListener('click', () => selectPerson(Number(button.dataset.jumpId), true)));
    panel.classList.add('open');
  }

  function selectPerson(id, moveIntoView) {
    const person = byId(id);
    if (!person) return;
    state.selectedId = id;
    renderPanel(person);
    updateHighlights();
    if (moveIntoView) centerOn(id);
  }

  function centerOn(id) {
    const position = state.positions.get(id);
    if (!position) return;
    const rect = svg.getBoundingClientRect();
    state.transform.x = rect.width / 2 - position.x * state.transform.scale;
    state.transform.y = rect.height / 2 - position.y * state.transform.scale;
    setTransform();
  }

  function closePanel() {
    state.selectedId = null;
    panel.classList.remove('open');
    updateHighlights();
  }

  function worldPoint(event) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - state.transform.x) / state.transform.scale,
      y: (event.clientY - rect.top - state.transform.y) / state.transform.scale
    };
  }

  function startNodeDrag(event, id) {
    event.preventDefault();
    event.stopPropagation();
    // Select on pointerdown because pointer capture can retarget the later
    // click event to the SVG root while a node is draggable.
    selectPerson(id, false);
    const point = worldPoint(event);
    state.draggingNode = { id, offsetX: state.positions.get(id).x - point.x, pointerId: event.pointerId };
    svg.setPointerCapture(event.pointerId);
  }

  function pointerDown(event) {
    if (event.target.closest('.node')) return;
    closePanel();
    state.pointer = { x: event.clientX, y: event.clientY, transformX: state.transform.x, transformY: state.transform.y, pointerId: event.pointerId };
    svg.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (state.draggingNode) {
      const point = worldPoint(event);
      const position = state.positions.get(state.draggingNode.id);
      position.x = Math.max(20, Math.min(state.world.width - 20, point.x + state.draggingNode.offsetX));
      state.nodeElements.get(state.draggingNode.id).setAttribute('transform', `translate(${position.x} ${position.y})`);
      updateLinkGeometry();
      return;
    }
    if (state.pointer) {
      state.transform.x = state.pointer.transformX + event.clientX - state.pointer.x;
      state.transform.y = state.pointer.transformY + event.clientY - state.pointer.y;
      setTransform();
    }
  }

  function pointerUp() {
    state.draggingNode = null;
    state.pointer = null;
  }

  function zoom(event) {
    event.preventDefault();
    const before = worldPoint(event);
    const factor = event.deltaY < 0 ? 1.12 : .89;
    state.transform.scale = Math.max(.35, Math.min(3.2, state.transform.scale * factor));
    const rect = svg.getBoundingClientRect();
    state.transform.x = event.clientX - rect.left - before.x * state.transform.scale;
    state.transform.y = event.clientY - rect.top - before.y * state.transform.scale;
    setTransform();
  }

  function renderSearch() {
    const query = searchInput.value.trim().toLocaleLowerCase('zh-CN');
    if (!query) {
      searchResults.classList.remove('visible');
      searchResults.replaceChildren();
      return;
    }
    const results = state.graph.persons.filter(person => person.name.toLocaleLowerCase('zh-CN').includes(query)).slice(0, 12);
    searchResults.innerHTML = results.length
      ? results.map(person => `<button class="search-result" data-search-id="${person.id}"><span>${api.escapeHtml(person.name)}</span><small>${gradeLabel(person)}</small></button>`).join('')
      : '<div class="empty-state">没有找到匹配的人物</div>';
    searchResults.classList.add('visible');
    searchResults.querySelectorAll('[data-search-id]').forEach(button => button.addEventListener('click', () => {
      selectPerson(Number(button.dataset.searchId), true);
      searchResults.classList.remove('visible');
      searchInput.blur();
    }));
  }

  async function load() {
    try {
      state.graph = await api.request('/api/graph');
      makeIndexes();
      layout();
      draw();
      fitGraph();
      status.textContent = `${state.graph.persons.length} 人 · ${state.graph.relationships.length} 条有向关系 · 纵向按最长路径分层`;
    } catch (error) {
      status.textContent = error.message;
      api.showToast(error.message, 'error');
    } finally {
      loading.classList.add('hidden');
    }
  }

  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.getElementById('fit-graph').addEventListener('click', fitGraph);
  document.getElementById('open-login').addEventListener('click', () => { window.location.href = '/admin.html'; });
  svg.addEventListener('pointerdown', pointerDown);
  svg.addEventListener('pointermove', pointerMove);
  svg.addEventListener('pointerup', pointerUp);
  svg.addEventListener('pointercancel', pointerUp);
  svg.addEventListener('wheel', zoom, { passive: false });
  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('keydown', event => { if (event.key === 'Escape') { searchInput.value = ''; renderSearch(); } });
  window.addEventListener('resize', () => { if (state.initialized) fitGraph(); });
  state.initialized = true;
  load();
}());
