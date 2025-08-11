import {mapRequestToAsset} from '@cloudflare/kv-asset-handler'

import appDemo from './apps/demo';
import appServe from './apps/serve';
import appClip from './apps/clip';

const DOMAIN = 'rames.dev'

const APP_HANDLERS = {
  'demo': {
    server: appDemo,
  },
  'serve': {
    assetRoot: 'apps/serve/',
    matcher: url => url.pathname !== '/',
    server: appServe,
  },
  'clip': {
    assetRoot: 'apps/clip/',
    matcher: url => url.pathname.startsWith('/api/'),
    server: appClip,
    singlePage: true,
  },
  'utils': {
    assetRoot: 'apps/utils/',
  },
  'www': {
    assetRoot: 'apps/www/',
  },
};

export default {
  async fetch(req, env, ctx) {
    try {
      return serve(req, env, ctx);
    } catch (e) {
      return new Response(e.message || e.toString(), {status: 500});
    }
  }
}

async function serve(req, env, ctx) {
  const url = new URL(req.url);
  const hostname = url.hostname;
  
  let appName = hostname.replace(DOMAIN, '').replace('.', '');
  appName = appName && APP_HANDLERS[appName] ? appName : 'clip';
  
  // Get the handler for the matched app
  const appHandler = APP_HANDLERS[appName];

  // Check if this is a correct match for the server
  const matcher = appHandler.matcher || (() => true);

  // If the req matches the app's matcher, serve it
  if (appHandler.server && matcher(url)) {
    return appHandler.server(req, env, ctx);
  }

  // Otherwise, handle it as a static asset if appHandler has an assetRoot
  if (appHandler.assetRoot) {
    const assetHasExtension = url.pathname.match(/\.[a-z0-9]+$/i);
    const assetURL = new URL(mapRequestToAsset(req).url);
    const assetPathname = (appHandler.singlePage && !assetHasExtension) ? 'index.html' : assetURL.pathname;
    assetURL.pathname = appHandler.assetRoot + assetPathname;

    let asset = await env.ASSETS.fetch(assetURL.toString());
    let status = asset.status;
    let statusText = asset.statusText;

    if (!asset.ok) {
      asset = await env.ASSETS.fetch(`${url.origin}/404.html`);
      status = 404;
      statusText = 'Not Found';
    }

    const response = new Response(asset.body, {
      status: status,
      statusText: statusText,
      headers: asset.headers,
    });

    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'unsafe-url');
    response.headers.set('Feature-Policy', 'none');
    
    return response;
  }
};
