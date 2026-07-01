// 解析 Mermaid flowchart 数据，转为嵌套树结构 JSON
const fs = require('fs');

const MERMAID = `
Total[师徒关系树] --> A1[李诗俊]
    Total --> A2[李遵森]
    Total --> A3[郭佳乐]
    Total --> A4[姜锐]
    Total --> A5[鲁永清]
    Total --> A6[马安娜]
    Total --> A7[张珈奕]
    Total --> A8[陈玺吉]
    Total --> A9[陈剑东]
    Total --> A10[吕晓硕]

    %% ========== 第二层关系 ==========
    A1 --> B1-1[褚明侦]
    A1 --> B1-2[刘鹤祥]

    A2 --> B2-1[项千惠]
    A2 --> B2-2[吴秋圆]

    A3 --> B3-1[孟想文昕]
    A3 --> B3-2[汪洁清]
    A3 --> B3-3[覃海鸥]

    A4 --> B4-1[宋易达]

    A5 --> B5-1[吴秋圆]
    A5 --> B5-2[李彦明]
    A5 --> B5-3[游子震]

    A6 --> B6-1[林彤]
    A6 --> B6-2[欧阳瑞思]

    A7 --> B7-1[孟繁升]

    A8 --> B8-1[王天伊]

    A9 --> B9-1[任潇]
    A9 --> B9-2[李翔宇]
    A9 --> B9-3[王天宇]

    A10 --> B10-1[张家铭]
    A10 --> B10-2[杨紫萱]

    %% ========== 第三层关系 ==========
    B1-1 --> C1-1-1[岳广睿]
    B1-1 --> C1-1-2[谢雨函]

    B1-2 --> C1-2-1[和怡宁]
    B1-2 --> C1-2-2[杨子琪]
    B1-2 --> C1-2-3[陈采汐]

    B3-1 --> C3-1-1[林千晴]
    B3-1 --> C3-1-2[尹柳樾]
    B3-1 --> C3-1-3[程正良]

    B3-2 --> C3-2-1[陈嘉仪]
    B3-2 --> C3-2-2[苏颖怡]

    B4-1 --> C4-1-1[刘泽]

    B5-1 --> C5-1-1[张高雅]
    B5-1 --> C5-1-2[杨新睿]
    B5-1 --> C5-1-3[缪颖]
    B5-1 --> C5-1-4[彭楚云]

    B5-2 --> C5-2-1[李博]
    B5-2 --> C5-2-2[李旭丞]

    A5 --> C5-3-1[孔亮]

    B6-1 --> C6-1-1[郑福华]
    B6-1 --> C6-1-2[康嫚芯]

    B7-1 --> C7-1-1[饶培颖]
    B7-1 --> C7-1-2[黄子蔚]
    B7-1 --> C7-1-3[方菲]

    B8-1 --> C8-1-1[张高雅]

    B9-2 --> C9-2-1[黄一鸣]
    B9-2 --> C9-2-2[刘雨婷]
    B9-2 --> C9-2-3[孔瑞洁]

    B10-1 --> C10-1-1[刘希睿]
    B10-1 --> C10-1-2[韩锦辉]
    B10-1 --> C10-1-3[周睿]

    %% ========== 第四层关系 ==========
    C1-2-2 --> D1-2-2-1[朱彦婕]

    C1-2-3 --> D1-2-3-1[谢文昊]
    C1-2-3 --> D1-2-3-2[曹钰湫]
    C1-2-3 --> D1-2-3-3[黄廷玉]

    C3-1-1 --> D3-1-1-1[赵锦婷]

    C5-1-1 --> D5-1-1-1[王淑芬]
    C5-1-1 --> D5-1-1-2[张昊昀]
    C5-1-1 --> D5-1-1-3[杜璟慧]

    C5-1-2 --> D5-1-2-1[潘柔]

    C5-1-4 --> D5-1-4[冯韵之]
    C5-1-4 --> D5-1-4-2[曾逸舟]
    C5-1-4 --> D5-1-4-3[颜苗苗]

    C5-3-1 --> D5-3-1-1[喻继超]
    C5-3-1 --> D5-3-1-2[徐柳]
    C5-3-1 --> D5-3-1-3[马君业]

    C7-1-2 --> D7-1-2-1[刘慧君]
    C7-1-2 --> D7-1-2-2[容子谦]
    C7-1-2 --> D7-1-2-3[郭书岐]

    C9-2-1 --> D9-2-1-1[冯燕来]
    C9-2-1 --> D9-2-1-2[李俊怡]

    C9-2-2 --> D9-2-2-1[彭子娴]

    C10-1-1 --> D10-1-1-1[陈烨健]
    C10-1-1 --> D10-1-1-2[王焯]
    C10-1-1 --> D10-1-1-3[马群杰]

    C10-1-3 --> D10-1-3-1[朱芮瑄]
    C10-1-3 --> D10-1-3-2[周祎]
    C10-1-3 --> D10-1-3-3[海洋]

    %% ========== 第五层关系 ==========
    D1-2-3-1 --> E1-2-3-1-1[许子欣]
    D1-2-3-1 --> E1-2-3-1-2[张盼兮]

    D1-2-3-3 --> E1-2-3-3-1[赵冬雪]
    D1-2-3-3 --> E1-2-3-3-2[黎源木梓]
    D1-2-3-3 --> E1-2-3-3-3[罗宇晟]

    D5-1-2-1 --> E5-1-2-1-1[李柔萱]
    D5-1-2-1 --> E5-1-2-1-2[明丹]
    D5-1-2-1 --> E5-1-2-1-3[姚晨飞]

    D5-3-1-1 --> E5-3-1-1-1[池思荣]

    D5-3-1-3 --> E5-3-1-3-1[阿立福·艾孜买提江]

    D7-1-2-1 --> E7-1-2-1-1[李锦鹏]
    D7-1-2-1 --> E7-1-2-1-2[韩轩]
    D7-1-2-1 --> E7-1-2-1-3[游惠郡]

    D9-2-1-1 --> E9-2-1-1-1[陈晶]
    D9-2-1-1 --> E9-2-1-1-2[张劲雷]
    D9-2-1-1 --> E9-2-1-1-3[刘骐铭]

    D10-1-3-1 --> E10-1-3-1-1[孙鹤溪]
    D10-1-3-1 --> E10-1-3-1-2[朱玥乔]
    D10-1-3-1 --> E10-1-3-1-3[覃佳乐]

    D10-1-3-2 --> E10-1-3-2-1[苏婧]
    D10-1-3-2 --> E10-1-3-2-2[葛禹彤]
    D10-1-3-2 --> E10-1-3-2-3[田鸿雅]

    D10-1-3-3 --> E10-1-3-3-1[张盼兮]
    D10-1-3-3 --> E10-1-3-3-2[朱垚]

    %% ========== 第六层关系 ==========
    E1-2-3-1-1 --> F1-2-3-1-1-1[黄方合奕]
    E1-2-3-1-1 --> F1-2-3-1-1-2[马金丽]
    E1-2-3-1-1 --> F1-2-3-1-1-3[王雅婷]

    E1-2-3-1-2 --> F1-2-3-1-2-1[李杭轩]
    E1-2-3-1-2 --> F1-2-3-1-2-2[涂语桐]
    E1-2-3-1-2 --> F1-2-3-1-2-3[徐笑依]

    E1-2-3-3-2 --> F1-2-3-3-2-1[汪逸云]
    E1-2-3-3-2 --> F1-2-3-3-2-2[肖佳彤]
    E1-2-3-3-2 --> F1-2-3-3-2-3[赵景曜]

    E5-3-1-1-1 --> F5-3-1-1-1-1[李伊然]
    E5-3-1-1-1 --> F5-3-1-1-1-2[朱智康]

    E5-3-1-3-1 --> F5-3-1-3-1-1[陈怡锘]
    E5-3-1-3-1 --> F5-3-1-3-1-2[张钦]

    E7-1-2-1-2 --> F7-1-2-1-2-1[陈天行]
    E7-1-2-1-2 --> F7-1-2-1-2-2[谢俊溢]

    E9-2-1-1-1 --> F9-2-1-1-1-1[梁宝文]
    E9-2-1-1-1 --> F9-2-1-1-1-2[张荣彤]
    E9-2-1-1-1 --> F9-2-1-1-1-3[朱智康]
`;

