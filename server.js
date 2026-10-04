'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const DEFAULT_DB_FILE = path.join(APP_DIR, 'database.json');
const SCHEMA_VERSION = 2;
const ROOT_COLOR = '#9F84EF';
const LEAF_COLOR = '#44336B';
const GRADE_ANCHOR_NAME = '韩轩';
const GRADE_ANCHOR_VALUE = 24;
const DEFAULT_FIRST_GRADE = 20;

class DataError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalize the display form while keeping intended letter casing. */
function normalizeDisplayName(value) {
  if (typeof value !== 'string') {
    throw new DataError('INVALID_NAME', '姓名必须是文本。');
  }
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized) {
    throw new DataError('EMPTY_NAME', '姓名不能为空。');
  }
  return normalized;
}

/** Stable key used for global person-name uniqueness. */
function normalizeName(value) {
  return normalizeDisplayName(value).toLocaleLowerCase('en-US');
}

function normalizeOptionalText(value, fieldName) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new DataError('INVALID_FIELD', `${fieldName}必须是文本。`);
  }
  return value.trim();
}

function normalizeAvatar(value) {
  const avatar = normalizeOptionalText(value, 'avatar');
  if (!avatar) return '';
  try {
    const url = new URL(avatar);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    // Invalid URLs use the same readable error as unsupported protocols.
  }
  throw new DataError('INVALID_AVATAR_URL', '头像地址必须是有效的 HTTP 或 HTTPS URL，也可以留空。');
}

function parseId(value, fieldName = 'ID') {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/u.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  throw new DataError('INVALID_ID', `${fieldName}无效。`);
}

function assertNextId(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DataError('INVALID_DATABASE', `${fieldName}必须是正整数。`, 500);
  }
}

function ensureUnique(values, message, code = 'DUPLICATE_VALUE') {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new DataError(code, message, 409);
    seen.add(value);
  }
}

function buildIndexes(database) {
  const byId = new Map(database.persons.map(person => [person.id, person]));
  const mastersByDisciple = new Map(database.persons.map(person => [person.id, []]));
  const disciplesByMaster = new Map(database.persons.map(person => [person.id, []]));
  for (const relation of database.relationships) {
    mastersByDisciple.get(relation.disciple_id).push(relation.master_id);
    disciplesByMaster.get(relation.master_id).push(relation.disciple_id);
  }
  return { byId, mastersByDisciple, disciplesByMaster };
}

