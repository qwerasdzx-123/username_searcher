// 本地代理服务器 - 通过 HTTP 代理转发请求
// 用于解决前端无法直接使用系统代理的问题
'use strict';

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');

// ============================================================
// 配置
// ============================================================
const PROXY_HOST = '192.168.1.29';
const PROXY_PORT = 7897;
const SERVER_PORT = 8899;
const MAX_CONCURRENT = 6;  // 最大并发连接数

// ============================================================
// 并发控制
// ============================================================
let activeRequests = 0;
const pendingQueue = [];

function processQueue() {
    while (pendingQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
        const next = pendingQueue.shift();
        activeRequests++;
        next().finally(() => {
            activeRequests--;
            processQueue();
        });
    }
}

// ============================================================
// 解压响应内容
// ============================================================
function decompressResponse(buffer, headers) {
    const encoding = (headers['content-encoding'] || '').toLowerCase();
    try {
        if (encoding === 'gzip') return zlib.gunzipSync(buffer);
        if (encoding === 'deflate') return zlib.inflateSync(buffer);
        if (encoding === 'br') return zlib.brotliDecompressSync(buffer);
    } catch (e) {
        // 解压失败，返回原始 buffer
        console.error(`[解压失败] ${encoding}: ${e.message}`);
    }
    return buffer;
}

function getCharset(headers) {
    const contentType = headers['content-type'] || '';
    const match = contentType.match(/charset=([^\s;"]+)/i);
    if (match) {
        return match[1].toLowerCase().replace(/^utf-?8$/i, 'utf8');
    }
    return 'utf8';
}

// ============================================================
// 通过 HTTP CONNECT 代理隧道获取 HTTPS 网页内容
// ============================================================
function fetchViaConnectProxy(targetUrl, timeout = 25000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let connectReq = null;
        let httpsReq = null;
        let socket = null;
        let connectResStream = null;
        const startTime = Date.now();
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                cleanup();
                reject(new Error('请求超时'));
            }
        }, timeout);

        function cleanup() {
            clearTimeout(timer);
            if (httpsReq) { try { httpsReq.destroy(); } catch (e) {} }
            if (socket) { try { socket.destroy(); } catch (e) {} }
            if (connectReq) { try { connectReq.destroy(); } catch (e) {} }
        }

        try {
            const parsedUrl = new URL(targetUrl);
            const isHttps = parsedUrl.protocol === 'https:';

            if (!isHttps) {
                fetchViaHttpProxy(targetUrl, timeout)
                    .then(result => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } })
                    .catch(err => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } });
                return;
            }

            // HTTPS 请求：使用 CONNECT 方法建立隧道
            connectReq = http.request({
                host: PROXY_HOST,
                port: PROXY_PORT,
                method: 'CONNECT',
                path: `${parsedUrl.hostname}:${parsedUrl.port || 443}`,
                timeout: timeout,
                headers: {
                    'Proxy-Connection': 'Keep-Alive'
                }
            });

            connectReq.on('connect', (res, sock) => {
                if (settled) { sock.destroy(); return; }
                socket = sock;
                connectResStream = res;

                // 消费 CONNECT 响应流，防止内存泄漏
                res.on('data', () => {});
                res.on('end', () => {});

                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: 'GET',
                    socket: socket,
                    agent: false,
                    rejectUnauthorized: false,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Host': parsedUrl.hostname,
                        'Accept-Encoding': 'gzip, deflate'
                    }
                };

                httpsReq = https.request(options, (httpsRes) => {
                    // 处理 3xx 重定向：跟随重定向获取最终页面内容
                    if (httpsRes.statusCode >= 300 && httpsRes.statusCode < 400) {
                        const location = httpsRes.headers['location'];
                        if (location && !settled) {
                            // 跟随重定向
                            try {
                                const redirectUrl = new URL(location, targetUrl);
                                console.log(`[重定向跟随] ${targetUrl.substring(0,60)} -> ${redirectUrl.href.substring(0,60)}`);
                                // 递归调用 fetchViaConnectProxy 跟随重定向（最多跟3次）
                                const redirectCount = (options._redirectCount || 0) + 1;
                                if (redirectCount > 3) {
                                    if (!settled) {
                                        settled = true;
                                        clearTimeout(timer);
                                        resolve({ status: httpsRes.statusCode, headers: httpsRes.headers, body: '' });
                                    }
                                    return;
                                }
                                const newOptions = { ...options, _redirectCount: redirectCount };
                                fetchViaConnectProxy(redirectUrl.href, timeout - (Date.now() - startTime))
                                    .then(result => {
                                        if (!settled) { settled = true; clearTimeout(timer); resolve(result); }
                                    })
                                    .catch(err => {
                                        if (!settled) {
                                            // 重定向失败时返回原始状态
                                            settled = true;
                                            clearTimeout(timer);
                                            resolve({ status: httpsRes.statusCode, headers: httpsRes.headers, body: '' });
                                        }
                                    });
                            } catch (e) {
                                if (!settled) { settled = true; clearTimeout(timer); resolve({ status: httpsRes.statusCode, headers: httpsRes.headers, body: '' }); }
                            }
                            return;
                        }
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve({ status: httpsRes.statusCode, headers: httpsRes.headers, body: '' });
                        }
                        return;
                    }

                    const chunks = [];
                    httpsRes.on('data', (chunk) => { chunks.push(chunk); });
                    httpsRes.on('end', () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        try {
                            const rawBuffer = Buffer.concat(chunks);
                            const decompressed = decompressResponse(rawBuffer, httpsRes.headers);
                            const charset = getCharset(httpsRes.headers);
                            resolve({
                                status: httpsRes.statusCode,
                                headers: httpsRes.headers,
                                body: decompressed.toString(charset)
                            });
                        } catch (e) {
                            reject(new Error('响应处理失败: ' + e.message));
                        }
                    });
                    httpsRes.on('error', (err) => {
                        if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(err); }
                    });
                });

                httpsReq.setTimeout(timeout, () => {
                    if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error('HTTPS请求超时')); }
                });

                httpsReq.on('error', (err) => {
                    if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(err); }
                });

                httpsReq.end();
            });

            connectReq.on('error', (err) => {
                if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(err); }
            });

            connectReq.on('timeout', () => {
                if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error('代理连接超时')); }
            });

            connectReq.end();

        } catch (err) {
            if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        }
    });
}