// ---- Parse ----
const nodeNames = new Map(); // mermaidId → name
const edges = [];           // { from: mermaidId, to: mermaidId }

const lines = MERMAID.split('\n');
for (const line of lines) {
  // Skip comments and empty lines
  if (/^\s*%%/.test(line) || /^\s*$/.test(line.trim())) continue;

  // Extract all ID[Name] pairs
  const nameMatches = line.matchAll(/([\w-]+)\[([^\]]+)\]/g);
  for (const m of nameMatches) {
    nodeNames.set(m[1], m[2]);
  }

  // Extract edge: ID1 --> ID2 (with or without brackets)
  const edgeMatch = line.match(/([\w-]+)\s*-->\s*([\w-]+)/);
  if (edgeMatch) {
    edges.push({ from: edgeMatch[1], to: edgeMatch[2] });
    // Ensure source node exists in map (even without [Name])
    if (!nodeNames.has(edgeMatch[1])) {
      nodeNames.set(edgeMatch[1], edgeMatch[1]); // fallback
    }
    if (!nodeNames.has(edgeMatch[2])) {
      nodeNames.set(edgeMatch[2], edgeMatch[2]); // fallback
    }
  }
}

console.log(`Parsed ${nodeNames.size} unique nodes, ${edges.length} edges`);

