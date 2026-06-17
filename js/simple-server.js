// 简单静态文件服务器 - 测试用
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const LOG_DIR = path.join(BASE, 'log');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

// 确保 log 目录存在
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 获取当天的日志文件路径
function getLogFilePath() {
    const dateStr = new Date().toISOString().slice(0, 10);
    return path.join(LOG_DIR, `log_${dateStr}.txt`);
}

http.createServer((req, res) => {
    // 日志写入接口
    if (req.method === 'POST' && req.url === '/api/log') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const logFile = getLogFilePath();
                fs.appendFile(logFile, body + '\n', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ ok: true }));
                    }
                });
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    let filePath = req.url === '/' ? '/index.html' : req.url;
    // 解码 URL 编码的中文字符，否则中文文件名会找不到文件
    filePath = decodeURIComponent(filePath);
    filePath = path.join(BASE, filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found: ' + req.url);
        } else {
            const ext = path.extname(filePath);
            res.writeHead(200, {
                'Content-Type': MIME[ext] || 'text/plain',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
            });
            res.end(data);
        }
    });
}).listen(8888, () => {
    console.log('Test server running at http://localhost:8888');
});
