# 师徒传承关系图谱 v2

轻量、无构建步骤的师徒关系 DAG 管理系统。公开页面展示“师傅 → 徒弟”的有向关系；管理后台用于维护人员资料和关系。

## 功能

- 多师傅：同一位徒弟可以拥有多条上游关系，图中只渲染一个人员节点。
- DAG 校验：后端拒绝空姓名、重名、无效 ID、悬空关系、自连接、重复关系和环路。
- Obsidian 式力导向图：保留原版小圆点、暗色画布和自然网络布局；代数只作为轻量纵向引导，不强制排成树状层级。
- 关系操作独立：删除关系只删除边；删除人员只删除本人及其入边、出边，不级联删除后代。
- 图谱交互：搜索、缩放、拖拽、人物详情、祖先/后代高亮，桌面和移动端均可用。
- Obsidian A 配色：根节点固定 `#9F84EF`，叶节点固定为更深的 `#44336B`；中间节点根据其距根、距叶的路径距离，对两端颜色做 RGB 加权平均，形成清晰且会随关系变化自动更新的亮紫到深紫渐变。
- JSON 持久化：写入前全量校验，先写并验证临时文件，同时保留最近可恢复备份。

## 数据模型

`database.json` 使用 v2 结构：

```json
{
  "schemaVersion": 2,
  "users": [{ "id": 1, "username": "…", "password": "bcrypt hash" }],
  "persons": [{
    "id": 1,
    "name": "…",
    "normalizedName": "…",
    "category": "",
    "avatar": "",
    "description": ""
  }],
  "relationships": [{ "id": 1, "master_id": 1, "disciple_id": 2 }],
  "nextPersonId": 3,
  "nextRelationshipId": 2
}
```

关系方向固定为 `master_id → disciple_id`。姓名键使用 Unicode NFKC、首尾空白清理、连续空白折叠和拉丁字母小写化，因此姓名全局唯一。

## 本地启动

需要 Node.js 18 或更高版本。

```bash
npm install
npm start
```

也可以在 Windows 上运行 `start.bat`。访问 <http://localhost:3000> 查看公开图谱，管理入口位于右上角。

如果 `database.json` 不存在，启动时必须提供一次性初始管理员配置：

PowerShell：

```powershell
$env:INITIAL_ADMIN_USERNAME = "<your-admin-name>"
$env:INITIAL_ADMIN_PASSWORD = "<your-password-at-least-8-chars>"
$env:SECRET = "<long-random-jwt-secret>"
npm start
```

开发环境未设置 `SECRET` 时会生成仅存在于当前进程的随机密钥，并打印警告；生产环境缺少 `SECRET` 会拒绝启动。应用不会在启动时恢复或重置固定账号密码。

可用环境变量：

| 变量 | 说明 |
| --- | --- |
| `PORT` | HTTP 端口，默认 `3000` |
| `DB_FILE` | 数据库 JSON 路径，默认项目目录下的 `database.json` |
| `SECRET` | 生产环境必填的 JWT 密钥 |
| `INITIAL_ADMIN_USERNAME` | 仅在数据库完全不存在时使用 |
| `INITIAL_ADMIN_PASSWORD` | 仅在数据库完全不存在时使用，至少 8 位 |
| `NODE_ENV` | 设为 `production` 启用生产安全约束 |

## 数据迁移与备份

首次启动发现旧版嵌套 `trees` 数据时，服务会在替换前创建一次 `database.v1.backup.json`，之后迁移为 v2。初始备份存在时不会被覆盖；每次成功保存前还会更新 `database.last-good.backup.json`。

当前样本迁移结果为 125 人、119 条关系。四组重复姓名（吴秋圆、张高雅、张盼兮、朱智康）各合并为一个人员，并保留两条上游关系。迁移期间若重复记录的资料字段冲突，服务会保留首次出现的值并输出中文提示，不会静默丢弃关系。

部署或升级前应复制整个数据目录。若多人同时写入同一个 JSON 文件，应用没有外部数据库级锁，建议只运行一个写入实例。

## 管理操作

1. 登录管理后台。
2. 新增或编辑人员；“师傅（上游）”支持多选，失败时表单内容保留。
3. 在“新增师徒关系”中单独添加边；服务端会检查重复关系和环路。
4. 删除人员前会显示入边、出边数量，并二次确认；徒弟和其他后代不会被级联删除。
5. 关系列表中的“删除关系”只移除选中的边。
6. 认证过期后，管理页会清除失效 token 并引导回登录页。

主要接口：

- `GET /api/graph`：公开读取人员、关系、代数和颜色。
- `GET /api/persons`、`GET /api/persons/:id`：读取人员及详情。
- `POST/PUT/DELETE /api/persons`：人员新增、修改、删除，需鉴权。
- `GET /api/relationships`、`POST/DELETE /api/relationships/:id`：关系读取与维护，写操作需鉴权。
- `POST /api/login`、`GET /api/me`、`POST /api/account`：认证和账号设置。

修改接口统一返回 `{ ok: true, data }`；失败返回 `{ ok: false, error: { code, message } }`，前端按 HTTP 非 2xx 正确显示失败。

## 测试

```bash
npm test
```

测试覆盖姓名标准化、迁移合并、重复边、自连接、环路、多师傅、最长路径代数、颜色边界/距离渐变、删除关系、不级联删除、初始账号和重启后的账号持久化。

## Render / Docker 部署

仓库中的 `render.yaml` 已配置：

- Render 生成 `SECRET`，不在源码保存公开固定密钥；
- `INITIAL_ADMIN_USERNAME` 和 `INITIAL_ADMIN_PASSWORD` 作为部署时的私密变量，仅用于空数据盘的第一次初始化；
- 持久磁盘挂载到 `/app/data`，`DB_FILE` 指向 `/app/data/database.json`。

Render 免费实例若不配置持久磁盘，重启或重新部署可能丢失 JSON 数据。生产环境必须使用持久卷或外部备份，并定期保存 `database.json`、`database.v1.backup.json` 和 `database.last-good.backup.json`。

Docker 示例：

```bash
docker build -t shitu-dag .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e SECRET="<long-random-jwt-secret>" \
  -e INITIAL_ADMIN_USERNAME="<your-admin-name>" \
  -e INITIAL_ADMIN_PASSWORD="<your-password-at-least-8-chars>" \
  -e DB_FILE=/data/database.json \
  -v "$(pwd)/data:/data" shitu-dag
```

不要把真实密码、JWT 密钥或生产数据提交到版本库。

## 已知限制

- 图谱使用 D3.js SVG 力导向布局；125 人规模下可使用缩放、搜索和节点拖拽，数据继续增长后可能需要 Canvas/WebGL 渲染。
- 公开图谱目前从 D3 官方 CDN 加载运行库；首次打开页面需要能够访问该 CDN，若需完全离线部署可改为随项目托管 D3 文件。
- 头像使用人员填写的 URL，部署环境的 CSP、网络或第三方防盗链可能导致头像不可见，但不会影响关系图。
- JSON 文件适合单实例轻量部署，不适合高并发、多写入进程或需要事务查询的场景。

## 技术栈

Node.js、Express、bcrypt、JWT、原生 HTML/CSS/JavaScript、D3.js、SVG；无前端框架、无构建步骤、无外部数据库。
