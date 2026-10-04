'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  createService,
  loadDatabase,
  migrateLegacyDatabase,
  validateDatabase,
  normalizeName,
  calculateGenerations,
  computeColors,
  ROOT_COLOR,
  LEAF_COLOR,
  DataError
} = require('../server');

function person(id, name) {
  return { id, name, normalizedName: normalizeName(name), category: '', avatar: '', description: '' };
}

function database(persons, relationships = []) {
  return {
    schemaVersion: 2,
    users: [{ id: 1, username: 'tester', password: bcrypt.hashSync('tester-password', 4) }],
    persons,
    relationships,
    nextPersonId: Math.max(0, ...persons.map(item => item.id)) + 1,
    nextRelationshipId: Math.max(0, ...relationships.map(item => item.id)) + 1
  };
}

function assertDataError(callback, code) {
  assert.throws(callback, error => error instanceof DataError && error.code === code);
}

async function startHttpService(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shitu-dag-'));
  const databaseFile = path.join(directory, 'database.json');
  const service = createService({
    databaseFile,
    secret: 'integration-test-secret',
    initialAdminUsername: 'tester',
    initialAdminPassword: 'tester-password',
    ...options
  });
  service.initialize();
  const httpServer = await new Promise((resolve, reject) => {
    const server = service.app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
  const address = httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolve => httpServer.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function request(url, requestOptions = {}) {
    const response = await fetch(`${baseUrl}${url}`, {
      ...requestOptions,
      headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) }
    });
    const body = await response.json();
    return { response, body };
  }
  return { service, databaseFile, request };
}

test('姓名标准化使用 NFKC、折叠空白和拉丁字母不区分大小写', () => {
  assert.equal(normalizeName('  Ａlice\t Smith  '), 'alice smith');
  assert.equal(normalizeName('张  三'), '张 三');
  assertDataError(() => normalizeName(' \t '), 'EMPTY_NAME');
});

