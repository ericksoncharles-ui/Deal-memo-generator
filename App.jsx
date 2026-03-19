// Deal Memo Generator — React component (no build step, runs via Babel in-browser)
// All state and logic lives in a single JSX file.

const { useState, useMemo, useCallback, useRef, useEffect } = React;

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT =
  'You are a senior investment banker at a bulge bracket firm specializing in M&A and deal origination. Given a company description, produce a concise but rigorous deal memo covering: business model, market opportunity, key risks, comparable transactions, critical diligence questions, and a preliminary recommendation (Pass / Watch / Pursue). Use precise financial language. Be direct and opinionated.';

const EXAMPLE_DESCRIPTION = `Rippling is an enterprise HR and IT management platform that unifies payroll, benefits, device management, and app provisioning into a single system of record built on a core employee graph. Founded in 2016 by Parker Conrad (previously of Zenefits), Rippling has raised ~$1.2B across multiple rounds at a reported $13.5B valuation as of its Series F in 2023. The company targets mid-market businesses (50–2,000 employees) and operates a compound startup model where each product module — Payroll, PEO, Benefits, IT, Finance, Expenses — cross-sells off the same data layer, creating compounding lock-in and strong net dollar retention (reportedly >135% NDR). Revenue is estimated at $300–400M ARR growing 60%+ year-over-year. The business model is SaaS, priced per seat per module. Primary competitors include Workday and ADP in HCM, Gusto in SMB payroll, Okta and Jamf in IT management, and Bamboo HR in HR. The company has expanded to the UK and Australia and is exploring broader international markets. Key strategic questions center on path to profitability, competitive response from entrenched HCM incumbents, execution risk of maintaining multi-product velocity, and the timing and valuation of a potential IPO.`;

