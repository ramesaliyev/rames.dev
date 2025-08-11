/**
 * Config
 */
const EXPIRATION_TTL = 24 * 60 * 60;

/**
 * Utils
 */
function res_json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

function res_na() {
  return new Response('Method not allowed.', {status: 405});
}

function res_err(error) {
  return res_json({error}, 500);
}

/**
 * Model
 */
class Model {
  #kv = null;

  constructor(kv) {
    this.#kv = kv;
  }

  #set(k, v) {
    return this.#kv.put(k, JSON.stringify(v), {
      expirationTtl: EXPIRATION_TTL
    });
  }

  #get(k) {
    return this.#kv.get(k, {type: 'json'});
  }

  #del(k) {
    return this.#kv.delete(k);
  }

  nextPurgeTime() {
    return new Date(Date.now() + EXPIRATION_TTL * 1000).toISOString();
  }

  createEntriesData() {
    return {
      entries: [],
    }
  }

  fetchEntries(slug) {
    return this.#get(slug);
  }

  async saveEntries(slug, data) {
    data.purgeTime = this.nextPurgeTime()
    await this.#set(slug, data);
    return data.purgeTime;
  }

  deleteEntries(slug) {
    return this.#del(slug);
  }
}

/**
 * GET /entries/<slug>
 */
async function api_entries_get([slug], model) {
  if (!slug) return res_na();

  const data = await model.fetchEntries(slug) || {};
  return res_json(data);
}

/**
 * DELETE /entries/<slug>
 */
async function api_entries_delete([slug], model) {
  if (!slug) return res_na();

  await model.deleteEntries(slug);
  return res_json({});
}

/**
 * POST /entries/<slug>
 */
async function api_entries_post([slug], model, req) {
  const body = await req.json();
  const entryContent = body?.content;
  if (!slug || !entryContent) return res_na();

  const data = await model.fetchEntries(slug) || model.createEntriesData();

  const nextId = (data.entries.at(-1)?.id ?? 0) + 1;
  data.entries.push({
    id: nextId,
    content: entryContent,
  });

  const purgeTime = await model.saveEntries(slug, data);
  return res_json({id: nextId, purgeTime});
}

/**
 * DELETE /entry/<slug>/<id>
 */
async function api_entry_delete([slug, entryId], model) {
  entryId = +entryId;
  if (!slug || !entryId) return res_na();

  const data = await model.fetchEntries(slug);
  data.entries = data.entries.filter(e => e.id !== entryId);

  if (!data.entries.length) {
    return api_entries_delete([slug], model);
  }

  const purgeTime = await model.saveEntries(slug, data);
  return res_json({purgeTime});
}

/**
 * Main
 */
const ENDPOINTS = {
  entries: {
    get: api_entries_get,
    post: api_entries_post,
    delete: api_entries_delete
  },
  entry: {
    delete: api_entry_delete
  }
}

export default async (req, env, ctx) => {
  const model = new Model(env.KV_CLIP);

  const url = new URL(req.url);
  const pathname = url.pathname;
  const segments = pathname.split('/').filter(Boolean).slice(1);
  const endpoint = segments[0];
  const args = segments.slice(1);
  const method = req.method.toLowerCase();

  const handler = ENDPOINTS[endpoint]?.[method];
  if (!handler) return res_na();

  try {
    return handler(args, model, req);
  } catch (err) {
    console.error(err);
    return res_err(err);
  }
};
