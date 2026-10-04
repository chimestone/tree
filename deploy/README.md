# Ubuntu 部署到 /tree

应用代码放在 `/opt/tree-system`，运行数据库单独保存在 `/var/lib/tree-system/database.json`。`treeapp` 用户运行应用，systemd 管理启动与重启；Nginx 将 `/tree/` 转发到仅监听本机的 3145 端口，并将 `/tree` 重定向到 `/tree/`。

`tree.service` 与 `tree.nginx.conf` 是该服务器的配置模板。安装前检查端口和现有站点，按目标地址修改 server_name。应用与后台使用相对路径，可同时在根路径和 `/tree/` 部署。

`/etc/tree-system.env` 仅在服务器创建，权限为 600，包含 NODE_ENV=production、HOST=127.0.0.1、PORT=3145、DB_FILE=/var/lib/tree-system/database.json 和随机生成的 SECRET。该文件及运行数据库不得提交 Git。数据库保存前自动生成最近一次备份，仍需定期做外部归档。

安装依赖使用 `npm ci --omit=dev`，Node 24 官方二进制可由 `install-node.sh` 下载并校验。代码更新时先备份数据库，拉取已验证提交、安装依赖并重启 tree 服务；不要用仓库数据库覆盖运行数据。

HTTP 访问不加密登录凭据；公网管理应使用 HTTPS 或 SSH 隧道。只有 Nginx 的 80 端口需对外开放，应用的 3145 端口不应开放。

检查：`systemctl status tree --no-pager`、`nginx -t`、`curl -I http://127.0.0.1/tree/`、`curl http://127.0.0.1/tree/api/graph`。日志使用 `journalctl -u tree` 查看，不打印密钥或密码哈希。
