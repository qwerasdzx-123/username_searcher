// 本地代理服务器（SOLID重构版）- 通过 HTTP 代理转发请求
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
const MAX_CONCURRENT = 6;
const MAX_REDIRECTS = 3;

// ============================================================
// 共享请求头（消除重复）
// ============================================================
const DEFAULT_HEADERS = Object.freeze({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate'
});

// ============================================================
// 并发控制
// ============================================================
let activeRequests = 0;
const pendingQueue = [];

function processQueue() {
    while (pendingQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
        const nextRequest = pendingQueue.shift();
        activeRequests++;
        nextRequest().finally(() => { activeRequests--; processQueue(); });
    }
}

// ============================================================
// 工具函数
// ============================================================
function decompressResponse(buffer, headers) {
    const encoding = (headers['content-encoding'] || '').toLowerCase();
    try {
        if (encoding === 'gzip') return zlib.gunzipSync(buffer);
        if (encoding === 'deflate') return zlib.inflateSync(buffer);
        if (encoding === 'br') return zlib.brotliDecompressSync(buffer);
    } catch (e) { console.error(`[解压失败] ${encoding}: ${e.message}`); }
    return buffer;
}

function getCharset(headers) {
    const contentType = headers['content-type'] || '';
    const match = contentType.match(/charset=([^\s;"]+)/i);
    return match ? match[1].toLowerCase().replace(/^utf-?8$/i, 'utf8') : 'utf8';
}

/**
 * 收集响应体（消除 fetchViaConnectProxy 和 fetchViaHttpProxy 中的重复逻辑）
 */
function collectResponseBody(response, isSettledRef, timer) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
            if (isSettledRef.settled) return;
            isSettledRef.settled = true;
            clearTimeout(timer);
            try {
                const rawBuffer = Buffer.concat(chunks);
                const decompressed = decompressResponse(rawBuffer, response.headers);
                const charset = getCharset(response.headers);
                resolve({ status: response.statusCode, headers: response.headers, body: decompressed.toString(charset) });
            } catch (e) {
                reject(new Error('响应处理失败: ' + e.message));
            }
        });
        response.on('error', err => {
            if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); reject(err); }
        });
    });
}

/**
 * 处理 HTTP 3xx 重定向（消除两处重复逻辑）
 */
function handleRedirect(originalUrl, statusCode, headers, isSettledRef, timer, timeout, startTime, fetchFn) {
    const location = headers['location'];
    if (!location || isSettledRef.settled) {
        if (!isSettledRef.settled) {
            isSettledRef.settled = true;
            clearTimeout(timer);
            return Promise.resolve({ status: statusCode, headers, body: '' });
        }
        return Promise.resolve(null);
    }

    try {
        const redirectUrl = new URL(location, originalUrl);
        console.log(`[重定向跟随] ${originalUrl.substring(0, 60)} -> ${redirectUrl.href.substring(0, 60)}`);
        const redirectCount = (headers._redirectCount || 0) + 1;
        if (redirectCount > MAX_REDIRECTS) {
            isSettledRef.settled = true;
            clearTimeout(timer);
            return Promise.resolve({ status: statusCode, headers, body: '' });
        }
        const remainingTime = timeout - (Date.now() - startTime);
        return fetchFn(redirectUrl.href, remainingTime > 0 ? remainingTime : timeout, redirectCount)
            .then(result => {
                if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); return result; }
                return null;
            })
            .catch(() => {
                if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); return { status: statusCode, headers, body: '' }; }
                return null;
            });
    } catch (e) {
        if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); return Promise.resolve({ status: statusCode, headers, body: '' }); }
        return Promise.resolve(null);
    }
}

