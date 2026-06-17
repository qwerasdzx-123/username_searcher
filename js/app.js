// 用户名检索工具 - 主程序（SOLID重构版：精准存在性验证 + 日志 + 智能代理 + 查询模式）
'use strict';

// ============================================================
// 共享常量引用（来自 shared-constants.js，先于本文件加载）
//   METHOD, SPA_SHELL_PATTERNS, ANTI_BOT_KEYWORDS, ERROR_TITLE_KEYWORDS,
//   createManualVerifyResult, isSpaShell, isAntiBotPage, isErrorPage, isLoginRequired
// ============================================================
// 为保持向后兼容，创建本地别名（shared-constants.js 中函数名前无下划线）
const _createManualVerifyResult = createManualVerifyResult;
const _isSpaShell = isSpaShell;
const _isAntiBotPage = isAntiBotPage;
const _isErrorPage = isErrorPage;
const _isLoginRequired = isLoginRequired;

// ============================================================
// 零、日志系统
// ============================================================
class Logger {
    constructor() {
        this.logs = [];
        this.MAX_LOGS = 5000;
        this.listeners = [];
        this._logQueue = [];
        this._isFlushing = false;
        this._flushInterval = setInterval(() => this._flushToFile(), 3000);
    }

    _formatTime() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').slice(0, 19);
    }

    _flushToFile() {
        if (this._logQueue.length === 0 || this._isFlushing) return;
        this._isFlushing = true;
        const batch = this._logQueue.splice(0);
        const text = batch.join('\n') + '\n';
        fetch('http://localhost:8888/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: text
        }).catch(() => {}).finally(() => { this._isFlushing = false; });
    }

    _add(level, message, data = null) {
        const entry = {
            id: this.logs.length + 1,
            time: this._formatTime(),
            level: level,
            message: message,
            data: data
        };
        this.logs.push(entry);

        if (this.logs.length > this.MAX_LOGS) {
            this.logs = this.logs.slice(-this.MAX_LOGS);
        }

        this.listeners.forEach(callback => callback(entry));

        let line = `[${entry.time}] [${level.toUpperCase()}] ${message}`;
        if (data) line += ` | ${JSON.stringify(data)}`;
        this._logQueue.push(line);
    }

    info(msg, data) { this._add('info', msg, data); }
    warn(msg, data) { this._add('warn', msg, data); }
    error(msg, data) { this._add('error', msg, data); }
    debug(msg, data) { this._add('debug', msg, data); }

    getLogs(filterLevel = 'all') {
        if (filterLevel === 'all') return [...this.logs];
        return this.logs.filter(l => l.level === filterLevel);
    }

    getRecent(count = 100) {
        return this.logs.slice(-count);
    }

    clear() {
        this.logs = [];
        this.info('日志已清空');
    }

    onNewLog(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    exportAsText() {
        let output = '=== 用户名检索工具 - 运行日志 ===\n';
        output += `导出时间: ${this._formatTime()}\n`;
        output += `日志总数: ${this.logs.length}\n`;
        output += '='.repeat(60) + '\n\n';

        this.logs.forEach(entry => {
            output += `[${entry.time}] [${entry.level.toUpperCase()}] ${entry.message}\n`;
            if (entry.data) {
                output += `  Data: ${JSON.stringify(entry.data)}\n`;
            }
        });

        return output;
    }
}

// 全局日志实例
const logger = new Logger();


// ============================================================
// 一、智能代理管理器
// ============================================================
class ProxyManager {
    constructor() {
        // 全局代理模式：'local-proxy'（本地代理）或 'direct'（直连模式）
        this.mode = 'local-proxy';
        // 本地代理服务器地址
        this.localProxyUrl = 'http://localhost:8899/proxy';
    }

    setMode(mode) {
        this.mode = mode;
        const modeLabel = mode === 'local-proxy' ? '本地代理' : '直连模式';
        logger.info(`代理模式切换为: ${modeLabel}`);
    }

    /**
     * 为指定域名获取代理配置
     * 返回 null 表示直连，返回 'local' 表示使用本地代理
     */
    getProxiesForDomain(domain) {
        if (this.mode === 'direct') {
            logger.debug(`[代理] ${domain} - 直连模式`);
            return null;
        }

        // 本地代理模式
        logger.debug(`[代理] ${domain} - 本地代理模式 (${this.localProxyUrl})`);
        return 'local';
    }
}


// ============================================================
// 二、网站验证规则配置（可扩展的数据结构）
// ============================================================
const VERIFICATION_RULES = {
    // 基础规则将作为默认值，动态规则会从 sites-db.json 加载并覆盖
};

// ============================================================
// 用户名变体生成器 (Permutator)
// ============================================================
class Permutator {
    constructor(elements) {
        this.elements = elements;
        this.separators = ['', '_', '-', '.'];
    }

    gather(method = 'strict') {
        const permutations = {};
        const keys = Object.keys(this.elements);
        
        for (let i = 1; i <= keys.length; i++) {
            this._getCombinations(keys, i).forEach(subset => {
                if (i === 1) {
                    if (method === 'all') {
                        permutations[subset[0]] = this.elements[subset[0]];
                        permutations['_' + subset[0]] = this.elements[subset[0]];
                        permutations[subset[0] + '_'] = this.elements[subset[0]];
                    }
                } else {
                    this.separators.forEach(separator => {
                        const perm = subset.join(separator);
                        permutations[perm] = this.elements[subset[0]];
                        if (separator === '') {
                            permutations['_' + perm] = this.elements[subset[0]];
                            permutations[perm + '_'] = this.elements[subset[0]];
                        }
                    });
                }
            });
        }
        return permutations;
    }

    _getCombinations(arr, k) {
        if (k === 1) return arr.map(e => [e]);
        const result = [];
        for (let i = 0; i <= arr.length - k; i++) {
            const head = arr[i];
            const tailCombinations = this._getCombinations(arr.slice(i + 1), k - 1);
            tailCombinations.forEach(tail => result.push([head, ...tail]));
        }
        return result;
    }
}

