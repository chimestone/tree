'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadDatabase, saveDatabase, validateDatabase, normalizeName } = require('../server');
const corrections = require('../data/relationship-corrections.json');

function applyCorrections(database) {
  validateDatabase(database);
  const next = JSON.parse(JSON.stringify(database));
  const lookup = name => next.persons.find(person => person.normalizedName === normalizeName(name));
  // Check all masters before changing anything, so a wrong database fails closed.
  for (const relation of [...corrections.remove, ...corrections.add]) {
    if (!lookup(relation.master)) throw new Error(`找不到师傅：${relation.master}，未保存任何修改。`);
  }
  for (const relation of corrections.remove) {
    const master = lookup(relation.master);
    const disciple = lookup(relation.disciple);
    if (!disciple) continue;
    next.relationships = next.relationships.filter(edge => edge.master_id !== master.id || edge.disciple_id !== disciple.id);
  }
  for (const relation of corrections.add) {
    const master = lookup(relation.master);
    let disciple = lookup(relation.disciple);
    if (!disciple) {
      disciple = { id: next.nextPersonId++, name: relation.disciple, normalizedName: normalizeName(relation.disciple), category: '', avatar: '', description: '' };
      next.persons.push(disciple);
    }
    if (!next.relationships.some(edge => edge.master_id === master.id && edge.disciple_id === disciple.id)) {
      next.relationships.push({ id: next.nextRelationshipId++, master_id: master.id, disciple_id: disciple.id });
    }
  }
  validateDatabase(next);
  return next;
}

if (require.main === module) {
  try {
    const databaseFile = process.env.DB_FILE || path.join(__dirname, '../database.json');
    if (!fs.existsSync(databaseFile)) throw new Error('数据库文件不存在，请先确认 DB_FILE。');
    const { database } = loadDatabase({ databaseFile });
    const next = applyCorrections(database);
    const changed = JSON.stringify(next) !== JSON.stringify(database);
    if (changed) saveDatabase(next, databaseFile);
    console.log(`${changed ? '关系修正已保存' : '关系已经正确，无需再次保存'}：${next.persons.length} 人，${next.relationships.length} 条关系。`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { applyCorrections };
