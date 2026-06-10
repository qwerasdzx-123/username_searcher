/**
 * 共享常量模块
 * 提取 app.js 和 proxy-server.js 中的重复常量，消除魔术字符串
 */
'use strict';

// ============================================================
// 方法标识常量（消除 "manual-verify" 等魔术字符串）
// ============================================================
const METHOD = Object.freeze({
    HTTP_STATUS: 'http-status',
    HTTP_STATUS_DIRECT: 'http-status-direct',
    NOT_FOUND_KEYWORDS: 'notFoundKeywords',
    FOUND_KEYWORDS: 'foundKeywords',
    KEYWORD_COMPARISON: 'keywordComparison',
    LENGTH_FALLBACK: 'lengthFallback',
    CONTENT_LENGTH_ONLY: 'contentLengthOnly',
    VERY_SHORT_CONTENT: 'veryShortContent',
    UNIVERSAL_NOT_FOUND: 'universalNotFoundKeywords',
    UNIVERSAL_FOUND: 'universalFoundKeywords',
    UNIVERSAL_COMPARISON: 'universalComparison',
    LENGTH_ONLY: 'lengthOnly',
    MEDIUM_CONTENT: 'mediumContent',
    INSUFFICIENT_CONTENT: 'insufficientContent',
    FUZZY_MATCH: 'fuzzy-match',
    MANUAL_VERIFY: 'manual-verify',
    TITLE_ERROR_FALLBACK: 'titleErrorFallback',
    FOUND_KEYWORDS_SHORT: 'foundKeywordsShort'
});

// ============================================================
// SPA 壳子检测模式（消除 applyConfiguredRules / applyUniversalRules 重复）
// ============================================================
const SPA_SHELL_PATTERNS = Object.freeze([
    /<app-root>\s*<\/app-root>/i,
    /<div\s+id=["']root["']\s*>\s*<\/div>/i,
    /<div\s+id=["']app["']\s*>\s*<\/div>/i,
    /<noscript>[\s\S]*?javascript is required[\s\S]*?<\/noscript>/i
]);

// ============================================================
// 反爬虫检测关键词（消除多处重复）
// ============================================================
const ANTI_BOT_KEYWORDS = Object.freeze([
    'just a moment', 'enable javascript', 'please enable javascript',
    'client challenge', 'checking your browser', 'ddos protection',
    'please turn javascript on', 'ctrl+f5', 'ctrl+shift+r'
]);

// ============================================================
// HTTP 请求头常量（消除 proxy-server.js 两处 + app.js 一处重复）
// ============================================================
const DEFAULT_REQUEST_HEADERS = Object.freeze({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
});

// ============================================================
// 手工验证结果工厂（消除 15+ 处重复的返回对象）
// ============================================================
function createManualVerifyResult(reason, proxy = 'local-proxy', extraDetails = {}) {
    return {
        found: false,
        message: '需手工验证',
        confidence: 0,
        details: {
            httpStatus: extraDetails.httpStatus || 0,
            contentLength: extraDetails.contentLength || 0,
            notFoundMatches: [`[需手工验证-${reason}]`],
            foundMatches: [],
            method: METHOD.MANUAL_VERIFY,
            proxy: proxy,
            ...extraDetails
        }
    };
}

// ============================================================
// SPA 壳子检测函数（消除两处完全相同的循环）
// ============================================================
function isSpaShell(text) {
    return SPA_SHELL_PATTERNS.some(pattern => pattern.test(text));
}

// ============================================================
// 反爬虫页面检测（消除多处分散的判断）
// ============================================================
function isAntiBotPage(lowerText, contentLength = Infinity) {
    const hasKeyword = ANTI_BOT_KEYWORDS.some(kw => lowerText.includes(kw));
    if (hasKeyword) return true;

    // 额外的人机验证特征
    return (
        lowerText.includes('it needs a human touch') ||
        lowerText.includes('are you a human') ||
        lowerText.includes('cf-browser-verification') ||
        lowerText.includes('please verify you are a human') ||
        lowerText.includes('recaptcha') ||
        lowerText.includes('g-recaptcha') ||
        (lowerText.includes('access denied') && contentLength < 5000) ||
        (lowerText.includes('captcha') && contentLength < 10000)
    );
}

// ============================================================
// 错误页面检测（消除多处重复）
// ============================================================
function isErrorPage(lowerText) {
    return (
        lowerText.includes('sorry, something went wrong') ||
        lowerText.includes('sorry, we couldn\'t find') ||
        lowerText.includes('error occurred') ||
        (lowerText.includes('<title>error</title>') && lowerText.includes('facebook'))
    );
}

// ============================================================
// 需要登录页面检测
// ============================================================
function isLoginRequired(lowerText) {
    return (
        lowerText.includes('login') || lowerText.includes('sign in') ||
        (lowerText.includes('redirect') && lowerText.includes('login'))
    );
}

// ============================================================
// 错误标题关键词检测
// ============================================================
const ERROR_TITLE_KEYWORDS = Object.freeze([
    'error', '错误', 'not found', 'doesn\'t exist', 'does not exist',
    'page not found', 'user not found', '404', '找不到',
    '页面不存在', '用户不存在', 'エラー'
]);

// ============================================================
// 导出
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        METHOD, SPA_SHELL_PATTERNS, ANTI_BOT_KEYWORDS,
        DEFAULT_REQUEST_HEADERS, createManualVerifyResult,
        isSpaShell, isAntiBotPage, isErrorPage, isLoginRequired,
        ERROR_TITLE_KEYWORDS
    };
}
