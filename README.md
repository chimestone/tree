# 师徒传承关系图谱 v2

轻量、无构建步骤的师徒关系 DAG 管理系统。数据关系方向固定为“师傅 → 徒弟”；公开页面用自然网络布局、节点大小和人物详情表达师承，不使用常驻箭头或强制上下分层。管理后台用于维护人员资料和关系。

## 文档与项目目录

以下命令均在包含 `package.json`、`server.js` 和 `render.yaml` 的仓库根目录执行。

- [部署说明](Render部署教程-图文版.md)：Render、数据导入与部署检查。
- [头像安全教学](docs/R1-avatar-safety.md)：属性注入与 DOM 渲染。
- [登录认证教学](docs/R2-session-version.md)：改密码时撤销旧登录。
- [师承关系教学](docs/R3-lineage-list.md)：上游人物列表与真实路径的区别。

## 功能

- 多师傅：同一位徒弟可以拥有多条上游关系，图中只渲染一个人员节点。
- DAG 校验：后端拒绝空姓名、重名、无效 ID、悬空关系、自连接、重复关系和环路。
- Obsidian 式力导向图：保留原版小圆点、暗色画布和自然网络布局；代数只作为轻量纵向引导，不强制排成树状层级。
- 关系操作独立：删除关系只删除边；删除人员只删除本人及其入边、出边，不级联删除后代。
- 图谱交互：搜索、缩放、拖拽、人物详情、祖先/后代高亮。
- 详情的“历代师承”列出全部去重的上游人物，按代数和姓名排序，可点击跳转；列表顺序不表示人物之间存在直接师徒关系。直接关系以“师傅”“徒弟”栏目为准。
- Obsidian A 配色：根节点固定 `#9F84EF`，叶节点固定为更深的 `#44336B`；中间节点根据其距根、距叶的路径距离，对两端颜色做 RGB 加权平均，形成清晰且会随关系变化自动更新的亮紫到深紫渐变。
- JSON 持久化：写入前全量校验，先写并验证临时文件，同时保留最近可恢复备份。

## 数据模型

`database.json` 使用 v2 结构：