test('空数据库必须显式提供初始管理员，生产环境必须显式提供 JWT 密钥', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shitu-config-'));
  const databaseFile = path.join(directory, 'database.json');
  try {
    assertDataError(() => loadDatabase({ databaseFile }), 'INITIAL_ADMIN_REQUIRED');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SECRET;
      assert.throws(() => createService({ databaseFile, initialAdminUsername: 'admin', initialAdminPassword: 'password-123' }), error => error instanceof DataError && error.code === 'SECRET_REQUIRED');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSecret === undefined) delete process.env.SECRET;
      else process.env.SECRET = previousSecret;
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('旧树迁移会合并重复人员和重复边', () => {
  const legacy = {
    users: [{ id: 1, username: 'tester', password: bcrypt.hashSync('tester-password', 4) }],
    trees: [
      { id: 1, name: '师傅甲', children: [{ id: 2, name: ' 徒弟 ', children: [] }] },
      { id: 3, name: '师傅乙', children: [{ id: 4, name: '徒弟', children: [] }] },
      { id: 5, name: '师傅甲', children: [{ id: 6, name: '徒弟', children: [] }] }
    ]
  };
  const result = migrateLegacyDatabase(legacy);
  assert.equal(result.database.schemaVersion, 2);
  assert.equal(result.database.persons.length, 3);
  assert.equal(result.database.relationships.length, 2);
  assert.equal(result.database.persons.filter(item => item.normalizedName === '徒弟').length, 1);
  assert.ok(result.warnings.length === 0);
  validateDatabase(result.database);
});

test('当前旧数据迁移结果为 125 人、119 条关系并保留四组多师傅', () => {
  const legacyFile = path.join(__dirname, '..', 'database.v1.backup.json');
  assert.ok(fs.existsSync(legacyFile), '迁移备份应由首次启动创建');
  const result = migrateLegacyDatabase(JSON.parse(fs.readFileSync(legacyFile, 'utf8')));
  assert.equal(result.stats.personCount, 125);
  assert.equal(result.stats.relationshipCount, 119);
  for (const name of ['吴秋圆', '张高雅', '张盼兮', '朱智康']) {
    const target = result.database.persons.find(item => item.name === name);
    assert.ok(target, `${name} 应存在`);
    assert.equal(result.database.relationships.filter(item => item.disciple_id === target.id).length, 2);
  }
});

test('数据库验证拒绝重名、重复关系、自连接和环路', () => {
  const duplicateNames = database([person(1, 'Alice'), person(2, ' alice ')]);
  assertDataError(() => validateDatabase(duplicateNames), 'INVALID_DATABASE');

  const two = [person(1, '甲'), person(2, '乙')];
  const duplicateRelations = database(two, [{ id: 1, master_id: 1, disciple_id: 2 }, { id: 2, master_id: 1, disciple_id: 2 }]);
  assertDataError(() => validateDatabase(duplicateRelations), 'INVALID_DATABASE');

  const selfRelation = database([person(1, '甲')], [{ id: 1, master_id: 1, disciple_id: 1 }]);
  assertDataError(() => validateDatabase(selfRelation), 'INVALID_DATABASE');

  const cycle = database([person(1, '甲'), person(2, '乙'), person(3, '丙')], [
    { id: 1, master_id: 1, disciple_id: 2 },
    { id: 2, master_id: 2, disciple_id: 3 },
    { id: 3, master_id: 3, disciple_id: 1 }
  ]);
  assertDataError(() => validateDatabase(cycle), 'DAG_CYCLE');
});

test('多师傅代数取最长路径，颜色按根叶距离形成明显渐变', () => {
  const persons = [person(1, '根甲'), person(2, '根乙'), person(3, '中间'), person(4, '叶')];
  const relationships = [
    { id: 1, master_id: 1, disciple_id: 3 },
    { id: 2, master_id: 2, disciple_id: 3 },
    { id: 3, master_id: 3, disciple_id: 4 }
  ];
  const data = database(persons, relationships);
  assert.deepEqual(calculateGenerations(data), { 1: 1, 2: 1, 3: 2, 4: 3 });
  const colors = computeColors(data);
  assert.equal(colors[1], ROOT_COLOR);
  assert.equal(colors[2], ROOT_COLOR);
  assert.equal(colors[4], LEAF_COLOR);

  const chain = database([person(1, '根'), person(2, '中间'), person(3, '叶')], [
    { id: 1, master_id: 1, disciple_id: 2 },
    { id: 2, master_id: 2, disciple_id: 3 }
  ]);
  assert.equal(computeColors(chain)[2], '#725CAD');
});

test('HTTP API 支持多师傅、拒绝冲突、独立删除关系和不级联删除人员', async t => {
  const { request } = await startHttpService(t);
  const login = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'tester', password: 'tester-password' }) });
  assert.equal(login.response.status, 200);
  const token = login.body.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };
  const create = async name => request('/api/persons', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name }) });

  const rootA = await create('根甲');
  const rootB = await create('根乙');
  const child = await request('/api/persons', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: '共同徒弟', master_ids: [rootA.body.data.id] }) });
  assert.equal(child.response.status, 201);

  const update = await request(`/api/persons/${child.body.data.id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ master_ids: [rootA.body.data.id, rootB.body.data.id] }) });
  assert.equal(update.response.status, 200);
  const graph = await request('/api/graph');
  assert.equal(graph.body.data.persons.filter(item => item.name === '共同徒弟').length, 1);
  assert.equal(graph.body.data.relationships.filter(item => item.disciple_id === child.body.data.id).length, 2);
  assert.equal(graph.body.data.generationById[child.body.data.id], 2);

  const duplicateName = await create(' 根甲 ');
  assert.equal(duplicateName.response.status, 409);
  assert.equal(duplicateName.body.error.code, 'DUPLICATE_PERSON_NAME');

  const duplicateRelation = await request('/api/relationships', { method: 'POST', headers: authHeaders, body: JSON.stringify({ master_id: rootA.body.data.id, disciple_id: child.body.data.id }) });
  assert.equal(duplicateRelation.response.status, 409);
  const selfRelation = await request('/api/relationships', { method: 'POST', headers: authHeaders, body: JSON.stringify({ master_id: child.body.data.id, disciple_id: child.body.data.id }) });
  assert.equal(selfRelation.response.status, 400);
  const cycle = await request('/api/relationships', { method: 'POST', headers: authHeaders, body: JSON.stringify({ master_id: child.body.data.id, disciple_id: rootA.body.data.id }) });
  assert.equal(cycle.response.status, 409);

  const currentGraph = (await request('/api/graph')).body.data;
  const relationToRemove = currentGraph.relationships.find(item => item.master_id === rootA.body.data.id && item.disciple_id === child.body.data.id);
  const removedRelation = await request(`/api/relationships/${relationToRemove.id}`, { method: 'DELETE', headers: authHeaders });
  assert.equal(removedRelation.response.status, 200);
  const deletedPerson = await request(`/api/persons/${rootA.body.data.id}`, { method: 'DELETE', headers: authHeaders });
  assert.equal(deletedPerson.response.status, 200);
  assert.equal(deletedPerson.body.data.cascadedPersons, 0);
  const afterDelete = (await request('/api/graph')).body.data;
  assert.ok(afterDelete.persons.some(item => item.id === rootB.body.data.id));
  assert.ok(afterDelete.persons.some(item => item.id === child.body.data.id));
  assert.equal(afterDelete.relationships.length, 1);
});

test('头像新增和修改只接受空值或有效 HTTP/HTTPS URL，拒绝时不改变数据', async t => {
  const { request } = await startHttpService(t);
  const login = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'tester', password: 'tester-password' }) });
  const headers = { Authorization: `Bearer ${login.body.data.token}` };
  const invalid = ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'file:///tmp/avatar.png', '/avatar.png', 'not-a-url', 'x" onerror="alert(1)'];
  for (const avatar of invalid) {
    const result = await request('/api/persons', { method: 'POST', headers, body: JSON.stringify({ name: '非法头像测试', avatar }) });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, 'INVALID_AVATAR_URL');
  }
  assert.equal((await request('/api/persons')).body.data.length, 0);

  const created = await request('/api/persons', { method: 'POST', headers, body: JSON.stringify({ name: '头像测试', avatar: ' https://example.invalid/avatar.png ' }) });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.avatar, 'https://example.invalid/avatar.png');
  const id = created.body.data.id;
  for (const avatar of invalid) {
    const rejected = await request(`/api/persons/${id}`, { method: 'PUT', headers, body: JSON.stringify({ name: '不应保存的姓名', avatar }) });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.body.error.code, 'INVALID_AVATAR_URL');
  }
  const unchanged = (await request(`/api/persons/${id}`)).body.data;
  assert.equal(unchanged.name, '头像测试');
  assert.equal(unchanged.avatar, 'https://example.invalid/avatar.png');
  const httpAvatar = await request(`/api/persons/${id}`, { method: 'PUT', headers, body: JSON.stringify({ avatar: 'http://example.invalid/avatar.png' }) });
  assert.equal(httpAvatar.response.status, 200);
  for (const avatar of ['', '   ', null]) {
    const cleared = await request(`/api/persons/${id}`, { method: 'PUT', headers, body: JSON.stringify({ avatar }) });
    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.body.data.avatar, '');
  }
});

test('改密码立即吊销旧令牌，旧数据库兼容，失败/改用户名不吊销，重启不恢复旧令牌', async t => {
  const { service, databaseFile, request } = await startHttpService(t);
  // Model an existing v2 account created before tokenVersion was introduced.
  delete service.getDatabase().users[0].tokenVersion;
  service.getDatabase().users.push({ ...service.getDatabase().users[0], id: 2, username: 'other-admin' });
  validateDatabase(service.getDatabase());
  const otherLogin = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'other-admin', password: 'tester-password' }) });
  const otherHeaders = { Authorization: `Bearer ${otherLogin.body.data.token}` };
  const login = async password => request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'tester', password }) });
  const first = await login('tester-password');
  const oldToken = first.body.data.token;
  const headers = { Authorization: `Bearer ${oldToken}` };
  assert.equal(jwt.decode(oldToken).tokenVersion, 0);
  const secondToken = (await login('tester-password')).body.data.token;

  const legacyToken = jwt.sign({ sub: '1', username: 'tester' }, 'integration-test-secret', { expiresIn: '24h' });
  assert.equal((await request('/api/me', { headers: { Authorization: `Bearer ${legacyToken}` } })).response.status, 401);

  const weak = await request('/api/account', { method: 'POST', headers, body: JSON.stringify({ username: 'must-not-save', newPassword: 'short' }) });
  assert.equal(weak.response.status, 400);
  assert.equal((await request('/api/me', { headers })).body.data.username, 'tester');
  const renamed = await request('/api/account', { method: 'POST', headers, body: JSON.stringify({ username: 'tester-renamed' }) });
  assert.equal(renamed.body.data.requiresReauthentication, false);
  assert.equal((await request('/api/me', { headers })).body.data.username, 'tester-renamed');
  await request('/api/account', { method: 'POST', headers, body: JSON.stringify({ username: 'tester' }) });

  const changed = await request('/api/account', { method: 'POST', headers, body: JSON.stringify({ newPassword: 'updated-password' }) });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.data.requiresReauthentication, true);
  for (const token of [oldToken, secondToken]) {
    const staleHeaders = { Authorization: `Bearer ${token}` };
    assert.equal((await request('/api/me', { headers: staleHeaders })).response.status, 401);
    assert.equal((await request('/api/persons', { method: 'POST', headers: staleHeaders, body: JSON.stringify({ name: '不应写入' }) })).response.status, 401);
    assert.equal((await request('/api/account', { method: 'POST', headers: staleHeaders, body: JSON.stringify({ newPassword: 'attacker-password' }) })).response.status, 401);
  }
  assert.equal((await login('tester-password')).response.status, 401);
  assert.equal((await request('/api/me', { headers: otherHeaders })).response.status, 200);
  const fresh = await login('updated-password');
  assert.equal(fresh.response.status, 200);
  assert.equal(jwt.decode(fresh.body.data.token).tokenVersion, 1);
  assert.equal((await request('/api/me', { headers: { Authorization: `Bearer ${fresh.body.data.token}` } })).response.status, 200);
  assert.equal((await request('/api/persons')).body.data.length, 0);

  const restarted = createService({ databaseFile, secret: 'integration-test-secret' });
  restarted.initialize();
  assert.equal(restarted.getDatabase().users[0].tokenVersion, 1);
  const httpServer = await new Promise(resolve => { const server = restarted.app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => httpServer.close(resolve)));
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  assert.equal((await fetch(`${base}/api/me`, { headers })).status, 401);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${fresh.body.data.token}` } })).status, 200);
});

