/**
 * EdgeOne 云函数 HTTP 请求透传代理
 * 功能：将传入的 URL 参数作为目标地址，透传 HTTP 请求并返回响应内容
 * 支持：API 接口代理、静态资源代理（HTML、CSS、JS、图片、文件下载等）
 * 使用方式：访问 https://your-domain.com/proxy-function?url=http://target-site.com
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // 获取目标 URL 参数
  const targetUrl = url.searchParams.get('url');
  
  // 如果没有提供目标 URL，返回错误信息
  if (!targetUrl) {
    return new Response(JSON.stringify({
      error: 'Missing url parameter',
      usage: 'Please provide a target URL using ?url=http://example.com'
    }), {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
  
  try {
    // 验证 URL 格式
    const targetUrlObj = new URL(targetUrl);
    
    // 创建新的请求头部，过滤掉一些可能导致问题的头部
    const proxyHeaders = new Headers();
    
    // 复制原始请求头部，但过滤掉一些特定的头部
    for (const [key, value] of request.headers.entries()) {
      // 过滤掉可能导致问题的头部
      const lowerKey = key.toLowerCase();
      if (!['host', 'origin', 'referer', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor'].includes(lowerKey)) {
        proxyHeaders.set(key, value);
      }
    }
    
    // 设置目标域名的 Host 头部
    proxyHeaders.set('Host', targetUrlObj.hostname);
    
    // 设置用户代理，如果原请求没有的话
    if (!proxyHeaders.has('User-Agent')) {
      proxyHeaders.set('User-Agent', 'Mozilla/5.0 (compatible; EdgeOne-Proxy/1.0)');
    }
    
    // 创建代理请求
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'follow'
    });
    
    // 发送代理请求并获取响应
    const response = await fetch(proxyRequest);
    
    // 创建新的响应头部
    const responseHeaders = new Headers();
    
    // 复制原始响应头部
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      
      // 保持重要的头部用于静态资源处理
      if (['content-type', 'content-length', 'content-encoding', 'content-disposition',
           'cache-control', 'expires', 'last-modified', 'etag', 'accept-ranges'].includes(lowerKey)) {
        responseHeaders.set(key, value);
      }
      // 对于其他头部，也复制过来，但排除一些可能导致问题的
      else if (!['set-cookie', 'server', 'x-powered-by'].includes(lowerKey)) {
        responseHeaders.set(key, value);
      }
    }
    
    // 添加 CORS 头部，允许跨域访问
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Content-Type, Content-Disposition');
    
    // 对于文件下载，确保保持原始的 Content-Disposition 头部
    if (response.headers.get('content-disposition')) {
      responseHeaders.set('Content-Disposition', response.headers.get('content-disposition'));
    }
    
    // 创建新的响应对象
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    
    return newResponse;
    
  } catch (error) {
    // 处理错误情况
    return new Response(JSON.stringify({
      error: 'Failed to fetch target URL',
      message: error.message,
      targetUrl: targetUrl,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

// 处理 OPTIONS 请求（CORS 预检请求）
export function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Content-Type, Content-Disposition',
      'Access-Control-Max-Age': '86400',
    }
  });
}

// 处理 HEAD 请求（用于检查资源状态，不返回响应体）
export async function onRequestHead(context) {
  // HEAD 请求的处理逻辑与 GET 请求类似，但不返回响应体
  return onRequest(context);
}