// 临时保留部分内置规则作为回退（后续可逐步迁移至 JSON）
Object.assign(VERIFICATION_RULES, {
    'archive.org': {
        checkType: 'message',
        // 不存在时返回 "The search engine encountered an error, which might be related to your search query"
        // 2024年后 archive.org 改为 SPA，不存在时也返回首页壳子（<app-root>），需 JS 渲染
        absenceStrs: [
            'search engine encountered an error', 'might be related to your search query',
            'tips for constructing search queries', 'error, which might be related',
            'no results found', 'could not be found', 'not found'
        ],
        presenseStrs: [
            'uploads', 'favorites', 'reviews', 'forum posts', 'collections',
            'member since', 'items', 'views', 'followers'
        ],
        // SPA 壳子页面特征：只有 <app-root> 占位，内容极少（约1800-3000字节）
        // 这是 JS 渲染前的空壳，无法确定用户是否存在
        minContentLength: 8000,
        notFoundContentLength: 3000,
        scoreThreshold: 2
    },
    'github.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429, 500, 502, 503] },
        checkType: 'message',
        absenceStrs: [
            'not found', 'page doesn\'t exist', 'there isn\'t a github user',
            'this is not the web page you are looking for'
        ],
        presenseStrs: [
            'repositories', 'followers', 'contributions in the last year',
            'joined github', 'overview', 'block or report'
        ],
        minContentLength: 3000,
        notFoundContentLength: 800,
        scoreThreshold: 2
    },
    'reddit.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        checkType: 'message',
        absenceStrs: [
            'user not found', 'page not found', 'sorry, nobody on reddit goes by that name',
            'the person may have been banned', 'this account has been suspended'
        ],
        presenseStrs: [
            'karma', 'cake day', 'post karma', 'comment karma',
            'followers', 'overview', 'comments', 'submitted'
        ],
        minContentLength: 2500,
        notFoundContentLength: 600,
        scoreThreshold: 2
    },
    'twitter.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'this account doesn\'t exist', 'user not found', 'account suspended',
            'this page doesn\'t exist', 'something went wrong, but don\'t fret'
        ],
        foundKeywords: [
            'joined', 'following', 'followers', 'tweets',
            'tweets & replies', 'media', 'likes', 'verified'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'instagram.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'page not found', 'sorry, this page isn\'t available',
            'the link you followed may be broken'
        ],
        foundKeywords: [
            'posts', 'followers', 'following', 'is on instagram', 'message', 'follow'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'facebook.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'page not found', 'content not found', 'this page isn\'t available',
            'the link you followed may be broken', 'this content isn\'t available right now',
            'this page isn\'t available right now', 'the link may be broken',
            'sorry, this content isn\'t available', 'go to news feed',
            'find friends', 'create a page', 'create page'
        ],
        foundKeywords: [
            'friends', 'photos', 'posts', 'about', 'intro',
            'lives in', 'from', 'followed by', 'timeline', 'videos',
            'check-ins', 'sports', 'music', 'movies', 'tv shows',
            'books', 'likes', 'groups', 'events', 'reviews',
            'recently added', 'see more about', 'cover photo'
        ],
        minContentLength: 2500,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'youtube.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'this page isn\'t available', 'channel not found', 'doesn\'t exist', '404 not found'
        ],
        foundKeywords: [
            'videos', 'subscribers', 'joined', 'views', 'about',
            'channels', 'playlists', 'community'
        ],
        minContentLength: 2500,
        notFoundContentLength: 600,
        scoreThreshold: 2
    },
    'linkedin.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'page not found', 'member not found', 'profile not found', 'this page doesn\'t exist'
        ],
        foundKeywords: [
            'connections', 'about', 'experience', 'education',
            'skills', 'licenses', 'contact info', 'activity'
        ],
        minContentLength: 3000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'twitch.tv': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'this page doesn\'t exist',
            'sorry. unless you\'ve got a time machine', 'that content is unavailable'
        ],
        foundKeywords: [
            'followers', 'videos', 'clips', 'about', 'schedule',
            'chat', 'streaming', 'recent broadcasts'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'tiktok.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // TikTok "account not found" 页面是中文 SPA，返回 HTTP 200，内容包含：
        // - "找不到此账号" / "找不到此音乐" 等错误信息
        // - 同时也有 followers/following/videos 等导航词（在推荐区域）
        // - 同时 URL 中也包含用户名（推荐账号卡片）
        // 解决策略：精确的中文"不存在"关键词优先，foundKeywords 不使用泛化词
        notFoundKeywords: [
            // 中文错误信息
            '找不到此账号', '账号不存在', '用户不存在', '无法找到该账号',
            'couldn\'t find this account', 'couldn\'t find', 'account not found',
            'user not found', 'profile not found'
        ],
        // 移除 foundKeywords：followers/videos/likes 在 TikTok 的 404 页面也大量存在（推荐账号区域）
        // 不依赖 foundKeywords，只靠 notFoundKeywords 和 HTTP 状态码判定
        foundKeywords: [],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'instagram.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // Instagram 不存在账号时返回 HTTP 200，SPA 内容：
        // - Title 只显示 "Instagram"（存在时是 "@qy145222 • Instagram"）
        // - notFoundKeywords 中的中文/英文错误信息由 JS 渲染，服务器 HTML 中可能不存在
        // 核心检测：检查 <title> 是否包含 @username 格式
        notFoundKeywords: [
            // 中文错误信息（如果服务器 HTML 包含）
            '无法访问此页面', '你点击的链接可能已损坏', '页面已被移除',
            '很抱歉，无法访问', '该内容无法在你的所在地区查看',
            // 英文错误信息
            'sorry, this page isn\'t available', 'link you followed may have expired',
            'page isn\'t available', 'account not found', 'user not found',
            'this page is unavailable', 'no longer available'
        ],
        foundKeywords: [],
        // Instagram SPA 检测：Title 不包含 @username 时判定为不存在
        titleContainsUsername: true,
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'pinterest.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // Pinterest 不存在账号时返回 HTTP 200，SPA 页面：
        // - 服务器 HTML 中 Title 通常为空或 "Pinterest"
        // - URL 参数 show_error=true 表示出错（由 JS 渲染）
        // - 页面可能包含泛化词和用户名（来自 URL 区域）
        // 核心检测：Title 不包含用户名时判定为不存在
        notFoundKeywords: [
            'profile not found', 'user not found', 'doesn\'t exist', 'does not exist',
            'board not found', 'no longer available'
        ],
        foundKeywords: [],
        // Pinterest SPA 检测：Title 不包含 @username 或 "Pinterest" + username 时判定为不存在
        titleContainsUsername: true,
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'steamcommunity.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'the specified profile could not be found', 'profile not found',
            '无法找到指定的个人资料', '处理您的请求时遇到错误', '抱歉！',
            'steam 社区 :: 错误', 'steam社区 :: 错误'
        ],
        foundKeywords: [
            'recent activity', 'games', 'friends',
            'inventory', 'badges', 'screenshots', 'workshop items', 'reviews',
            'level', 'years of service', 'steam profile'
        ],
        minContentLength: 2000,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'pinterest.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'page not found', 'sorry! we couldn\'t find', 'we couldn\'t find that page'
        ],
        foundKeywords: ['pins', 'followers', 'following', 'boards', 'saved', 'created', 'tried'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'medium.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'page not found', 'user not found', 'this page is unavailable', 'out of the medium',
            'page that doesn\'t exist', 'out of nothing, something', 'even a page that doesn',
            'just a moment'  // Cloudflare 验证页面
        ],
        foundKeywords: [
            'articles', 'followers', 'following', 'clapped', 'about',
            'stories', 'responses', 'highlights', 'lists'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'imgur.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // Imgur 不存在时跳转到主页 + 弹窗 "The requested page could not be found"
        // 主页标题固定为 "Imgur: The magic of the Internet"，不同于用户页
        notFoundKeywords: [
            'requested page could not be found', 'could not be found',
            'page could not be found', 'not found on imgur',
            'the magic of the internet'  // 主页标题特征
        ],
        foundKeywords: [
            'posts', 'comments', 'favorites', 'albums',
            'about', 'joined', 'reputation', 'notoriety'
        ],
        minContentLength: 8000,
        notFoundContentLength: 7000,
        scoreThreshold: 2
    },
    'social.msdn.microsoft.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['user not found', 'page not found', 'profile not found'],
        foundKeywords: [
            'posts', 'reputation', 'badges', 'joined', 'answers', 'questions', 'tags', 'about me'
        ],
        minContentLength: 2000,
        notFoundContentLength: 300,
        scoreThreshold: 2
    },
    'zhihu.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            '页面不存在', '你似乎来到了没有知识存在的荒原', '404',
            '用户不存在', '该用户已注销', '秒后返回主页', '秒后回到首页',
            '您访问的页面不存在', '不存在', '未找到', '没有找到',
            // 代理可能 HTML 实体化或编码
            '&#29992;&#25143;&#19981;&#23384;&#22312;'
        ],
        foundKeywords: [
            '个人主页', '关注者', '关注了', '回答', '文章', '想法', '收藏', '知乎用户'
        ],
        minContentLength: 1500,
        notFoundContentLength: 500,
        scoreThreshold: 1
    },
    'trello.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // 不存在或私有页面返回 "页面不存在" + "此页面可能是私有页面，请先登录之后再查看"
        // 反爬虫时返回 "Trello" 标题 + "enable JavaScript" 提示
        notFoundKeywords: [
            '页面不存在', '此页面可能是私有页面', '请先登录之后再查看',
            '页面可能是私有页面', '可能是私有页面', 'page not found',
            'board not found', 'not found',
            'please enable javascript', 'ctrl+f5'
        ],
        foundKeywords: [
            'boards', 'cards', 'activity', 'bio', 'members', 'workspace'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'slideshare.net': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // 不存在时返回 "Page no longer exists" + "that page was deleted from the deck"
        // 反爬虫时返回 "Client Challenge" 验证页面
        notFoundKeywords: [
            'page no longer exists', 'no longer exists',
            'we said no blank pages', 'that page was deleted',
            'deleted from the deck', 'explore by category instead',
            'not found', 'client challenge'
        ],
        foundKeywords: [
            'slides', 'followers', 'following', 'uploads',
            'presentations', 'documents', 'about', 'contact'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'dailymotion.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // Dailymotion 是纯 SPA 渲染，代理模式下标题始终为 "Dailymotion"
        // 需要 JS 渲染才能判断用户是否存在，代理模式下标记为无法验证
        notFoundKeywords: [
            '好奇怪', '这个页面似乎不见了', '页面似乎不见了',
            'oops', 'this page seems to have disappeared', 'seems to have disappeared',
            'page not found', 'not found', "doesn't exist", 'does not exist',
            'no longer exists', "this page doesn't exist",
            "this user doesn't have any videos", 'no videos yet',
            "hasn't uploaded any videos", 'no content',
            'no results found', 'no uploads', 'nothing to show',
            'this channel is empty', 'this user has no content',
            "could not find", "we couldn't find"
        ],
        foundKeywords: [
            'videos', 'followers', 'following', 'playlists',
            'about', 'joined', 'views', 'channel', 'uploads',
            'popular videos', 'latest videos', 'recent uploads',
            'total views', 'subscribers'
        ],
        minContentLength: 10000,
        notFoundContentLength: 4000,
        scoreThreshold: 2,
        // SPA 渲染：通过 HTTP 代理无法区分存在/不存在，始终返回无法验证
        requireJsRendering: true
    },
    'tokopedia.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // 印尼语 404: "Waduh, tujuanmu nggak ada! Mungkin kamu salah jalan atau alamat"
        notFoundKeywords: [
            'tujuanmu nggak ada', 'nggak ada', 'waduh',
            'salah jalan atau alamat', 'balik sebelum gelap',
            'page not found', 'not found'
        ],
        foundKeywords: [
            'produk', 'dilihat', 'pengikut', 'mengikuti',
            'toko', 'produk dijual', 'terjual'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'mercadolivre.com.br': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        // 葡萄牙语: "Parece que esta página não existe"
        notFoundKeywords: [
            'página não existe', 'parece que esta página', 'esta página não existe',
            'não existe', 'not found'
        ],
        foundKeywords: [
            'vendas', 'seguidores', 'seguindo', 'produtos',
            'reputação', 'mercado', 'anúncios'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'douban.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['该用户不存在', '页面不存在', '404', '无法访问', '没有这个页面'],
        foundKeywords: [
            '豆瓣成员', '常居', '加入', '读过', '看过', '听过', '日记', '相册', '广播', '豆列'
        ],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'weibo.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            '用户不存在', '该用户不存在', '页面不存在', '抱歉，您要访问的页面不存在', '404'
        ],
        foundKeywords: ['关注', '粉丝', '微博', '简介', '注册时间', '他的主页'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'bilibili.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['页面不存在', '视频去哪了', '404', '找不到', '该用户不存在'],
        foundKeywords: [
            '粉丝', '关注', '投稿', '获赞', '播放', '直播间', '个人主页', '大会员'
        ],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'vk.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'page not found', 'not found', 'user not found',
            'страница не найдена', 'пользователь не найден'
        ],
        foundKeywords: [
            'friends', 'photos', 'followers', 'groups', 'music', 'videos', 'wall',
            'друзья', 'фотографии', 'подписчики'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'tumblr.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'there\'s nothing here', 'blog not found'],
        foundKeywords: ['posts', 'following', 'followers', 'likes', 'archive', 'blog'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'open.spotify.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['page not found', 'couldn\'t find', 'not available', 'something went wrong'],
        foundKeywords: ['followers', 'following', 'playlists', 'public playlists', 'top artists', 'artist'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'snapchat.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['page not found', 'not found', 'user not found', 'snapchat couldn\'t find'],
        foundKeywords: ['snapchat', 'subscribe', 'snap code', 'username'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    't.me': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'user not found', 'doesn\'t exist', 'no user'],
        foundKeywords: ['telegram', 'send message', 'preview', 'last seen'],
        minContentLength: 800,
        notFoundContentLength: 200,
        scoreThreshold: 1
    },
    'telegram.me': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'user not found', 'no telegram user'],
        foundKeywords: ['telegram', 'send message', 'preview', 'bio'],
        minContentLength: 800,
        notFoundContentLength: 200,
        scoreThreshold: 1
    },
    'en.wikipedia.org': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'no such user', 'no global account',
            'there is no global account'
        ],
        // 注意：不能用 'global account' 作为 foundKeyword，因为 notFound 页面也包含它
        foundKeywords: [
            'centralauth', 'global account information for',
            'registered on', 'home wiki', 'edit count', 'account statistics',
            'local accounts', 'unified login', 'attached'
        ],
        minContentLength: 3000,
        notFoundContentLength: 500,
        scoreThreshold: 2
    },
    'wordpress.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'doesn\'t exist', 'does not exist', 'page not found',
            'nothing found', 'authors', 'no longer available', 'this site is no longer available',
            'has been deleted', 'is not a registered', 'was deleted',
            'wordpress.com doesn&#39;t exist', 'not a valid wordpress',
            'no results', 'cannot be found', 'site not found',
            'this site cannot be accessed', 'the site you were looking for',
            'do you want to register', 'is available', 'start your website',
            'create a free website', 'get started', 'build a website',
            "wordpress.com doesn't exist", 'doesn&#39;t exist',
            "this user hasn't posted", 'nothing here',
            'typo', 'subdomain', 'register a new domain',
            'name your site', 'enter your new site address',
            'choose a domain', 'pick a domain',
            'site address', 'give your site a name', 'create a new site',
            'wordpress.com is the best', 'powerful hosting', 'free domain'
        ],
        foundKeywords: [
            'posts', 'blog', 'about', 'follow', 'comments', 'archives', 'categories',
            'my sites', 'published', 'scheduled', 'drafts', 'trashed',
            'posted on', 'leave a comment', 'recent posts', 'search for'
        ],
        minContentLength: 5000,
        notFoundContentLength: 1500,
        scoreThreshold: 4
    },
    'patreon.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'creator not found', 'doesn\'t exist'],
        foundKeywords: ['patrons', 'members', 'posts', 'about', 'join', 'membership'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'paypal.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'doesn\'t exist'],
        foundKeywords: ['paypal', 'donate', 'send', 'paypal.me'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'deviantart.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'deviant not found', 'user not found'],
        foundKeywords: [
            'deviations', 'watchers', 'watching', 'gallery', 'favourites', 'journal', 'about'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'roblox.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'user not found', 'inaccessible',
            'page cannot be found', 'no results', 'couldn\'t find anything',
            'this page is unavailable', 'requested page does not exist'
        ],
        foundKeywords: [
            'friends', 'followers', 'following', 'inventory', 'groups', 'favorites', 'creations',
            'about', 'currently wearing', 'join date', 'badges', 'roblox',
            'place visits', 'forum posts', 'collections'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'soundcloud.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'can\'t find', 'user not found',
            'this track was not found', 'sorry, we can\'t find that',
            'we can\'t find that user', 'couldn\'t find that user',
            'this user doesn\'t have any tracks', 'nothing to hear'
        ],
        foundKeywords: [
            'tracks', 'followers', 'following', 'playlists', 'reposts', 'comments', 'likes',
            'popular tracks', 'all tracks', 'albums', 'spotlight'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'dribbble.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'whoops'],
        foundKeywords: ['shots', 'followers', 'following', 'likes', 'buckets', 'projects', 'teams'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'flickr.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: [
            'photos', 'followers', 'following', 'albums', 'faves', 'galleries', 'about'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'quora.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found', 'doesn\'t exist'],
        foundKeywords: [
            'answers', 'followers', 'following', 'questions', 'posts', 'shares', 'edits', 'knows about'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'keybase.io': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'user not found', 'doesn\'t exist'],
        foundKeywords: ['keybase', 'proofs', 'followers', 'following', 'crypto', 'devices', 'tracking'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'fiverr.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'user not found', 'doesn\'t exist',
            'the page you are looking for', 'oops, the page you are looking for',
            'couldn\'t find this page', 'page does not exist',
            'this gig is not available', 'no gigs found',
            'it needs a human touch', 'are you a human',
            'just a moment', 'please verify'
        ],
        foundKeywords: [
            'gigs', 'reviews', 'about me', 'languages', 'skills',
            'from', 'member since', 'response time', 'avg response',
            'completed orders', 'portfolio', 'description',
            'seller', 'online now', 'i will', 'contact me'
        ],
        minContentLength: 5000,
        notFoundContentLength: 2000,
        scoreThreshold: 2
    },
    'slack.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'doesn\'t exist', 'no workspace',
            'workspace not found', 'couldn\'t find your workspace',
            'no account found', 'this workspace doesn\'t exist',
            'sign in to your workspace', 'find your workspace'
        ],
        foundKeywords: [
            'slack', 'sign in', 'workspace', 'continue', 'email',
            'password', 'your workspace', 'sign in to'
        ],
        minContentLength: 2000,
        notFoundContentLength: 500,
        scoreThreshold: 1
    },
    'scribd.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'user not found', 'doesn\'t exist',
            'the page you requested', 'could not be found',
            'page does not exist', 'no such user'
        ],
        foundKeywords: [
            'documents', 'followers', 'following', 'uploads',
            'books', 'audiobooks', 'reading list', 'about',
            'joined', 'reads', 'readers'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'tripadvisor.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'user not found', 'doesn\'t exist',
            'member not found', 'profile not found', 'page does not exist',
            'the page you are looking for', 'oops, the page you are looking for'
        ],
        foundKeywords: [
            'reviews', 'contributions', 'photos', 'badges',
            'cities visited', 'helpful votes', 'since',
            'travelers\' choice', 'tripadvisor member',
            'favorite', 'ratings', 'trip collections'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'codecademy.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['achievements', 'badges', 'courses', 'skills', 'points', 'streak'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'about.me': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['about.me', 'contact', 'bio', 'work', 'education'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'behance.net': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: [
            'projects', 'followers', 'following', 'appreciations', 'views', 'about', 'work'
        ],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'producthunt.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['products', 'followers', 'following', 'maker', 'collections', 'upvotes'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'foursquare.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['followers', 'following', 'tips', 'lists', 'photos', 'checkins'],
        minContentLength: 1500,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'venmo.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['venmo', 'transactions', 'friends', 'public'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'vsco.co': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['images', 'journal', 'grid', 'collection', 'vsco'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'ebay.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'not found', 'page not found', 'user not found', 'no longer available',
            'このユーザーは見つかりません', 'ユーザーが見つかりません', 'ユーザーは見つかりません',
            'we couldn\'t find this user', 'couldn\'t find this user', 'the user id you entered was not found'
        ],
        foundKeywords: ['feedback', 'items for sale', 'followers', 'following', 'saved', 'reviews'],
        minContentLength: 2000,
        notFoundContentLength: 400,
        scoreThreshold: 2
    },
    'news.ycombinator.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'no such user', 'user not found'],
        foundKeywords: ['karma', 'joined', 'submissions', 'comments', 'about'],
        minContentLength: 1000,
        notFoundContentLength: 200,
        scoreThreshold: 1
    },
    'hackerone.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['reputation', 'signal', 'impact', 'hacktivity', 'thanks'],
        minContentLength: 1500,
        notFoundContentLength: 300,
        scoreThreshold: 1
    },
    'pastebin.com': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: ['not found', 'page not found', 'user not found'],
        foundKeywords: ['pastes', 'member since', 'views'],
        minContentLength: 1000,
        notFoundContentLength: 200,
        scoreThreshold: 1
    },

    // ============================================================
    // 通用规则（域名模式匹配）
    // _mediawiki_ 匹配所有 *.wikia.com, *.wiki.xxx 等 MediaWiki 站点
    // ============================================================
    // Meta-Wiki CentralAuth 页面
    'meta.wikimedia.org': {
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'no global account', 'there is no global account',
            'cdx-message--error',  // MediaWiki 错误消息框
            'not found', 'does not exist'
        ],
        foundKeywords: [
            'registered on', 'edit count', 'account statistics',
            'local accounts', 'unified login', 'attached on',
            'total edit count', 'number of wikis'
        ],
        // 注意：标题始终是 "Global account information for {username}"，不区分存不存在
        // 'centralauth' 和 'home wiki' 也会在 notFound 页面中出现
        minContentLength: 5000,
        notFoundContentLength: 800,
        scoreThreshold: 2
    },

    '_mediawiki_': {
        domainPattern: /\.(wikia\.com|wiki\.[a-z]|gamepedia\.com|wikidot\.com|wikialpha\.org|everybodywiki\.com|ssbwiki\.com|mariowiki\.com|dandwiki\.com|pcgamingwiki\.com|asianwiki\.com)$/i,
        httpStatus: { directNotFound: [404], directError: [403, 429] },
        notFoundKeywords: [
            'there is currently no text in this page',
            'you do not have permission to create this page',
            'currently no text in this page',
            'search for this page title in other pages',
            'no text in this page',
            'this page does not exist',
            'page does not exist'
        ],
        foundKeywords: [
            'user contributions', 'user page', 'talk', 'contributions',
            'member since', 'edit', 'block log'
        ],
        minContentLength: 1500,
        notFoundContentLength: 600,
        scoreThreshold: 2
    }
});


