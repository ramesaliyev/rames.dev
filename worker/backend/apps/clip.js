function json_response(data, status=200) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    status: status
  });
}

async function path_api_get() {
  return new Response('200');
}

export default (req, env, ctx) => {
  const url = new URL(req.url);

  return json_response({
    pathname: url.pathname,
    search: url.search,
    method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
  });
}
