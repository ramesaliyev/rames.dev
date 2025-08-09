export default (req, env, ctx) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req)
  }

  return handleRequest(req);
}

/**
 * Handle Cors
 */
const CORS_DEFAULT_METHODS = 'GET, HEAD, POST, OPTIONS';
const CORS_DEFAULT_HEADERS = 'Content-Type';
const CORS_DEFAULT_ORIGIN = '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_DEFAULT_ORIGIN
};

function handleCors({headers}) {
  return new Response(null, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': headers.get('Access-Control-Request-Method') || CORS_DEFAULT_METHODS,
      'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers') || CORS_DEFAULT_HEADERS
    }
  });
}

/**
 * Handle Request
 */
function getCacheProofURL(url) {
  const splittedUrl = url.split('?');
  const origin = splittedUrl[0];
  const querystring = splittedUrl[1] || '';
  return origin + '?' + querystring + '&CACHE_PURGER_TIMESTAMP=' + Date.now()
}

async function handleRequest(request) {
  const ownURL = request.url.match(/(https?:\/\/(.+?)\/)/)[0];
  const fileURL = request.url.replace(ownURL, '');

  if (fileURL) {
    try {
      // Fetch from origin server.
      let response = await fetch(getCacheProofURL(decodeURIComponent(fileURL)));

      // Create an identity TransformStream (a.k.a. a pipe).
      // The readable side will become our new response body.
      let {readable, writable} = new TransformStream();

      // Start pumping the body. NOTE: No await!
      response.body.pipeTo(writable);

      // ... and deliver our Response while that's running.
      return new Response(readable, {
        status: 200,
        headers: corsHeaders
      });
    } catch (e) {
      return new Response(e, {status: 500});
    }
  }

  return new Response('not sure what happen', {status: 500});
}