// ============================================================
// 通过 HTTP CONNECT 代理隧道获取 HTTPS 网页内容
// ============================================================
function fetchViaConnectProxy(targetUrl, timeout = 25000, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const isSettledRef = { settled: false };
        let connectRequest = null, httpsRequest = null, tunnelSocket = null;
        const startTime = Date.now();

        const timer = setTimeout(() => {
            if (!isSettledRef.settled) { isSettledRef.settled = true; cleanup(); reject(new Error('请求超时')); }
        }, timeout);

        function cleanup() {
            clearTimeout(timer);
            [httpsRequest, tunnelSocket, connectRequest].forEach(r => { try { r && r.destroy(); } catch (e) {} });
        }

        try {
            const parsedUrl = new URL(targetUrl);

            if (parsedUrl.protocol !== 'https:') {
                fetchViaHttpProxy(targetUrl, timeout, redirectCount)
                    .then(r => { if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); resolve(r); } })
                    .catch(err => { if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); reject(err); } });
                return;
            }

            connectRequest = http.request({
                host: PROXY_HOST, port: PROXY_PORT, method: 'CONNECT',
                path: `${parsedUrl.hostname}:${parsedUrl.port || 443}`,
                timeout, headers: { 'Proxy-Connection': 'Keep-Alive' }
            });

            connectRequest.on('connect', (res, sock) => {
                if (isSettledRef.settled) { sock.destroy(); return; }
                tunnelSocket = sock;
                res.on('data', () => {});
                res.on('end', () => {});

                const options = {
                    hostname: parsedUrl.hostname, port: parsedUrl.port || 443,
                    path: parsedUrl.pathname + parsedUrl.search, method: 'GET',
                    socket: tunnelSocket, agent: false, rejectUnauthorized: false,
                    headers: { ...DEFAULT_HEADERS, 'Host': parsedUrl.hostname, _redirectCount: redirectCount }
                };

                httpsRequest = https.request(options, async (httpsResponse) => {
                    if (httpsResponse.statusCode >= 300 && httpsResponse.statusCode < 400) {
                        const result = await handleRedirect(targetUrl, httpsResponse.statusCode, httpsResponse.headers,
                            isSettledRef, timer, timeout, startTime, fetchViaConnectProxy);
                        if (result) resolve(result);
                        return;
                    }
                    collectResponseBody(httpsResponse, isSettledRef, timer).then(resolve).catch(reject);
                });

                httpsRequest.setTimeout(timeout, () => {
                    if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); cleanup(); reject(new Error('HTTPS请求超时')); }
                });
                httpsRequest.on('error', err => {
                    if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); cleanup(); reject(err); }
                });
                httpsRequest.end();
            });

            connectRequest.on('error', err => {
                if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); cleanup(); reject(err); }
            });
            connectRequest.on('timeout', () => {
                if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); cleanup(); reject(new Error('代理连接超时')); }
            });
            connectRequest.end();
        } catch (err) {
            if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); reject(err); }
        }
    });
}

// ============================================================
// 通过 HTTP 代理获取 HTTP 网页（非 HTTPS）
// ============================================================
function fetchViaHttpProxy(targetUrl, timeout = 25000, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const isSettledRef = { settled: false };
        let proxyRequest = null;

        const timer = setTimeout(() => {
            if (!isSettledRef.settled) { isSettledRef.settled = true; if (proxyRequest) proxyRequest.destroy(); reject(new Error('请求超时')); }
        }, timeout);

        try {
            const parsedUrl = new URL(targetUrl);

            proxyRequest = http.request({
                hostname: PROXY_HOST, port: PROXY_PORT, method: 'GET',
                path: targetUrl, timeout,
                headers: { ...DEFAULT_HEADERS, 'Host': parsedUrl.hostname, _redirectCount: redirectCount }
            }, async (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400) {
                    const result = await handleRedirect(targetUrl, response.statusCode, response.headers,
                        isSettledRef, timer, timeout, Date.now(), fetchViaHttpProxy);
                    if (result) resolve(result);
                    return;
                }
                collectResponseBody(response, isSettledRef, timer).then(resolve).catch(reject);
            });

            proxyRequest.on('timeout', () => {
                if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); proxyRequest.destroy(); reject(new Error('请求超时')); }
            });
            proxyRequest.on('error', err => {
                if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); reject(err); }
            });
            proxyRequest.end();
        } catch (err) {
            if (!isSettledRef.settled) { isSettledRef.settled = true; clearTimeout(timer); reject(err); }
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
