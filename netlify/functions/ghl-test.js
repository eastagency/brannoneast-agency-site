// ghl-test.js — temporary debug endpoint, remove after GHL is confirmed working
export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    return new Response(JSON.stringify({ error: 'env vars missing', GHL_API_KEY: !!apiKey, GHL_LOCATION_ID: !!locationId }), { status: 200, headers });
  }

  const contact = {
    locationId,
    firstName: 'Debug',
    lastName: 'Test',
    email: `debug-test-${Date.now()}@brannoneast.agency`,
    source: 'Debug Test',
    tags: ['Debug']
  };

  try {
    const resp = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
      body: JSON.stringify(contact)
    });
    const result = await resp.json();
    return new Response(JSON.stringify({ status: resp.status, ok: resp.ok, result }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ exception: e.message }), { status: 200, headers });
  }
};