// ============================================================
// 通过 HTTP 代理获取 HTTP 网页（非 HTTPS）
// ============================================================
function fetchViaHttpProxy(targetUrl, timeout = 25000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let proxyReq = null;
        const timer = setTimeout(() => {
            if (!settled) { settled = true; if (proxyReq) proxyReq.destroy(); reject(new Error('请求超时')); }
        }, timeout);

        try {
            const parsedUrl = new URL(targetUrl);

            proxyReq = http.request({
                hostname: PROXY_HOST,
                port: PROXY_PORT,
                method: 'GET',
                path: targetUrl,
                timeout: timeout,
                headers: {
                    'Host': parsedUrl.hostname,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate'
                }
            }, (res) => {
                // 处理 3xx 重定向：跟随获取最终内容
                if (res.statusCode >= 300 && res.statusCode < 400) {
                    const location = res.headers['location'];
                    if (location && !settled) {
                        try {
                            const redirectUrl = new URL(location, targetUrl);
                            console.log(`[HTTP重定向跟随] ${targetUrl.substring(0,60)} -> ${redirectUrl.href.substring(0,60)}`);
                            fetchViaHttpProxy(redirectUrl.href, timeout)
                                .then(result => {
                                    if (!settled) { settled = true; clearTimeout(timer); resolve(result); }
                                })
                                .catch(err => {
                                    if (!settled) { settled = true; clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: '' }); }
                                });
                        } catch (e) {
                            if (!settled) { settled = true; clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: '' }); }
                        }
                        return;
                    }
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve({ status: res.statusCode, headers: res.headers, body: '' });
                    }
                    return;
                }

                const chunks = [];
                res.on('data', (chunk) => { chunks.push(chunk); });
                res.on('end', () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    try {
                        const rawBuffer = Buffer.concat(chunks);
                        const decompressed = decompressResponse(rawBuffer, res.headers);
                        const charset = getCharset(res.headers);
                        resolve({ status: res.statusCode, headers: res.headers, body: decompressed.toString(charset) });
                    } catch (e) {
                        reject(new Error('响应处理失败: ' + e.message));
                    }
                });
                res.on('error', (err) => {
                    if (!settled) { settled = true; clearTimeout(timer); reject(err); }
                });
            });

            proxyReq.on('timeout', () => {
                if (!settled) { settled = true; clearTimeout(timer); proxyReq.destroy(); reject(new Error('请求超时')); }
            });

            proxyReq.on('error', (err) => {
                if (!settled) { settled = true; clearTimeout(timer); reject(err); }
            });

            proxyReq.end();
        } catch (err) {
            if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        }
    });
}

// ============================================================
// HTTP 服务器 - 处理前端代理请求
// ============================================================
const server = http.createServer((req, res) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Target-Url, X-Timeout');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 健康检查
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', proxy: `${PROXY_HOST}:${PROXY_PORT}`, activeRequests, maxConcurrent: MAX_CONCURRENT }));
        return;
    }

    // 代理请求
    if (req.url === '/proxy' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const executeRequest = async () => {
                try {
                    const { url, timeout = 25000 } = JSON.parse(body);

                    if (!url) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: '缺少 url 参数' }));
                        return;
                    }

                    console.log(`[代理] ${new Date().toLocaleTimeString()} - 请求(${activeRequests}/${MAX_CONCURRENT}): ${url.substring(0, 80)}`);
                    const result = await fetchViaConnectProxy(url, timeout);
                    console.log(`[代理] ${new Date().toLocaleTimeString()} - 完成: HTTP ${result.status}, ${result.body.length} 字节`);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: result.status,
                        headers: result.headers,
                        body: result.body
                    }));
                } catch (error) {
                    console.error(`[代理] ${new Date().toLocaleTimeString()} - 错误: ${error.message}`);
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                }
            };

            // 并发控制
            if (activeRequests >= MAX_CONCURRENT) {
                pendingQueue.push(executeRequest);
            } else {
                activeRequests++;
                executeRequest().finally(() => {
                    activeRequests--;
                    processQueue();
                });
            }
        });

        req.on('error', (err) => {
            console.error(`[请求错误] ${err.message}`);
        });

        return;
    }

    // 未知路径
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '未知路径' }));
});

// ============================================================
// 防止未捕获异常导致服务器崩溃
// ============================================================
process.on('uncaughtException', (err) => {
    console.error(`[未捕获异常] ${err.message}`, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error(`[未处理的 Promise 拒绝]`, reason);
});

// ============================================================
// 启动
// ============================================================
server.listen(SERVER_PORT, () => {
    console.log('========================================');
    console.log('  本地代理服务器已启动');
    console.log(`  上游代理: http://${PROXY_HOST}:${PROXY_PORT}`);
    console.log(`  服务地址: http://localhost:${SERVER_PORT}`);
    console.log(`  代理端点: POST http://localhost:${SERVER_PORT}/proxy`);
    console.log(`  健康检查: GET  http://localhost:${SERVER_PORT}/health`);
    console.log(`  最大并发: ${MAX_CONCURRENT}`);
    console.log('========================================');
});
