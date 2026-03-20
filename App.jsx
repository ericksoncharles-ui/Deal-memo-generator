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
    return { accent: 'text-sky-400', leftBorder: 'border-l-sky-500' };
  if (/MARKET|TAM|OPPORTUNITY/.test(key))
    return { accent: 'text-violet-400', leftBorder: 'border-l-violet-500' };
  if (/RISK/.test(key))
    return { accent: 'text-rose-400', leftBorder: 'border-l-rose-500' };
  if (/COMPARABLE|COMP/.test(key))
    return { accent: 'text-amber-400', leftBorder: 'border-l-amber-500' };
  if (/DILIGENCE|QUESTION/.test(key))
    return { accent: 'text-teal-400', leftBorder: 'border-l-teal-500' };
  if (/VERDICT|RECOMMENDATION|PRELIMINARY/.test(key))
    return { accent: 'text-slate-300', leftBorder: 'border-l-slate-400', isVerdict: true };
  return { accent: 'text-slate-400', leftBorder: 'border-l-slate-600' };
}

function getVerdictType(content) {
  const u = content.toUpperCase();
  if (/RECOMMENDATION:\s*PURSUE/.test(u)) return 'PURSUE';
  if (/RECOMMENDATION:\s*PASS/.test(u)) return 'PASS';
  if (/RECOMMENDATION:\s*WATCH/.test(u)) return 'WATCH';
  if (u.includes('PURSUE')) return 'PURSUE';
  if (u.includes('PASS')) return 'PASS';
  return 'WATCH';
}

