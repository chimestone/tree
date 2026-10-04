# Render 部署说明（v2 DAG）

本说明对应仓库中的 `render.yaml`，介绍服务配置、数据导入与备份恢复。

## 1. 项目与配置

GitHub 仓库为 [chimestone/tree](https://github.com/chimestone/tree)。仓库根目录包含 server.js、package.json 和 render.yaml。

使用 Blueprint 创建服务时，让 Render 读取仓库根目录的 render.yaml。已有服务应先确认其连接的仓库、分支和 Root Directory，避免把父目录或旧副本作为部署源。

当前配置：

| 项目 | 当前值 |
| --- | --- |
| 运行方式 | 原生 Node Web Service |
| 构建命令 | npm install |
| 启动命令 | npm start |
| 持久磁盘 | tree-system-data，1 GB |
| 挂载路径 | /app/data |
| 数据库 | /app/data/database.json |
| Node 版本 | 配置未锁定，应在部署环境明确设置并测试 |

Render 持久磁盘需要付费服务，免费服务不能挂载。无持久磁盘时重启或重新部署会丢失本地文件改动；持久盘只有挂载目录中的文件能保留。参见 [Render 持久磁盘文档](https://render.com/docs/disks)。

建议使用 Node 24 LTS，通过服务环境变量 NODE_VERSION 指定版本；参见 [Render Node 版本设置](https://render.com/docs/node-version)。

## 2. 环境变量

| 变量 | 用途 |
| --- | --- |
| NODE_ENV | 当前配置为 production |
| SECRET | Blueprint 生成随机 JWT 密钥；不要写入源码 |
| DB_FILE | 当前配置为 /app/data/database.json |
| INITIAL_ADMIN_USERNAME | 仅数据库文件不存在时创建管理员 |
| INITIAL_ADMIN_PASSWORD | 初始管理员密码，至少 8 位 |
| PORT | 使用 Render 注入的端口；应用缺省为 3000 |

INITIAL_ADMIN_* 需通过部署环境私密配置。已有数据库中的账号不会被这些变量覆盖；更改账号请使用管理后台。

空持久盘第一次启动只创建账号和空图谱，不会自动导入仓库中的人物。测试登录、确认服务可启动后，再按下一节导入已有数据。

## 3. 导入已有图谱

1. 确认目标是该服务的持久磁盘和 DB_FILE，不是构建目录。磁盘仅在运行时可用。
2. 将来源数据库、目标当前数据库及已有备份分别下载并保存到外部归档，明确此次保留哪份管理员账号。
3. 对来源副本运行下面的校验，再在维护窗口中停止所有写入进程。不要在正在运行的应用旁直接改数据库文件：服务持有内存副本，下一次写入可能覆盖手工替换。
4. 通过已配置的受控文件传输方式把经过验证的数据放到目标持久盘的 database.json；保留原文件的独立副本。账号、密码哈希和图谱都会随整个数据库一起替换，不是仅导入人物。
5. 如果来源为旧 trees 数据，下一次启动自动执行迁移；如果是 v2，直接读取。
6. 更换部署 SECRET，让来源或旧部署的登录令牌失效，再启动并检查人员、关系及登录。SECRET 更换会要求所有管理员重新登录。

Render 的 SSH/SCP 等传输方式见[官方文件传输说明](https://render.com/docs/disks#transferring-files)。本项目没有网页上传数据库接口，也没有自动合并两个数据库的导入功能。

### 在副本上校验

以下命令在项目根目录执行，把路径改成实际的数据库副本。它只读取副本，不保存或改写数据库。

```powershell
$env:CHECK_DB_COPY = 'D:\backups\database-copy.json'
node -e "const fs=require('fs');const s=require('./server');const raw=JSON.parse(fs.readFileSync(process.env.CHECK_DB_COPY,'utf8'));const d=raw.schemaVersion===2?raw:s.migrateLegacyDatabase(raw).database;s.validateDatabase(d);console.log('校验通过：'+d.persons.length+' 人，'+d.relationships.length+' 条关系');"
Remove-Item Env:CHECK_DB_COPY
```

如果在 production 环境运行，必须已有 SECRET，否则加载服务模块会先拒绝缺失的生产密钥。校验失败时不要替换目标数据，先保留副本并查明错误。

## 4. 迁移、备份与恢复

旧版嵌套 trees 数据首次启动时，应用先建立一次 database.v1.backup.json，校验合并同名人员与重复边，转换为 v2 DAG。原始备份存在时不会覆盖。

每次保存前会更新 database.last-good.backup.json，再保存新数据。它是滚动备份，同目录副本也不能应对整个磁盘丢失；应定期导出外部、带日期的独立备份。

恢复步骤：

1. 找到正确版本的副本，在测试环境用上面的只读命令验证。迁移备份可能仍是旧 trees 格式，不要凭文件名判断。
2. 确认恢复日期和会回退的人员、关系、账号信息；停止全部写入进程。
3. 将故障现状另存为独立副本，保留用于排查。不要覆盖原始备份或唯一可用副本。
4. 将选定副本放回实际 DB_FILE，并检查运行用户有读写权限。
5. 轮换 SECRET，再启动服务，核对人员、关系及管理员登录；确认后才恢复写入。

旧备份可能回退账号 tokenVersion 或密码，恢复时轮换 SECRET 可避免旧令牌重新获得权限。应用不会自动从备份恢复，也没有默认密码重置入口。

## 5. 部署后检查

使用测试副本或测试服务验证写操作，不为验收随意更改真实账号或关系。

- 公开图谱显示自然网络、小圆点和大小层次；无需常驻箭头或强制上下排列。
- 同一人物有多位师傅时仍只有一个节点；详情“师傅”列出直接上游，“历代师承”列出去重的全部上游人物。
- “历代师承”的排序不代表相邻人物有师徒关系；点击可跳到对应详情。
- 头像为空、非法旧地址或加载失败时显示首字。
- 管理数据写入需要登录；新增关系后刷新仍存在。
- 修改密码后当前设备提示重新登录，其他设备下一次管理操作被拒绝；新密码可以重新登录。
- 重新部署或重启后持久盘中的人员、关系和 tokenVersion 仍保留。

## 6. 常见问题

### 缺少 SECRET，或缺少初始管理员变量

生产环境必须有 SECRET；空库还需要 INITIAL_ADMIN_USERNAME 和 INITIAL_ADMIN_PASSWORD。已有库不会因为修改初始变量而重置账号。

### 图谱为空

确认 DB_FILE 的目标文件是否只是首次初始化的空数据库。仓库有数据不代表它已导入 /app/data。不要通过删除现有文件强制重建来“找回数据”。

### 数据在重新部署后丢失

检查真实数据库路径是否在持久磁盘下。没有持久盘的免费实例不适合作为本项目生产 JSON 数据库宿主。

### 更新后要求重新登录

升级前不带版本的令牌需要重新登录；改密码和更换 SECRET 也会撤销登录。图谱的公开访问不受影响。

### 图谱无法加载，或头像打不开

图谱依赖外部 D3 CDN；头像依赖 URL 对应的图片服务、网络及浏览器协议策略。检查控制台与网络请求，不要把 CDN 故障误判为数据库丢失。

### 忘记管理员密码

先做外部备份，再安排受控的一次性账号恢复；不要往源码补默认账号。
