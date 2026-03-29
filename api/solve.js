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

/*
 * ── THEMATIC CLUSTERS ──
 * Models grouped by theme so lateral picks come from genuinely different angles.
 * When we pick "direct" models from one cluster, lateral picks come from others.
 */
const CLUSTERS = [
  { name: 'decision', models: ['Inversion', 'Second-Order Thinking', 'Circle of Competence', 'Explore vs Exploit'] },
  { name: 'risk', models: ['Antifragility', 'Optionality & Asymmetric Payoffs', 'Power Laws & Fat Tails', 'Survivorship Bias & Narrative Fallacy'] },
  { name: 'self', models: ['Self-Deception & Confabulation', 'Radical Acceptance', 'Stoic Sovereignty', 'Epistemological Humility'] },
  { name: 'craft', models: ['Creative Process & Mastery', 'The Resistance', 'Flow & Optimal Experience', 'Compounding'] },
  { name: 'meaning', models: ['Myth & Meaning-Making', 'Finite vs Infinite Games', 'Enough', 'Temporal Patience'] },
  { name: 'systems', models: ['Systems Over Goals', 'Incentive Architecture', 'Remarkability & Differentiation', 'Intangible Capital'] },
  { name: 'society', models: ['Skin in the Game', 'Via Negativa', 'Status Gradient', 'Private Vices, Public Benefits', 'Lollapalooza Effect'] },
  { name: 'leadership', models: ['Leadership Under Duress', 'The Unreasonable Man', 'Pattern & Elegance'] },
];

// Precompute: for each model, which cluster is it in?
const MODEL_TO_CLUSTER = {};
CLUSTERS.forEach((c) => {
  c.models.forEach((m) => { MODEL_TO_CLUSTER[m] = c.name; });
});

/*
 * ── SEMANTIC EXPANSIONS ──
 * Maps common query concepts to additional keywords that should boost
 * model scoring. This bridges the gap between how people phrase questions
 * and the language used in model descriptions.
 */
const EXPANSIONS = {
  'quit': ['risk', 'failure', 'fear', 'courage', 'meaning', 'purpose', 'enough', 'playing', 'resistance', 'mastery', 'soul'],
  'startup': ['risk', 'failure', 'creative', 'work', 'mastery', 'meaning', 'playing', 'resistance', 'soul', 'purpose'],
  'job': ['work', 'meaning', 'purpose', 'mastery', 'enough', 'soul', 'playing', 'resistance', 'status'],
  'career': ['work', 'meaning', 'purpose', 'mastery', 'enough', 'resistance', 'playing', 'status', 'soul'],
  'money': ['enough', 'wealth', 'status', 'meaning', 'purpose', 'soul'],
  'price': ['value', 'perception', 'status', 'differentiation', 'remarkable'],
  'decision': ['backwards', 'failure', 'risk', 'beyond', 'effects', 'playing', 'meaning'],
  'uncertain': ['knowledge', 'know', 'limits', 'disorder', 'volatility', 'humility', 'accept'],
  'fear': ['resistance', 'courage', 'creative', 'mastery', 'soul', 'accept'],
  'love': ['meaning', 'soul', 'surrender', 'accept', 'playing', 'myth'],
  'lead': ['duress', 'composure', 'sovereign', 'mastery', 'playing'],
  'team': ['incentive', 'systems', 'culture', 'mastery'],
  'fail': ['disorder', 'antifragile', 'resistance', 'mastery', 'meaning'],
  'success': ['enough', 'meaning', 'survivor', 'status', 'playing'],
  'stress': ['disorder', 'accept', 'composure', 'sovereign', 'flow'],
  'creative': ['resistance', 'mastery', 'flow', 'playing', 'meaning', 'soul'],
  'happy': ['enough', 'meaning', 'flow', 'accept', 'soul', 'playing'],
  'stuck': ['resistance', 'accept', 'creative', 'mastery', 'disorder'],
  'grow': ['compounding', 'mastery', 'creative', 'playing', 'disorder'],
  'compete': ['differentiation', 'remarkable', 'playing', 'asymmetric'],
  'relationship': ['accept', 'meaning', 'soul', 'surrender', 'playing'],
  'purpose': ['meaning', 'myth', 'soul', 'resistance', 'mastery', 'playing', 'enough'],
  'life': ['meaning', 'myth', 'soul', 'enough', 'playing', 'accept', 'mortality'],
};

/*
 * ── STAGE 1: SERVER-SIDE MODEL ROUTING (no LLM, free) ──
 * Score every model against the query using word overlap with names + descriptions.
 * Then pick 4 direct (highest scoring) + 3 lateral (from different clusters).
 */