const VERDICT_STYLES = {
  PURSUE: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    outerBorder: 'border-emerald-500/20',
    leftBorder: 'border-l-emerald-500',
    headerBg: 'bg-emerald-500/[0.04]',
    headerBorder: 'border-emerald-500/15',
    label: 'PURSUE',
  },
  WATCH: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    outerBorder: 'border-amber-500/20',
    leftBorder: 'border-l-amber-500',
    headerBg: 'bg-amber-500/[0.04]',
    headerBorder: 'border-amber-500/15',
    label: 'WATCH',
  },
  PASS: {
    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    outerBorder: 'border-rose-500/20',
    leftBorder: 'border-l-rose-500',
    headerBg: 'bg-rose-500/[0.04]',
    headerBorder: 'border-rose-500/15',
    label: 'PASS',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>
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
      const num = trimmed.match(/^(\d+\.)/)[1];
      const body = trimmed.replace(/^\d+\.\s*/, '');
      nodes.push(
        <div key={i} className="flex gap-3 items-start">
          <span className="font-mono text-slate-600 text-xs shrink-0 mt-0.5 w-5 text-right select-none">{num}</span>
          <span className="text-slate-300 text-sm leading-relaxed">{renderInline(body)}</span>
        </div>
      );
    } else if (/^[-•*]/.test(trimmed)) {
      const body = trimmed.replace(/^[-•*]\s*/, '');
      nodes.push(
        <div key={i} className="flex gap-3 items-start">
          <span className="text-slate-700 shrink-0 mt-1 text-xs select-none">—</span>
          <span className="text-slate-300 text-sm leading-relaxed">{renderInline(body)}</span>
        </div>
      );
    } else if (/^[A-Z][^a-z]{1,40}:/.test(trimmed)) {
      const colon = trimmed.indexOf(':');
      const label = trimmed.slice(0, colon + 1);
      const rest = trimmed.slice(colon + 1).trim();
      nodes.push(
        <div key={i} className="text-sm leading-relaxed mt-2">
          <span className="text-white font-semibold">{label}</span>
          {rest && <span className="text-slate-300"> {renderInline(rest)}</span>}
        </div>
      );
    } else if (/^RECOMMENDATION:/.test(trimmed)) {
      // Skip — rendered separately in VerdictCard
    } else {
      nodes.push(
        <p key={i} className="text-slate-300 text-sm leading-[1.75]">
          {renderInline(trimmed)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-2.5">{nodes}</div>;
}

function SectionCard({ header, content, meta }) {
  return (
    <div className={`print-section rounded-xl overflow-hidden bg-[#0c0d12] border border-[#181a23] border-l-[3px] ${meta.leftBorder}`}>
      <div className="px-5 py-3.5 border-b border-[#181a23]">
        <h3 className={`text-[11px] font-bold tracking-[0.15em] uppercase ${meta.accent} font-mono`}>{header}</h3>
      </div>
      <div className="px-5 py-4">
        <FormattedContent text={content} />
      </div>
    </div>
  );
}

function VerdictCard({ content }) {
  const type = getVerdictType(content);
  const style = VERDICT_STYLES[type];
  const body = content.replace(/^RECOMMENDATION:\s*(PASS|WATCH|PURSUE)\s*\n?/i, '').trim();

  return (
    <div className={`print-section rounded-xl overflow-hidden border ${style.outerBorder} border-l-[3px] ${style.leftBorder}`}>
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${style.headerBorder} ${style.headerBg}`}>
        <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 font-mono">
          Preliminary Verdict
        </h3>
        <span className={`px-4 py-1 rounded text-[11px] font-bold tracking-[0.12em] border ${style.badge}`}>
          {style.label}
        </span>
      </div>
      <div className="px-5 py-4 bg-[#0c0d12]">
        <FormattedContent text={body} />
      </div>
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

function sanitizeText(text) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\x7F]/g, (c) => {
      return c.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
    });
}

function App() {
  const [description, setDescription]  = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [streamText, setStreamText]     = useState('');
  const [rawMemo, setRawMemo]           = useState('');
  const [error, setError]               = useState('');
  const [copied, setCopied]             = useState(false);
  const [charCount, setCharCount]       = useState(0);

  const memoTopRef   = useRef(null);
  const streamEndRef = useRef(null);

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamText]);

  const sections = useMemo(() => (rawMemo ? parseSections(rawMemo) : []), [rawMemo]);

  const handleExample = useCallback(() => {
    setDescription(EXAMPLE_DESCRIPTION);
    setCharCount(EXAMPLE_DESCRIPTION.length);
    setError('');
    setRawMemo('');
    setStreamText('');
  }, []);

  const generate = useCallback(async () => {
    if (description.trim().length < 20) {
      setError('Please provide a brief company description (at least 20 characters).');
      return;
    }

    setIsLoading(true);
    setError('');
    setRawMemo('');
    setStreamText('');

    try {
      const cleanDescription = sanitizeText(description.trim());
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2500,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(cleanDescription) }],
        }),
      });

      if (!res.ok) {
        let msg = `API error ${res.status}`;
        try {
          const data = await res.json();
          msg = data.error?.message || msg;
        } catch {}
        if (res.status === 429) msg = 'Rate limit reached. Wait a moment then try again.';
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
  }, [description]);

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
    <div className="min-h-screen bg-[#07080c] text-slate-100 font-sans">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="no-print sticky top-0 z-50 border-b border-[#181a23] bg-[#07080c]/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="6" fill="#111318" stroke="#1e2028" strokeWidth="1"/>
              {/* Document base */}
              <rect x="7" y="6" width="11" height="14" rx="1.5" fill="none" stroke="#f59e0b" strokeWidth="1.2"/>
              {/* Folded corner */}
              <path d="M15 6 L18 9 L15 9 Z" fill="#f59e0b" opacity="0.5"/>
              <line x1="15" y1="6" x2="15" y2="9" stroke="#f59e0b" strokeWidth="1.2"/>
              <line x1="15" y1="9" x2="18" y2="9" stroke="#f59e0b" strokeWidth="1.2"/>
              {/* Text lines on doc */}
              <line x1="9.5" y1="12" x2="15.5" y2="12" stroke="#f59e0b" strokeWidth="1" opacity="0.5"/>
              <line x1="9.5" y1="14.5" x2="14" y2="14.5" stroke="#f59e0b" strokeWidth="1" opacity="0.5"/>
              {/* Mini bar chart */}
              <rect x="16" y="17" width="2" height="4" rx="0.5" fill="#f59e0b" opacity="0.9"/>
              <rect x="19" y="15" width="2" height="6" rx="0.5" fill="#f59e0b" opacity="0.6"/>
            </svg>
            <span className="font-mono text-[11px] font-bold text-amber-400 tracking-[0.2em]">DEAL MEMO</span>
            <span className="h-4 w-px bg-[#252830] hidden sm:block" />
            <span className="hidden sm:block text-[11px] text-slate-600 font-mono tracking-[0.15em]">GENERATOR</span>
          </div>
          <div />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="no-print space-y-5 pt-2 pb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/[0.05]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-amber-400/80 uppercase">M&A Intelligence</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1]">
            Institutional-Grade<br />
            Deal Memos,{' '}
            <span className="text-amber-400">Instantly</span>
          </h1>
          <p className="text-slate-500 max-w-xl text-base leading-relaxed">
            Paste a company description. Get a rigorous M&A deal memo — business model,
            TAM, risks, comps, diligence questions, and a preliminary investment verdict —
            written the way a senior banker would write it.
          </p>
        </div>

        {/* ── Input panel ───────────────────────────────────────────────────── */}
        {!rawMemo && (
          <div className="no-print bg-[#0c0d12] border border-[#181a23] rounded-2xl p-6 space-y-5 shadow-2xl shadow-black/60">

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-500 font-mono">
                  Company Description
                </label>
                <button
                  onClick={handleExample}
                  className="text-[11px] font-mono text-amber-500/60 hover:text-amber-400 transition-colors tracking-wide"
                >
                  Try an example →
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
                className="w-full bg-[#09090f] border border-[#1e2028] rounded-xl px-4 py-3.5 text-slate-200 text-sm placeholder-[#2a2d3a] focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10 transition-all resize-none leading-relaxed"
              />
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-slate-700 font-mono">
                  {charCount.toLocaleString()} chars
                  {charCount > 0 && charCount < 20 &&
                    <span className="text-amber-700/60 ml-2">— add more detail for a better memo</span>
                  }
                </p>
                {charCount > 3500 && (
                  <p className="text-[11px] text-amber-700/60 font-mono">Consider trimming — 500 words is ideal</p>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-rose-950/30 border border-rose-900/30 rounded-xl px-4 py-3">
                <span className="text-rose-400 shrink-0 text-sm">⚠</span>
                <p className="text-rose-300/90 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={generate}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:bg-[#111318] disabled:text-slate-600 text-black font-bold text-[13px] tracking-[0.12em] uppercase py-4 rounded-xl transition-all duration-150 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
            >
              {isLoading ? (
                <>
                  <PulseDots />
                  <span className="text-black/60">Generating Memo…</span>
                </>
              ) : (
                <span>Generate Deal Memo →</span>
              )}
            </button>
          </div>
        )}

        {/* ── Streaming preview ─────────────────────────────────────────────── */}
        {isLoading && streamText && (
          <div className="no-print bg-[#0a0b10] border border-amber-500/10 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#181a23] bg-[#0c0d12]">
              <PulseDots />
              <span className="text-amber-400/60 font-mono text-[10px] tracking-[0.2em]">GENERATING — DO NOT CLOSE</span>
            </div>
            <div className="p-5 max-h-64 overflow-y-auto">
              <pre className="text-[#353a52] text-xs font-mono leading-relaxed whitespace-pre-wrap cursor-blink">
                {streamText}
              </pre>
              <div ref={streamEndRef} />
            </div>
          </div>
        )}

        {/* ── Loading placeholder ────────────────────────────────────────────── */}
        {isLoading && !streamText && (
          <div className="no-print flex flex-col items-center justify-center py-20 gap-4">
            <PulseDots />
            <p className="text-slate-700 font-mono text-[11px] tracking-[0.2em]">
              CONTACTING ANTHROPIC API…
            </p>
          </div>
        )}

        {/* ── Memo output ───────────────────────────────────────────────────── */}
        {rawMemo && sections.length > 0 && (
          <div ref={memoTopRef} className="space-y-3">

            {/* Memo header bar */}
            <div className="no-print flex items-center justify-between py-4 border-b border-[#181a23]">
              <div>
                <h2 className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-slate-500">
                  Investment Deal Memo
                </h2>
                <p className="text-[11px] text-slate-700 font-mono mt-0.5">
                  {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111318] hover:bg-[#181a23] border border-[#1e2028] rounded-lg text-[11px] font-mono text-slate-500 hover:text-white transition-all"
                >
                  {copied ? '✓ Copied' : '⎘ Copy'}
                </button>
                <button
                  onClick={exportMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111318] hover:bg-[#181a23] border border-[#1e2028] rounded-lg text-[11px] font-mono text-slate-500 hover:text-white transition-all"
                >
                  ↓ Export
                </button>
                <button
                  onClick={resetMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111318] hover:bg-[#181a23] border border-[#1e2028] rounded-lg text-[11px] font-mono text-slate-600 hover:text-white transition-all"
                >
                  ↺ New
                </button>
              </div>
            </div>

            {/* Verdict first — most prominent */}
            {(() => {
              const verdictSec = sections.find(s => /VERDICT|RECOMMENDATION|PRELIMINARY/.test(s.key));
              return verdictSec ? <VerdictCard content={verdictSec.content} /> : null;
            })()}

            {/* All other sections */}
            {sections
              .filter(s => !/VERDICT|RECOMMENDATION|PRELIMINARY/.test(s.key))
              .map(s => {
                const meta = getSectionMeta(s.key);
                return <SectionCard key={s.key} header={s.header} content={s.content} meta={meta} />;
              })
            }

            {/* Bottom action bar */}
            <div className="no-print flex flex-wrap justify-center gap-3 pt-6 pb-10">
              <button
                onClick={copyMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#111318] hover:bg-[#181a23] border border-[#1e2028] hover:border-[#272a36] rounded-xl text-sm font-mono text-slate-400 hover:text-white transition-all"
              >
                {copied ? '✓ Copied' : '⎘ Copy Full Memo'}
              </button>
              <button
                onClick={exportMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/[0.07] hover:bg-amber-500/[0.12] border border-amber-500/20 hover:border-amber-500/35 rounded-xl text-sm font-mono text-amber-400/70 hover:text-amber-300 transition-all"
              >
                ↓ Export as .txt
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#111318] hover:bg-[#181a23] border border-[#1e2028] hover:border-[#272a36] rounded-xl text-sm font-mono text-slate-500 hover:text-white transition-all"
              >
                ⎙ Print
              </button>
              <button
                onClick={resetMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#111318] hover:bg-[#181a23] border border-[#1e2028] hover:border-[#272a36] rounded-xl text-sm font-mono text-slate-500 hover:text-white transition-all"
              >
                ↺ Generate Another
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="no-print border-t border-[#181a23] mt-6 py-5">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-slate-800">
          <span>CREATED BY CHARLES ERICKSON</span>
          <span>FOR INFORMATIONAL PURPOSES ONLY — NOT INVESTMENT ADVICE</span>
        </div>
      </footer>

    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
