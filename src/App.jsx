import { useState, useCallback, useMemo } from 'react'
import RAW from './data.json'

/* ── DATA SETUP ── */
const ALL_HIGHLIGHTS = RAW.h.map((h, i) => ({ id: i, text: h[0], book: h[1], author: h[2] }))

const ALL_MODELS = Object.entries(RAW.m)
  .map(([name, [desc, indices]]) => ({ name, description: desc, highlightIds: indices, count: indices.length }))
  .sort((a, b) => b.count - a.count)

const H2M = {}
ALL_MODELS.forEach((m) => {
  m.highlightIds.forEach((id) => {
    if (!H2M[id]) H2M[id] = []
    H2M[id].push(m.name)
  })
})

const UNIQUE_BOOKS = new Set(ALL_HIGHLIGHTS.map((h) => h.book)).size

function getDailyInsight() {
  const eligible = ALL_MODELS.filter((m) => m.count >= 5)
  const model = eligible[Math.floor(Math.random() * eligible.length)]
  const ids = [...model.highlightIds].sort(() => Math.random() - 0.5)
  return { model, highlights: ids.slice(0, 3).map((id) => ALL_HIGHLIGHTS[id]) }
}

/* ── COLORS ── */
const c = {
  bg: '#FAF7F2', bgWarm: '#F5F0E8', bgCard: '#FFFFFF',
  border: '#E2DDD4', borderLight: '#EDE9E2',
  text: '#1A1917', textSec: '#5C5850', textMuted: '#908980', textFaint: '#B8B0A4',
  green: '#1B5E3B', greenLight: '#2D7A4F', greenPale: '#E8F0EA', greenFaint: 'rgba(27,94,59,0.06)',
  gold: '#9E7C20', goldLight: '#C49B26', goldFaint: 'rgba(158,124,32,0.08)',
}

const serif = "'EB Garamond', Georgia, serif"
const sans = "'Instrument Sans', -apple-system, sans-serif"
const mono = "'JetBrains Mono', monospace"

