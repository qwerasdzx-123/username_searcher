<div align="center">

# 🔍 用户名检索工具

**跨平台用户名检索工具 — 一键检测用户名在 999+ 个社交平台上的注册情况。**

[🌐 功能展示](https://qwerasdzx-123.github.io/username_searcher/showcase.html) | [⭐ GitHub](https://github.com/qwerasdzx-123/username_searcher)

[![Twitter](https://img.shields.io/badge/Twitter-@kalaspace002-1DA1F2?style=flat-square&logo=twitter&logoColor=white)](https://x.com/kalaspace002) [![Threads](https://img.shields.io/badge/Threads-@kalaspace002-000000?style=flat-square&logo=threads&logoColor=white)](https://www.threads.com/@kalaspace002)

<a href="./README.zh.md">中文</a> / <a href="./README.md">English</a>

</div>

---

## ✨ 功能特性

- **999+ 平台覆盖** — 涵盖热门网站、普通网站、小众社区三个层级
- **精准 & 模糊匹配** — 双重查询模式，支持精确验证与模糊变体发现
- **双代理模式** — 本地代理与直连模式自由切换，灵活应对不同网络环境
- **可调并发数** — 1–20 可调，在速度与稳定性之间自由平衡
- **智能筛选** — 按已注册 / 不存在 / 需手工验证 / 错误信息四类状态筛选
- **热门网站过滤** — 支持仅检索热门平台，快速聚焦
- **测试模式** — 仅测试前几个网站，方便快速验证功能
- **本地日志记录** — 自动按日期将运行日志保存到 `log/` 目录

## 📋 环境要求

- [Node.js](https://nodejs.org/) 运行环境

## 🚀 快速开始

1. 双击运行 `启动服务器.bat`（Windows）
2. 浏览器自动打开 `http://localhost:8888`
3. 输入用户名，点击"开始搜索"
4. 通过下拉菜单筛选结果

## 💻 手动启动

```bash
node proxy-server.js
node simple-server.js
```

然后访问 `http://localhost:8888`

## 📊 结果状态说明

| 状态 | 含义 |
|------|------|
| 已注册 | 该用户名在此平台已存在 |
| 不存在 | 该用户名在此平台未注册 |
| 需手工验证 | 需要人工进一步确认 |
| 错误信息 | 请求失败或出现网络异常 |

## 🛑 关闭程序

在启动窗口按 `Y` 键即可自动清理进程和端口占用后退出。

## 📄 开源协议

MIT License