test('初始管理员只在空库创建，修改账号后重启不会恢复旧账号', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shitu-account-'));
  const databaseFile = path.join(directory, 'database.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = createService({ databaseFile, secret: 'account-secret', initialAdminUsername: 'first-admin', initialAdminPassword: 'first-password' });
  const result = first.initialize();
  assert.equal(result.created, true);
  const serverOne = await new Promise(resolve => { const server = first.app.listen(0, '127.0.0.1', () => resolve(server)); });
  const addressOne = serverOne.address();
  const urlOne = `http://127.0.0.1:${addressOne.port}`;
  const loginOne = await fetch(`${urlOne}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'first-admin', password: 'first-password' }) });
  const token = (await loginOne.json()).data.token;
  await fetch(`${urlOne}/api/account`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ username: 'second-admin', newPassword: 'second-password' }) });
  await new Promise(resolve => serverOne.close(resolve));

  const second = createService({ databaseFile, secret: 'account-secret', initialAdminUsername: 'should-not-replace', initialAdminPassword: 'different-password' });
  const secondResult = second.initialize();
  assert.equal(secondResult.created, false);
  const serverTwo = await new Promise(resolve => { const server = second.app.listen(0, '127.0.0.1', () => resolve(server)); });
  const addressTwo = serverTwo.address();
  const loginNew = await fetch(`http://127.0.0.1:${addressTwo.port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'second-admin', password: 'second-password' }) });
  assert.equal(loginNew.status, 200);
  const loginOld = await fetch(`http://127.0.0.1:${addressTwo.port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'first-admin', password: 'first-password' }) });
  assert.equal(loginOld.status, 401);
  await new Promise(resolve => serverTwo.close(resolve));
});

test('启动迁移只创建一次原始备份，v2 重启不重复迁移', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shitu-migration-'));
  try {
    const databaseFile = path.join(directory, 'database.json');
    const legacy = { users: [{ id: 1, username: 'tester', password: bcrypt.hashSync('tester-password', 4) }], trees: [{ id: 1, name: '甲', children: [{ id: 2, name: '乙', children: [] }] }] };
    fs.writeFileSync(databaseFile, JSON.stringify(legacy));
    const first = createService({ databaseFile, secret: 'migration-secret' }).initialize();
    assert.equal(first.migrated, true);
    const backupFile = path.join(directory, 'database.v1.backup.json');
    const before = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
    const second = createService({ databaseFile, secret: 'migration-secret' }).initialize();
    const after = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
    assert.equal(second.migrated, false);
    assert.equal(before, after);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
