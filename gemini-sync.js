// /api/gemini-sync.js
// Vercel Serverless Function — securely proxies AI-sync requests to Google Gemini.
// The Gemini API key NEVER touches the browser; it lives only in Vercel's
// Environment Variables (Project Settings → Environment Variables → GEMINI_API_KEY).

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

module.exports = async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server misconfiguration: GEMINI_API_KEY is not set in the deployment environment.'
    });
  }

  // Vercel parses JSON bodies automatically for Node functions, but guard anyway
  let prompt;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    prompt = body && body.prompt;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing "prompt" string in request body.' });
  }

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      return res.status(geminiRes.status).json({
        error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 500)}`
      });
    }

    const data = await geminiRes.json();

    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!text) {
      return res.status(502).json({ error: 'Gemini returned no usable content.', raw: data });
    }

    // Frontend (syncSection in the main HTML) reads result.text
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Sync request failed: ' + (err && err.message) });
  }
};
