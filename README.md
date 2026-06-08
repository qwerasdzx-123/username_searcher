<div align="center">

# 🔍 Username Searcher

**Cross-platform username lookup tool — detect registrations across 999+ social platforms in seconds.**

[🌐 功能展示](https://qwerasdzx-123.github.io/username_searcher/showcase.html) | [⭐ GitHub](https://github.com/qwerasdzx-123/username_searcher)

[![Twitter](https://img.shields.io/badge/Twitter-@kalaspace002-1DA1F2?style=flat-square&logo=twitter&logoColor=white)](https://x.com/kalaspace002) [![Threads](https://img.shields.io/badge/Threads-@kalaspace002-000000?style=flat-square&logo=threads&logoColor=white)](https://www.threads.com/@kalaspace002)

<a href="./README.zh.md">中文</a> / <a href="./README.md">English</a>

</div>

---

## ✨ Features

- **999+ Platforms** — Covers popular, normal, and niche social sites worldwide
- **Precision & Fuzzy Matching** — Dual query modes for exact and variant username detection
- **Dual Proxy Modes** — Local proxy and direct connection to adapt to different network environments
- **Adjustable Concurrency** — 1–20 concurrent requests, balancing speed and stability
- **Smart Filtering** — Filter results by: Registered, Not Found, Manual Verify, Error
- **Popular Sites Only** — Option to limit search to trending platforms
- **Test Mode** — Quick validation by testing only the first few sites
- **Local Logging** — Auto-saves run logs to local files by date

## 📋 Requirements

- [Node.js](https://nodejs.org/) runtime

## 🚀 Quick Start

1. Double-click `启动服务器.bat` (Windows)
2. Browser opens automatically at `http://localhost:8888`
3. Enter a username and click "Start Search"
4. Filter results via the dropdown menu

## 💻 Manual Start

```bash
node proxy-server.js
node simple-server.js
```

Then visit `http://localhost:8888`

## 📊 Result Status

| Status | Description |
|--------|-------------|
| Registered | Username exists on this platform |
| Not Found | Username is not registered |
| Manual Verify | Requires human confirmation |
| Error | Request failed or network error |

## 🛑 Shutdown

Press `Y` in the launcher window to clean up processes and port bindings before exit.

## 📄 License

MIT License
