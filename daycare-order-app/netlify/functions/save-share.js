const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  try {
    const { payload } = JSON.parse(event.body);
    if (!payload) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'payload required' }) };
    }

    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const store = getStore({ name: 'shares', consistency: 'strong' });
    await store.set(id, JSON.stringify(payload), { metadata: { createdAt: Date.now() } });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
