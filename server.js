const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const SECRET = process.env.SECRET || 'your-secret-key-change-this';
const PORT = process.env.PORT || 3000;
const DB_FILE = 'database.json';

app.use(express.json());
app.use(express.static('public'));

// 初始化数据库
let db = { users: [], persons: [], nextId: 1 };
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} else {
  const hash = bcrypt.hashSync('admin123', 10);
  db.users.push({ id: 1, username: 'admin', password: hash });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// 认证中间件
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: '无效token' });
  }
};

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ username }, SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// 修改密码
app.post('/api/change-password', auth, (req, res) => {
  const { username, newPassword } = req.body;
  const user = db.users.find(u => u.username === username);
  if (user) {
    user.password = bcrypt.hashSync(newPassword, 10);
    saveDB();
  }
  res.json({ success: true });
});

// 获取所有人员
app.get('/api/persons', (req, res) => {
  res.json(db.persons);
});

// 添加人员
app.post('/api/persons', auth, (req, res) => {
  const { name, parent_id } = req.body;
  const person = { id: db.nextId++, name, parent_id: parent_id || null };
  db.persons.push(person);
  saveDB();
  res.json(person);
});

// 更新人员
app.put('/api/persons/:id', auth, (req, res) => {
  const { name, parent_id } = req.body;
  const person = db.persons.find(p => p.id == req.params.id);
  if (person) {
    person.name = name;
    person.parent_id = parent_id || null;
    saveDB();
  }
  res.json({ success: true });
});

// 删除人员
app.delete('/api/persons/:id', auth, (req, res) => {
  db.persons = db.persons.filter(p => p.id != req.params.id);
  saveDB();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`默认账号: admin / admin123`);
});
