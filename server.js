const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const SECRET = process.env.SECRET || 'your-secret-key-change-this';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  树结构存储引擎
// ============================================================
// database.json 格式:
//   { users: [...], trees: [{ id, name, category, avatar, description, children: [...] }], nextId: N }
// ============================================================

let db = { users: [], trees: [], nextId: 1 };

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // 确保默认用户存在且密码可用
    const admin = db.users.find(u => u.username === 'stfzb611');
    if (!admin) {
      db.users.push({ id: 1, username: 'stfzb611', password: bcrypt.hashSync('ywagrycz', 10) });
      saveDB();
    } else if (!bcrypt.compareSync('ywagrycz', admin.password)) {
      admin.password = bcrypt.hashSync('ywagrycz', 10);
      saveDB();
    }
  } else {
    const hash = bcrypt.hashSync('ywagrycz', 10);
    db.users.push({ id: 1, username: 'stfzb611', password: hash });
    saveDB();
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

// ---- 树操作辅助函数 ----

/** 在树数组中递归查找节点（返回引用） */
function findNode(trees, id) {
  for (const node of trees) {
    if (node.id === id) return node;
    if (node.children && node.children.length) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 查找节点的父节点（返回父节点引用），roots 的父节点为 null */
function findParent(trees, id, parent = null) {
  for (const node of trees) {
    if (node.id === id) return parent;
    if (node.children && node.children.length) {
      const found = findParent(node.children, id, node);
      if (found !== undefined) return found;
    }
  }
  return undefined; // 未找到
}

/** 将树结构扁平化为数组（兼容旧 API） */
function flatten(trees, parentId = null) {
  const result = [];
  for (const node of trees) {
    const { children, ...flat } = node;
    flat.parent_id = parentId;
    if (!flat.category) flat.category = '';
    if (!flat.avatar) flat.avatar = '';
    if (!flat.description) flat.description = '';
    result.push(flat);
    if (children && children.length) {
      result.push(...flatten(children, node.id));
    }
  }
  return result;
}

/** 在树中递归删除节点，返回是否删除成功 */
function removeNode(trees, id) {
  for (let i = 0; i < trees.length; i++) {
    if (trees[i].id === id) {
      trees.splice(i, 1);
      return true;
    }
    if (trees[i].children && trees[i].children.length) {
      if (removeNode(trees[i].children, id)) return true;
    }
  }
  return false;
}

/** 移动节点：从旧位置删除，插入到新父节点下 */
function moveNode(trees, nodeId, newParentId) {
  // 先找到并深拷贝节点
  const node = findNode(trees, nodeId);
  if (!node) return false;
  const clone = JSON.parse(JSON.stringify(node));

  // 从旧位置删除
  removeNode(trees, nodeId);

  // 插入到新父节点下
  if (newParentId === null) {
    trees.push(clone);
  } else {
    const parent = findNode(trees, newParentId);
    if (!parent) {
      // 回退：放回根级别
      trees.push(clone);
      return false;
    }
    if (!parent.children) parent.children = [];
    parent.children.push(clone);
  }
  return true;
}

/** 统计节点总数 */
function countNodes(trees) {
  let n = 0;
  for (const node of trees) {
    n += 1 + (node.children ? countNodes(node.children) : 0);
  }
  return n;
}

// ============================================================
//  初始化
// ============================================================
loadDB();

// ============================================================
//  认证中间件
// ============================================================
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

// ============================================================
//  API 路由
// ============================================================

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

// 修改账号（用户名 / 密码）
app.post('/api/account', auth, (req, res) => {
  const { username, newPassword } = req.body;
  // 从 token 中获取当前用户名
  const token = req.headers.authorization.split(' ')[1];
  const decoded = jwt.verify(token, SECRET);
  const currentUsername = decoded.username;

  const user = db.users.find(u => u.username === currentUsername);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  if (username) {
    // 检查新用户名是否已被占用
    const exists = db.users.find(u => u.username === username && u.username !== currentUsername);
    if (exists) return res.status(400).json({ error: '用户名已被占用' });
    user.username = username;
  }
  if (newPassword) {
    user.password = bcrypt.hashSync(newPassword, 10);
  }
  saveDB();
  res.json({ success: true });
});

// 获取所有人员（扁平输出，兼容前端）
app.get('/api/persons', (req, res) => {
  res.json(flatten(db.trees));
});

// 添加人员
app.post('/api/persons', auth, (req, res) => {
  const { name, parent_id, category, avatar, description } = req.body;
  if (!name) return res.status(400).json({ error: '姓名不能为空' });

  const person = {
    id: db.nextId++,
    name,
    category: category || '',
    avatar: avatar || '',
    description: description || '',
    children: []
  };

  if (parent_id == null || parent_id === '') {
    // 添加为根节点（新树）
    db.trees.push(person);
  } else {
    const parent = findNode(db.trees, parseInt(parent_id));
    if (!parent) {
      return res.status(400).json({ error: '指定的师傅不存在' });
    }
    if (!parent.children) parent.children = [];
    parent.children.push(person);
  }

  saveDB();
  res.json(person);
});

// 更新人员
app.put('/api/persons/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, parent_id, category, avatar, description } = req.body;
  const node = findNode(db.trees, id);

  if (!node) return res.status(404).json({ error: '人员不存在' });

  // 更新字段
  if (name !== undefined) node.name = name;
  if (category !== undefined) node.category = category || '';
  if (avatar !== undefined) node.avatar = avatar || '';
  if (description !== undefined) node.description = description || '';

  // 处理师傅变更（移动节点）
  if (parent_id !== undefined) {
    const newParentId = parent_id === '' || parent_id === null ? null : parseInt(parent_id);
    const currentParent = findParent(db.trees, id);
    const currentParentId = currentParent ? currentParent.id : null;

    if (newParentId !== currentParentId) {
      // 防止循环引用：不能移动到自己或自己的后代下
      if (newParentId === id) {
        return res.status(400).json({ error: '不能将自己设为师傅' });
      }
      if (newParentId !== null) {
        const newParent = findNode(db.trees, newParentId);
        if (!newParent) return res.status(400).json({ error: '目标师傅不存在' });
        // 检查新父节点是否是当前节点的后代
        const descendants = flatten([node]);
        if (descendants.some(d => d.id === newParentId)) {
          return res.status(400).json({ error: '不能将节点移动到自己的后代下' });
        }
      }
      moveNode(db.trees, id, newParentId);
    }
  }

  saveDB();
  res.json({ success: true });
});

// 删除人员（级联删除其所有后代）
app.delete('/api/persons/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const node = findNode(db.trees, id);
  if (!node) return res.status(404).json({ error: '人员不存在' });

  const subtreeSize = 1 + countNodes(node.children || []);
  removeNode(db.trees, id);
  saveDB();
  res.json({ success: true, removed: subtreeSize });
});

// ============================================================
//  SPA fallback
// ============================================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
//  启动
// ============================================================
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`存储模式: 树结构 (${db.trees.length} 棵树, ${countNodes(db.trees)} 个节点)`);
  console.log(`默认账号: stfzb611 / ywagrycz`);
});
