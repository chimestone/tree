# 师徒关系树管理系统

一个轻量级的树状人员结构管理系统，支持手机和电脑访问。

## 功能特性
- 📱 响应式设计，支持手机和电脑访问
- 🔐 账号密码登录保护
- ➕ 增删改人员信息
- 🌳 实时查看树状结构图
- 💾 JSON数据库存储

## 本地测试

### Windows
双击运行 `start.bat`（需要先安装Node.js）

### Mac/Linux
```bash
npm install
npm start
```

访问：http://localhost:3000

## 部署到Render（免费）

详见：[Render部署教程-图文版.md](./Render部署教程-图文版.md)

### 快速步骤
1. 上传代码到GitHub
2. 连接Render.com
3. 配置并部署
4. 获得免费网址

## 默认账号
- 用户名：`admin`
- 密码：`admin123`

## 技术栈
- 后端：Node.js + Express
- 前端：HTML/CSS/JavaScript + Mermaid.js
- 认证：JWT + bcrypt

## License
MIT