// ---- Build adjacency ----
const childrenMap = new Map(); // mermaidId → [mermaidId, ...]
for (const [id] of nodeNames) {
  childrenMap.set(id, []);
}
for (const e of edges) {
  childrenMap.get(e.from).push(e.to);
}

// ---- Assign numeric IDs ----
let nextId = 1;
const numericId = new Map(); // mermaidId → numeric id
for (const [mid] of nodeNames) {
  numericId.set(mid, nextId++);
}

// ---- Build tree recursively ----
function buildTree(mermaidId) {
  const children = (childrenMap.get(mermaidId) || []).map(childMid => buildTree(childMid));
  return {
    id: numericId.get(mermaidId),
    name: nodeNames.get(mermaidId),
    category: '',
    avatar: '',
    description: '',
    children,
  };
}

// Roots = children of "Total", or nodes with no parent
const hasParent = new Set(edges.map(e => e.to));
const rootIds = [];
for (const [mid] of nodeNames) {
  if (mid === 'Total') continue;
  if (!hasParent.has(mid)) {
    rootIds.push(mid);
  }
}

// Also handle children of "Total"
const totalChildren = childrenMap.get('Total') || [];
for (const cid of totalChildren) {
  if (!rootIds.includes(cid)) rootIds.push(cid);
}

const trees = rootIds.map(mid => buildTree(mid));

// ---- Count ----
function countNodes(tree) {
  let n = 1;
  for (const c of tree.children) n += countNodes(c);
  return n;
}
const totalNodes = trees.reduce((sum, t) => sum + countNodes(t), 0);
console.log(`Forest: ${trees.length} trees, ${totalNodes} total nodes`);

// ---- Write ----
const db = {
  users: [
    {
      id: 1,
      username: 'admin',
      password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
    }
  ],
  trees,
  nextId: nextId
};

fs.writeFileSync('database.json', JSON.stringify(db, null, 2), 'utf8');
console.log(`Written database.json with nextId=${nextId}`);

// Verify
const verify = JSON.parse(fs.readFileSync('database.json', 'utf8'));
console.log(`Verification OK: ${verify.trees.length} trees`);