function findCycle(database) {
  const { disciplesByMaster } = buildIndexes(database);
  const state = new Map();
  const stack = [];

  function visit(id) {
    const currentState = state.get(id) || 0;
    if (currentState === 1) {
      const start = stack.indexOf(id);
      return stack.slice(start).concat(id);
    }
    if (currentState === 2) return null;
    state.set(id, 1);
    stack.push(id);
    for (const childId of disciplesByMaster.get(id) || []) {
      const cycle = visit(childId);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  }

  for (const person of database.persons) {
    const cycle = visit(person.id);
    if (cycle) return cycle;
  }
  return null;
}

function validateDatabase(database) {
  if (!isRecord(database) || database.schemaVersion !== SCHEMA_VERSION) {
    throw new DataError('INVALID_DATABASE', '数据库不是有效的 v2 DAG 数据。', 500);
  }
  if (!Array.isArray(database.users) || !Array.isArray(database.persons) || !Array.isArray(database.relationships)) {
    throw new DataError('INVALID_DATABASE', '数据库缺少 users、persons 或 relationships 数组。', 500);
  }
  if (database.users.length === 0) {
    throw new DataError('INVALID_DATABASE', '数据库没有管理员账号；不会因为已有数据而自动写入默认账号。', 500);
  }

  const userIds = new Set();
  const usernames = new Set();
  for (const user of database.users) {
    if (!isRecord(user)) throw new DataError('INVALID_DATABASE', '用户记录格式无效。', 500);
    const id = parseId(user.id, '用户 ID');
    if (userIds.has(id)) throw new DataError('INVALID_DATABASE', `用户 ID ${id} 重复。`, 500);
    userIds.add(id);
    if (typeof user.username !== 'string' || !user.username.trim() || typeof user.password !== 'string' || !user.password) {
      throw new DataError('INVALID_DATABASE', `用户 ${id} 的账号记录不完整。`, 500);
    }
    if (user.tokenVersion !== undefined && (!Number.isSafeInteger(user.tokenVersion) || user.tokenVersion < 0)) {
      throw new DataError('INVALID_DATABASE', `用户 ${id} 的 tokenVersion 必须是非负安全整数。`, 500);
    }
    if (usernames.has(user.username)) throw new DataError('INVALID_DATABASE', `用户名 ${user.username} 重复。`, 500);
    usernames.add(user.username);
  }

  const personIds = new Set();
  const normalizedNames = new Map();
  for (const person of database.persons) {
    if (!isRecord(person)) throw new DataError('INVALID_DATABASE', '人员记录格式无效。', 500);
    const id = parseId(person.id, '人员 ID');
    if (personIds.has(id)) throw new DataError('INVALID_DATABASE', `人员 ID ${id} 重复。`, 500);
    personIds.add(id);
    const normalizedName = normalizeName(person.name);
    if (person.normalizedName !== normalizedName) {
      throw new DataError('INVALID_DATABASE', `人员 ${id} 的 normalizedName 与姓名不一致。`, 500);
    }
    if (normalizedNames.has(normalizedName)) {
      throw new DataError('INVALID_DATABASE', `姓名重复：${person.name}。`, 500);
    }
    normalizedNames.set(normalizedName, id);
    for (const field of ['category', 'avatar', 'description']) {
      if (typeof person[field] !== 'string') {
        throw new DataError('INVALID_DATABASE', `人员 ${person.name} 的 ${field} 字段必须是文本。`, 500);
      }
    }
  }

  const relationIds = new Set();
  const relationKeys = new Set();
  for (const relation of database.relationships) {
    if (!isRecord(relation)) throw new DataError('INVALID_DATABASE', '关系记录格式无效。', 500);
    const relationId = parseId(relation.id, '关系 ID');
    if (relationIds.has(relationId)) throw new DataError('INVALID_DATABASE', `关系 ID ${relationId} 重复。`, 500);
    relationIds.add(relationId);
    const masterId = parseId(relation.master_id, '师傅 ID');
    const discipleId = parseId(relation.disciple_id, '徒弟 ID');
    if (!personIds.has(masterId) || !personIds.has(discipleId)) {
      throw new DataError('INVALID_DATABASE', `关系 ${relationId} 引用了不存在的人员。`, 500);
    }
    if (masterId === discipleId) {
      throw new DataError('INVALID_DATABASE', `关系 ${relationId} 不能连接同一个人。`, 500);
    }
    const key = `${masterId}:${discipleId}`;
    if (relationKeys.has(key)) throw new DataError('INVALID_DATABASE', `重复关系：${masterId} → ${discipleId}。`, 500);
    relationKeys.add(key);
  }

  assertNextId(database.nextPersonId, 'nextPersonId');
  assertNextId(database.nextRelationshipId, 'nextRelationshipId');
  for (const id of personIds) {
    if (id >= database.nextPersonId) throw new DataError('INVALID_DATABASE', 'nextPersonId 没有超过现有人员 ID。', 500);
  }
  for (const id of relationIds) {
    if (id >= database.nextRelationshipId) throw new DataError('INVALID_DATABASE', 'nextRelationshipId 没有超过现有关系 ID。', 500);
  }

  const cycle = findCycle(database);
  if (cycle) {
    const names = new Map(database.persons.map(person => [person.id, person.name]));
    throw new DataError('DAG_CYCLE', `关系图存在环路：${cycle.map(id => names.get(id) || id).join(' → ')}。`, 500);
  }
  return true;
}

function calculateGenerations(database) {
  validateDatabase(database);
  const { mastersByDisciple, disciplesByMaster } = buildIndexes(database);
  const indegree = new Map(database.persons.map(person => [person.id, mastersByDisciple.get(person.id).length]));
  const generationById = new Map(database.persons.map(person => [person.id, 1]));
  const queue = database.persons.filter(person => indegree.get(person.id) === 0).map(person => person.id);
  let visited = 0;

  while (queue.length) {
    const masterId = queue.shift();
    visited += 1;
    for (const discipleId of disciplesByMaster.get(masterId) || []) {
      generationById.set(discipleId, Math.max(generationById.get(discipleId), generationById.get(masterId) + 1));
      indegree.set(discipleId, indegree.get(discipleId) - 1);
      if (indegree.get(discipleId) === 0) queue.push(discipleId);
    }
  }
  if (visited !== database.persons.length) {
    throw new DataError('DAG_CYCLE', '关系图存在环路，无法计算代数。', 500);
  }
  return Object.fromEntries(generationById);
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Fixed roots/leaves plus distance-weighted RGB averaging for internal nodes. */
function computeColors(database) {
  validateDatabase(database);
  const { mastersByDisciple, disciplesByMaster } = buildIndexes(database);
  const generationById = calculateGenerations(database);
  const distanceToLeaf = new Map(database.persons.map(person => [person.id, 0]));
  const rootRgb = hexToRgb(ROOT_COLOR);
  const leafRgb = hexToRgb(LEAF_COLOR);

  const reverseGenerationOrder = [...database.persons].sort((left, right) =>
    generationById[right.id] - generationById[left.id] || right.id - left.id
  );
  for (const person of reverseGenerationOrder) {
    const disciples = disciplesByMaster.get(person.id) || [];
    if (disciples.length) {
      distanceToLeaf.set(person.id, 1 + Math.max(...disciples.map(id => distanceToLeaf.get(id))));
    }
  }

  return Object.fromEntries(database.persons.map(person => {
    const masters = mastersByDisciple.get(person.id) || [];
    const disciples = disciplesByMaster.get(person.id) || [];
    if (masters.length === 0) return [person.id, ROOT_COLOR];
    if (disciples.length === 0) return [person.id, LEAF_COLOR];

    const distanceFromRoot = generationById[person.id] - 1;
    const remainingDistance = distanceToLeaf.get(person.id);
    const ratio = distanceFromRoot / (distanceFromRoot + remainingDistance);
    return [person.id, rgbToHex({
      r: rootRgb.r * (1 - ratio) + leafRgb.r * ratio,
      g: rootRgb.g * (1 - ratio) + leafRgb.g * ratio,
      b: rootRgb.b * (1 - ratio) + leafRgb.b * ratio
    })];
  }));
}

function isReachable(database, startId, targetId) {
  const { disciplesByMaster } = buildIndexes(database);
  const visited = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (id === targetId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    stack.push(...(disciplesByMaster.get(id) || []));
  }
  return false;
}

function assertRelationshipDoesNotCreateCycle(database, masterId, discipleId) {
  if (masterId === discipleId) throw new DataError('SELF_RELATIONSHIP', '不能把自己设为自己的师傅。', 400);
  if (isReachable(database, discipleId, masterId)) {
    throw new DataError('DAG_CYCLE', '不能建立环路：徒弟已经可以沿关系到达拟设置的师傅。', 409);
  }
}

function migrateLegacyDatabase(legacy) {
  if (!isRecord(legacy) || !Array.isArray(legacy.trees)) {
    throw new DataError('INVALID_LEGACY_DATABASE', '旧数据库缺少有效的 trees 数组。', 500);
  }
  const users = Array.isArray(legacy.users) ? clone(legacy.users) : [];
  const persons = [];
  const personByName = new Map();
  const legacyIds = new Set();
  const relationshipKeys = new Set();
  const warnings = [];
  let maxLegacyId = 0;
  let generatedId = 1;

  function allocateId(preferred) {
    if (Number.isSafeInteger(preferred) && preferred > 0 && !persons.some(person => person.id === preferred)) {
      maxLegacyId = Math.max(maxLegacyId, preferred);
      return preferred;
    }
    while (persons.some(person => person.id === generatedId)) generatedId += 1;
    const id = generatedId;
    generatedId += 1;
    maxLegacyId = Math.max(maxLegacyId, id);
    return id;
  }

  function visit(nodes, parentPersonId = null, pathLabel = 'root') {
    if (!Array.isArray(nodes)) {
      throw new DataError('INVALID_LEGACY_DATABASE', `旧数据 ${pathLabel} 的 children 不是数组。`, 500);
    }
    for (const node of nodes) {
      if (!isRecord(node)) throw new DataError('INVALID_LEGACY_DATABASE', `旧数据 ${pathLabel} 含有无效节点。`, 500);
      const name = normalizeDisplayName(node.name);
      const normalizedName = name.toLocaleLowerCase('en-US');
      const legacyId = node.id === undefined || node.id === null ? null : parseId(node.id, '旧人员 ID');
      if (legacyId !== null) {
        if (legacyIds.has(legacyId)) throw new DataError('INVALID_LEGACY_DATABASE', `旧人员 ID ${legacyId} 重复，无法安全迁移。`, 500);
        legacyIds.add(legacyId);
        maxLegacyId = Math.max(maxLegacyId, legacyId);
      }

      let person = personByName.get(normalizedName);
      if (!person) {
        person = {
          id: allocateId(legacyId),
          name,
          normalizedName,
          category: normalizeOptionalText(node.category, 'category'),
          avatar: normalizeOptionalText(node.avatar, 'avatar'),
          description: normalizeOptionalText(node.description, 'description')
        };
        persons.push(person);
        personByName.set(normalizedName, person);
      } else {
        for (const field of ['category', 'avatar', 'description']) {
          const incoming = normalizeOptionalText(node[field], field);
          if (incoming && person[field] && incoming !== person[field]) {
            warnings.push(`重复人员“${name}”的 ${field} 存在冲突，保留首次出现的值。`);
          } else if (!person[field] && incoming) {
            person[field] = incoming;
          }
        }
      }
      if (parentPersonId !== null) {
        if (parentPersonId === person.id) {
          throw new DataError('DAG_CYCLE', `迁移会产生自连接：${name}。`, 500);
        }
        const key = `${parentPersonId}:${person.id}`;
        relationshipKeys.add(key);
      }
      visit(node.children === undefined ? [] : node.children, person.id, `${pathLabel}/${name}`);
    }
  }

  visit(legacy.trees);
  const relationships = [...relationshipKeys].map((key, index) => {
    const [master_id, disciple_id] = key.split(':').map(Number);
    return { id: index + 1, master_id, disciple_id };
  });
  const migrated = {
    schemaVersion: SCHEMA_VERSION,
    users,
    persons,
    relationships,
    nextPersonId: Math.max(maxLegacyId + 1, persons.reduce((max, person) => Math.max(max, person.id), 0) + 1, 1),
    nextRelationshipId: relationships.length + 1
  };
  validateDatabase(migrated);
  return {
    database: migrated,
    warnings,
    stats: { legacyNodeCount: legacyIds.size, personCount: persons.length, relationshipCount: relationships.length }
  };
}

function backupName(databaseFile, suffix) {
  const parsed = path.parse(databaseFile);
  return path.join(parsed.dir, `${parsed.name}.${suffix}${parsed.ext || '.json'}`);
}

function ensureLegacyBackup(databaseFile) {
  const backupFile = backupName(databaseFile, 'v1.backup');
  if (!fs.existsSync(backupFile)) fs.copyFileSync(databaseFile, backupFile);
  return backupFile;
}

function writeVerifiedFile(database, databaseFile) {
  validateDatabase(database);
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const temporaryFile = `${databaseFile}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2), { encoding: 'utf8', mode: 0o600 });
    const descriptor = fs.openSync(temporaryFile, 'r');
    try {
      try {
        fs.fsyncSync(descriptor);
      } catch (error) {
        // Some Windows-mounted workspaces do not expose fsync. The temporary
        // file is still parsed and fully validated before replacement below.
        if (!['EPERM', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error;
      }
    } finally {
      fs.closeSync(descriptor);
    }
    const verified = JSON.parse(fs.readFileSync(temporaryFile, 'utf8'));
    validateDatabase(verified);

    if (fs.existsSync(databaseFile)) {
      const recoveryFile = backupName(databaseFile, 'last-good.backup');
      fs.copyFileSync(databaseFile, recoveryFile);
    }
    try {
      fs.renameSync(temporaryFile, databaseFile);
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      // Windows may not replace an existing file with renameSync. The old file
      // has already been backed up and the new file has been validated.
      fs.copyFileSync(temporaryFile, databaseFile);
      fs.unlinkSync(temporaryFile);
    }
    try {
      fs.chmodSync(databaseFile, 0o600);
    } catch {
      // chmod is best effort on Windows and some mounted filesystems.
    }
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}

function createInitialDatabase(options = {}) {
  const username = options.initialAdminUsername ?? process.env.INITIAL_ADMIN_USERNAME;
  const password = options.initialAdminPassword ?? process.env.INITIAL_ADMIN_PASSWORD;
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 8) {
    throw new DataError('INITIAL_ADMIN_REQUIRED', '数据库不存在，请设置 INITIAL_ADMIN_USERNAME 和至少 8 位的 INITIAL_ADMIN_PASSWORD 后再启动。', 500);
  }
  const database = {
    schemaVersion: SCHEMA_VERSION,
    users: [{ id: 1, username: username.trim(), password: bcrypt.hashSync(password, 12), tokenVersion: 0 }],
    persons: [],
    relationships: [],
    nextPersonId: 1,
    nextRelationshipId: 1
  };
  validateDatabase(database);
  return database;
}

function loadDatabase(options = {}) {
  const databaseFile = options.databaseFile || process.env.DB_FILE || DEFAULT_DB_FILE;
  if (!fs.existsSync(databaseFile)) {
    const initial = createInitialDatabase(options);
    writeVerifiedFile(initial, databaseFile);
    return { database: initial, migrated: false, created: true, warnings: [], backupFile: null };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  } catch (error) {
    throw new DataError('DATABASE_READ_ERROR', `无法读取数据库 JSON：${error.message}`, 500);
  }

  if (raw && raw.schemaVersion === SCHEMA_VERSION) {
    validateDatabase(raw);
    return { database: raw, migrated: false, created: false, warnings: [], backupFile: null };
  }
  if (raw && Array.isArray(raw.trees)) {
    const backupFile = ensureLegacyBackup(databaseFile);
    const migration = migrateLegacyDatabase(raw);
    writeVerifiedFile(migration.database, databaseFile);
    return { ...migration, migrated: true, created: false, backupFile };
  }
  throw new DataError('INVALID_DATABASE', '数据库既不是 v2 DAG，也不是可识别的旧版 trees 数据。', 500);
}

function resolveSecret(options = {}) {
  if (options.secret) return options.secret;
  if (process.env.SECRET) return process.env.SECRET;
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new DataError('SECRET_REQUIRED', '生产环境必须通过 SECRET 环境变量提供 JWT 密钥。', 500);
  }
  console.warn('警告：开发环境未设置 SECRET，当前进程使用随机 JWT 密钥；重启后已有 token 会失效。');
  return crypto.randomBytes(32).toString('hex');
}

function sendOk(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function sendError(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = status >= 500 && !error.code ? '服务器内部错误。' : error.message;
  return res.status(status).json({ ok: false, error: { code, message, ...(error.details === undefined ? {} : { details: error.details }) } });
}

function getMasterIdsFromBody(body, fieldName = 'master_ids') {
  if (Object.prototype.hasOwnProperty.call(body, fieldName)) {
    if (!Array.isArray(body[fieldName])) throw new DataError('INVALID_MASTER_IDS', '师傅（上游）必须以数组提交。');
    const ids = body[fieldName].map(value => parseId(value, '师傅 ID'));
    ensureUnique(ids, '不能重复选择同一位师傅。', 'DUPLICATE_MASTER');
    return ids;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'parent_id')) {
    if (body.parent_id === null || body.parent_id === '') return [];
    return [parseId(body.parent_id, '师傅 ID')];
  }
  return null;
}

function calculateGrades(database, generations = calculateGenerations(database)) {
  const anchor = database.persons.find(person => person.name === GRADE_ANCHOR_NAME);
  const offset = anchor ? GRADE_ANCHOR_VALUE - generations[anchor.id] : DEFAULT_FIRST_GRADE - 1;
  return Object.fromEntries(database.persons.map(person => [person.id, generations[person.id] + offset]));
}

function personsWithGrades(database) {
  const grades = calculateGrades(database);
  return database.persons.map(person => ({ ...clone(person), grade: grades[person.id] }));
}

function graphPayload(database) {
  const generations = calculateGenerations(database);
  const grades = calculateGrades(database, generations);
  const colors = computeColors(database);
  return {
    persons: database.persons.map(person => ({ ...clone(person), grade: grades[person.id] })),
    relationships: clone(database.relationships),
    generationById: generations,
    gradeById: grades,
    colorById: colors,
    rootColor: ROOT_COLOR,
    leafColor: LEAF_COLOR
  };
}

function personDetail(database, id) {
  const person = database.persons.find(item => item.id === id);
  if (!person) throw new DataError('PERSON_NOT_FOUND', '人员不存在。', 404);
  const { mastersByDisciple, disciplesByMaster } = buildIndexes(database);
  const generationById = calculateGenerations(database);
  const colors = computeColors(database);

  function collect(startIds, adjacency) {
    const visited = new Set();
    const stack = [...startIds];
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(adjacency.get(current) || []));
    }
    return visited;
  }
  const ancestors = collect(mastersByDisciple.get(id), mastersByDisciple);
  const descendants = collect(disciplesByMaster.get(id), disciplesByMaster);
  return {
    ...clone(person),
    master_ids: [...mastersByDisciple.get(id)],
    disciple_ids: [...disciplesByMaster.get(id)],
    ancestor_ids: [...ancestors],
    descendant_ids: [...descendants],
    generation: generationById[id],
    grade: calculateGrades(database, generationById)[id],
    color: colors[id]
  };
}

function createService(options = {}) {
  const databaseFile = options.databaseFile || process.env.DB_FILE || DEFAULT_DB_FILE;
  const secret = resolveSecret(options);
  const state = { database: null, loadResult: null };
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  function currentDatabase() {
    if (!state.database) throw new DataError('DATABASE_NOT_READY', '数据库尚未初始化。', 503);
    return state.database;
  }

  function commit(nextDatabase) {
    validateDatabase(nextDatabase);
    writeVerifiedFile(nextDatabase, databaseFile);
    state.database = nextDatabase;
  }

  function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(/\s+/u);
    if (scheme !== 'Bearer' || !token) {
      return sendError(res, new DataError('AUTH_REQUIRED', '请先登录管理账号。', 401));
    }
    try {
      const payload = jwt.verify(token, secret);
      const userId = parseId(payload.sub, '用户 ID');
      const user = currentDatabase().users.find(item => item.id === userId);
      if (!user) throw new DataError('AUTH_INVALID', '登录状态已失效，请重新登录。', 401);
      // Missing versions are legacy JWTs; require a fresh login after upgrade.
      if (!Number.isSafeInteger(payload.tokenVersion) || payload.tokenVersion !== (user.tokenVersion ?? 0)) {
        throw new DataError('AUTH_INVALID', '登录状态已失效，请重新登录。', 401);
      }
      req.authUser = user;
      return next();
    } catch (error) {
      if (error instanceof DataError) return sendError(res, error);
      return sendError(res, new DataError('AUTH_INVALID', '登录状态已失效，请重新登录。', 401));
    }
  }

  function route(handler) {
    return (req, res) => {
      try {
        return handler(req, res);
      } catch (error) {
        return sendError(res, error);
      }
    };
  }

  app.post('/api/login', route((req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = currentDatabase().users.find(item => item.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      throw new DataError('LOGIN_FAILED', '用户名或密码错误。', 401);
    }
    const token = jwt.sign({ sub: String(user.id), username: user.username, tokenVersion: user.tokenVersion ?? 0 }, secret, { expiresIn: '24h' });
    return sendOk(res, { token, username: user.username, expiresIn: 24 * 60 * 60 });
  }));

  app.get('/api/me', auth, route((req, res) => sendOk(res, { id: req.authUser.id, username: req.authUser.username })));

  app.post('/api/account', auth, route((req, res) => {
    const body = req.body || {};
    const next = clone(currentDatabase());
    const user = next.users.find(item => item.id === req.authUser.id);
    if (!user) throw new DataError('USER_NOT_FOUND', '用户不存在。', 404);
    if (body.username !== undefined) {
      if (typeof body.username !== 'string' || !body.username.trim()) throw new DataError('INVALID_USERNAME', '用户名不能为空。');
      const username = body.username.trim();
      if (next.users.some(item => item.id !== user.id && item.username === username)) {
        throw new DataError('DUPLICATE_USERNAME', '用户名已被占用。', 409);
      }
      user.username = username;
    }
    if (body.newPassword !== undefined) {
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 8) throw new DataError('WEAK_PASSWORD', '新密码至少需要 8 位。');
      const tokenVersion = (user.tokenVersion ?? 0) + 1;
      if (!Number.isSafeInteger(tokenVersion)) throw new DataError('TOKEN_VERSION_LIMIT', '登录版本已达上限，请联系维护人员。', 500);
      user.password = bcrypt.hashSync(body.newPassword, 12);
      user.tokenVersion = tokenVersion;
    }
    if (body.username === undefined && body.newPassword === undefined) throw new DataError('EMPTY_UPDATE', '请至少填写用户名或新密码。');
    commit(next);
    return sendOk(res, { username: user.username, requiresReauthentication: body.newPassword !== undefined });
  }));

  app.get('/api/graph', route((req, res) => sendOk(res, graphPayload(currentDatabase()))));
  app.get('/api/persons', route((req, res) => sendOk(res, personsWithGrades(currentDatabase()))));
  app.get('/api/persons/:id', route((req, res) => sendOk(res, personDetail(currentDatabase(), parseId(req.params.id, '人员 ID')))));
  app.get('/api/relationships', route((req, res) => sendOk(res, clone(currentDatabase().relationships))));

  app.post('/api/persons', auth, route((req, res) => {
    const body = req.body || {};
    const name = normalizeDisplayName(body.name);
    const normalizedName = normalizeName(name);
    const next = clone(currentDatabase());
    if (next.persons.some(person => person.normalizedName === normalizedName)) {
      throw new DataError('DUPLICATE_PERSON_NAME', `姓名“${name}”已存在，不能重复创建。`, 409);
    }
    const masterIds = getMasterIdsFromBody(body) || [];
    const id = next.nextPersonId;
    const person = {
      id,
      name,
      normalizedName,
      category: normalizeOptionalText(body.category, 'category'),
      avatar: normalizeAvatar(body.avatar),
      description: normalizeOptionalText(body.description, 'description')
    };
    for (const masterId of masterIds) {
      if (!next.persons.some(item => item.id === masterId)) throw new DataError('MASTER_NOT_FOUND', '指定的师傅不存在。', 404);
      if (masterId === id) throw new DataError('SELF_RELATIONSHIP', '不能把自己设为自己的师傅。');
    }
    next.persons.push(person);
    next.nextPersonId += 1;
    for (const masterId of masterIds) {
      next.relationships.push({ id: next.nextRelationshipId, master_id: masterId, disciple_id: id });
      next.nextRelationshipId += 1;
    }
    commit(next);
    return sendOk(res, { ...person, grade: calculateGrades(next)[id] }, 201);
  }));

  app.put('/api/persons/:id', auth, route((req, res) => {
    const id = parseId(req.params.id, '人员 ID');
    const body = req.body || {};
    const next = clone(currentDatabase());
    const person = next.persons.find(item => item.id === id);
    if (!person) throw new DataError('PERSON_NOT_FOUND', '人员不存在。', 404);

    if (body.name !== undefined) {
      const name = normalizeDisplayName(body.name);
      const normalizedName = normalizeName(name);
      if (next.persons.some(item => item.id !== id && item.normalizedName === normalizedName)) {
        throw new DataError('DUPLICATE_PERSON_NAME', `姓名“${name}”已存在，不能修改为重名。`, 409);
      }
      person.name = name;
      person.normalizedName = normalizedName;
    }
    for (const field of ['category', 'description']) {
      if (body[field] !== undefined) person[field] = normalizeOptionalText(body[field], field);
    }
    if (body.avatar !== undefined) person.avatar = normalizeAvatar(body.avatar);

    const masterIds = getMasterIdsFromBody(body);
    if (masterIds !== null) {
      const desired = new Set(masterIds);
      if (desired.size !== masterIds.length) throw new DataError('DUPLICATE_MASTER', '不能重复选择同一位师傅。', 409);
      const withoutIncoming = { ...next, relationships: next.relationships.filter(relation => relation.disciple_id !== id) };
      for (const masterId of masterIds) {
        if (!next.persons.some(item => item.id === masterId)) throw new DataError('MASTER_NOT_FOUND', '指定的师傅不存在。', 404);
        assertRelationshipDoesNotCreateCycle(withoutIncoming, masterId, id);
      }
      const existingIncoming = new Map(next.relationships.filter(relation => relation.disciple_id === id).map(relation => [relation.master_id, relation]));
      next.relationships = next.relationships.filter(relation => relation.disciple_id !== id);
      for (const masterId of masterIds) {
        const existing = existingIncoming.get(masterId);
        if (existing) next.relationships.push(existing);
        else {
          next.relationships.push({ id: next.nextRelationshipId, master_id: masterId, disciple_id: id });
          next.nextRelationshipId += 1;
        }
      }
    }
    commit(next);
    return sendOk(res, personDetail(next, id));
  }));

  app.delete('/api/persons/:id', auth, route((req, res) => {
    const id = parseId(req.params.id, '人员 ID');
    const next = clone(currentDatabase());
    const person = next.persons.find(item => item.id === id);
    if (!person) throw new DataError('PERSON_NOT_FOUND', '人员不存在。', 404);
    const incoming = next.relationships.filter(relation => relation.disciple_id === id).length;
    const outgoing = next.relationships.filter(relation => relation.master_id === id).length;
    next.persons = next.persons.filter(item => item.id !== id);
    next.relationships = next.relationships.filter(relation => relation.master_id !== id && relation.disciple_id !== id);
    commit(next);
    return sendOk(res, {
      removedPerson: clone(person),
      removedRelationships: { incoming, outgoing, total: incoming + outgoing },
      cascadedPersons: 0
    });
  }));

  app.post('/api/relationships', auth, route((req, res) => {
    const masterId = parseId(req.body?.master_id, '师傅 ID');
    const discipleId = parseId(req.body?.disciple_id, '徒弟 ID');
    const next = clone(currentDatabase());
    if (!next.persons.some(person => person.id === masterId)) throw new DataError('MASTER_NOT_FOUND', '师傅不存在。', 404);
    if (!next.persons.some(person => person.id === discipleId)) throw new DataError('DISCIPLE_NOT_FOUND', '徒弟不存在。', 404);
    if (next.relationships.some(relation => relation.master_id === masterId && relation.disciple_id === discipleId)) {
      throw new DataError('DUPLICATE_RELATIONSHIP', '这条师徒关系已经存在。', 409);
    }
    assertRelationshipDoesNotCreateCycle(next, masterId, discipleId);
    const relationship = { id: next.nextRelationshipId, master_id: masterId, disciple_id: discipleId };
    next.relationships.push(relationship);
    next.nextRelationshipId += 1;
    commit(next);
    return sendOk(res, relationship, 201);
  }));

  app.delete('/api/relationships/:id', auth, route((req, res) => {
    const id = parseId(req.params.id, '关系 ID');
    const next = clone(currentDatabase());
    const index = next.relationships.findIndex(relation => relation.id === id);
    if (index === -1) throw new DataError('RELATIONSHIP_NOT_FOUND', '师徒关系不存在。', 404);
    const [removed] = next.relationships.splice(index, 1);
    commit(next);
    return sendOk(res, removed);
  }));

  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return sendError(res, new DataError('NOT_FOUND', '接口不存在。', 404));
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed') return sendError(res, new DataError('INVALID_JSON', '请求内容不是有效 JSON。'));
    console.error('请求处理失败：', error);
    return sendError(res, new DataError('INTERNAL_ERROR', '服务器内部错误。', 500));
  });

  function initialize() {
    const result = loadDatabase({ ...options, databaseFile });
    state.database = result.database;
    state.loadResult = result;
    if (result.migrated) {
      console.log(`已将旧版树数据迁移为 DAG：${result.stats.personCount} 人、${result.stats.relationshipCount} 条关系。`);
      console.log(`旧数据备份：${result.backupFile}`);
      for (const warning of result.warnings) console.warn(`迁移提示：${warning}`);
    } else if (result.created) {
      console.log(`已创建初始管理员（账号：${result.database.users[0].username}）。`);
    }
    return result;
  }

  return {
    app,
    databaseFile,
    secret,
    initialize,
    getDatabase: () => state.database,
    getLoadResult: () => state.loadResult
  };
}

const defaultService = createService();
const app = defaultService.app;

function startServer() {
  const port = Number(process.env.PORT || 3000);
  const result = defaultService.initialize();
  const server = app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    console.log(`存储模式：DAG（${result.database.persons.length} 人、${result.database.relationships.length} 条关系）`);
  });
  return server;
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  app,
  createService,
  startServer,
  loadDatabase,
  saveDatabase: writeVerifiedFile,
  migrateLegacyDatabase,
  validateDatabase,
  normalizeName,
  normalizeDisplayName,
  calculateGenerations,
  calculateGrades,
  computeColors,
  findCycle,
  isReachable,
  ROOT_COLOR,
  LEAF_COLOR,
  DataError
};
