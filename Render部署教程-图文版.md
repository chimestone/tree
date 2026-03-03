# Render 部署教程 - 10分钟完成

## 📋 准备工作（5分钟）

### 第1步：注册GitHub账号
1. 打开 https://github.com
2. 点击右上角 "Sign up"
3. 填写邮箱、密码、用户名
4. 验证邮箱
5. 完成注册

### 第2步：注册Render账号
1. 打开 https://render.com
2. 点击 "Get Started"
3. 选择 "Sign up with GitHub"（用GitHub登录）
4. 授权Render访问GitHub
5. 完成注册

---

## 🚀 部署步骤（5分钟）

### 第1步：上传代码到GitHub

#### 方法A：网页上传（最简单）✨

**1. 创建仓库**
```
1. 登录GitHub
2. 点击右上角 "+" → "New repository"
3. Repository name: tree-system
4. 选择 Public（公开）
5. 点击 "Create repository"
```

**2. 上传文件**
```
1. 点击 "uploading an existing file"
2. 打开文件夹 d:\myWorkSpace\tree
3. 选择以下文件拖拽上传：
   ✅ server.js
   ✅ package.json
   ✅ public 文件夹（整个文件夹）
   ✅ Dockerfile
   ✅ render.yaml
   ❌ 不要上传 node_modules 文件夹
   ❌ 不要上传 database.json
4. 点击 "Commit changes"
```

**完成！** 代码已上传到GitHub

---

### 第2步：在Render创建服务

**1. 连接GitHub**
```
1. 登录 https://render.com
2. 点击 "New +" → "Web Service"
3. 点击 "Connect GitHub"
4. 找到 tree-system 仓库
5. 点击 "Connect"
```

**2. 配置服务**

填写以下信息：

| 配置项 | 填写内容 |
|--------|----------|
| Name | `tree-system` |
| Region | `Singapore (Southeast Asia)` |
| Branch | `main` |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | `Free` |

**3. 添加环境变量（可选）**
```
点击 "Advanced" → "Add Environment Variable"

KEY: PORT
VALUE: 3000

KEY: SECRET
VALUE: my-secret-key-2024
```

**4. 开始部署**
```
1. 点击 "Create Web Service"
2. 等待部署（约3-5分钟）
3. 看到绿色 "Live" → 部署成功！
```

---

## 🎉 部署完成！

### 你的网站地址
```
https://tree-system-xxxx.onrender.com
```
（xxxx是随机生成的）

### 管理后台
```
https://tree-system-xxxx.onrender.com/login.html
账号：admin
密码：admin123
```

---

## 📱 手机访问测试

1. 打开手机浏览器
2. 输入你的网站地址
3. 看到树状图 → 成功！
4. 点击"管理登录"测试后台

---

## ⚠️ 重要提示

### 1. 首次访问较慢
- 免费版会休眠
- 首次访问需要30秒唤醒
- 之后访问正常

### 2. 防止休眠（可选）
使用 UptimeRobot 定时访问：
```
1. 注册 https://uptimerobot.com
2. Add New Monitor
3. Monitor Type: HTTP(s)
4. URL: 你的网站地址
5. Monitoring Interval: 5 minutes
6. 保存
```

### 3. 数据会丢失
- 重启后 database.json 会重置
- 建议定期导出数据
- 或使用外部数据库

---

## 🔧 常见问题

### Q1: 部署失败显示 "Build failed"
**A**: 检查 package.json 是否正确
```json
{
  "name": "tree-system",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2"
  }
}
```

### Q2: 访问显示 "Application failed to respond"
**A**: 
1. 查看 Logs 标签页
2. 确认 PORT 使用环境变量：
```javascript
const PORT = process.env.PORT || 3000;
```

### Q3: 如何更新代码？
**A**: 
```
1. 在GitHub仓库点击文件
2. 点击编辑按钮（铅笔图标）
3. 修改代码
4. 点击 "Commit changes"
5. Render会自动重新部署
```

### Q4: 如何查看日志？
**A**: 
```
Render控制台 → 你的服务 → Logs 标签
```

### Q5: 如何删除服务？
**A**: 
```
Render控制台 → 你的服务 → Settings → Delete Web Service
```

---

## 📊 部署检查清单

部署前确认：
- [ ] package.json 文件存在
- [ ] server.js 使用 process.env.PORT
- [ ] public 文件夹已上传
- [ ] 没有上传 node_modules

部署后确认：
- [ ] 状态显示 "Live"（绿色）
- [ ] 可以访问网站
- [ ] 可以看到树状图
- [ ] 可以登录管理后台
- [ ] 手机可以正常访问

---

## 🎯 下一步

1. ✅ 分享链接给朋友
2. ✅ 添加到手机桌面
3. ✅ 修改默认密码
4. ✅ 设置 UptimeRobot 防休眠
5. ✅ 定期备份数据

---

## 💡 优化建议

### 1. 绑定自定义域名
```
Render控制台 → Settings → Custom Domain
添加你的域名（需要在域名商添加CNAME记录）
```

### 2. 升级到付费版
```
$7/月 → 不休眠 + 更快速度 + 数据持久化
```

### 3. 使用外部数据库
```
MongoDB Atlas（免费）
PostgreSQL（Render提供免费版）
```

---

## 📞 需要帮助？

遇到问题？
1. 查看 Render 的 Logs 标签
2. 检查上面的常见问题
3. 重新部署试试

---

## 🎊 恭喜！

你已经成功将项目部署到云端！
现在任何人都可以通过网址访问你的师徒关系树系统了！