// ============================================================
// 三、通用关键词黑名单
// ============================================================
const UNIVERSAL_NOT_FOUND_KEYWORDS = [
    'user not found', 'page not found', 'not found', 'this user doesn\'t exist',
    'sorry, this page', 'sorry, nobody', 'the specified profile could not be found',
    'this account doesn\'t exist', 'account suspended', 'page doesn\'t exist',
    'doesn\'t exist', 'the requested profile', 'content not found', 'nothing found',
    'no results found', '404', 'not available', 'unavailable',
    'this page isn\'t available', 'couldn\'t find', 'can\'t find that page',
    'no longer available', 'there\'s nothing here', 'nothing to see here',
    'could not be found', 'requested page could not be found',
    'there is currently no text in this page', 'you do not have permission to create this page',
    'currently no text in this page',
    'no global account', 'there is no global account',
    '用户不存在', '该用户不存在', '页面不存在', '无法找到该用户', '找不到该用户',
    '找不到用户', '找不到相关用户', '没有找到', '未找到', '您要找的页面不存在',
    '抱歉，您访问的页面不存在', '该用户已注销', '账号已注销',
    '秒后返回主页', '秒后回到首页', '秒后自动跳转',
    '无法找到指定的个人资料', '处理您的请求时遇到错误',
    '好奇怪', '页面似乎不见了', '似乎不见了',
    'não existe', 'página não existe',
    'пользователь не найден', 'страница не найдена', 'не найдено',
    'ユーザーが見つかりません', 'このユーザーは見つかりません', 'ユーザーは見つかりません',
    'ページが見つかりません', '存在しません',
    '사용자를 찾을 수 없습니다', '페이지를 찾을 수 없습니다'
];

