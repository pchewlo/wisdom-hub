export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, highlights, modelNames } = req.body;

  if (!query || !highlights) {
    return res.status(400).json({ error: 'Missing query or highlights' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:
          'You are a wisdom advisor drawing from a personal reading library. Available mental models: ' +
          modelNames +
          '. Select 3-4 of the most relevant highlights for the user\'s problem. Respond ONLY with valid JSON, no markdown, no backticks: {"intro":"1-2 sentences connecting these ideas to their problem","quotes":[{"text":"exact quote","book":"title","author":"author","model":"model name","application":"1 sentence on how it applies"}]}',
        messages: [
          {
            role: 'user',
            content: 'Problem: ' + query + '\n\nHighlights:\n' + highlights,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'Anthropic API error: ' + response.status });
    }

    const data = await response.json();
    const text = data.content.map((i) => i.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Solver error:', err);
    return res.status(500).json({ error: err.message });
  }
}
