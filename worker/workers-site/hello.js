/**
 * Utils 
 */
function HTMLResponse(title, body, headers = {}) {
  const html = `<!DOCTYPE html>
    <html lang="en">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        html {
          font-family: monospace;
        }
      </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;

  return new Response(html, {
    headers: {
      ...headers,
      "content-type": "text/html;charset=UTF-8",
    },
  });
}

/**
 * Path Handlers: Protected 
 */

async function validate_jwt(jwt, jwks_cache) {
  const {jwtVerify, createRemoteJWKSet, experimental_jwksCache} = require('jose');

  // Using experimental cache feature.
  // https://github.com/panva/jose/blob/v5.6.3/src/jwks/remote.ts#L32
  let remote_options = {
    [experimental_jwksCache]: jwks_cache || {}, 
  };

  const JWKS_URL = `${ENV_HELLO_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  const JWKS = createRemoteJWKSet(new URL(JWKS_URL), remote_options);

  return await jwtVerify(jwt, JWKS, {
    issuer: ENV_HELLO_TEAM_DOMAIN,
    audience: ENV_HELLO_POLICY_AUD,
  });
}

async function get_jwks_cache() {
  return KV_DATA.get(ENV_JWKS_CACHE_KEY, {type: 'json', cacheTtl: ENV_JWKS_CACHE_TTL});
}

async function set_jwks_cache(jwks_data) {
  return KV_DATA.put(ENV_JWKS_CACHE_KEY, JSON.stringify(jwks_data));
}

async function verify_jwt(jwt, use_cache=true) {
  if (!use_cache) {
    return validate_jwt(jwt);
  }

  // Get cached JWKS data.
  const jwks_cache = await get_jwks_cache() || {};
  const uat = jwks_cache.uat ?? 0;

  // Validate the JWT.
  const jwt_result = await validate_jwt(jwt, jwks_cache);
    
  // If the JWKS data has changed, update the cache.
  if (uat !== jwks_cache?.uat) {
    await set_jwks_cache(jwks_cache);
  }

  return {
    uat: [uat, jwks_cache.uat],
    jwt_result,
  };
}

async function path_protected(event) {
  const req = event.request;
  const headers = Object.fromEntries(req.headers.entries());

  const token_key = 'cf-access-jwt-assertion';
  const token = headers[token_key];
  headers[token_key] = `<a target="_blank" href="https://jwt.io/#debugger-io?token=${token}">${token}</a>`;

  const headers_list = Object.entries(headers)
    .map(([key, value]) => `<li><strong>${key}</strong>: ${value}</li>`
  ).join('');

  let jwt_status;
  try {
    const result = await verify_jwt(token, ENV_JWKS_CACHE_USE);
    jwt_status = `<strong style="color:green">JWT Valid</strong>`;
    jwt_status += `<pre>${JSON.stringify(result, null, 2)}</pre>`;
  } catch (err) {
    jwt_status = `<strong style="color:red">JWT Invalid</strong>`;
    jwt_status += `<pre>${err}</pre>`;
  }

  return HTMLResponse("Protected Lands", `
    <h1>Welcome to the protected lands.</h1>
    <h2>Request Headers:</h2>
    <ul>${headers_list}</ul>
    <h2>JWT Validation</h2>
    ${jwt_status}
  `);
}

/**
 * Path Handlers Index and Basic Path Handlers 
 */
const path_handlers = {
  "/": path_home,
  "/protected": path_protected,
}

async function path_404() {
  return new Response('404');
}

async function path_home() {
  return new Response('Hello there 😎');
}

/**
 * Main Event Handler 
 */
export default event => {
  const req = event.request;
  const url = new URL(req.url);

  let path_handler = path_404

  if (path_handlers.hasOwnProperty(url.pathname)) {
    path_handler = path_handlers[url.pathname];
  }

  event.respondWith(path_handler(event));
}