function routeToModels(query) {
  const rawWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  // Expand query words with semantic associations
  const expandedSet = new Set(rawWords);
  rawWords.forEach((w) => {
    // Check if any expansion key is a substring of the word or vice versa
    Object.keys(EXPANSIONS).forEach((key) => {
      if (w.includes(key) || key.includes(w)) {
        EXPANSIONS[key].forEach((exp) => expandedSet.add(exp));
      }
    });
  });
  const words = [...expandedSet];

  const scored = ALL_MODELS.map((m) => {
    let score = 0;
    const nameLower = m.name.toLowerCase();
    const descLower = m.description.toLowerCase();

    // Direct query words score higher than expanded words
    rawWords.forEach((w) => {
      if (nameLower.includes(w)) score += 5;
      if (descLower.includes(w)) score += 3;
    });

    // Expanded words score lower but still contribute
    words.forEach((w) => {
      if (!rawWords.includes(w)) {
        if (nameLower.includes(w)) score += 3;
        if (descLower.includes(w)) score += 2;
      }
    });

    // Bonus for models with more highlights (richer pool)
    score += Math.min(m.highlightIds.length / 20, 2);

    return { ...m, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick top 4 as "direct" models
  const direct = scored.slice(0, 4);
  const directNames = new Set(direct.map((m) => m.name));
  const directClusters = new Set(direct.map((m) => MODEL_TO_CLUSTER[m.name]));

  // Pick 3 "lateral" models from clusters NOT represented in direct picks
  const lateral = scored
    .filter((m) => !directNames.has(m.name) && !directClusters.has(MODEL_TO_CLUSTER[m.name]))
    .slice(0, 3);

  // If we couldn't fill 3 lateral from different clusters, just take next best
  const remaining = 3 - lateral.length;
  if (remaining > 0) {
    const used = new Set([...directNames, ...lateral.map((m) => m.name)]);
    const extras = scored.filter((m) => !used.has(m.name)).slice(0, remaining);
    lateral.push(...extras);
  }

  return {
    direct: direct.map((m) => m.name),
    lateral: lateral.map((m) => m.name),
    all: [...direct.map((m) => m.name), ...lateral.map((m) => m.name)],
  };
}

/* ── STAGE 2: SMART CANDIDATE SELECTION ── */
function selectCandidates(query, models) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const directSet = new Set(models.direct);
  const allSet = new Set(models.all);

  const candidateIds = new Set();
  models.all.forEach((modelName) => {
    const model = ALL_MODELS.find((m) => m.name === modelName);
    if (model) {
      model.highlightIds.forEach((id) => candidateIds.add(id));
    }
  });

  const scored = [...candidateIds].map((id) => {
    const h = ALL_HIGHLIGHTS[id];
    let score = 0;
    const textLower = h.text.toLowerCase();
    const bookLower = h.book.toLowerCase();

    words.forEach((w) => {
      if (textLower.includes(w)) score += 3;
      if (bookLower.includes(w)) score += 1;
    });

    const hModels = H2M[id] || [];

    // Direct model bonus
    if (hModels.some((m) => directSet.has(m))) score += 2;

    // Cross-model relevance bonus
    const selectedCount = hModels.filter((m) => allSet.has(m)).length;
    if (selectedCount > 1) score += selectedCount;

    // Tag whether this is from a lateral model
    const isLateral = hModels.some((m) => !directSet.has(m) && allSet.has(m));

    return { ...h, score, models: hModels, isLateral };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take top 14 from direct models + top 6 from lateral models = 20 candidates
  const directCandidates = scored.filter((h) => !h.isLateral).slice(0, 14);
  const lateralCandidates = scored.filter((h) => h.isLateral).slice(0, 6);

  // Combine, deduplicate, cap at 20
  const seen = new Set();
  const combined = [...directCandidates, ...lateralCandidates].filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });

  return combined.slice(0, 20);
}

/* ── STAGE 3: FINAL QUOTE SELECTION (Haiku — fast & cheap) ── */
async function selectQuotes(apiKey, query, candidates) {
  const highlightCtx = candidates
    .map((h, i) => {
      const models = h.models.length ? ` [Models: ${h.models.join(', ')}]` : '';
      return `${i + 1}. [${h.book} — ${h.author || 'Unknown'}]${models}\n"${h.text}"`;
    })
    .join('\n\n');

  const system = `You are a wisdom advisor drawing from a personal reading library. The user is thinking through a problem and you must surface the most relevant, powerful wisdom from their highlights.

Select 5 quotes total:
- 2-3 quotes that DIRECTLY address the question with practical, relevant wisdom
- 2-3 quotes that offer a SURPRISING or LATERAL perspective — reframe the question entirely, challenge the premise, or illuminate it from a completely different angle (philosophy, spirituality, human nature, art, history)

The lateral quotes are the most valuable. Don't just find quotes that agree with the obvious framing. Find quotes that make the person think "I never would have connected that to my question, but it changes how I see it."

Prefer quotes from different books/authors.`;

  const userMessage = `The user's question: ${query}

Highlights from their library:

${highlightCtx}

Select 5 quotes. For each, explain specifically how it applies — especially for the lateral/surprising picks, draw out the non-obvious connection.

Respond ONLY with valid JSON, no markdown, no backticks:
{"intro":"2-3 sentences framing how these ideas connect to their question — weave together both the direct and unexpected angles","quotes":[{"text":"the exact full quote from above","book":"book title","author":"author name","model":"mental model","application":"2-3 sentences explaining specifically how this applies — for lateral picks, make the surprising connection explicit"}]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
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
    // Stage 1: Server-side model routing (free, instant)
    const models = routeToModels(query);

    // Stage 2: Build candidate pool — direct + lateral
    const candidates = selectCandidates(query, models);

    // Stage 3: Haiku picks the best quotes
    const result = await selectQuotes(apiKey, query, candidates);

    return res.status(200).json(result);
  } catch (err) {
    console.error('Solver error:', err);
    return res.status(500).json({ error: err.message });
  }
}
