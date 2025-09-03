/**
 * EdgeOne 平台 GitHub 代理函数
 * 基于原始 Cloudflare Workers dd.js 改写
 */

// 配置常量
const ASSET_URL = 'https://hunshcn.github.io/gh-proxy/'
const PREFIX = '/'
const Config = {
    jsdelivr: 1  // jsDelivr 镜像开关，0为关闭
}

// 白名单配置
const whiteList = [] // 路径白名单，例如: ['/username/']

// CORS 预检响应配置
const PREFLIGHT_INIT = {
    status: 204,
    headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }
}

// GitHub URL 匹配正则表达式
const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i

/**
 * 创建响应对象
 * @param {any} body 响应体
 * @param {number} status 状态码
 * @param {Object} headers 响应头
 * @returns {Response}
 */
function makeResponse(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}

/**
 * 安全创建URL对象
 * @param {string} urlStr URL字符串
 * @returns {URL|null}
 */
function createUrl(urlStr) {
    try {
        return new URL(urlStr)
    } catch (err) {
        return null
    }
}

/**
 * 检查URL是否匹配GitHub模式
 * @param {string} url URL字符串
 * @returns {boolean}
 */
function checkUrl(url) {
    const patterns = [exp1, exp2, exp3, exp4, exp5, exp6]
    return patterns.some(pattern => url.search(pattern) === 0)
}

/**
 * 主要的fetch事件处理器
 * @param {Request} request 请求对象
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {
    try {
        const url = new URL(request.url)
        
        // 处理查询参数重定向
        const queryPath = url.searchParams.get('q')
        if (queryPath) {
            const redirectUrl = `https://${url.host}${PREFIX}${queryPath}`
            return Response.redirect(redirectUrl, 301)
        }

        // 解析路径 - 使用 substring 替代已废弃的 substr
        let path = url.href.substring(url.origin.length + PREFIX.length)
        path = path.replace(/^https?:\/+/, 'https://')

        // 如果路径为空，返回首页或帮助信息
        if (!path || path === '/') {
            return makeResponse(getHelpPage(), 200, {'content-type': 'text/html; charset=utf-8'})
        }

        // 根据不同的GitHub URL模式进行处理
        if (exp1.test(path) || exp3.test(path) || exp4.test(path) || exp5.test(path) || exp6.test(path)) {
            return await proxyRequest(request, path)
        } else if (exp2.test(path)) {
            if (Config.jsdelivr) {
                // 使用 jsDelivr CDN
                const newUrl = path
                    .replace('/blob/', '@')
                    .replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh')
                return Response.redirect(newUrl, 302)
            } else {
                // 转换为raw链接
                path = path.replace('/blob/', '/raw/')
                return await proxyRequest(request, path)
            }
        } else if (path.startsWith('github.com') || path.startsWith('raw.githubusercontent.com') || path.startsWith('gist.github.com')) {
            // 直接处理GitHub相关URL
            return await proxyRequest(request, path)
        } else {
            // 对于其他URL，先检查是否为有效URL
            const targetUrl = createUrl(path)
            if (targetUrl) {
                return await fetch(path, request)
            } else {
                return makeResponse('Invalid URL format', 400)
            }
        }
    } catch (error) {
        console.error('EdgeOne proxy error:', error)
        return makeResponse(`EdgeOne proxy error: ${error.message}`, 502)
    }
}

/**
 * 生成帮助页面
 * @returns {string} HTML帮助页面
 */
function getHelpPage() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub 代理服务</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .example { background: #f6f8fa; padding: 10px; border-radius: 6px; margin: 10px 0; }
        code { background: #f6f8fa; padding: 2px 4px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>GitHub 代理服务</h1>
    <p>这是一个基于 EdgeOne 平台的 GitHub 文件代理服务。</p>
    
    <h2>使用方法</h2>
    <p>在当前域名后添加 GitHub URL 即可：</p>
    
    <div class="example">
        <strong>原始链接：</strong><br>
        <code>https://github.com/user/repo/releases/download/v1.0/file.zip</code><br><br>
        <strong>代理链接：</strong><br>
        <code>https://${typeof window !== 'undefined' ? window.location.host : 'your-domain.com'}/github.com/user/repo/releases/download/v1.0/file.zip</code>
    </div>
    
    <h2>支持的链接类型</h2>
    <ul>
        <li>GitHub Releases: <code>github.com/user/repo/releases/...</code></li>
        <li>GitHub Archive: <code>github.com/user/repo/archive/...</code></li>
        <li>GitHub Raw 文件: <code>raw.githubusercontent.com/...</code></li>
        <li>GitHub Gist: <code>gist.github.com/...</code></li>
        <li>GitHub Blob 文件: <code>github.com/user/repo/blob/...</code></li>
    </ul>
    
    <p><small>Powered by EdgeOne</small></p>
</body>
</html>`
}

/**
 * 代理请求处理
 * @param {Request} request 原始请求
 * @param {string} targetUrl 目标URL
 * @returns {Promise<Response>}
 */
async function proxyRequest(request, targetUrl) {
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS' && 
        request.headers.get('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT)
    }

    // 白名单检查
    if (whiteList.length > 0) {
        const isWhitelisted = whiteList.some(item => targetUrl.includes(item))
        if (!isWhitelisted) {
            return makeResponse("Access blocked by whitelist", 403)
        }
    }

    // URL 标准化
    let finalUrl = targetUrl
    if (finalUrl.startsWith('github')) {
        finalUrl = 'https://' + finalUrl
    }

    const urlObj = createUrl(finalUrl)
    if (!urlObj) {
        return makeResponse("Invalid URL", 400)
    }

    return await proxyFetch(urlObj, request)
}

/**
 * 执行代理请求
 * @param {URL} targetUrl 目标URL对象
 * @param {Request} originalRequest 原始请求
 * @returns {Promise<Response>}
 */
async function proxyFetch(targetUrl, originalRequest) {
    // 复制请求头
    const headers = new Headers(originalRequest.headers)
    
    // 构建请求选项
    const requestInit = {
        method: originalRequest.method,
        headers: headers,
        redirect: 'manual'
    }

    // 对于非GET请求，添加请求体
    if (originalRequest.method !== 'GET' && originalRequest.method !== 'HEAD') {
        requestInit.body = await originalRequest.arrayBuffer()
    }

    const response = await fetch(targetUrl.href, requestInit)
    
    return await processResponse(response, targetUrl, requestInit)
}

/**
 * 处理代理响应
 * @param {Response} response 原始响应
 * @param {URL} targetUrl 目标URL
 * @param {Object} requestInit 请求配置
 * @returns {Promise<Response>}
 */
async function processResponse(response, targetUrl, requestInit) {
    const responseHeaders = new Headers(response.headers)

    // 处理重定向
    if (responseHeaders.has('location')) {
        const location = responseHeaders.get('location')
        if (checkUrl(location)) {
            responseHeaders.set('location', PREFIX + location)
        } else {
            // 跟随重定向
            requestInit.redirect = 'follow'
            return await proxyFetch(createUrl(location), { 
                method: requestInit.method,
                headers: requestInit.headers 
            })
        }
    }

    // 设置CORS响应头
    responseHeaders.set('access-control-expose-headers', '*')
    responseHeaders.set('access-control-allow-origin', '*')
    responseHeaders.set('Accept-Language', 'en-us')

    // 删除安全策略相关头部
    responseHeaders.delete('content-security-policy')
    responseHeaders.delete('content-security-policy-report-only')
    responseHeaders.delete('clear-site-data')

    return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
    })
}

// EdgeOne 事件监听器
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})
