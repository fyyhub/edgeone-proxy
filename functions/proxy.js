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
    
    // 创建代理请求，复制原始请求的方法、头部和内容
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    // 设置 Host 头部为目标域名
    proxyRequest.headers.set('Host', targetUrlObj.hostname);
    
    // 发送代理请求并获取响应
    const response = await fetch(proxyRequest);
    
    // 创建新的响应对象，复制原始响应的头部和内容
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    
    // 添加 CORS 头部，允许跨域访问
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    // 对于静态资源和文件下载，确保保持重要头部
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    const contentEncoding = response.headers.get('content-encoding');
    
    if (contentType) {
      newResponse.headers.set('Content-Type', contentType);
    }
    
    if (contentDisposition) {
      newResponse.headers.set('Content-Disposition', contentDisposition);
    }
    
    // 移除可能导致解码问题的编码头部
    if (contentEncoding) {
      newResponse.headers.delete('content-encoding');
    }
    
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    }
  });
}
