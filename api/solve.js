import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const RAW = require('./data.json');

/* ── DATA SETUP ── */
const ALL_HIGHLIGHTS = RAW.h.map((h, i) => ({ id: i, text: h[0], book: h[1], author: h[2] }));

const ALL_MODELS = Object.entries(RAW.m).map(([name, [desc, indices]]) => ({
  name,
  description: desc,
  highlightIds: indices,
}));

const H2M = {};
ALL_MODELS.forEach((m) => {
  m.highlightIds.forEach((id) => {
    if (!H2M[id]) H2M[id] = [];
    H2M[id].push(m.name);
  });
});

/* ── STOPWORDS ── */
const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'been', 'will', 'would',
  'could', 'should', 'what', 'how', 'when', 'where', 'which', 'about', 'into',
  'more', 'most', 'some', 'than', 'them', 'they', 'their', 'there', 'then',
  'very', 'just', 'also', 'like', 'make', 'know', 'take', 'come', 'made',
  'does', 'doing', 'being', 'having', 'going', 'want', 'need', 'think',
  'really', 'best', 'good', 'better', 'much', 'many', 'well', 'still',
  'keep', 'help', 'feel', 'way', 'can', 'not', 'but', 'for', 'are', 'was',
]);

/* ── CLAUDE API HELPER ── */
async function callClaude(apiKey, system, userMessage, maxTokens = 1000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Anthropic API error: ' + response.status + ' ' + errText);
  }

  const data = await response.json();
  const text = data.content.map((i) => i.text || '').join('');
  return text.replace(/```json|```/g, '').trim();
}

/* ── STAGE 1: MODEL ROUTING ── */
async function routeToModels(apiKey, query) {
  const modelList = ALL_MODELS.map((m) => `- ${m.name}: ${m.description}`).join('\n');

  const system = `You are helping match a user's question to the most relevant mental models from their personal reading library. Think carefully about which mental models would contain wisdom most applicable to the user's situation.`;

  const userMessage = `Mental models available:\n${modelList}\n\nUser's question: ${query}\n\nReturn the 5 most relevant mental models as a JSON array of names, ordered by relevance. Consider both direct and indirect relevance — a question about pricing might relate to models about psychology, risk, or decision-making, not just business.\n\nRespond ONLY with a valid JSON array, e.g. ["Model1","Model2","Model3","Model4","Model5"]`;

  const raw = await callClaude(apiKey, system, userMessage, 200);
  return JSON.parse(raw);
}

/* ── STAGE 2: SMART CANDIDATE SELECTION ── */
function selectCandidates(query, rankedModels) {
  // Extract meaningful query words
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  // Build set of highlight IDs from the selected models
  const modelRank = {};
  rankedModels.forEach((name, i) => {
    modelRank[name] = i;
  });

  const candidateIds = new Set();
  rankedModels.forEach((modelName) => {
    const model = ALL_MODELS.find((m) => m.name === modelName);
    if (model) {
      model.highlightIds.forEach((id) => candidateIds.add(id));
    }
  });

  // Score highlights within the selected models
  const scored = [...candidateIds].map((id) => {
    const h = ALL_HIGHLIGHTS[id];
    let score = 0;
    const textLower = h.text.toLowerCase();
    const bookLower = h.book.toLowerCase();

    // Keyword scoring
    words.forEach((w) => {
      if (textLower.includes(w)) score += 3;
      if (bookLower.includes(w)) score += 1;
    });

    // Model rank bonus — highlights from top-ranked models get priority
    const models = H2M[id] || [];
    let bestRank = 999;
    models.forEach((mName) => {
      if (modelRank[mName] !== undefined && modelRank[mName] < bestRank) {
        bestRank = modelRank[mName];
      }
    });
    if (bestRank === 0) score += 3;       // #1 ranked model
    else if (bestRank <= 1) score += 2;   // #2 ranked model
    else if (bestRank <= 2) score += 1;   // #3 ranked model

    // Slight bonus for highlights in multiple selected models (cross-model relevance)
    const selectedModelCount = models.filter((m) => modelRank[m] !== undefined).length;
    if (selectedModelCount > 1) score += selectedModelCount;

    return { ...h, score, models };
  });

  // Sort by score descending, take top 30
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 30);
}

/* ── STAGE 3: FINAL QUOTE SELECTION ── */
async function selectQuotes(apiKey, query, candidates) {
  const highlightCtx = candidates
    .map((h, i) => {
      const models = h.models.length ? ` [Models: ${h.models.join(', ')}]` : '';
      return `${i + 1}. [${h.book} — ${h.author || 'Unknown'}]${models}\n"${h.text}"`;
    })
    .join('\n\n');

  const system = `You are a wisdom advisor drawing from a personal reading library. The user is thinking through a problem and you must surface the most relevant, powerful wisdom from their highlights.

Your job is to select the 4-5 quotes that most directly illuminate the user's situation. Prefer quotes that:
- Offer a genuine shift in perspective on their specific question
- Provide actionable principles they can apply
- Come from different books/authors for diverse viewpoints
- Are substantive enough to be genuinely useful (not generic platitudes)`;

  const userMessage = `The user's question: ${query}

Here are the most relevant highlights from their library:

${highlightCtx}

Select the 4-5 quotes that best address their question. For each quote, explain specifically how it applies to their situation — not generic advice, but a concrete connection between the wisdom and their problem.

Respond ONLY with valid JSON, no markdown, no backticks:
{"intro":"2-3 sentences framing how these ideas connect to their question — be specific to their situation, not generic","quotes":[{"text":"the exact full quote from above","book":"book title","author":"author name","model":"the most relevant mental model for this quote","application":"2-3 sentences explaining specifically how this wisdom applies to their situation"}]}`;

  const raw = await callClaude(apiKey, system, userMessage, 1500);
  return JSON.parse(raw);
}

/* ── HANDLER ── */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Missing query' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Stage 1: Route to relevant mental models
    const rankedModels = await routeToModels(apiKey, query);

    // Stage 2: Build quality candidate pool from those models
    const candidates = selectCandidates(query, rankedModels);

    // Stage 3: Let Claude pick the best quotes with full context
    const result = await selectQuotes(apiKey, query, candidates);

    return res.status(200).json(result);
  } catch (err) {
    console.error('Solver error:', err);
    return res.status(500).json({ error: err.message });
  }
}
