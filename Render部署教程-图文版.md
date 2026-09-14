# Render 部署说明（v2 DAG）

这份说明对应当前 `render.yaml`。部署前请先准备一个 Render Web Service 和持久磁盘；JSON 数据库不适合无持久化磁盘的临时实例。

## 1. 创建服务

1. 将 `luna` 目录作为独立项目连接到 GitHub。
2. 在 Render 选择 **New → Blueprint**，让 Render 读取 `render.yaml`。
3. 确认服务类型为 Node Web Service，构建命令为 `npm install`，启动命令为 `npm start`。
4. 确认持久磁盘挂载到 `/app/data`，容量按数据量调整。

## 2. 配置环境变量

`render.yaml` 会让 Render 生成随机 `SECRET`。不要把 JWT 密钥复制到代码、截图或公开仓库中。

在 Render 的 Environment 中设置以下私密变量：

| 变量 | 用途 |
| --- | --- |
| `INITIAL_ADMIN_USERNAME` | 仅在持久盘还没有 `database.json` 时创建管理员 |
| `INITIAL_ADMIN_PASSWORD` | 初始管理员密码，至少 8 位 |
| `SECRET` | Blueprint 自动生成；也可以换成密码管理器生成的长随机值 |
| `DB_FILE` | Blueprint 已指向 `/app/data/database.json` |

首次初始化完成后，不要依赖修改 `INITIAL_ADMIN_*` 来改变账号；请在管理后台使用“账号设置”。应用不会在每次启动时恢复或重置账号。

## 3. 部署后检查

打开服务 URL，确认：

- 公开页面能显示 DAG、箭头和多师傅节点；
- 管理入口要求登录；
- 添加一条测试关系后刷新页面仍然存在；
- 管理后台的“账号设置”可以保存；
- 持久盘中存在 `database.json`。

## 4. 旧数据迁移

如果持久盘中的 `database.json` 是旧版嵌套 `trees` 格式，第一次启动会：

1. 先创建且只创建一次 `database.v1.backup.json`；
2. 校验并合并同名人员；
3. 将树边转换为 `master_id → disciple_id` 关系；
4. 写入 v2 DAG；
5. 在后续写入时维护 `database.last-good.backup.json`。

升级前仍建议从持久盘下载一份完整数据副本。不要手工删除备份文件，除非已经完成外部归档。

## 5. 常见问题

### 服务启动后提示缺少 SECRET

生产环境必须设置 `SECRET`。重新保存环境变量并重新部署，不要在 `render.yaml` 中写入固定公开值。

### 每次部署后数据消失

检查 Web Service 是否挂载了持久磁盘，以及 `DB_FILE` 是否为 `/app/data/database.json`。没有持久卷的实例重启后可能清空本地文件。

### 忘记管理员密码

不要通过源码补回固定密码。先备份数据，再按团队的安全流程恢复管理员账号或在受控环境中进行一次性密码重置。
