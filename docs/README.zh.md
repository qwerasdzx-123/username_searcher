<div align="center">

# 🌐 OSINT 全域身份追踪引擎

### UserSearch Pro — Advanced OSINT Identity Tracker

**跨平台用户名深度检索系统 — 一键检测用户名在 999+ 个社交平台上的注册状态，精准定位目标数字足迹。**

[![Showcase](https://img.shields.io/badge/功能展示-demo-6366f1?style=flat-square&logo=github)](https://qwerasdzx-123.github.io/username_searcher/showcase.html) 
[![Issues](https://img.shields.io/badge/Issues-反馈问题-ef4444?style=flat-square&logo=github)](https://github.com/qwerasdzx-123/username_searcher/issues)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[![GitHub](https://img.shields.io/badge/GitHub-@qwerasdzx--123-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/qwerasdzx-123) 
[![X/Twitter](https://img.shields.io/badge/X-@kalaspace002-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/kalaspace002)

<a href="./README.zh.md">🇨🇳 中文</a> • <a href="./README.md">🇺🇸 English</a>

</div>

---

## ✨ 核心特性

### 🔍 **智能检索引擎**
- **999+ 平台覆盖** — 涵盖全球热门社交、专业社区、小众论坛等多层级网站
- **双重查询模式** — 精准匹配（精确验证）与模糊匹配（变体发现）自由切换
- **动态规则数据库** — 基于 Maigret 架构的 `sites-db.json`，支持灵活扩展验证规则
- **SPA 页面检测** — 智能识别 Instagram、TikTok、Facebook 等单页应用的用户状态

### ⚡ **高性能架构**
- **可调并发控制** — 1–20 并发请求可配置，平衡检索速度与稳定性
- **双代理模式** — 本地代理（HTTP CONNECT 隧道）与直连模式无缝切换
- **智能超时策略** — 根据站点类型动态调整超时阈值（8s–30s）
- **批量结果处理** — DocumentFragment 优化 DOM 更新，避免界面卡顿

### 🎨 **专业用户界面**
- **OSINT 科技风格** — 渐变色彩、毛玻璃效果、雷达扫描动画图标
- **深色/浅色主题** — 一键切换，偏好自动保存至 localStorage
- **中英双语界面** — 所有标签、按钮、说明文字均提供中英文对照
- **实时进度追踪** — 可视化进度条 + 分类统计卡片（已注册/不存在/需验证/错误）

### 🛠️ **高级功能**
- **智能筛选系统** — 点击统计卡片即可按状态过滤结果
- **用户名变体生成** — Permutator 算法自动生成组合变体（如 `user_name`、`user-name`）
- **本地日志记录** — 自动按日期归档运行日志至 `log/` 目录
- **结果导出功能** — 支持 JSON/CSV 格式导出，便于后续分析
- **测试模式** — 仅检测前 5 个网站，快速验证功能正常性

## 📋 环境要求

- **Node.js** ≥ 14.0（推荐最新 LTS 版本）
- **操作系统**：Windows / macOS / Linux
- **浏览器**：Chrome、Firefox、Edge 等现代浏览器（支持 ES6+）
- **网络环境**：建议配置代理以访问部分国际社交平台

## 🚀 快速开始

### 方式一：一键启动（推荐）

1. **双击运行** [`启动服务器.bat`](../启动服务器.bat)（Windows 系统）
2. 浏览器自动打开前端界面：`http://localhost:8888`
3. 输入目标用户名，选择查询模式（精准/模糊）
4. 点击 **「开始搜索」** 按钮，实时查看检测结果
5. 通过顶部统计卡片筛选感兴趣的结果
6. 完成后按 **Y** 键安全退出（自动清理端口占用）

### 方式二：手动启动

```bash
# 终端 1：启动本地代理服务器（端口 8899）
node js/proxy-server.js

# 终端 2：启动静态文件服务器（端口 8888）
node js/simple-server.js
```

然后在浏览器中访问：**`http://localhost:8888`**

> 💡 **提示**：代理服务器默认配置为 `192.168.1.29:7897`，如需修改请编辑 [`js/proxy-server.js`](../js/proxy-server.js) 中的 `PROXY_HOST` 和 `PROXY_PORT` 常量。

## 📊 检测结果状态

| 状态标识 | 含义说明 | 典型场景 |
|---------|---------|----------|
| ✅ **已注册** | 用户名在该平台确认存在 | 检测到个人主页、用户资料页 |
| ❌ **不存在** | 用户名未在该平台注册 | 返回 404 或明确的"用户不存在"提示 |
| ⚠️ **需手工验证** | 无法自动判定，需人工确认 | SPA 页面、登录墙、反爬虫验证、内容不足 |
| 🔴 **错误信息** | 请求失败或网络异常 | 超时、连接拒绝、代理故障 (HTTP 502) |

### 判定方法说明

系统采用多维度验证策略，包括：
- **HTTP 状态码**：404/403/429 等状态码快速预判
- **关键词匹配**：基于 `sites-db.json` 的特征词库（presence/absence strs）
- **Title 标签分析**：检测页面标题是否包含用户名（针对 Instagram/Pinterest 等 SPA）
- **内容长度评估**：对比页面字节数与预设阈值
- **反爬虫识别**：自动检测 Cloudflare Challenge、JavaScript 验证页面

## 🗂️ 项目结构

```
用户名检索工具/
├── 📄 index.html              # 主页面（UI 入口）
├── 📄 showcase.html           # 功能展示演示页
├── 🚀 启动服务器.bat          # 一键启动脚本（Windows）
│
├── 📁 js/                     # JavaScript 源代码
│   ├── app.js                 # 前端主逻辑（检索引擎、UI 交互）
│   ├── proxy-server.js        # 本地代理服务器（HTTP CONNECT 隧道）
│   ├── simple-server.js       # 静态文件服务器 + 日志 API
│   └── shared-constants.js    # 共享常量与工具函数
│
├── 📁 css/                    # 样式文件
│   └── styles.css             # 全局样式（深色/浅色主题变量）
│
├── 📁 data/                   # 数据文件
│   ├── sites-db.json          # 动态验证规则数据库（Maigret 风格）
│   └── 社交网站及用户页面.json # 网站列表与 URL 模板
│
├── 📁 docs/                   # 文档资料
│   ├── README.md              # 英文说明文档
│   ├── README.zh.md           # 中文说明文档（本文件）
│   └── 性能瓶颈分析报告.md     # 性能优化建议与技术债务
│
└── 📁 log/                    # 运行日志（按日期自动生成）
    └── log_YYYY-MM-DD.txt
```

## ⚙️ 配置说明

### 代理服务器配置

编辑 [`js/proxy-server.js`](../js/proxy-server.js)：

```javascript
const PROXY_HOST = '192.168.1.29';  // 上游代理地址
const PROXY_PORT = 7897;            // 上游代理端口
const SERVER_PORT = 8899;           // 本地代理服务端口
const MAX_CONCURRENT = 6;           // 最大并发请求数
```

### 前端服务配置

编辑 [`js/simple-server.js`](../js/simple-server.js)：

```javascript
const PORT = 8888;  // 前端访问端口
```

### 并发数调整

在前端界面直接修改「并发数」输入框（1–20），设置会自动保存至 `localStorage`。

## 🛑 关闭程序

在启动窗口按 **Y** 键即可：
1. 自动终止后台 Node.js 进程
2. 清理端口 8888/8899 占用
3. 安全退出

> ⚠️ **注意**：直接关闭窗口可能导致端口残留，下次启动时会自动清理。

## 🔧 常见问题

### Q1: 为什么很多网站显示"需手工验证"？

A: 以下情况会触发手工验证标记：
- **SPA 单页应用**：Instagram、TikTok 等内容需 JavaScript 渲染，HTTP 代理无法获取完整 HTML
- **登录墙**：Facebook、LinkedIn 等要求登录后才能查看用户资料
- **反爬虫机制**：Cloudflare Challenge、CAPTCHA 验证页面
- **内容不足**：页面字节数低于阈值，特征词匹配不充分

**解决方案**：点击「手工验证」链接直接在浏览器中打开目标页面人工确认。

### Q2: 如何提升检索速度？

A: 参考 [`docs/性能瓶颈分析报告.md`](./性能瓶颈分析报告.md)，主要优化方向：
- 更换高性能代理服务器（当前使用家用代理 `192.168.1.29:7897`）
- 启用「仅热门网站」过滤，减少检测数量
- 调整并发数至 5–10（需确保代理服务器性能足够）
- 使用「测试模式」快速验证功能正常性

### Q3: 如何添加新的检测网站？

A: 编辑 [`data/社交网站及用户页面.json`](../data/社交网站及用户页面.json)，按以下格式添加：

```json
{
  "domain": "example.com",
  "url": "https://example.com/user/{username}",
  "type": "社交媒体",
  "nsfw": "false",
  "global_rank": 1000
}
```

如需自定义验证规则，在 [`data/sites-db.json`](../data/sites-db.json) 中添加对应域名的规则。

### Q4: 日志文件保存在哪里？

A: 所有运行日志自动保存至 [`log/`](../log/) 目录，按日期命名（如 `log_2026-06-17.txt`）。也可在前端界面点击「导出日志」按钮下载。

## 📈 性能优化路线图

详细的性能分析与优化建议请参阅：**[`docs/性能瓶颈分析报告.md`](./性能瓶颈分析报告.md)**

主要优化方向：
- 🔥 **高优先级**：更换代理服务器、智能超时策略、代理健康检查
- ⚡ **中优先级**：请求缓存、DOM 批量更新、虚拟滚动
- 🛠️ **低优先级**：断点续传、多代理负载均衡、速率限制优化

预期优化效果：
- **首次搜索**：401s → **120-150s**（提速 62-70%）
- **重复搜索**：401s → **40-60s**（提速 85-90%，依赖缓存）

## 🤝 贡献指南

欢迎提交 Issue 或 Pull Request！

1. **报告 Bug**：在 [Issues](https://github.com/qwerasdzx-123/username_searcher/issues) 中详细描述问题
2. **功能建议**：说明使用场景和预期效果
3. **代码贡献**：
   - Fork 本仓库
   - 创建特性分支 (`git checkout -b feature/AmazingFeature`)
   - 提交变更 (`git commit -m 'Add some AmazingFeature'`)
   - 推送到分支 (`git push origin feature/AmazingFeature`)
   - 开启 Pull Request

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

<div align="center">

**Made with ❤️ by [kalaspace](https://github.com/qwerasdzx-123)**

[![GitHub](https://img.shields.io/badge/GitHub-@qwerasdzx--123-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/qwerasdzx-123) 
[![X/Twitter](https://img.shields.io/badge/X-@kalaspace002-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/kalaspace002)

</div>