```json
{
  "schemaVersion": 2,
  "users": [{ "id": 1, "username": "…", "password": "bcrypt hash", "tokenVersion": 0 }],
  "persons": [{
    "id": 1,
    "name": "甲",
    "normalizedName": "甲",
    "category": "",
    "avatar": "",
    "description": ""
  }, {
    "id": 2,
    "name": "乙",
    "normalizedName": "乙",
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

以上仅为结构示例，密码哈希占位符不能用于真实登录。空库通过初始管理员环境变量创建，不需要手工填写哈希。

`tokenVersion` 是账号的登录版本。旧数据库没有该字段时按 0 读取；改密码会递增并保存，立即使该账号此前的所有登录令牌失效。升级前不包含版本的旧令牌也需要重新登录。恢复旧账号备份时应同时轮换 `SECRET`，避免回退版本后重新接受已撤销令牌。

## 本地启动

建议使用 Node.js 24 LTS。版本维护状态见 [Node.js 官方说明](https://nodejs.org/en/about/previous-releases)。

PowerShell 先进入项目目录：

```powershell
Set-Location '<仓库目录>'
```

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

迁移会合并同名人员与重复关系，并保留多位师傅。若重复记录的资料字段冲突，服务会保留首次出现的值并输出提示。

部署或升级前应复制整个数据目录。若多人同时写入同一个 JSON 文件，应用没有外部数据库级锁，建议只运行一个写入实例。

最近一次备份会随每次保存被覆盖，不能替代外部历史备份。恢复步骤见[部署说明](Render部署教程-图文版.md)。编辑资料时请使用单一窗口，避免旧表单覆盖其他窗口的新修改。

## 管理操作

1. 登录管理后台。
2. 新增或编辑人员；“师傅（上游）”支持多选，接口拒绝提交时保留表单输入。
3. 在“新增师徒关系”中单独添加边；服务端会检查重复关系和环路。
4. 删除人员前会显示入边、出边数量，并二次确认；徒弟和其他后代不会被级联删除。
5. 关系列表中的“删除关系”只移除选中的边。
6. 认证过期后，管理页会清除失效 token 并引导回登录页。
7. 修改密码成功后，当前设备清除 token 并提示使用新密码登录；其他设备下一次访问受保护接口会被拒绝。只修改用户名不退出登录。

主要接口：

- `GET /api/graph`：公开读取人员、关系、代数和颜色。
- `GET /api/persons`、`GET /api/persons/:id`：读取人员及详情。
- `POST /api/persons`：新增人员，需鉴权。
- `PUT /api/persons/:id`、`DELETE /api/persons/:id`：修改或删除指定人员，需鉴权。
- `GET /api/relationships`：读取关系列表。
- `POST /api/relationships`：新增关系，需鉴权。
- `DELETE /api/relationships/:id`：删除指定关系，需鉴权。
- `POST /api/login`、`GET /api/me`、`POST /api/account`：认证和账号设置。

上述接口成功统一返回 `{ ok: true, data }`；失败返回 `{ ok: false, error: { code, message } }`（部分错误附带 details），前端按 HTTP 非 2xx 显示失败。写操作和 `/api/me`、`/api/account` 使用 `Authorization: Bearer <token>`。

## 测试

```bash
npm test
```

也可直接运行 `node --test`。测试覆盖姓名/关系校验、迁移、颜色、删除、头像地址限制、密码更改撤销登录、旧数据库兼容及重启持久化。

浏览器回归为手工脚本，不包含在 `npm test` 中。需单独准备 Playwright 与 Chrome，生产运行不需要它们。

```powershell
# Playwright 已能从项目中加载时，直接运行以下脚本。
# 若使用其他现有安装，先将此变量指向实际模块路径：
# $env:PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
node scripts/avatar.browser.cjs
node scripts/account.browser.cjs
node scripts/lineage.browser.cjs
```

三项分别验证头像渲染、改密码后的会话失效、师承列表与点击目标，使用隔离数据，不修改运行数据库。

## Render / Docker 部署

仓库中的 `render.yaml` 已配置：

- Render 生成 `SECRET`，不在源码保存公开固定密钥；
- `INITIAL_ADMIN_USERNAME` 和 `INITIAL_ADMIN_PASSWORD` 作为部署时的私密变量，仅用于空数据盘的第一次初始化；
- 持久磁盘挂载到 `/app/data`，`DB_FILE` 指向 `/app/data/database.json`。

Render 持久磁盘仅适用于付费服务；没有持久磁盘时，重启或重新部署会丢失本地文件改动。当前 JSON 存储方案需要持久磁盘或等效持久卷，并定期导出独立备份。见 [Render 持久磁盘说明](https://render.com/docs/disks)。

空磁盘启动只创建管理员和空图谱，不会自动复制仓库的 database.json。已有数据需按[部署说明](Render部署教程-图文版.md)导入持久盘。生产端 Node 版本应明确配置并验证，当前 render.yaml 未锁定版本，见 [Render Node 版本配置](https://render.com/docs/node-version)。

Docker 示例（Bash；PowerShell 请按其语法填写参数和绝对挂载路径）。现有 Dockerfile 基于已结束维护的 Node 18，生产镜像请使用维护中的 Node LTS 版本：

```bash
mkdir -p data
docker build -t shitu-dag .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e SECRET="<long-random-jwt-secret>" \
  -e INITIAL_ADMIN_USERNAME="<your-admin-name>" \
  -e INITIAL_ADMIN_PASSWORD="<your-password-at-least-8-chars>" \
  -e DB_FILE=/data/database.json \
  -v "$(pwd)/data:/data" shitu-dag
```

不要提交真实密码、JWT 密钥或生产账号数据。仓库中的数据库及备份含账号记录，部署时请使用自己的管理员凭据，将运行数据和外部备份单独保存。

## 已知限制

- 公开图谱目前从 D3 官方 CDN 加载运行库；首次打开页面需要能够访问该 CDN，若需完全离线部署可改为随项目托管 D3 文件。
- 头像允许留空或填写 HTTP/HTTPS URL；详情通过 DOM 设置图片属性，旧非法地址及加载失败会显示姓名首字。图片仍可能受网络、防盗链或 HTTPS 页面的混合内容限制影响，不影响关系图。
- JSON 文件适合单实例轻量部署，不适合高并发、多写入进程或需要事务查询的场景。

## 技术栈

Node.js、Express、bcrypt、JWT、原生 HTML/CSS/JavaScript、D3.js、SVG；无前端框架、无构建步骤、无外部数据库。
