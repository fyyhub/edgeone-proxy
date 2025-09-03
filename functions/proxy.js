/**
 * Enhanced EdgeOne proxy function with comprehensive API interface support
 * Supports all HTTP methods, proper header forwarding, CORS, and JSON handling
 */
export async function onRequest(context) {
    const { request } = context;

    try {
        const requestUrl = new URL(request.url);
        const targetUrlParam = requestUrl.searchParams.get('url');

        if (!targetUrlParam) {
            return new Response(
                JSON.stringify({ 
                    error: "Missing 'url' query parameter",
                    message: "请在URL中提供 'url' 查询参数指定目标地址"
                }), 
                { 
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        }

        // 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return handleCORSPreflight(request);
        }

        // 验证目标 URL
        let targetUrl;
        try {
            targetUrl = new URL(targetUrlParam);
        } catch (error) {
            return new Response(
                JSON.stringify({
                    error: "Invalid target URL",
                    message: "提供的目标URL格式无效"
                }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        }

        // 构建转发请求的头信息
        const forwardHeaders = buildForwardHeaders(request, requestUrl);
        
        // 处理请求体
        let requestBody = null;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
            try {
                requestBody = await request.blob();
            } catch (error) {
                console.warn('Failed to read request body:', error);
            }
        }

        // 创建转发请求
        const forwardRequest = new Request(targetUrl.toString(), {
            method: request.method,
            headers: forwardHeaders,
            body: requestBody,
            redirect: 'follow'
        });

        // 发送请求到目标服务器
        const response = await fetch(forwardRequest);
        
        // 构建响应头
        const responseHeaders = buildResponseHeaders(response);

        // 处理响应体
        let responseBody;
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json') || 
            contentType.includes('text/') || 
            contentType.includes('application/xml')) {
            // 对于文本类型，直接传递
            responseBody = response.body;
        } else {
            // 对于二进制数据，也直接传递
            responseBody = response.body;
        }

        return new Response(responseBody, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (error) {
        console.error('Proxy error:', error);
        
        return new Response(
            JSON.stringify({
                error: "Proxy Error",
                message: `代理请求失败: ${error.message}`,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        );
    }
}

/**
 * 处理 CORS 预检请求
 */
function handleCORSPreflight(request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, Cache-Control, Pragma',
        'Access-Control-Max-Age': '86400', // 24 hours
        'Access-Control-Allow-Credentials': 'false'
    };

    return new Response(null, {
        status: 204,
        headers: corsHeaders
    });
}

/**
 * 构建转发请求的头信息
 */
function buildForwardHeaders(request, requestUrl) {
    const headers = new Headers();
    
    // 需要转发的关键头信息
    const headersToForward = [
        'accept',
        'accept-language',
        'authorization',
        'cache-control',
        'content-type',
        'pragma',
        'user-agent',
        'x-requested-with',
        'x-api-key',
        'x-auth-token'
    ];

    // 转发指定的头信息
    headersToForward.forEach(headerName => {
        const headerValue = request.headers.get(headerName);
        if (headerValue) {
            headers.set(headerName, headerValue);
        }
    });

    // 设置代理相关头信息
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || 'unknown');
    headers.set('X-Forwarded-Proto', requestUrl.protocol.slice(0, -1));
    headers.set('X-Forwarded-Host', requestUrl.host);
    
    // 如果没有 User-Agent，设置一个默认值
    if (!headers.has('user-agent')) {
        headers.set('User-Agent', 'EdgeOne-Proxy/1.0');
    }

    return headers;
}

/**
 * 构建响应头信息
 */
function buildResponseHeaders(response) {
    const headers = new Headers();

    // 复制大部分原始响应头
    for (const [key, value] of response.headers.entries()) {
        const lowerKey = key.toLowerCase();
        
        // 跳过可能引起问题的头信息
        if (lowerKey === 'set-cookie' || 
            lowerKey === 'cookie' ||
            lowerKey.startsWith('cf-') ||
            lowerKey === 'server' ||
            lowerKey === 'x-powered-by') {
            continue;
        }
        
        headers.set(key, value);
    }

    // 添加 CORS 头
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, Cache-Control, Pragma');
    
    // 添加代理标识
    headers.set('X-Proxy-By', 'EdgeOne-Enhanced-Proxy');

    return headers;
}