const buildUserPrompt = (description) => `Analyze the following company and produce a structured investment deal memo.

Use EXACTLY these section headers, each preceded by "##" on its own line:

## COMPANY OVERVIEW & BUSINESS MODEL
## MARKET OPPORTUNITY & TAM
## KEY RISKS
## COMPARABLE COMPANIES / COMPS
## CRITICAL DILIGENCE QUESTIONS
## PRELIMINARY VERDICT

Guidelines per section:
- COMPANY OVERVIEW & BUSINESS MODEL: 2–3 paragraphs. Core business, revenue model, key products, competitive moat, unit economics where known.
- MARKET OPPORTUNITY & TAM: Provide a specific TAM number with methodology (top-down and/or bottom-up). Include CAGR, current penetration, and primary growth drivers.
- KEY RISKS: Three clearly labeled subsections — "Regulatory Risk:", "Competitive Risk:", "Execution Risk:" — each 2–3 sentences. Be specific and direct.
- COMPARABLE COMPANIES / COMPS: Bulleted list of 5–7 public or private comps with relevant trading/transaction multiples (EV/Revenue, EV/EBITDA, growth rates) and a one-line rationale.
- CRITICAL DILIGENCE QUESTIONS: Numbered list of exactly 10 sharp, specific questions a lead banker would ask in first-round diligence.
- PRELIMINARY VERDICT: Start the section body with "RECOMMENDATION: [PASS / WATCH / PURSUE]" on its own line, then 3–4 sentences of direct, opinionated reasoning identifying the key value driver or primary dealbreaker.

Company Description:
${description}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSections(rawText) {
  // Splits on ## headers; normalises numbering ("## 1. Foo" → "FOO")
  const results = [];
  const re = /##\s+(?:\d+\.\s+)?([^\n]+)\n([\s\S]*?)(?=\n##\s+|$)/g;
  let m;
  while ((m = re.exec(rawText)) !== null) {
    results.push({
      header: m[1].trim(),
      key: m[1].trim().toUpperCase(),
      content: m[2].trim(),
    });
  }
  return results;
}

function getSectionMeta(key) {
  if (/COMPANY|OVERVIEW|BUSINESS/.test(key))
    return { icon: '◈', accent: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/5' };
  if (/MARKET|TAM|OPPORTUNITY/.test(key))
    return { icon: '◉', accent: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-500/5' };
  if (/RISK/.test(key))
    return { icon: '▲', accent: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-500/5' };
  if (/COMPARABLE|COMP/.test(key))
    return { icon: '≡', accent: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5' };
  if (/DILIGENCE|QUESTION/.test(key))
    return { icon: '?', accent: 'text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-500/5' };
  if (/VERDICT|RECOMMENDATION|PRELIMINARY/.test(key))
    return { icon: '★', accent: 'text-slate-300', border: 'border-slate-500/30', bg: 'bg-slate-500/5', isVerdict: true };
  return { icon: '◆', accent: 'text-slate-400', border: 'border-slate-600/30', bg: 'bg-slate-600/5' };
}

function getVerdictType(content) {
  const u = content.toUpperCase();
  if (/RECOMMENDATION:\s*PURSUE/.test(u)) return 'PURSUE';
  if (/RECOMMENDATION:\s*PASS/.test(u)) return 'PASS';
  if (/RECOMMENDATION:\s*WATCH/.test(u)) return 'WATCH';
  // Fallback: scan for standalone word
  if (u.includes('PURSUE')) return 'PURSUE';
  if (u.includes('PASS')) return 'PASS';
  return 'WATCH';
}

const VERDICT_STYLES = {
  PURSUE: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    card: 'border-emerald-500/30 bg-emerald-500/5',
    label: 'PURSUE',
  },
  WATCH: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    card: 'border-amber-500/30 bg-amber-500/5',
    label: 'WATCH',
  },
  PASS: {
    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    card: 'border-rose-500/30 bg-rose-500/5',
    label: 'PASS',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function renderInline(text) {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="text-slate-200 font-semibold">{p.slice(2, -2)}</strong>
      : p
  );
}

function FormattedContent({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const nodes = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      nodes.push(<div key={i} className="h-2" />);
    } else if (/^\d+\./.test(trimmed)) {
      // Numbered item
      const num = trimmed.match(/^(\d+\.)/)[1];
      const body = trimmed.replace(/^\d+\.\s*/, '');
      nodes.push(
        <div key={i} className="flex gap-3 items-start">
          <span className="font-mono text-slate-500 text-xs shrink-0 mt-0.5 w-5 text-right">{num}</span>
          <span className="text-slate-300 text-sm leading-relaxed">{renderInline(body)}</span>
        </div>
      );
    } else if (/^[-•*]/.test(trimmed)) {
      // Bullet item
      const body = trimmed.replace(/^[-•*]\s*/, '');
      nodes.push(
        <div key={i} className="flex gap-3 items-start">
          <span className="text-slate-600 shrink-0 mt-1 text-xs">›</span>
          <span className="text-slate-300 text-sm leading-relaxed">{renderInline(body)}</span>
        </div>
      );
    } else if (/^[A-Z][^a-z]{1,40}:/.test(trimmed)) {
      // Subsection label like "Regulatory Risk:"
      const colon = trimmed.indexOf(':');
      const label = trimmed.slice(0, colon + 1);
      const rest = trimmed.slice(colon + 1).trim();
      nodes.push(
        <div key={i} className="text-sm leading-relaxed mt-1">
          <span className="text-slate-200 font-semibold">{label}</span>
          {rest && <span className="text-slate-300"> {renderInline(rest)}</span>}
        </div>
      );
    } else if (/^RECOMMENDATION:/.test(trimmed)) {
      // Skip — rendered separately in VerdictCard
    } else {
      nodes.push(
        <p key={i} className="text-slate-300 text-sm leading-relaxed">
          {renderInline(trimmed)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-2">{nodes}</div>;
}

function SectionCard({ header, content, meta }) {
  return (
    <div className={`print-section rounded-xl border ${meta.border} ${meta.bg} p-5 space-y-3`}>
      <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
        <span className={`font-mono text-base ${meta.accent}`}>{meta.icon}</span>
        <h3 className={`text-[11px] font-bold tracking-widest uppercase ${meta.accent}`}>{header}</h3>
      </div>
      <FormattedContent text={content} />
    </div>
  );
}

function VerdictCard({ content }) {
  const type = getVerdictType(content);
  const style = VERDICT_STYLES[type];
  // Strip the "RECOMMENDATION: TYPE" line from the body
  const body = content.replace(/^RECOMMENDATION:\s*(PASS|WATCH|PURSUE)\s*\n?/i, '').trim();

  return (
    <div className={`print-section rounded-xl border ${style.card} p-5 space-y-3`}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base text-slate-300">★</span>
          <h3 className="text-[11px] font-bold tracking-widest uppercase text-slate-400">
            PRELIMINARY VERDICT
          </h3>
        </div>
        <span className={`px-4 py-1 rounded-full text-[11px] font-bold tracking-widest border ${style.badge}`}>
          {style.label}
        </span>
      </div>
      <FormattedContent text={body} />
    </div>
  );
}

function PulseDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [apiKey, setApiKey]             = useState('');
  const [showKey, setShowKey]           = useState(false);
  const [description, setDescription]  = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [streamText, setStreamText]     = useState('');
  const [rawMemo, setRawMemo]           = useState('');
  const [error, setError]               = useState('');
  const [copied, setCopied]             = useState(false);
  const [charCount, setCharCount]       = useState(0);

  const memoTopRef    = useRef(null);
  const streamEndRef  = useRef(null);

  // Auto-scroll streaming panel
  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamText]);

  const sections = useMemo(() => (rawMemo ? parseSections(rawMemo) : []), [rawMemo]);

  // ── Load example ──────────────────────────────────────────────────────────
  const handleExample = useCallback(() => {
    setDescription(EXAMPLE_DESCRIPTION);
    setCharCount(EXAMPLE_DESCRIPTION.length);
    setError('');
    setRawMemo('');
    setStreamText('');
  }, []);

  // ── Generate memo ─────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter your Anthropic API key.');
      return;
    }
    if (description.trim().length < 60) {
      setError('Please provide a more detailed company description (at least 60 characters).');
      return;
    }

    setIsLoading(true);
    setError('');
    setRawMemo('');
    setStreamText('');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2500,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(description.trim()) }],
        }),
      });

      if (!res.ok) {
        let msg = `API error ${res.status}`;
        try {
          const data = await res.json();
          msg = data.error?.message || msg;
        } catch {}
        if (res.status === 401) msg = 'Invalid API key. Please verify it at console.anthropic.com.';
        else if (res.status === 429) msg = 'Rate limit reached. Wait a moment then try again.';
        else if (res.status === 400) msg = 'Bad request — the description may contain unsupported characters.';
        throw new Error(msg);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full   = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              full += evt.delta.text;
              setStreamText(full);
            } else if (evt.type === 'error') {
              throw new Error(evt.error?.message || 'Stream error');
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      if (!full.trim()) throw new Error('Empty response received. Please try again.');

      setRawMemo(full);
      setStreamText('');

      // Scroll to memo
      setTimeout(() => memoTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (err) {
      let msg = err.message || 'An unexpected error occurred.';
      if (/fetch|network|Failed to fetch/i.test(msg)) {
        msg = 'Network error. Check your internet connection and try again.';
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, description]);

  // ── Copy / Export ──────────────────────────────────────────────────────────
  const copyMemo = useCallback(() => {
    if (!rawMemo) return;
    navigator.clipboard.writeText(rawMemo).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }, [rawMemo]);

  const exportMemo = useCallback(() => {
    if (!rawMemo) return;
    const blob = new Blob([rawMemo], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `deal-memo-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rawMemo]);

  const resetMemo = useCallback(() => {
    setRawMemo('');
    setStreamText('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080a0d] text-slate-100 font-sans">

      {/* ── Top nav bar ─────────────────────────────────────────────────────── */}
      <header className="no-print sticky top-0 z-50 border-b border-slate-800/80 bg-[#0a0c10]/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-mono text-xs font-bold text-amber-400 tracking-widest">DEAL MEMO</span>
            <span className="hidden sm:block h-4 w-px bg-slate-700" />
            <span className="hidden sm:block text-xs text-slate-500 font-mono tracking-wide">
              GENERATOR
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 font-mono hidden sm:block">Powered by</span>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
              {MODEL}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-10 space-y-8">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="no-print text-center space-y-4 pt-4 pb-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-100">
            Institutional-Grade Deal Memos,{' '}
            <span className="text-amber-400">Instantly</span>
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
            Paste a company description. Get a rigorous M&A deal memo — business model,
            TAM, risks, comps, diligence questions, and a preliminary investment verdict —
            written the way a senior banker would write it.
          </p>
        </div>

        {/* ── Input panel ───────────────────────────────────────────────────── */}
        {!rawMemo && (
          <div className="no-print bg-[#0d0f16] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl shadow-black/40">

            {/* API key */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-slate-400">
                <span className="text-amber-400">◈</span> Anthropic API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setError(''); }}
                  placeholder="sk-ant-api03-…"
                  className="w-full bg-[#141720] border border-slate-700 rounded-lg px-4 py-3 text-slate-200 text-sm font-mono placeholder-slate-700 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-all pr-20"
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-500 hover:text-slate-300 transition-colors tracking-widest"
                >
                  {showKey ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              <p className="text-[11px] text-slate-700 font-mono">
                Your key is never stored — used only for this request.
                Get yours at <span className="text-slate-600">console.anthropic.com</span>
              </p>
            </div>

            {/* Description textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-slate-400">
                  <span className="text-amber-400">◉</span> Company Description
                </label>
                <button
                  onClick={handleExample}
                  className="text-[11px] font-mono tracking-wide text-amber-500 hover:text-amber-400 border border-amber-500/25 hover:border-amber-500/50 px-3 py-1 rounded transition-all"
                >
                  TRY AN EXAMPLE →
                </button>
              </div>
              <textarea
                value={description}
                onChange={e => {
                  setDescription(e.target.value);
                  setCharCount(e.target.value.length);
                  setError('');
                }}
                placeholder="Describe the company: what they do, their business model, target market, competitive landscape, funding history, key metrics (ARR, growth rate, headcount), and any strategic context…"
                rows={9}
                className="w-full bg-[#141720] border border-slate-700 rounded-lg px-4 py-3 text-slate-200 text-sm placeholder-slate-700 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-all resize-none leading-relaxed"
              />
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-slate-700 font-mono">
                  {charCount.toLocaleString()} characters
                  {charCount > 0 && charCount < 60 &&
                    <span className="text-amber-700 ml-2">— add more detail for a better memo</span>
                  }
                </p>
                {charCount > 3500 && (
                  <p className="text-[11px] text-amber-700 font-mono">Consider trimming — 500 words is ideal</p>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-rose-900/20 border border-rose-800/40 rounded-lg px-4 py-3">
                <span className="text-rose-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-rose-300 text-sm">{error}</p>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={generate}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-[13px] tracking-widest uppercase py-4 rounded-xl transition-all duration-150 shadow-lg shadow-amber-500/10"
            >
              {isLoading ? (
                <>
                  <PulseDots />
                  <span className="text-amber-900">GENERATING MEMO…</span>
                </>
              ) : (
                <>
                  <span>⟶</span>
                  <span>GENERATE DEAL MEMO</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Streaming preview ─────────────────────────────────────────────── */}
        {isLoading && streamText && (
          <div className="no-print bg-[#0d0f16] border border-amber-500/20 rounded-2xl overflow-hidden shadow-lg shadow-amber-500/5">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800 bg-[#0b0d13]">
              <PulseDots />
              <span className="text-amber-400 font-mono text-[11px] tracking-widest">GENERATING — DO NOT CLOSE</span>
            </div>
            <div className="p-5 max-h-72 overflow-y-auto">
              <pre className="text-slate-500 text-xs font-mono leading-relaxed whitespace-pre-wrap cursor-blink">
                {streamText}
              </pre>
              <div ref={streamEndRef} />
            </div>
          </div>
        )}

        {/* ── Memo output ───────────────────────────────────────────────────── */}
        {rawMemo && sections.length > 0 && (
          <div ref={memoTopRef} className="space-y-4">

            {/* Memo header bar */}
            <div className="no-print flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <h2 className="font-mono text-[11px] font-bold tracking-widest uppercase text-slate-400">
                  Investment Deal Memo
                </h2>
                <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                  Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white transition-all"
                >
                  {copied ? '✓ COPIED' : '⎘ COPY'}
                </button>
                <button
                  onClick={exportMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] font-mono text-slate-300 hover:text-white transition-all"
                >
                  ↓ EXPORT
                </button>
                <button
                  onClick={resetMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] font-mono text-slate-400 hover:text-white transition-all"
                >
                  ↺ NEW
                </button>
              </div>
            </div>

            {/* Verdict first (most prominent) */}
            {(() => {
              const verdictSec = sections.find(s => /VERDICT|RECOMMENDATION|PRELIMINARY/.test(s.key));
              return verdictSec ? <VerdictCard content={verdictSec.content} /> : null;
            })()}

            {/* All other sections */}
            {sections
              .filter(s => !/VERDICT|RECOMMENDATION|PRELIMINARY/.test(s.key))
              .map(s => {
                const meta = getSectionMeta(s.key);
                return (
                  <SectionCard key={s.key} header={s.header} content={s.content} meta={meta} />
                );
              })
            }

            {/* Bottom action bar */}
            <div className="no-print flex flex-wrap justify-center gap-3 pt-4 pb-8">
              <button
                onClick={copyMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-mono text-slate-300 hover:text-white transition-all"
              >
                {copied ? '✓ COPIED' : '⎘ COPY FULL MEMO'}
              </button>
              <button
                onClick={exportMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl text-sm font-mono text-amber-400 hover:text-amber-300 transition-all"
              >
                ↓ EXPORT AS .TXT
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-mono text-slate-400 hover:text-white transition-all"
              >
                ⎙ PRINT
              </button>
              <button
                onClick={resetMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-mono text-slate-400 hover:text-white transition-all"
              >
                ↺ GENERATE ANOTHER
              </button>
            </div>
          </div>
        )}

        {/* If loading + no stream yet, show placeholder */}
        {isLoading && !streamText && (
          <div className="no-print flex flex-col items-center justify-center py-16 gap-4">
            <PulseDots />
            <p className="text-slate-500 font-mono text-xs tracking-widest">
              CONTACTING ANTHROPIC API…
            </p>
          </div>
        )}

      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="no-print border-t border-slate-800/60 mt-6 py-5">
        <div className="max-w-4xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono text-slate-700">
          <span>DEAL MEMO GENERATOR — POWERED BY ANTHROPIC</span>
          <span>FOR INFORMATIONAL PURPOSES ONLY — NOT INVESTMENT ADVICE</span>
        </div>
      </footer>

    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
