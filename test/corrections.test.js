'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName } = require('../server');
const { applyCorrections } = require('../scripts/apply-relationship-corrections.cjs');

test('关系修正新增四人，保留朱智康的其他师傅和账号，重复执行不重复写入', () => {
  const names = ['陈晶', '阿立福·艾孜买提江', '韩轩', '池思荣', '朱智康'];
  const original = {
    schemaVersion: 2,
    users: [{ id: 1, username: 'test-admin', password: 'test-hash', tokenVersion: 3 }],
    persons: names.map((name, i) => ({ id: i + 1, name, normalizedName: normalizeName(name), avatar: '', description: '', category: '' })),
    relationships: [{ id: 1, master_id: 1, disciple_id: 5 }, { id: 2, master_id: 4, disciple_id: 5 }],
    nextPersonId: 6, nextRelationshipId: 3
  };
  const before = JSON.stringify(original);
  const fixed = applyCorrections(original);
  const edges = fixed.relationships.map(edge => [fixed.persons.find(p => p.id === edge.master_id).name, fixed.persons.find(p => p.id === edge.disciple_id).name]);
  assert.deepEqual(edges, [['池思荣', '朱智康'], ['陈晶', '周子涵'], ['阿立福·艾孜买提江', '何咏芝'], ['阿立福·艾孜买提江', '戴煦璋'], ['韩轩', '李浚赫']]);
  assert.equal(fixed.persons.length, 9);
  assert.deepEqual(fixed.users, original.users);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(applyCorrections(fixed), fixed);
  const wrong = { ...original, persons: original.persons.filter(person => person.name !== '韩轩') };
  assert.throws(() => applyCorrections(wrong), /找不到师傅/);
});