/* ── COMPONENT ── */
export default function App() {
  const [activeModel, setActiveModel] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('count')
  const [daily, setDaily] = useState(() => getDailyInsight())
  const [solverQuery, setSolverQuery] = useState('')
  const [solverLoading, setSolverLoading] = useState(false)
  const [solverResults, setSolverResults] = useState(null)

  /* Filtered models */
  const filteredModels = useMemo(() => {
    let list = [...ALL_MODELS]
    const q = search.toLowerCase().trim()
    if (q) {
      const matchIds = new Set()
      ALL_HIGHLIGHTS.forEach((h, i) => {
        if (h.text.toLowerCase().includes(q) || h.book.toLowerCase().includes(q) || (h.author || '').toLowerCase().includes(q))
          matchIds.add(i)
      })
      list = list
        .filter((m) => {
          if (m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) return true
          return m.highlightIds.some((id) => matchIds.has(id))
        })
        .map((m) => {
          const fIds = m.highlightIds.filter((id) => matchIds.has(id))
          const nm = m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
          return { ...m, displayCount: nm ? m.count : fIds.length }
        })
    }
    if (sortBy === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name))
    else list.sort((a, b) => (b.displayCount || b.count) - (a.displayCount || a.count))
    return list
  }, [search, sortBy])

  /* Active highlights */
  const activeHighlights = useMemo(() => {
    if (!activeModel) return []
    const m = ALL_MODELS.find((x) => x.name === activeModel)
    if (!m) return []
    let ids = m.highlightIds
    const q = search.toLowerCase().trim()
    if (q) {
      ids = ids.filter((id) => {
        const h = ALL_HIGHLIGHTS[id]
        return h.text.toLowerCase().includes(q) || h.book.toLowerCase().includes(q) || (h.author || '').toLowerCase().includes(q)
      })
    }
    return ids.map((id) => ALL_HIGHLIGHTS[id])
  }, [activeModel, search])

  /* Solver */
  const solveProblem = useCallback(async () => {
    const q = solverQuery.trim()
    if (!q || solverLoading) return
    setSolverLoading(true)
    setSolverResults(null)

    const qLower = q.toLowerCase()
    const words = qLower.split(/\s+/).filter((w) => w.length > 3)

    const scored = ALL_HIGHLIGHTS.map((h, i) => {
      let score = 0
      const tL = h.text.toLowerCase()
      const bL = h.book.toLowerCase()
      words.forEach((w) => {
        if (tL.includes(w)) score += 2
        if (bL.includes(w)) score += 1
      })
      if (H2M[i]) score += 1
      return { ...h, score, models: H2M[i] || [] }
    })
    scored.sort((a, b) => b.score - a.score)
    const top = scored.filter((h) => h.score > 0).slice(0, 12)
    const classified = ALL_HIGHLIGHTS.map((h, i) => ({ ...h, models: H2M[i] || [] })).filter((h) => h.models.length > 0)
    const rand = [...classified].sort(() => Math.random() - 0.5).slice(0, 8)
    const seen = new Set()
    const cands = [...top, ...rand]
      .filter((h) => { if (seen.has(h.id)) return false; seen.add(h.id); return true })
      .slice(0, 18)
    const ctx = cands
      .map((h) => `[${h.book}] "${h.text.slice(0, 200)}" ${h.models.length ? '{' + h.models[0] + '}' : ''}`)
      .join('\n')
    const modelNames = ALL_MODELS.map((m) => m.name).join(', ')

    try {
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, highlights: ctx, modelNames }),
      })
      if (!response.ok) throw new Error('API returned ' + response.status)
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setSolverResults(data)
    } catch (err) {
      console.error(err)
      setSolverResults({ intro: 'Could not reach the API — ' + err.message, quotes: [] })
    }
    setSolverLoading(false)
  }, [solverQuery, solverLoading])

  const toggleModel = useCallback((name) => {
    setActiveModel((prev) => (prev === name ? null : name))
  }, [])

  const qTrim = search.toLowerCase().trim()
  let searchCount = 0
  if (qTrim) {
    ALL_HIGHLIGHTS.forEach((h) => {
      if (h.text.toLowerCase().includes(qTrim) || h.book.toLowerCase().includes(qTrim) || (h.author || '').toLowerCase().includes(qTrim))
        searchCount++
    })
  }

  return (
    <div style={{ background: c.bg, minHeight: '100vh', fontFamily: sans, color: c.text }}>
      {/* HEADER */}
      <div style={{ padding: '2.5rem 2rem 2rem', borderBottom: `1px solid ${c.borderLight}`, background: 'linear-gradient(180deg, #FEFDFB 0%, #FAF7F2 100%)' }}>
        <div style={{ maxWidth: 1300, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.9rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: serif, fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.025em', color: c.green, margin: 0 }}>The Wisdom Hub</h1>
            <span style={{ fontFamily: serif, fontSize: '0.95rem', fontStyle: 'italic', color: c.textMuted }}>Your library, distilled into mental models</span>
          </div>
          <div style={{ display: 'flex', gap: '2.5rem', marginTop: '1.3rem', flexWrap: 'wrap' }}>
            {[[ALL_HIGHLIGHTS.length.toLocaleString(), 'HIGHLIGHTS'], [UNIQUE_BOOKS, 'BOOKS'], [ALL_MODELS.length, 'MENTAL MODELS'], ['12.6M', 'WORDS READ']].map(([num, label]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: serif, fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{num}</span>
                <span style={{ fontSize: '0.65rem', color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginTop: '0.1rem' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SOLVER */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '1.8rem 2rem 0.5rem' }}>
        <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, padding: '1.8rem 2rem', boxShadow: '0 4px 12px rgba(26,25,23,0.06)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c.green}, ${c.goldLight}, ${c.green})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontFamily: serif, fontSize: '1.3rem', fontWeight: 700, color: c.green }}>What are you thinking about?</span>
            <span style={{ fontFamily: serif, fontSize: '0.82rem', fontStyle: 'italic', color: c.textMuted }}>Your library will surface the wisdom you need</span>
          </div>
          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
            <input
              style={{ flex: 1, minWidth: 200, padding: '0.8rem 1rem', background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 10, color: c.text, fontFamily: serif, fontSize: '0.95rem', outline: 'none' }}
              placeholder="e.g. Should I raise my prices or keep growing first..."
              value={solverQuery}
              onChange={(e) => setSolverQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && solveProblem()}
              onFocus={(e) => (e.target.style.borderColor = c.green)}
              onBlur={(e) => (e.target.style.borderColor = c.border)}
            />
            <button
              onClick={solveProblem}
              disabled={solverLoading}
              style={{ padding: '0.8rem 1.6rem', background: solverLoading ? c.textMuted : c.green, color: '#fff', border: 'none', borderRadius: 10, fontFamily: sans, fontSize: '0.82rem', fontWeight: 600, cursor: solverLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
            >
              {solverLoading ? 'Thinking...' : 'Ask Your Library'}
            </button>
          </div>

          {solverLoading && (
            <div style={{ fontFamily: serif, fontStyle: 'italic', color: c.textMuted, padding: '1.5rem 0', textAlign: 'center' }}>
              Searching your library for wisdom...
            </div>
          )}

          {solverResults && (
            <div style={{ marginTop: '1.1rem' }}>
              {solverResults.intro && (
                <p style={{ fontFamily: serif, fontSize: '0.95rem', lineHeight: 1.7, color: c.text, marginBottom: '0.8rem' }}>{solverResults.intro}</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {(solverResults.quotes || []).map((q, i) => (
                  <div key={i} style={{ padding: '1rem 1.2rem', background: c.bgWarm, borderRadius: 10, borderLeft: `3px solid ${c.gold}` }}>
                    <div style={{ fontFamily: serif, fontSize: '0.92rem', lineHeight: 1.7, fontStyle: 'italic', color: c.text }}>"{q.text}"</div>
                    <div style={{ fontSize: '0.68rem', color: c.textMuted, marginTop: '0.4rem', fontWeight: 500 }}>
                      {q.book}{q.author ? ` — ${q.author}` : ''}
                      {q.model && <span style={{ display: 'inline-block', fontSize: '0.6rem', color: c.green, background: c.greenPale, padding: '0.12rem 0.45rem', borderRadius: 3, marginLeft: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{q.model}</span>}
                    </div>
                    {q.application && <div style={{ fontSize: '0.78rem', color: c.textSec, marginTop: '0.45rem', lineHeight: 1.5 }}>{q.application}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DAILY INSIGHT */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '1.6rem 2rem 0' }}>
        <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, padding: '1.4rem 1.6rem', boxShadow: '0 1px 3px rgba(26,25,23,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem' }}>
              <span style={{ fontFamily: serif, fontSize: '1.05rem', fontWeight: 600, color: c.gold }}>Daily Insight</span>
              <span style={{ fontSize: '0.62rem', color: c.green, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, background: c.greenPale, padding: '0.22rem 0.55rem', borderRadius: 4 }}>{daily.model.name}</span>
            </div>
            <button onClick={() => setDaily(getDailyInsight())} style={{ background: 'none', border: `1px solid ${c.border}`, color: c.textMuted, padding: '0.28rem 0.7rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500, fontFamily: sans }}>↻ Refresh</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {daily.highlights.map((h, i) => (
              <div key={i} style={{ padding: '0.85rem 1rem', background: c.bgWarm, borderRadius: 8, borderLeft: `2px solid ${c.gold}` }}>
                <div style={{ fontFamily: serif, fontSize: '0.9rem', lineHeight: 1.65, fontStyle: 'italic', color: c.text }}>"{h.text}"</div>
                <div style={{ fontSize: '0.66rem', color: c.textMuted, marginTop: '0.35rem', fontWeight: 500 }}>{h.book}{h.author ? ` — ${h.author}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SEARCH + MODELS */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '1.6rem 2rem 2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            style={{ width: '100%', maxWidth: 400, padding: '0.6rem 0.9rem', background: c.bgCard, border: `1.5px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: '0.82rem', outline: 'none' }}
            placeholder="🔍 Filter models and highlights..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveModel(null) }}
            onFocus={(e) => (e.target.style.borderColor = c.green)}
            onBlur={(e) => (e.target.style.borderColor = c.border)}
          />
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {['count', 'alpha'].map((s) => (
              <button key={s} onClick={() => setSortBy(s)} style={{ background: sortBy === s ? c.greenFaint : 'none', border: `1px solid ${sortBy === s ? c.green : c.borderLight}`, color: sortBy === s ? c.green : c.textMuted, padding: '0.25rem 0.6rem', borderRadius: 5, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 500 }}>
                {s === 'count' ? 'By count' : 'A–Z'}
              </button>
            ))}
          </div>
        </div>

        {qTrim && <div style={{ fontSize: '0.72rem', color: c.textMuted, marginBottom: '0.9rem', fontFamily: mono }}>{searchCount} highlights across {filteredModels.length} models</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '0.65rem' }}>
          {filteredModels.map((m) => (
            <div
              key={m.name}
              onClick={() => toggleModel(m.name)}
              style={{
                background: activeModel === m.name ? c.greenFaint : c.bgCard,
                border: `1.5px solid ${activeModel === m.name ? c.green : c.borderLight}`,
                borderRadius: 10, padding: '1rem 1.15rem', cursor: 'pointer',
                boxShadow: activeModel === m.name ? `0 0 0 3px ${c.greenFaint}, 0 4px 12px rgba(26,25,23,0.06)` : '0 1px 3px rgba(26,25,23,0.04)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontFamily: serif, fontSize: '1.02rem', fontWeight: 700, color: c.text, marginBottom: '0.2rem' }}>{m.name}</div>
              <div style={{ fontFamily: serif, fontSize: '0.78rem', color: c.textSec, lineHeight: 1.45, fontStyle: 'italic', marginBottom: '0.5rem' }}>{m.description}</div>
              <div style={{ fontFamily: mono, fontSize: '0.68rem', color: c.gold, fontWeight: 500 }}>{m.displayCount || m.count} highlight{(m.displayCount || m.count) !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        {/* HIGHLIGHT PANEL */}
        {activeModel && activeHighlights.length > 0 && (
          <div style={{ marginTop: '1.3rem', background: c.bgCard, border: `1.5px solid ${c.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 30px rgba(26,25,23,0.08)' }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: `1px solid ${c.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.bgWarm }}>
              <div>
                <div style={{ fontFamily: serif, fontSize: '1.2rem', fontWeight: 700, color: c.green }}>{activeModel}</div>
                <div style={{ fontFamily: mono, fontSize: '0.72rem', color: c.textMuted, marginTop: '0.1rem' }}>{activeHighlights.length} highlight{activeHighlights.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setActiveModel(null)} style={{ background: 'none', border: `1px solid ${c.border}`, color: c.textMuted, width: 28, height: 28, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem' }}>✕</button>
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {activeHighlights.map((h, i) => {
                const hm = H2M[h.id] || []
                return (
                  <div key={h.id} style={{ padding: '1rem 1.5rem', borderBottom: i < activeHighlights.length - 1 ? `1px solid ${c.borderLight}` : 'none' }}>
                    <div style={{ fontFamily: serif, fontSize: '0.93rem', lineHeight: 1.7 }}>"{h.text}"</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.45rem', gap: '0.8rem' }}>
                      <span style={{ fontSize: '0.7rem', color: c.gold, fontWeight: 600 }}>{h.book}</span>
                      <span style={{ fontSize: '0.68rem', color: c.textMuted, fontStyle: 'italic' }}>{h.author || ''}</span>
                    </div>
                    {hm.length > 1 && (
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                        {hm.filter((x) => x !== activeModel).map((x) => (
                          <span key={x} onClick={(e) => { e.stopPropagation(); toggleModel(x) }} style={{ fontSize: '0.58rem', color: c.green, background: c.greenPale, padding: '0.12rem 0.4rem', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>{x}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '1.5rem 2rem', fontFamily: serif, fontSize: '0.78rem', color: c.textFaint, fontStyle: 'italic', borderTop: `1px solid ${c.borderLight}`, maxWidth: 1300, margin: '0 auto' }}>
        "A reader lives a thousand lives before he dies. The man who never reads lives only one."
      </div>
    </div>
  )
}