const UNIVERSAL_FOUND_KEYWORDS = [
    'joined', 'followers', 'following', 'posts', 'profile', 'avatar',
    'member since', 'about me', 'bio', 'repositories', 'contributions', 'karma',
    '关注者', '粉丝', '关注', '动态', '回答', '文章', '个人主页', '注册时间'
];


// ============================================================
// 四、主程序类
// ============================================================
class UsernameChecker {
    constructor() {
        this.sites = [];
        this.results = [];
        this.isSearching = false;
        this.abortController = null;
        this.proxyManager = new ProxyManager();
        this.currentUsername = null;  // 当前搜索的用户名，用于检测判断
        this.currentFilter = 'all';  // 当前筛选状态
        this.permutator = null;      // 用户名变体生成器实例

        this.config = {
            batchSize: 3,
            requestTimeout: 25000,
            delayBetweenBatches: 200,
            minContentLength: 1500,
            maxRetries: 2,
            searchMode: 'precise'  // 'precise' | 'fuzzy'
        };

        // 从 localStorage 恢复用户设定的并发数，默认 3
        const savedConcurrency = localStorage.getItem('usernameChecker_concurrency');
        if (savedConcurrency) {
            const concurrency = parseInt(savedConcurrency, 10);
            if (concurrency >= 1 && concurrency <= 20) {
                this.config.batchSize = concurrency;
            }
        }

        this.init();
    }

    async init() {
        try {
            await this.loadSites();
            this.bindEvents();
            logger.info(`系统初始化完成 - 加载 ${this.sites.length} 个网站, ${Object.keys(VERIFICATION_RULES).length} 个验证规则`);
        } catch (error) {
            logger.error('初始化失败', { error: error.message, stack: error.stack });
            this.showError('加载网站数据失败，请刷新页面重试');
        }
    }

    async loadSites() {
        try {
            const response = await fetch('data/社交网站及用户页面.json');
            const data = await response.json();
            this.sites = data.common_sites || [];
            logger.info(`加载网站数据成功: ${this.sites.length} 个网站`);

            // 尝试加载动态验证规则数据库
            try {
                const dbResponse = await fetch('data/sites-db.json');
                if (dbResponse.ok) {
                    const dbData = await dbResponse.json();
                    Object.assign(VERIFICATION_RULES, dbData.sites || {});
                    logger.info(`加载动态验证规则成功: ${Object.keys(dbData.sites || {}).length} 个规则`);
                }
            } catch (dbError) {
                logger.warn('加载动态验证规则失败，使用内置规则', { error: dbError.message });
            }
        } catch (error) {
            logger.error('加载网站数据失败', { error: error.message });
            throw error;
        }
    }

