<div align="center">

# 🌐 OSINT Global Identity Tracker

### UserSearch Pro — Advanced OSINT Identity Tracker

**Cross-platform username deep search engine — Detect registration status across 100+ mainstream social platforms in seconds, precisely locate target digital footprints.**

[![Showcase](https://img.shields.io/badge/Showcase-demo-6366f1?style=flat-square&logo=github)](https://qwerasdzx-123.github.io/username_searcher/showcase.html) 
[![Issues](https://img.shields.io/badge/Issues-report-ef4444?style=flat-square&logo=github)](https://github.com/qwerasdzx-123/username_searcher/issues)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[![GitHub](https://img.shields.io/badge/GitHub-@qwerasdzx--123-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/qwerasdzx-123) 
[![X/Twitter](https://img.shields.io/badge/X-@kalaspace002-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/kalaspace002)

<a href="./README.zh.md">🇨🇳 中文</a> • <a href="./README.md">🇺🇸 English</a>

</div>

---

## ✨ Core Features

### 🔍 **Intelligent Search Engine**
- **100+ Mainstream Platforms Coverage** — Spans global social media, professional communities, niche forums, and more (based on `data/社交网站及用户页面.json`)
- **Dual Query Modes** — Switch between Precision Matching (exact verification) and Fuzzy Matching (variant discovery)
- **Dynamic Rule Database** — Maigret-style `sites-db.json` for flexible validation rule expansion
- **SPA Page Detection** — Smart identification of user states on single-page apps like Instagram, TikTok, Facebook

### ⚡ **High-Performance Architecture**
- **Adjustable Concurrency** — Configurable 1–20 concurrent requests, balancing speed and stability
- **Dual Proxy Modes** — Seamless switching between local proxy (HTTP CONNECT tunnel) and direct connection
- **Smart Timeout Strategy** — Dynamic timeout thresholds (8s–30s) based on site characteristics
- **Batch Result Processing** — DocumentFragment-optimized DOM updates to prevent interface lag

### 🎨 **Professional User Interface**
- **OSINT Tech Aesthetic** — Gradient colors, glassmorphism effects, radar scan animated icons
- **Dark/Light Themes** — One-click toggle with preferences auto-saved to localStorage
- **Bilingual Interface** — All labels, buttons, and descriptions feature Chinese-English dual display
- **Real-time Progress Tracking** — Visual progress bar + categorized stat cards (Found/Not Found/Manual Verify/Error)

### 🛠️ **Advanced Features**
- **Smart Filtering System** — Click stat cards to filter results by status instantly
- **Username Permutation Generator** — Permutator algorithm auto-generates variants (e.g., `user_name`, `user-name`)
- **Local Logging** — Automatic date-based log archiving to `log/` directory
- **Result Export** — JSON/CSV format export for further analysis
- **Test Mode** — Check only the first 5 sites for quick functionality validation

## 📋 Requirements

- **Node.js** ≥ 14.0 (Latest LTS recommended)
- **Operating System**: Windows / macOS / Linux
- **Browser**: Modern browsers supporting ES6+ (Chrome, Firefox, Edge, etc.)
- **Network**: Proxy configuration recommended for accessing international social platforms

## 🚀 Quick Start

### Method 1: One-Click Launch (Recommended)

1. **Double-click** [`启动服务器.bat`](../启动服务器.bat) (Windows)
2. Browser automatically opens frontend at: `http://localhost:8888`
3. Enter target username, select query mode (Precise/Fuzzy)
4. Click **「Start Search」** button to view real-time results
5. Filter interesting results via top stat cards
6. Press **Y** key to safely exit (auto-cleanup port bindings)

### Method 2: Manual Start

```bash
# Terminal 1: Start local proxy server (port 8899)
node js/proxy-server.js

# Terminal 2: Start static file server (port 8888)
node js/simple-server.js
```

Then visit in browser: **`http://localhost:8888`**

> 💡 **Note**: Default proxy is configured as `192.168.1.29:7897`. To modify, edit `PROXY_HOST` and `PROXY_PORT` constants in [`js/proxy-server.js`](../js/proxy-server.js).

## 📊 Result Status

| Status | Description | Typical Scenarios |
|--------|-------------|-------------------|
| ✅ **Found** | Username confirmed to exist on platform | Personal homepage or profile page detected |
| ❌ **Not Found** | Username not registered on platform | Returns 404 or explicit "user not found" message |
| ⚠️ **Manual Verify** | Cannot auto-determine, requires human confirmation | SPA pages, login walls, anti-bot verification, insufficient content |
| 🔴 **Error** | Request failed or network error | Timeout, connection refused, proxy failure (HTTP 502) |

### Detection Methods

The system employs multi-dimensional verification strategies:
- **HTTP Status Codes**: Quick pre-judgment via 404/403/429 status codes
- **Keyword Matching**: Feature word libraries from `sites-db.json` (presence/absence strs)
- **Title Tag Analysis**: Checks if page title contains username (for SPA sites like Instagram/Pinterest)
- **Content Length Assessment**: Compares page byte count against preset thresholds
- **Anti-Bot Recognition**: Auto-detects Cloudflare Challenge, JavaScript verification pages

## 🗂️ Project Structure

```
username_searcher/
├── 📄 index.html              # Main page (UI entry point)
├── 📄 showcase.html           # Feature showcase demo page
├── 🚀 启动服务器.bat          # One-click launch script (Windows)
│
├── 📁 js/                     # JavaScript source code
│   ├── app.js                 # Frontend main logic (search engine, UI interaction)
│   ├── proxy-server.js        # Local proxy server (HTTP CONNECT tunnel)
│   ├── simple-server.js       # Static file server + logging API
│   └── shared-constants.js    # Shared constants and utility functions
│
├── 📁 css/                    # Stylesheets
│   └── styles.css             # Global styles (dark/light theme variables)
│
├── 📁 data/                   # Data files
│   ├── sites-db.json          # Dynamic validation rule database (Maigret-style)
│   └── 社交网站及用户页面.json # Site list and URL templates (104 sites)
│
├── 📁 docs/                   # Documentation
│   ├── README.md              # English documentation (this file)
│   └── README.zh.md           # Chinese documentation
│
└── 📁 log/                    # Runtime logs (auto-generated by date)
    └── log_YYYY-MM-DD.txt
```

## ⚙️ Configuration

### Proxy Server Configuration

Edit [`js/proxy-server.js`](../js/proxy-server.js):

```javascript
const PROXY_HOST = '192.168.1.29';  // Upstream proxy address
const PROXY_PORT = 7897;            // Upstream proxy port
const SERVER_PORT = 8899;           // Local proxy service port
const MAX_CONCURRENT = 6;           // Maximum concurrent requests
```

### Frontend Service Configuration

Edit [`js/simple-server.js`](../js/simple-server.js):

```javascript
const PORT = 8888;  // Frontend access port
```

### Concurrency Adjustment

Modify the "Concurrency" input box directly in the frontend UI (1–20). Settings are auto-saved to `localStorage`.

## 🛑 Shutdown

Press **Y** key in the launcher window to:
1. Automatically terminate background Node.js processes
2. Clean up port 8888/8899 bindings
3. Exit safely

> ⚠️ **Note**: Directly closing the window may leave port residues, which will be auto-cleaned on next startup.

## 🔧 FAQ

### Q1: Why do many sites show "Manual Verify"?

A: The following scenarios trigger manual verification flags:
- **SPA Single-Page Applications**: Instagram, TikTok, etc., require JavaScript rendering; HTTP proxies cannot retrieve complete HTML
- **Login Walls**: Facebook, LinkedIn, etc., require login to view user profiles
- **Anti-Bot Mechanisms**: Cloudflare Challenge, CAPTCHA verification pages
- **Insufficient Content**: Page byte count below threshold, inadequate keyword matches

**Solution**: Click the "Manual Verify" link to open the target page directly in your browser for human confirmation.

### Q2: How to improve search speed?

A: Key optimization directions:
- Replace with high-performance proxy server (currently using home proxy `192.168.1.29:7897`)
- Enable "Popular Sites Only" filter to reduce detection count
- Adjust concurrency to 5–10 (ensure proxy server has sufficient performance)
- Use "Test Mode" for quick functionality validation
- Implement request caching mechanism (85-90% faster for repeated searches)

### Q3: How to add new detection sites?

A: Edit [`data/社交网站及用户页面.json`](../data/社交网站及用户页面.json) and add entries in the following format:

```json
{
  "domain": "example.com",
  "url": "https://example.com/user/{username}",
  "type": "Social Media",
  "nsfw": "false",
  "global_rank": 1000
}
```

For custom validation rules, add corresponding domain rules in [`data/sites-db.json`](../data/sites-db.json).

### Q4: Where are log files saved?

A: All runtime logs are automatically saved to the [`log/`](../log/) directory, named by date (e.g., `log_2026-06-17.txt`). You can also click the "Export Logs" button in the frontend UI to download.

## 📈 Future Optimization Roadmap

Planned optimization directions:
- 🔥 **High Priority**: Replace proxy server, smart timeout strategy, proxy health checks
- ⚡ **Medium Priority**: Request caching, batch DOM updates, virtual scrolling
- 🛠️ **Low Priority**: Resume from breakpoint, multi-proxy load balancing, rate limiting optimization

Expected optimization results:
- **First search**: Estimated 50-70% faster through proxy and timeout optimization
- **Repeated searches**: Estimated 85-90% faster after implementing caching

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. **Report Bugs**: Describe issues in detail in [Issues](https://github.com/qwerasdzx-123/username_searcher/issues)
2. **Feature Requests**: Explain use cases and expected outcomes
3. **Code Contributions**:
   - Fork the repository
   - Create a feature branch (`git checkout -b feature/AmazingFeature`)
   - Commit changes (`git commit -m 'Add some AmazingFeature'`)
   - Push to branch (`git push origin feature/AmazingFeature`)
   - Open a Pull Request

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Made with ❤️ by [kalaspace](https://github.com/qwerasdzx-123)**

[![GitHub](https://img.shields.io/badge/GitHub-@qwerasdzx--123-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/qwerasdzx-123) 
[![X/Twitter](https://img.shields.io/badge/X-@kalaspace002-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/kalaspace002)

</div>