    bindEvents() {
        const searchBtn = document.getElementById('searchBtn');
        const usernameInput = document.getElementById('usernameInput');

        searchBtn.addEventListener('click', () => this.handleSearch());
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // stat-card 按钮点击筛选
        document.querySelectorAll('.stat-card[data-filter]').forEach(card => {
            card.addEventListener('click', () => {
                // 切换 active 状态
                document.querySelectorAll('.stat-card[data-filter]').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                // 执行筛选
                this.currentFilter = card.dataset.filter;
                this.filterResults();
            });
        });

        // 查询模式切换
        document.querySelectorAll('input[name="searchMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.config.searchMode = e.target.value;
                logger.info(`查询模式切换: ${e.target.value === 'precise' ? '精准匹配' : '模糊匹配'}`);
            });
        });

        // 代理模式切换
        document.querySelectorAll('input[name="proxyMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.proxyManager.setMode(e.target.value);
            });
        });

        // 并发数设置
        const concurrencyInput = document.getElementById('concurrencyInput');
        if (concurrencyInput) {
            concurrencyInput.value = this.config.batchSize;
            concurrencyInput.addEventListener('change', () => {
                let concurrency = parseInt(concurrencyInput.value, 10);
                if (isNaN(concurrency) || concurrency < 1) concurrency = 1;
                if (concurrency > 20) concurrency = 20;
                concurrencyInput.value = concurrency;
                this.config.batchSize = concurrency;
                localStorage.setItem('usernameChecker_concurrency', concurrency);
                logger.info(`并发数已设置为: ${concurrency}`);
            });
        }

        // 变体生成器触发
        const permuteBtn = document.getElementById('permuteBtn');
        if (permuteBtn) {
            permuteBtn.addEventListener('click', () => this.handlePermute());
        }

        // 主题切换逻辑
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            // 初始化：检查本地存储或系统偏好
            const savedTheme = localStorage.getItem('usernameChecker_theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            if (savedTheme === 'light' || (!savedTheme && !prefersDark)) {
                document.body.classList.add('light-mode');
                themeToggle.querySelector('.toggle-icon').textContent = '☀️';
            }

            themeToggle.addEventListener('click', () => {
                document.body.classList.toggle('light-mode');
                const isLight = document.body.classList.contains('light-mode');
                themeToggle.querySelector('.toggle-icon').textContent = isLight ? '☀️' : '🌙';
                localStorage.setItem('usernameChecker_theme', isLight ? 'light' : 'dark');
                logger.info(`主题已切换为: ${isLight ? '浅色模式' : '深色模式'}`);
            });
        }
    }

    async handleSearch() {
        if (this.isSearching) {
            this.cancelSearch();
            return;
        }

        const usernameInput = document.getElementById('usernameInput');
        let username = usernameInput.value.trim();

        if (!username) {
            this.showError('请输入用户名');
            return;
        }

        // 如果启用了变体生成，先生成变体
        const usePermute = document.getElementById('usePermute')?.checked;
        if (usePermute && !username.includes(' ')) {
            // 简单处理：如果输入包含空格或逗号，则视为多个部分
            const parts = username.split(/[, ]+/).filter(p => p);
            if (parts.length > 1) {
                const elements = {};
                parts.forEach(p => elements[p] = 'part');
                this.permutator = new Permutator(elements);
                const variants = this.permutator.gather('all');
                logger.info(`生成了 ${Object.keys(variants).length} 个用户名变体`);
                // 这里可以扩展为批量搜索，目前仅记录日志并提示用户
                alert(`已生成 ${Object.keys(variants).length} 个变体。请手动选择或稍后支持批量搜索。`);
                return;
            }
        }

        if (!this.isValidUsername(username)) {
            this.showError('用户名格式不正确，请使用字母、数字、下划线或连字符');
            return;
        }

        if (this.abortController) {
            this.abortController.abort();
        }

        this.abortController = new AbortController();
        this.isSearching = true;
        this.results = [];

        this.updateSearchButton(true);
        this.showProgress(true);
        this.showStats(true);
        this.showResults(true);
        this.resetStats();

        const filteredSites = this.getFilteredSites();
        document.getElementById('progressCount').textContent = `0/${filteredSites.length}`;

        logger.info(`开始搜索 - 用户名: ${username}, 模式: ${this.config.searchMode}, 代理: ${this.proxyManager.mode}, 网站数: ${filteredSites.length}`);

        await this.searchUsername(username, filteredSites);
    }

    cancelSearch() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.isSearching = false;
        this.updateSearchButton(false);
        this.showProgress(false);
        logger.info('搜索已取消');
    }

    getFilteredSites() {
        const filterNSFW = document.getElementById('filterNSFW').checked;
        const onlyPopular = document.getElementById('onlyPopular').checked;
        const testMode = document.getElementById('testMode').checked;

        let filteredSites = this.sites.filter(site => {
            if (filterNSFW && site.nsfw === 'true') return false;
            if (onlyPopular && site.global_rank && site.global_rank > 500) return false;
            return true;
        });

        if (testMode) {
            logger.info('[测试模式] 仅测试前5个网站');
            filteredSites = filteredSites.slice(0, 5);
        }

        return filteredSites;
    }

    isValidUsername(username) {
        const regex = /^[a-zA-Z0-9_-]{3,30}$/;
        return regex.test(username);
    }

    async searchUsername(username, sites) {
        const resultsList = document.getElementById('resultsList');
        resultsList.innerHTML = '';

        let checkedCount = 0, foundCount = 0, notFoundCount = 0, errorCount = 0, manualVerifyCount = 0;

        for (let i = 0; i < sites.length; i += this.config.batchSize) {
            if (!this.isSearching) break;

            const batch = sites.slice(i, i + this.config.batchSize);
            const promises = batch.map(site => this.checkSite(site, username));

            try {
                const batchResults = await Promise.all(promises);

                for (const result of batchResults) {
                    this.results.push(result);
                    this.addResultToDOM(result);

                    if (result.status === 'found') foundCount++;
                    else if (result.status === 'not-found') {
                        notFoundCount++;
                        // 统计需手工验证的数量
                        if (result.message === '需手工验证') manualVerifyCount++;
                    }
                    else errorCount++;
                    checkedCount++;
                }

                this.updateProgress(checkedCount, sites.length);
                this.updateStats(foundCount, notFoundCount, checkedCount, errorCount, manualVerifyCount);

            } catch (error) {
                logger.error(`批次错误: ${error.message}`);
                for (const site of batch) {
                    const errorResult = {
                        site: site,
                        url: site.url.replace('{username}', username),
                        status: 'error',
                        message: `检测失败: ${error.message}`
                    };
                    this.results.push(errorResult);
                    this.addResultToDOM(errorResult);
                    errorCount++; checkedCount++;
                }
                this.updateProgress(checkedCount, sites.length);
                this.updateStats(foundCount, notFoundCount, checkedCount, errorCount, manualVerifyCount);
            }

            await this.delay(this.config.delayBetweenBatches);
        }

        this.isSearching = false;
        this.updateSearchButton(false);
        document.getElementById('progressText').textContent = '搜索完成';

        logger.info(`搜索完成 - 总计: ${checkedCount}, 已注册: ${foundCount}, 未注册: ${notFoundCount}, 需验证: ${manualVerifyCount}, 失败: ${errorCount}`);

        this.updateDebugInfo(this._buildDebugInfo(checkedCount, foundCount, notFoundCount, errorCount, manualVerifyCount));
    }

    _buildDebugInfo(checkedCount, foundCount, notFoundCount, errorCount, manualVerifyCount) {
        return `配置信息:
- 批次大小: ${this.config.batchSize}
- 请求超时: ${this.config.requestTimeout}ms
- 查询模式: ${this.config.searchMode === 'precise' ? '精准匹配' : '模糊匹配'}
- 代理模式: ${this.proxyManager.mode === 'local-proxy' ? '本地代理' : '直连模式'}
- 验证规则已配置: ${Object.keys(VERIFICATION_RULES).length} 个网站

统计信息:
- 总计检测: ${checkedCount}
- 已注册: ${foundCount}
- 未注册: ${notFoundCount}
- 需验证: ${manualVerifyCount}
- 失败: ${errorCount}
- 成功率: ${checkedCount > 0 ? ((checkedCount - errorCount) / checkedCount * 100).toFixed(1) : 0}%`;
    }

    async checkSite(site, username) {
        const url = site.url.replace('{username}', username);
        const result = {
            site: site,
            url: url,
            status: 'error',
            message: '',
            confidence: 0,
            details: {}
        };

        try {
            const checkResult = await this.verifySite(site, username);
            result.status = checkResult.found ? 'found' : 'not-found';
            result.message = checkResult.message || '';
            result.confidence = checkResult.confidence || 0;
            result.details = checkResult.details || {};
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            
            const errMsg = error.message || '';
            // 代理链路故障识别与提示优化
            const proxyErrors = ['本地代理返回 HTTP 502', 'ECONNREFUSED', '代理连接超时', 'signal timed out'];
            const isProxyFailure = proxyErrors.some(e => errMsg.includes(e));

            if (errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('TimeoutError')) {
                result.message = isProxyFailure 
                    ? '代理连接超时 - 请检查代理链路稳定性或更换代理'
                    : '无法访问（请求超时）- 可能该网站需要代理或网络不通';
            } else if (isProxyFailure) {
                result.message = '代理连接失败 - 请更换代理链路或检查网络设置';
            } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
                result.message = '无法访问（网络错误）- 可能被墙或网站不可达';
            } else if (errMsg.includes('所有代理均不可用')) {
                result.message = '无法访问（所有代理均失败）- 请检查代理设置或网络连接';
            } else {
                result.message = `检测失败: ${errMsg}`;
            }
            logger.error(`${site.domain} 检测失败`, { error: errMsg, url });
        }

        return result;
    }

    // ============================================================
    // 五、核心验证方法（含智能代理）
    // ============================================================
    async verifySite(site, username) {
        this.currentUsername = username;  // 记录当前用户名，供分析函数使用
        const url = site.url.replace('{username}', username);

        if (!url || url.includes('undefined') || url.includes('NaN')) {
            throw new Error('URL格式无效');
        }

        // 获取代理配置
        const proxyMode = this.proxyManager.getProxiesForDomain(site.domain);

        // null = 直连模式
        if (proxyMode === null) {
            try {
                return await this._directFetch(site, url);
            } catch (error) {
                logger.warn(`[直连失败] ${site.domain} - ${error.message}`);
                throw error;
            }
        }

        // 'local' = 本地代理模式
        try {
            return await this._localProxyFetch(site, url);
        } catch (error) {
            logger.warn(`[本地代理失败] ${site.domain} - ${error.message}`);
            throw error;
        }
    }

    /**
     * 直连模式（不使用代理）
     */
    async _directFetch(site, url) {
        try {
            const timeoutSignal = AbortSignal.timeout(this.config.requestTimeout);
            const combinedSignal = this.abortController
                ? AbortSignal.any([this.abortController.signal, timeoutSignal])
                : timeoutSignal;

            const response = await fetch(url, {
                signal: combinedSignal,
                mode: 'cors',
                headers: { ...DEFAULT_REQUEST_HEADERS }
            });

            const httpStatus = response.status;
            const httpResult = this.evaluateHttpStatus(site.domain, httpStatus);
            if (httpResult.definitive) {
                return this._buildHttpStatusResult(httpResult, httpStatus, 'direct');
            }

            // 3xx 重定向 → 需手工验证
            if (httpStatus >= 300 && httpStatus < 400) {
                logger.info(`[直连重定向] ${site.domain} HTTP ${httpStatus}`);
                return _createManualVerifyResult('重定向', 'direct', { httpStatus });
            }

            if (!response.ok && httpStatus !== 404) {
                throw new Error(`HTTP ${httpStatus}`);
            }

            const text = await response.text();
            const contentLength = text.length;

            if (contentLength < 200) {
                return _createManualVerifyResult('内容过短', 'direct', { httpStatus, contentLength });
            }

            return this._finalizeAnalysisResult(
                this.analyzeSiteResponse(site, text, text.toLowerCase(), contentLength, httpStatus),
                httpStatus, contentLength, 'direct'
            );

        } catch (error) {
            return this._handleFetchError(error, site, 'direct');
        }
    }

    _buildHttpStatusResult(httpResult, httpStatus, proxy) {
        return {
            found: httpResult.found, message: httpResult.message, confidence: httpResult.confidence,
            details: { httpStatus, contentLength: 0, notFoundMatches: [], foundMatches: [],
                       method: proxy === 'direct' ? METHOD.HTTP_STATUS_DIRECT : METHOD.HTTP_STATUS, proxy }
        };
    }

    _finalizeAnalysisResult(analysisResult, httpStatus, contentLength, proxy) {
        analysisResult.details.httpStatus = httpStatus;
        analysisResult.details.contentLength = contentLength;
        analysisResult.details.proxy = proxy;
        return analysisResult;
    }

    _handleFetchError(error, site, proxy) {
        const errMsg = error.message || '';
        if (error.name === 'AbortError' || error.name === 'TimeoutError' || errMsg.includes('timed out')) {
            logger.error(`[${proxy === 'direct' ? '直连超时' : '代理超时'}] ${site.domain} - 请求超时`);
            throw new Error(proxy === 'direct'
                ? '直连请求超时 - 该网站可能需要代理访问，请切换到"本地代理"模式'
                : '代理请求超时');
        }
        logger.error(`[${proxy}错误] ${site.domain} - ${errMsg}`);
        throw error;
    }

    /**
     * 本地代理模式（通过 proxy-server.js 后端转发）
     */
    async _localProxyFetch(site, url) {
        const proxyUrl = this.proxyManager.localProxyUrl;
        logger.debug(`[本地代理] ${site.domain} via ${proxyUrl}`);

        const timeoutSignal = AbortSignal.timeout(this.config.requestTimeout);
        const combinedSignal = this.abortController
            ? AbortSignal.any([this.abortController.signal, timeoutSignal])
            : timeoutSignal;

        const response = await fetch(proxyUrl, {
            method: 'POST',
            signal: combinedSignal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, timeout: this.config.requestTimeout })
        });

        if (!response.ok) throw new Error(`本地代理返回 HTTP ${response.status}`);
        const result = await response.json();
        if (result.error) throw new Error(`本地代理错误: ${result.error}`);

        const httpStatus = result.status;
        const text = result.body;
        const contentLength = text.length;
        const lowerText = text.toLowerCase();

        // 1. HTTP 状态码预判
        const httpResult = this.evaluateHttpStatus(site.domain, httpStatus, contentLength);
        if (httpResult.definitive) {
            return this._buildHttpStatusResult(httpResult, httpStatus, 'local-proxy');
        }

        // 2. 3xx 重定向 → 需手工验证
        if (httpStatus >= 300 && httpStatus < 400) {
            return _createManualVerifyResult('重定向', 'local-proxy', { httpStatus });
        }

        // 3. 内容过短 → 需手工验证
        if (contentLength < 200) {
            return _createManualVerifyResult('内容过短', 'local-proxy', { httpStatus, contentLength });
        }

        // 4. 特殊状态码的快速路径
        const quickResult = this._checkSpecialStatus(httpStatus, contentLength, lowerText);
        if (quickResult) return quickResult;

        return this._finalizeAnalysisResult(
            this.analyzeSiteResponse(site, text, lowerText, contentLength, httpStatus),
            httpStatus, contentLength, 'local-proxy'
        );
    }

    _checkSpecialStatus(httpStatus, contentLength, lowerText) {
        // HTTP 400 + 登录/错误页 → 需手工验证
        if (httpStatus === 400 && contentLength < 3000) {
            if (_isLoginRequired(lowerText) || _isErrorPage(lowerText)) {
                return _createManualVerifyResult('需登录', 'local-proxy', { httpStatus, contentLength });
            }
        }

        // HTTP 200 但短错误页 → 需手工验证
        if (httpStatus === 200 && contentLength < 3000 && _isErrorPage(lowerText)) {
            return _createManualVerifyResult('错误页', 'local-proxy', { httpStatus, contentLength });
        }

        // HTTP 403 + 反爬虫 → 需手工验证
        if (httpStatus === 403 && _isAntiBotPage(lowerText, contentLength)) {
            return _createManualVerifyResult('反爬虫', 'local-proxy', { httpStatus, contentLength });
        }

        // 针对 Instagram/TikTok/Facebook 等 SPA 的 Title 增强检测
        // 如果页面内容包含用户名，但 Title 明确显示为通用首页标题，则判定为不存在或需验证
        const titleMatch = lowerText.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch && this.currentUsername) {
            const title = titleMatch[1].toLowerCase();
            const escapedU = this.currentUsername.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
            
            // 如果 Title 是纯品牌名且没有用户名，通常意味着该用户不存在（对于强依赖 Title 的站点）
            const isGenericTitle = ['instagram', 'tiktok', 'facebook'].some(brand => title === brand || title.includes(brand + ' |'));
            if (isGenericTitle && !title.includes(this.currentUsername.toLowerCase())) {
                // 进一步检查：如果内容长度很长但不是 SPA 壳子，可能是登录墙
                if (contentLength > 5000 && !_isSpaShell(lowerText)) {
                    return _createManualVerifyResult('登录墙/隐私保护', 'local-proxy', { httpStatus, contentLength, title });
                }
            }
        }

        return null;
    }

    /**
     * 根据域名获取匹配的验证规则（支持通配规则）
     */
    getRulesForDomain(domain) {
        // 精确匹配优先
        if (VERIFICATION_RULES[domain]) return VERIFICATION_RULES[domain];
        // 子域名回退匹配：kalaspace.slack.com → slack.com, {username}.wordpress.com → wordpress.com
        const dotIndex = domain.indexOf('.');
        if (dotIndex > 0) {
            const parentDomain = domain.substring(dotIndex + 1);
            if (VERIFICATION_RULES[parentDomain]) return VERIFICATION_RULES[parentDomain];
        }
        // 尝试通配规则
        for (const key of Object.keys(VERIFICATION_RULES)) {
            if (key.startsWith('_') && VERIFICATION_RULES[key].domainPattern) {
                if (VERIFICATION_RULES[key].domainPattern.test(domain)) {
                    return VERIFICATION_RULES[key];
                }
            }
        }
        return null;
    }

    evaluateHttpStatus(domain, httpStatus, contentLength = 0) {
        const rules = this.getRulesForDomain(domain);

        if (httpStatus === 404) {
            return { definitive: true, found: false, message: '用户不存在 (HTTP 404)', confidence: 95 };
        }
        if (httpStatus === 403) {
            // HTTP 403 很可能是反爬虫/防火墙，不意味着用户不存在
            // 始终需要内容分析来确定（检查是否有反爬虫特征、是否有用户名等）
            if (contentLength > 5000) {
                return { definitive: false, message: 'HTTP 403 但内容充足，需内容分析', confidence: 0 };
            }
            // 内容很少也可能是 Cloudflare 等反爬虫，不要直接判不存在
            return { definitive: false, message: 'HTTP 403，需内容分析（可能是反爬虫）', confidence: 0 };
        }
        if (httpStatus === 429) {
            return { definitive: true, found: false, message: '需手工验证', confidence: 0 };
        }
        if (httpStatus >= 500) {
            return { definitive: true, found: false, message: '需手工验证', confidence: 0 };
        }

        if (rules && rules.httpStatus) {
            if (rules.httpStatus.directNotFound && rules.httpStatus.directNotFound.includes(httpStatus)) {
                return { definitive: true, found: false, message: `用户不存在 (HTTP ${httpStatus})`, confidence: 95 };
            }
            if (rules.httpStatus.directError && rules.httpStatus.directError.includes(httpStatus)) {
                return { definitive: true, found: false, message: '需手工验证', confidence: 0 };
            }
        }

        if (httpStatus >= 200 && httpStatus < 300) {
            return { definitive: false, message: 'HTTP OK，需要内容分析', confidence: 0 };
        }
        return { definitive: false, message: `HTTP ${httpStatus}`, confidence: 0 };
    }

    /**
     * 分析网站响应内容（含精准/模糊模式）
     */
    analyzeSiteResponse(site, text, lowerText, contentLength, httpStatus) {
        const domain = site.domain;
        const rules = this.getRulesForDomain(domain);

        let result;
        if (rules) {
            result = this.applyConfiguredRules(rules, domain, text, lowerText, contentLength, httpStatus);
        } else {
            result = this.applyUniversalRules(domain, text, lowerText, contentLength, httpStatus);
        }

        // 模糊匹配模式：放宽判定标准
        if (this.config.searchMode === 'fuzzy') {
            result = this.applyFuzzyMode(result, text, lowerText, contentLength, rules);
        }

        return result;
    }

    /**
     * 模糊匹配模式：只要页面包含用户名相关信息就倾向于判定为存在
     */
    applyFuzzyMode(result, text, lowerText, contentLength, rules) {
        if (result.found) { result.message = '[模糊] ' + result.message; return result; }

        const fuzzyIndicators = ['profile', 'user', 'account', 'member', 'join', '主页', '用户', '个人', '注册', '登录'];
        const fuzzyScore = fuzzyIndicators.filter(kw => lowerText.includes(kw)).length;

        const minLen = rules ? rules.minContentLength * 0.6 : 1200;
        if ((contentLength > minLen && fuzzyScore >= 2) || (contentLength > 800 && fuzzyScore >= 1)) {
            result.found = false; result.confidence = 0;
            result.message = '需手工验证'; result.details.method = METHOD.MANUAL_VERIFY;
        }
        return result;
    }

    applyConfiguredRules(rules, domain, text, lowerText, contentLength, httpStatus) {
        // 1. JS 渲染标记 → 直接需手工验证
        if (rules.requireJsRendering) {
            return _createManualVerifyResult('需JS渲染', 'local-proxy', { httpStatus, contentLength });
        }
    
        // 2. Title 用户名检测（如 Instagram/Pinterest：Title 应包含 @username 或纯用户名）
        if (rules.titleContainsUsername && this.currentUsername) {
            const titleMatch = lowerText.match(/<title[^>]*>([^<]*)<\/title>/i);
            if (titleMatch) {
                const title = titleMatch[1];
                const escapedU = this.currentUsername.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
                // 支持 @username（Instagram）或纯 username（Pinterest）
                const usernameInTitle = new RegExp('(@' + escapedU + '|' + escapedU + ')', 'i').test(title);
                if (!usernameInTitle) {
                    // Title 不包含用户名，说明账号不存在（即使其他关键词匹配也无效）
                    return _createManualVerifyResult('Title无用户名', 'local-proxy', {
                        httpStatus, contentLength, title,
                        message: `用户可能不存在（Title: "${title}"，未包含用户名 @${this.currentUsername}）`
                    });
                }
            }
        }
    
        // 3. 收集匹配项
        const { notFoundMatches, foundMatches, isAntiBot, isSpaShell } = this._collectMatches(rules, text, lowerText);
    
        const notFoundScore = notFoundMatches.length;
        const foundScore = foundMatches.length;
        const lengthScore = this.calculateLengthScore(contentLength, rules.minContentLength, rules.notFoundContentLength);
    
        // 4. 核心判定（传入 text 用于检查用户名是否出现在页面中）
        let verdict = this._computeVerdict(rules, text, notFoundScore, foundScore, lengthScore);
    
        // 5. 反爬虫/SPA 降级
        verdict = this._applyDegradations(verdict, isAntiBot, isSpaShell);
    
        // 6. 标题错误兜底
        verdict = this._applyTitleFallback(verdict, lowerText);
    
        // 7. check_type 逻辑应用 (优先于关键词比较)
        const checkTypeVerdict = this._applyCheckTypeLogic(rules, httpStatus, text);
        if (checkTypeVerdict) {
            verdict = checkTypeVerdict;
        }
    
        return {
            found: verdict.found, message: verdict.message, confidence: Math.round(verdict.confidence),
            details: {
                notFoundMatches, foundMatches, notFoundScore, foundScore,
                lengthScore: Math.round(lengthScore * 100),
                contentLength, minContentLength: rules.minContentLength,
                method: verdict.method, hasConfiguredRules: true
            }
        };
    }
    
    /**
     * 应用 Maigret 风格的 check_type 逻辑
     */
    _applyCheckTypeLogic(rules, httpStatus, text) {
        const checkType = rules.checkType || 'message';
    
        if (checkType === 'status_code') {
            if (httpStatus >= 200 && httpStatus < 300) {
                return { found: true, confidence: 90, method: METHOD.HTTP_STATUS, message: '用户已注册 (HTTP 2xx)' };
            }
            return { found: false, confidence: 90, method: METHOD.HTTP_STATUS, message: '用户不存在 (非 2xx)' };
        }
    
        if (checkType === 'response_url') {
            // 简化实现：如果存在重定向且最终 URL 不包含用户名，则判定为不存在
            // 在浏览器端难以获取最终 URL，此处主要依赖 HTTP 状态码和重定向处理
            if (httpStatus >= 300 && httpStatus < 400) {
                return { found: false, confidence: 80, method: METHOD.MANUAL_VERIFY, message: '需手工验证 (重定向)' };
            }
        }
    
        // 默认为 'message' 类型，依赖 presense_strs / absence_strs
        if (checkType === 'message') {
            const hasPresence = rules.presenseStrs && rules.presenseStrs.some(s => text.includes(s));
            const hasAbsence = rules.absenceStrs && rules.absenceStrs.some(s => text.includes(s));
    
            if (hasAbsence) {
                return { found: false, confidence: 85, method: METHOD.NOT_FOUND_KEYWORDS, message: '用户不存在 (检测到缺失特征词)' };
            }
            if (hasPresence) {
                return { found: true, confidence: 85, method: METHOD.FOUND_KEYWORDS, message: '用户已注册 (检测到存在特征词)' };
            }
        }
    
        return null; // 返回 null 表示继续使用原有的关键词比较逻辑
    }

    _collectMatches(rules, text, lowerText) {
        const notFoundMatches = [];
        const foundMatches = [];

        // 反爬虫检测
        let isAntiBot = false;
        for (const kw of ANTI_BOT_KEYWORDS) {
            if (lowerText.includes(kw)) { isAntiBot = true; notFoundMatches.push(`[反爬虫] ${kw}`); break; }
        }

        // SPA 壳子检测
        const isSpaShell = _isSpaShell(text);

        // 关键词匹配（增加安全检查，兼容 absenceStrs/presenseStrs）
        const notFoundKws = rules.notFoundKeywords || rules.absenceStrs || [];
        const foundKws = rules.foundKeywords || rules.presenseStrs || [];

        for (const kw of notFoundKws) { if (lowerText.includes(kw)) notFoundMatches.push(kw); }
        for (const kw of foundKws) { if (lowerText.includes(kw)) foundMatches.push(kw); }

        return { notFoundMatches, foundMatches, isAntiBot, isSpaShell };
    }

    /**
     * 检查用户名是否出现在页面内容中（作为完整词）
     */
    _usernameInText(username, text) {
        if (!username || !text) return false;
        const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 用单词边界匹配，确保不会匹配到部分字符串
        const re = new RegExp('\\b' + escaped + '\\b', 'i');
        return re.test(text);
    }

    _computeVerdict(rules, text, notFoundScore, foundScore, lengthScore) {
        const threshold = rules.scoreThreshold || 2;
        const username = this.currentUsername;
        const hasUsername = this._usernameInText(username, text);

        // 只匹配到否定词
        if (notFoundScore > 0 && foundScore === 0) {
            return { found: false, confidence: 70 + notFoundScore * 10, method: METHOD.NOT_FOUND_KEYWORDS,
                     message: `用户不存在（匹配到 ${notFoundScore} 个未找到特征词）` };
        }

        // 两边都匹配
        if (notFoundScore > 0 && foundScore > 0) {
            if (notFoundScore >= foundScore) {
                return { found: false, confidence: 55 + (notFoundScore - foundScore) * 10, method: METHOD.KEYWORD_COMPARISON,
                         message: `用户不存在（未找到特征 ${notFoundScore} >= 存在特征 ${foundScore}）` };
            }
            // foundScore > notFoundScore + threshold 时，只有用户名出现在页面中才判定为存在
            if (foundScore > notFoundScore + threshold) {
                if (hasUsername) {
                    return { found: true, confidence: 50 + (foundScore - notFoundScore) * 10, method: METHOD.KEYWORD_COMPARISON,
                             message: `用户已注册（存在特征 ${foundScore} > 未找到特征 ${notFoundScore}，且用户名出现在页面）` };
                }
                return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY,
                         message: '需手工验证（存在特征词匹配但用户名未在页面中出现）' };
            }
            return { found: false, confidence: 45, method: METHOD.KEYWORD_COMPARISON,
                     message: `用户可能不存在（特征接近，存在 ${foundScore} vs 未找到 ${notFoundScore}）` };
        }

        // 只匹配到肯定词
        if (foundScore > 0 && notFoundScore === 0) {
            // 泛化关键词必须结合用户名实际出现在页面中才能判定为存在
            if (lengthScore > 0.5 && hasUsername) {
                return { found: true, confidence: 55 + foundScore * 8, method: METHOD.FOUND_KEYWORDS,
                         message: `用户已注册（匹配到 ${foundScore} 个存在特征词，且用户名出现在页面）` };
            }
            if (lengthScore > 0.2) {
                return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY, message: '需手工验证' };
            }
            return { found: false, confidence: 50, method: METHOD.FOUND_KEYWORDS_SHORT,
                     message: '用户可能不存在（匹配到存在特征词但内容极少）' };
        }

        // 无任何匹配 → 依赖内容长度
        if (lengthScore > 0.3) {
            return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY, message: '需手工验证' };
        }
        return { found: false, confidence: 60, method: METHOD.CONTENT_LENGTH_ONLY,
                 message: '用户不存在（页面内容极少，无明确特征）' };
    }

    _applyDegradations(verdict, isAntiBot, isSpaShell) {
        if (isAntiBot) {
            return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY, message: '需手工验证' };
        }
        if (isSpaShell && (!verdict.found || verdict.confidence < 80)) {
            return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY, message: '需手工验证' };
        }
        return verdict;
    }

    _applyTitleFallback(verdict, lowerText) {
        if (!verdict.found || verdict.confidence >= 70) return verdict;
        const titleMatch = lowerText.match(/<title>([^<]*)<\/title>/i);
        if (!titleMatch) return verdict;
        const title = titleMatch[1].toLowerCase();
        for (const ek of ERROR_TITLE_KEYWORDS) {
            if (title.includes(ek)) {
                return { found: false, confidence: 70, method: METHOD.TITLE_ERROR_FALLBACK,
                         message: `用户不存在（页面标题包含错误提示: "${ek}"）` };
            }
        }
        return verdict;
    }

    applyUniversalRules(domain, text, lowerText, contentLength, httpStatus) {
        // 1. SPA 壳子检测
        if (_isSpaShell(text)) {
            return _createManualVerifyResult('SPA壳子', 'local-proxy', {
                httpStatus: 0, contentLength,
                notFoundScore: 1, foundScore: 0, minContentLength: 2000,
                hasConfiguredRules: false
            });
        }

        // 2. 收集通用关键词匹配
        const notFoundMatches = UNIVERSAL_NOT_FOUND_KEYWORDS.filter(kw => lowerText.includes(kw));
        const foundMatches = UNIVERSAL_FOUND_KEYWORDS.filter(kw => lowerText.includes(kw));
        const notFoundScore = notFoundMatches.length;
        const foundScore = foundMatches.length;

        // 3. 通用判定（传入 text 用于检查用户名是否出现在页面中）
        const verdict = this._computeUniversalVerdict(text, contentLength, notFoundScore, foundScore);

        return {
            found: verdict.found, message: verdict.message, confidence: Math.round(verdict.confidence),
            details: {
                notFoundMatches, foundMatches, notFoundScore, foundScore,
                contentLength, minContentLength: 2000,
                method: verdict.method, hasConfiguredRules: false
            }
        };
    }

    _computeUniversalVerdict(text, contentLength, notFoundScore, foundScore) {
        const hasVeryShort = contentLength < 500;
        const hasMedium = contentLength >= 500 && contentLength <= 2000;
        const hasValid = contentLength > 2000;
        const username = this.currentUsername;
        const hasUsername = this._usernameInText(username, text);

        if (hasVeryShort) {
            return { found: false, confidence: 80, method: METHOD.VERY_SHORT_CONTENT,
                     message: '用户不存在（页面内容极短）' };
        }
        if (notFoundScore > 0 && foundScore === 0) {
            return { found: false, confidence: 60 + notFoundScore * 10, method: METHOD.UNIVERSAL_NOT_FOUND,
                     message: `用户不存在（匹配到 ${notFoundScore} 个通用未找到特征词）` };
        }
        if (notFoundScore > 0 && foundScore > 0) {
            if (notFoundScore >= foundScore) {
                return { found: false, confidence: 50 + (notFoundScore - foundScore) * 8,
                         method: METHOD.UNIVERSAL_COMPARISON, message: '用户可能不存在（未找到特征词多于存在特征词）' };
            }
            if (foundScore > notFoundScore + 2 && hasValid) {
                // 即使存在特征词更多，也必须用户名实际出现在页面中才判定为存在
                if (hasUsername) {
                    return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY,
                             message: '需手工验证（存在特征词更多，但用户名未在页面中出现）' };
                }
                return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY, message: '需手工验证' };
            }
            return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY, message: '需手工验证' };
        }
        // 只有匹配到存在特征词时，也必须用户名出现在页面中才判定为存在
        if (foundScore > 0 && notFoundScore === 0 && hasValid) {
            if (hasUsername) {
                return { found: true, confidence: 50 + foundScore * 8, method: METHOD.UNIVERSAL_FOUND,
                         message: `用户已注册（匹配到 ${foundScore} 个通用存在特征词，且用户名出现在页面）` };
            }
            return { found: false, confidence: 0, method: METHOD.MANUAL_VERIFY,
                     message: '需手工验证（存在特征词匹配但用户名未在页面中出现）' };
        }
        if (hasValid) {
            return { found: false, confidence: 0, method: METHOD.LENGTH_ONLY, message: '需手工验证' };
        }
        if (hasMedium) {
            return { found: false, confidence: 50, method: METHOD.MEDIUM_CONTENT,
                     message: '用户可能不存在（页面内容不足且无明确特征）' };
        }
        return { found: false, confidence: 60, method: METHOD.INSUFFICIENT_CONTENT,
                 message: '用户不存在（页面内容不足）' };
    }

    calculateLengthScore(contentLength, minContentLength, notFoundContentLength) {
        if (!minContentLength) minContentLength = 2000;
        if (!notFoundContentLength) notFoundContentLength = 500;
        if (contentLength <= notFoundContentLength) return 0;
        if (contentLength >= minContentLength) return 1;
        const range = minContentLength - notFoundContentLength;
        return (contentLength - notFoundContentLength) / range;
    }

    // ============================================================
    // 六、UI 渲染方法（拆分 addResultToDOM 为多个构建子函数）
    // ============================================================
    addResultToDOM(result) {
        const item = document.createElement('div');
        const isManualVerify = result.status === 'not-found' && result.message === '需手工验证';
        item.className = `result-item ${result.status}`;
        item.dataset.status = isManualVerify ? 'manual-verify' : result.status;

        const { linkClass, linkText } = this._getLinkConfig(result, isManualVerify);

        item.innerHTML = `
            <div class="result-status">${this._getStatusIcon(result)}</div>
            <div class="result-content">
                <div class="result-name">
                    ${result.site.domain}
                    <span class="result-type">${result.site.type || '未知类型'}</span>
                    ${this._buildConfidenceBadge(result)}
                    ${this._buildMethodBadge(result)}
                </div>
                <div class="result-url">${result.url}</div>
                ${this._buildDetailsInfo(result)}
                ${result.status === 'error' && result.message ? `<div class="result-error">${result.message}</div>` : ''}
            </div>
            <a href="${result.url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${linkText}</a>
        `;

        // 如果当前有筛选条件（非 all），新添加的结果也需遵循筛选条件
        const currentFilter = this.currentFilter || 'all';
        if (currentFilter !== 'all') {
            const itemStatus = item.dataset.status;
            if (itemStatus !== currentFilter) {
                item.style.display = 'none';
            }
        }

        document.getElementById('resultsList').appendChild(item);
    }

    _getStatusIcon(result) {
        if (result.status === 'found') return '✓';
        if (result.status === 'not-found') return '✗';
        return '⚠';
    }

    _getLinkConfig(result, isManualVerify) {
        if (result.status === 'found') {
            return { linkClass: 'result-link result-link-found', linkText: '访问主页' };
        }
        if (isManualVerify) {
            return { linkClass: 'result-link result-link-manual', linkText: '手工验证' };
        }
        return { linkClass: 'result-link result-link-notfound', linkText: '手工验证' };
    }

    _buildConfidenceBadge(result) {
        if (!result.confidence || result.confidence <= 0) return '';
        const cls = result.confidence >= 80 ? 'confidence-high' :
                    result.confidence >= 50 ? 'confidence-mid' : 'confidence-low';
        return `<span class="confidence-badge ${cls}">置信度: ${result.confidence}%</span>`;
    }

    _buildMethodBadge(result) {
        if (!result.details || !result.details.method) return '';
        const METHOD_LABELS = {
            'http-status': 'HTTP状态码', 'http-status-direct': 'HTTP状态码(直连)',
            'notFoundKeywords': '未找到关键词', 'foundKeywords': '存在关键词',
            'keywordComparison': '关键词比较', 'lengthFallback': '长度辅助',
            'contentLengthOnly': '内容长度', 'veryShortContent': '内容极短',
            'universalNotFoundKeywords': '通用否定词', 'universalFoundKeywords': '通用肯定词',
            'universalComparison': '通用比较', 'lengthOnly': '长度判断',
            'insufficientContent': '内容不足', 'fuzzy-match': '模糊匹配',
            'manual-verify': '需手工验证'
        };
        const label = METHOD_LABELS[result.details.method] || result.details.method;
        return `<span class="method-badge" title="判定方法: ${label}">${label}</span>`;
    }

    _buildDetailsInfo(result) {
        if (!result.details || result.status.includes('error')) return '';
        const d = result.details;
        const parts = [];
        if (d.httpStatus) parts.push(`HTTP ${d.httpStatus}`);
        if (d.proxy) parts.push(d.proxy);
        if (d.contentLength) parts.push(`${d.contentLength}字节`);
        if (d.notFoundMatches && d.notFoundMatches.length > 0) parts.push(`否定: ${d.notFoundMatches.slice(0, 2).join(', ')}`);
        if (d.foundMatches && d.foundMatches.length > 0) parts.push(`肯定: ${d.foundMatches.slice(0, 2).join(', ')}`);
        return parts.length > 0 ? `<div class="result-details">${parts.join(' | ')}</div>` : '';
    }

    filterResults() {
        const filter = this.currentFilter || 'all';
        const items = document.querySelectorAll('.result-item');
        items.forEach(item => {
            item.style.display = (filter === 'all' || item.dataset.status === filter) ? 'flex' : 'none';
        });
    }

    updateSearchButton(isSearching) {
        const btn = document.getElementById('searchBtn');
        const btnText = btn.querySelector('.btn-text');
        const btnIcon = btn.querySelector('.btn-icon');
        if (isSearching) {
            btnText.textContent = '取消搜索';
            btnIcon.textContent = '✕';
            btn.classList.add('canceling');
        } else {
            btnText.textContent = '开始搜索';
            btnIcon.textContent = '🚀';
            btn.classList.remove('canceling');
        }
    }

    updateProgress(current, total) {
        const percentage = (current / total) * 100;
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressCount').textContent = `${current}/${total}`;
    }

    updateStats(found, notFound, checked, errors, manualVerify) {
        document.getElementById('foundCount').textContent = found;
        document.getElementById('notFoundCount').textContent = notFound;
        document.getElementById('checkedCount').textContent = checked;
        document.getElementById('errorCount').textContent = errors;
        document.getElementById('manualVerifyCount').textContent = manualVerify || 0;
    }

    resetStats() {
        document.getElementById('foundCount').textContent = '0';
        document.getElementById('notFoundCount').textContent = '0';
        document.getElementById('checkedCount').textContent = '0';
        document.getElementById('errorCount').textContent = '0';
        document.getElementById('manualVerifyCount').textContent = '0';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = '正在搜索...';
        document.getElementById('debugInfo').style.display = 'none';
    }

    showProgress(show) {
        document.getElementById('progressSection').style.display = show ? 'block' : 'none';
    }
    showStats(show) {
        document.getElementById('statsSection').style.display = show ? 'block' : 'none';
    }
    showResults(show) {
        document.getElementById('resultsSection').style.display = show ? 'block' : 'none';
    }

    showError(message) {
        let suggestions = '';
        if (message.includes('CORS') || message.includes('fetch')) {
            suggestions = '\n\n建议：\n1. 确保已启动HTTP服务器\n2. 不要直接双击打开HTML文件\n3. 尝试刷新页面重试';
        } else if (message.includes('proxy') || message.includes('代理')) {
            suggestions = '\n\n建议：\n1. 检查网络连接\n2. 稍后再试\n3. 某些网站可能暂时无法访问';
        } else if (message.includes('429') || message.includes('频率')) {
            suggestions = '\n\n建议：\n1. 等待几分钟后重试\n2. 减少搜索频率';
        }
        logger.error(message);
        alert(message + suggestions);
    }

    updateDebugInfo(info) {
        const debugInfo = document.getElementById('debugInfo');
        const debugContent = document.getElementById('debugContent');
        debugInfo.style.display = 'block';
        debugContent.textContent = info;
    }

    exportResults(format) {
        if (this.results.length === 0) {
            this.showError('没有可导出的结果');
            return;
        }

        let content, filename, mimeType;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[: ]/g, '-');
        const username = this.currentUsername || 'search';

        if (format === 'json') {
            content = JSON.stringify(this.results, null, 2);
            filename = `maigret_${username}_${timestamp}.json`;
            mimeType = 'application/json';
        } else if (format === 'csv') {
            const headers = ['Site', 'URL', 'Status', 'Message', 'Confidence'];
            const rows = this.results.map(r => [
                r.site.domain,
                r.url,
                r.status,
                r.message,
                r.confidence
            ]);
            content = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
            filename = `maigret_${username}_${timestamp}.csv`;
            mimeType = 'text/csv';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        logger.info(`结果已导出为 ${format.toUpperCase()} 格式`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new UsernameChecker();
});
