// Deal Memo Generator — React component (no build step, runs via Babel in-browser)
// All state and logic lives in a single JSX file.

const { useState, useMemo, useCallback, useRef, useEffect } = React;

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';

const buildSystemPrompt = (tone = 'banker', depth = 'standard', audience = 'ic') => {
  let prompt = 'You are a senior investment banker at a bulge bracket firm specializing in M&A and deal origination.';

  if (tone === 'aggressive') {
    prompt += ' Be opinionated, bold, and identify the biggest value drivers and risks clearly.';
  } else if (tone === 'conservative') {
    prompt += ' Be rigorous, thorough, and identify potential pitfalls and due diligence gaps.';
  }

  if (depth === 'executive') {
    prompt += ' Keep analysis concise and at 40% shorter length, focusing on highest-level drivers.';
  } else if (depth === 'deep') {
    prompt += ' Provide detailed analysis at 50% longer length, including nuanced competitive dynamics and scenario analysis.';
  }

  if (audience === 'presentation') {
    prompt += ' Format for an IC presentation — emphasize storytelling and clear visual structure.';
  } else if (audience === 'sellside') {
    prompt += ' Format for a sell-side pitch — emphasize seller strengths and valuation precedents.';
  }

  prompt += ' Given a company description, produce a rigorous deal memo covering: business model, market opportunity, key risks, comparable transactions, critical diligence questions, and a preliminary recommendation (Pass / Watch / Pursue). Use precise financial language. Be direct.';

  return prompt;
};

const EXAMPLE_DESCRIPTION = `Rippling is an enterprise HR and IT management platform that unifies payroll, benefits, device management, and app provisioning into a single system of record built on a core employee graph. Founded in 2016 by Parker Conrad (previously of Zenefits), Rippling has raised ~$1.2B across multiple rounds at a reported $13.5B valuation as of its Series F in 2023. The company targets mid-market businesses (50–2,000 employees) and operates a compound startup model where each product module — Payroll, PEO, Benefits, IT, Finance, Expenses — cross-sells off the same data layer, creating compounding lock-in and strong net dollar retention (reportedly >135% NDR). Revenue is estimated at $300–400M ARR growing 60%+ year-over-year. The business model is SaaS, priced per seat per module. Primary competitors include Workday and ADP in HCM, Gusto in SMB payroll, Okta and Jamf in IT management, and Bamboo HR in HR. The company has expanded to the UK and Australia and is exploring broader international markets. Key strategic questions center on path to profitability, competitive response from entrenched HCM incumbents, execution risk of maintaining multi-product velocity, and the timing and valuation of a potential IPO.`;

const buildUserPrompt = (description) => `Analyze the following company and produce a structured investment deal memo.

Use EXACTLY these section headers, each preceded by "##" on its own line:

## COMPANY OVERVIEW & BUSINESS MODEL
## MARKET OPPORTUNITY & TAM
## KEY RISKS
## COMPARABLE COMPANIES / COMPS
## CRITICAL DILIGENCE QUESTIONS
## PRELIMINARY VERDICT
## SOURCES & ASSUMPTIONS

Guidelines per section:
- COMPANY OVERVIEW & BUSINESS MODEL: 2–3 paragraphs. Core business, revenue model, key products, competitive moat, unit economics where known.
- MARKET OPPORTUNITY & TAM: Provide a specific TAM number with methodology (top-down and/or bottom-up). Include CAGR, current penetration, and primary growth drivers.
- KEY RISKS: Three clearly labeled subsections — "Regulatory Risk:", "Competitive Risk:", "Execution Risk:" — each 2–3 sentences. Be specific and direct.
- COMPARABLE COMPANIES / COMPS: Bulleted list of 5–7 public or private comps with relevant trading/transaction multiples (EV/Revenue, EV/EBITDA, growth rates) and a one-line rationale.
- CRITICAL DILIGENCE QUESTIONS: Numbered list of exactly 10 sharp, specific questions a lead banker would ask in first-round diligence.
- PRELIMINARY VERDICT: Start the section body with "RECOMMENDATION: [PASS / WATCH / PURSUE]" on its own line, then 3–4 sentences of direct, opinionated reasoning identifying the key value driver or primary dealbreaker.
- SOURCES & ASSUMPTIONS: A methodology transparency section. Use short labeled bullets, each starting with a category label in the format "Category:" followed by a brief note on sourcing or assumption basis. Cover: TAM methodology (how the market size was derived), Comps basis (what data source or proxy was used for multiples), Revenue/metrics (whether figures are disclosed, estimated, or extrapolated), and any material assumptions made in the analysis. Be honest about uncertainty. Do not fabricate specific URLs or report names. End with a bullet: "Data vintage: analysis reflects publicly available information through [state your training data cutoff period]."

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
  if (/SOURCE|ASSUMPTION/.test(key))
    return { accent: 'text-slate-500', leftBorder: 'border-l-slate-700', isSources: true };
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
          <span className="font-mono text-slate-500 text-xs shrink-0 mt-0.5 w-5 text-right select-none">{num}</span>
          <span className="text-slate-300 text-sm leading-relaxed">{renderInline(body)}</span>
        </div>
      );
    } else if (/^[-•*]/.test(trimmed)) {
      const body = trimmed.replace(/^[-•*]\s*/, '');
      nodes.push(
        <div key={i} className="flex gap-3 items-start">
          <span className="text-slate-500 shrink-0 mt-1 text-xs select-none">—</span>
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

function SectionCard({ header, content, meta, sectionKey, isEditing, isCopied, isRegenerating, onEdit, onCopy, onRegenerate }) {
  const [editText, setEditText] = useState(content);

  return (
    <div className={`print-section rounded-xl overflow-hidden bg-[#0d1525] border border-[#1a2438] border-l-[3px] ${meta.leftBorder}`}>
      <div className="px-5 py-3.5 border-b border-[#1a2438] flex items-center justify-between">
        <h3 className={`text-[11px] font-bold tracking-[0.15em] uppercase ${meta.accent} font-mono`}>{header}</h3>
        <div className="no-print flex items-center gap-1.5">
          <button
            onClick={() => onCopy(content, sectionKey)}
            className={`p-1 hover:bg-[#1a2438] rounded transition-all text-xs ${isCopied ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            title="Copy section"
          >
            {isCopied ? '✓' : '⎘'}
          </button>
          <button
            onClick={() => !isRegenerating && onRegenerate(sectionKey)}
            className={`p-1 hover:bg-[#1a2438] rounded transition-all text-xs ${isRegenerating ? 'text-amber-400 animate-spin' : 'text-slate-400 hover:text-white'}`}
            title="Regenerate section"
            disabled={isRegenerating}
          >
            ↻
          </button>
          {!isEditing && (
            <button
              onClick={() => onEdit(sectionKey)}
              className="p-1 hover:bg-[#1a2438] rounded text-slate-400 hover:text-white transition-all text-xs"
              title="Edit section"
            >
              ✎
            </button>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full bg-[#070c18] border border-[#1e2c3f] rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:border-amber-500/40 resize-none"
              rows={8}
            />
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(sectionKey, editText)}
                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded text-emerald-400 text-xs font-mono transition-all"
              >
                Save
              </button>
              <button
                onClick={() => onEdit(sectionKey)}
                className="px-3 py-1.5 bg-[#1a2438] hover:bg-[#243045] border border-[#1e2c3f] rounded text-slate-400 text-xs font-mono transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <FormattedContent text={content} />
        )}
      </div>
    </div>
  );
}

function VerdictCard({ content, onCopy, onRegenerate, isCopied, isRegenerating }) {
  const type = getVerdictType(content);
  const style = VERDICT_STYLES[type];
  const body = content.replace(/^RECOMMENDATION:\s*(PASS|WATCH|PURSUE)\s*\n?/i, '').trim();

  return (
    <div className={`print-section rounded-xl overflow-hidden border ${style.outerBorder} border-l-[3px] ${style.leftBorder}`}>
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${style.headerBorder} ${style.headerBg}`}>
        <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 font-mono">
          Preliminary Verdict
        </h3>
        <div className="flex items-center gap-2">
          <div className="no-print flex items-center gap-1">
            <button
              onClick={() => onCopy && onCopy(content, 'VERDICT')}
              className={`p-1 hover:bg-white/5 rounded transition-all text-xs ${isCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}
              title="Copy verdict"
            >
              {isCopied ? '✓' : '⎘'}
            </button>
            <button
              onClick={() => !isRegenerating && onRegenerate && onRegenerate('PRELIMINARY VERDICT')}
              className={`p-1 hover:bg-white/5 rounded transition-all text-xs ${isRegenerating ? 'text-amber-400 animate-spin' : 'text-slate-500 hover:text-white'}`}
              title="Regenerate verdict"
              disabled={isRegenerating}
            >
              ↻
            </button>
          </div>
          <span className={`px-4 py-1 rounded text-[11px] font-bold tracking-[0.12em] border ${style.badge}`}>
            {style.label}
          </span>
        </div>
      </div>
      <div className="px-5 py-4 bg-[#0d1525]">
        <FormattedContent text={body} />
      </div>
    </div>
  );
}

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const colors = type === 'success'
    ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
    : 'bg-rose-950/90 border-rose-500/30 text-rose-300';
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl font-mono text-xs backdrop-blur ${colors}`}>
      <span>{type === 'success' ? '✓' : '⚠'}</span>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">✕</button>
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

function renderMarkdown(rawMemo) {
  return rawMemo;
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
  const [fileLoading, setFileLoading]   = useState(false);
  const [fileError, setFileError]       = useState('');
  const [isDragging, setIsDragging]     = useState(false);
  const [fileName, setFileName]         = useState('');
  const [previewText, setPreviewText]   = useState('');
  const [previewFileName, setPreviewFileName] = useState('');

  // New feature states
  const [tone, setTone]                 = useState('banker');
  const [depth, setDepth]               = useState('standard');
  const [audience, setAudience]         = useState('ic');
  const [editingSections, setEditingSections] = useState({});
  const [sectionEdits, setSectionEdits] = useState({});
  const [history, setHistory]           = useState(() => {
    const saved = localStorage.getItem('dealMemoHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [copiedSection, setCopiedSection] = useState(null);
  const [regeneratingSection, setRegeneratingSection] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type });
  }, []);

  const memoTopRef   = useRef(null);
  const streamEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamText]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !rawMemo && !isLoading) {
        generate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [generate, rawMemo, isLoading]);

  const charCount = description.length;

  const sections = useMemo(() => {
    if (!rawMemo) return [];
    const parsed = parseSections(rawMemo);
    return parsed.map(s => ({
      ...s,
      content: sectionEdits[s.key] || s.content,
    }));
  }, [rawMemo, sectionEdits]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
      setFileError('Unsupported file type. Please upload a PDF, DOCX, or TXT file.');
      return;
    }
    setFileLoading(true);
    setFileError('');
    setFileName(file.name);
    try {
      let text = '';
      if (ext === 'txt') {
        text = await file.text();
      } else if (ext === 'pdf') {
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF library not loaded yet — please try again.');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map(item => item.str).join(' '));
        }
        text = pages.join('\n\n');
      } else if (ext === 'docx' || ext === 'doc') {
        if (typeof mammoth === 'undefined') throw new Error('DOCX library not loaded yet — please try again.');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }
      text = text.trim();
      if (!text) throw new Error('No readable text found in this file.');

      // Show preview instead of auto-filling
      setPreviewText(text);
      setPreviewFileName(file.name);
      setError('');
    } catch (err) {
      setFileError(err.message || 'Failed to read file.');
      setFileName('');
    } finally {
      setFileLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleExample = useCallback(() => {
    setDescription(EXAMPLE_DESCRIPTION);
    setError('');
    setRawMemo('');
    setStreamText('');
  }, []);

  const generate = useCallback(async () => {
    if (description.trim().length < 8) {
      setError('Please provide a brief company description (at least 8 characters).');
      return;
    }

    setIsLoading(true);
    setError('');
    setRawMemo('');
    setStreamText('');
    setShowFollowUp(false);
    setFollowUpText('');

    try {
      const cleanDescription = sanitizeText(description.trim());
      const systemPrompt = buildSystemPrompt(tone, depth, audience);

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2500,
          stream: true,
          system: systemPrompt,
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
      setSectionEdits({});
      setEditingSections({});

      // Save to history
      const historyEntry = {
        id: Date.now(),
        description: cleanDescription.slice(0, 100),
        memo: full,
        timestamp: new Date().toISOString(),
        tone, depth, audience,
      };
      const newHistory = [historyEntry, ...history].slice(0, 20);
      setHistory(newHistory);
      localStorage.setItem('dealMemoHistory', JSON.stringify(newHistory));

      setShowFollowUp(true);
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
  }, [description, tone, depth, audience, history]);

  const handleRegenerateSection = useCallback(async (sectionKey) => {
    if (!rawMemo) return;
    setRegeneratingSection(sectionKey);

    try {
      const currentSection = sections.find(s => s.key === sectionKey);
      if (!currentSection) return;

      const systemPrompt = buildSystemPrompt(tone, depth, audience);
      const prompt = `You are a senior investment banker. Regenerate ONLY the "${currentSection.header}" section of a deal memo. Keep the same depth and style as the original memo. Respond with ONLY the section content, starting with the header "## ${currentSection.header}" and the section text, no other text.`;

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1000,
          stream: false,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `${prompt}\n\nCompany: ${description.slice(0, 200)}...`
          }],
        }),
      });

      if (!res.ok) throw new Error('Failed to regenerate section');

      const data = await res.json();
      const newContent = data.content[0]?.text || '';
      const contentMatch = newContent.match(/##\s+[^\n]+\n([\s\S]*)/);
      const extractedContent = contentMatch ? contentMatch[1].trim() : newContent;

      setSectionEdits(prev => ({
        ...prev,
        [sectionKey]: extractedContent,
      }));
    } catch (err) {
      showToast('Failed to regenerate section: ' + err.message);
    } finally {
      setRegeneratingSection(null);
    }
  }, [rawMemo, sections, description, tone, depth, audience]);

  const copyMemo = useCallback(() => {
    if (!rawMemo) return;
    navigator.clipboard.writeText(getExportContent()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showToast('Memo copied to clipboard!', 'success');
    });
  }, [rawMemo, getExportContent, showToast]);

  const copySectionContent = useCallback((content, key) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedSection(key);
      setTimeout(() => setCopiedSection(null), 1500);
    });
  }, []);

  const getExportSlug = useCallback(() => {
    const slug = description.trim().split(/\s+/).slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    return (slug || 'deal-memo') + '-' + new Date().toISOString().slice(0, 10);
  }, [description]);

  const getExportContent = useCallback(() => {
    if (sections.length === 0) return rawMemo;
    return sections.map(s => `## ${s.header}\n${s.content}`).join('\n\n');
  }, [sections, rawMemo]);

  const exportPDF = useCallback(() => {
    if (!rawMemo) return;
    const element = memoTopRef.current;
    if (!element) return;

    // Simple approach: trigger print dialog
    window.print();
  }, [rawMemo]);

  const exportMarkdown = useCallback(() => {
    if (!rawMemo) return;
    const blob = new Blob([getExportContent()], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${getExportSlug()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rawMemo]);

  const exportTXT = useCallback(() => {
    if (!rawMemo) return;
    const blob = new Blob([getExportContent()], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${getExportSlug()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rawMemo]);

  const handleFollowUp = useCallback(async () => {
    if (!followUpText.trim() || !rawMemo) return;

    setIsLoading(true);
    try {
      const systemPrompt = buildSystemPrompt(tone, depth, audience);
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          stream: true,
          system: systemPrompt,
          messages: [
            { role: 'user', content: buildUserPrompt(sanitizeText(description.trim())) },
            { role: 'assistant', content: rawMemo },
            { role: 'user', content: followUpText },
          ],
        }),
      });

      if (!res.ok) throw new Error('Failed to process follow-up');

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
            }
          } catch (e) {}
        }
      }

      setFollowUpText('');
      // Append to rawMemo
      setRawMemo(prev => prev + '\n\n## FOLLOW-UP ANALYSIS\n' + full);
    } catch (err) {
      showToast('Failed: ' + err.message);
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  }, [followUpText, rawMemo, description, tone, depth, audience]);

  const resetMemo = useCallback(() => {
    setRawMemo('');
    setStreamText('');
    setError('');
    setShowFollowUp(false);
    setFollowUpText('');
    setSectionEdits({});
    setEditingSections({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const loadFromHistory = useCallback((entry) => {
    setDescription(entry.description);
    setRawMemo(entry.memo);
    setTone(entry.tone || 'banker');
    setDepth(entry.depth || 'standard');
    setAudience(entry.audience || 'ic');
    setSectionEdits({});
    setEditingSections({});
    setShowFollowUp(true);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('dealMemoHistory');
  }, []);

  const deleteHistoryEntry = useCallback((id) => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id);
      localStorage.setItem('dealMemoHistory', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleEditSection = useCallback((sectionKey, newContent = null) => {
    setEditingSections(prev => {
      const newState = { ...prev };
      if (newContent !== null) {
        setSectionEdits(prev2 => ({
          ...prev2,
          [sectionKey]: newContent,
        }));
      }
      newState[sectionKey] = !newState[sectionKey];
      return newState;
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-100 font-sans">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="no-print sticky top-0 z-50 border-b border-[#1a2438] bg-[#0a0f1e]/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {/* Logo mark */}
            <svg width="36" height="36" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="6" fill="#0f1928" stroke="#1e2c3f" strokeWidth="1"/>
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
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-bold text-amber-400 tracking-[0.18em]">DEAL MEMO</span>
              <span className="h-3.5 w-px bg-[#2a3a54] hidden sm:block self-center" />
              <span className="hidden sm:block text-sm font-bold text-slate-300 font-mono tracking-[0.18em]">GENERATOR</span>
            </div>
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
          <p className="text-slate-400 max-w-xl text-base leading-relaxed">
            Drop any company description — CIM, teaser, website, whatever you have. Get back a structured deal memo: business model breakdown, TAM with sizing logic, revenue quality and retention flags, risk factors ranked by materiality, public comps and precedent transactions, and sharp diligence questions ready for IC.
          </p>
        </div>

        {/* ── File preview modal ────────────────────────────────────────────── */}
        {previewText && (
          <div className="no-print fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#0d1525] border border-[#1a2438] rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="px-6 py-4 border-b border-[#1a2438] flex items-center justify-between">
                <h3 className="text-white font-bold">Review Extracted Text</h3>
                <span className="text-slate-500 text-xs">{previewFileName}</span>
              </div>
              <div className="px-6 py-4 overflow-y-auto flex-1">
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{previewText}</p>
              </div>
              <div className="px-6 py-4 border-t border-[#1a2438] flex gap-3 justify-end">
                <button
                  onClick={() => { setPreviewText(''); setPreviewFileName(''); setFileName(''); }}
                  className="px-4 py-2 bg-[#1a2438] hover:bg-[#243045] border border-[#1e2c3f] rounded-lg text-slate-400 text-sm font-mono transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setDescription(previewText);
                    setPreviewText('');
                    setPreviewFileName('');
                  }}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-mono transition-all"
                >
                  Use This Text
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── History panel ─────────────────────────────────────────────────── */}
        {!rawMemo && history.length > 0 && (
          <div className="no-print bg-[#0d1525] border border-[#1a2438] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-[#111b2d] transition-colors">
              <button
                onClick={() => setShowHistory(h => !h)}
                className="flex-1 flex items-center justify-between text-left"
              >
                <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 font-mono">
                  Recent Memos <span className="text-slate-600 ml-1.5">({history.length})</span>
                </span>
                <span className={`text-slate-500 text-xs transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`}>▾</span>
              </button>
              <button
                onClick={clearHistory}
                className="ml-4 text-[10px] font-mono text-slate-600 hover:text-rose-400 transition-colors"
                title="Clear all history"
              >
                Clear All
              </button>
            </div>
            {showHistory && (
              <div className="border-t border-[#1a2438] divide-y divide-[#1a2438]">
                {history.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#111b2d] group transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-300 text-xs truncate">{entry.description}</p>
                      <p className="text-slate-600 text-[10px] font-mono mt-0.5">
                        {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {entry.tone && entry.tone !== 'banker' && <span className="ml-2 text-amber-700/60">{entry.tone}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => loadFromHistory(entry)}
                      className="shrink-0 px-3 py-1 bg-[#1a2438] hover:bg-[#243045] border border-[#1e2c3f] rounded text-[10px] font-mono text-slate-400 hover:text-white transition-all"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteHistoryEntry(entry.id)}
                      className="shrink-0 p-1 text-slate-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Input panel ───────────────────────────────────────────────────── */}
        {!rawMemo && (
          <div className="no-print bg-[#0d1525] border border-[#1a2438] rounded-2xl p-6 space-y-5 shadow-2xl shadow-black/60">

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 font-mono">
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
                  setError('');
                }}
                placeholder="Describe the company: what they do, their business model, target market, competitive landscape, funding history, key metrics (ARR, growth rate, headcount), and any strategic context…"
                rows={9}
                className="w-full bg-[#070c18] border border-[#1e2c3f] rounded-xl px-4 py-3.5 text-slate-200 text-sm placeholder-[#1e2d47] focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10 transition-all resize-none leading-relaxed"
              />
              {(() => {
                const wordCount = description.trim() ? description.trim().split(/\s+/).length : 0;
                return (
                  <div className="flex justify-between items-center">
                    <p className="text-[11px] text-slate-500 font-mono">
                      {charCount.toLocaleString()} chars
                      {wordCount > 0 && <span className="text-slate-600 ml-2">· {wordCount} words</span>}
                      {charCount > 0 && charCount < 8 &&
                        <span className="text-amber-700/60 ml-2">— add more detail for a better memo</span>
                      }
                    </p>
                    {charCount > 3500 && (
                      <p className="text-[11px] text-amber-700/60 font-mono">Consider trimming — 500 words is ideal</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ── File upload ──────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#1a2438]" />
                <span className="text-[10px] font-mono text-slate-500 tracking-widest">OR UPLOAD A FILE</span>
                <div className="h-px flex-1 bg-[#1a2438]" />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
              />

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !fileLoading && fileInputRef.current?.click()}
                className={`cursor-pointer border border-dashed rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all ${
                  isDragging
                    ? 'border-amber-500/40 bg-amber-500/[0.04]'
                    : 'border-[#243045] hover:border-[#353a4a] hover:bg-[#111b2d]'
                } ${fileLoading ? 'cursor-default' : ''}`}
              >
                {fileLoading ? (
                  <>
                    <PulseDots />
                    <span className="text-slate-500 text-xs font-mono">Extracting text from {fileName}…</span>
                  </>
                ) : fileName && !fileError ? (
                  <>
                    <span className="text-emerald-500 text-sm">✓</span>
                    <span className="text-slate-400 text-xs font-mono truncate">{fileName}</span>
                    <span className="ml-auto text-[10px] text-slate-500 font-mono shrink-0">click to replace</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400 text-base leading-none">↑</span>
                    <span className="text-slate-400 text-xs font-mono">
                      Drop a file or <span className="text-slate-300">click to browse</span>
                    </span>
                    <span className="ml-auto text-[10px] text-slate-400 font-mono tracking-wide shrink-0">PDF · DOCX · TXT</span>
                  </>
                )}
              </div>

              {fileError && (
                <div className="flex items-start gap-2 px-3 py-2 bg-rose-950/20 border border-rose-900/25 rounded-lg">
                  <span className="text-rose-400 text-xs shrink-0">⚠</span>
                  <p className="text-rose-300/80 text-xs">{fileError}</p>
                </div>
              )}
            </div>

            {/* ── Generation options ────────────────────────────────────────── */}
            <div className="space-y-3 pt-3 border-t border-[#1a2438]">
              <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 font-mono">
                Analysis Settings
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 font-mono">Tone</label>
                  <select
                    value={tone}
                    onChange={e => setTone(e.target.value)}
                    className="w-full bg-[#070c18] border border-[#1e2c3f] rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none focus:border-amber-500/40"
                  >
                    <option value="banker">Professional (default)</option>
                    <option value="aggressive">Aggressive / Opinionated</option>
                    <option value="conservative">Conservative / Cautious</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 font-mono">Depth</label>
                  <select
                    value={depth}
                    onChange={e => setDepth(e.target.value)}
                    className="w-full bg-[#070c18] border border-[#1e2c3f] rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none focus:border-amber-500/40"
                  >
                    <option value="executive">Executive (brief)</option>
                    <option value="standard">Standard (default)</option>
                    <option value="deep">Deep Dive (detailed)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 font-mono">Audience</label>
                  <select
                    value={audience}
                    onChange={e => setAudience(e.target.value)}
                    className="w-full bg-[#070c18] border border-[#1e2c3f] rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none focus:border-amber-500/40"
                  >
                    <option value="ic">IC Review (default)</option>
                    <option value="presentation">IC Presentation</option>
                    <option value="sellside">Sell-Side Pitch</option>
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-rose-950/30 border border-rose-900/30 rounded-xl px-4 py-3">
                <span className="text-rose-400 shrink-0 text-sm">⚠</span>
                <div className="flex-1">
                  <p className="text-rose-300/90 text-sm">{error}</p>
                  <button
                    onClick={generate}
                    className="mt-2 text-xs font-mono text-rose-400 hover:text-rose-300 underline"
                  >
                    Try Again →
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={generate}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:bg-[#0f1928] disabled:text-slate-600 text-black font-bold text-[13px] tracking-[0.12em] uppercase py-4 rounded-xl transition-all duration-150 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
            >
              {isLoading ? (
                <>
                  <PulseDots />
                  <span className="text-black/60">Generating Memo…</span>
                </>
              ) : (
                <>
                  <span>Generate Deal Memo →</span>
                  <span className="text-black/40 text-[10px] font-normal tracking-normal hidden sm:inline">⌘↵</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Streaming preview ─────────────────────────────────────────────── */}
        {isLoading && streamText && (
          <div className="no-print bg-[#090e1b] border border-amber-500/10 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1a2438] bg-[#0d1525]">
              <PulseDots />
              <span className="text-amber-400/60 font-mono text-[10px] tracking-[0.2em]">GENERATING — DO NOT CLOSE</span>
            </div>
            <div className="p-5 max-h-64 overflow-y-auto">
              <pre className="text-[#5a7299] text-xs font-mono leading-relaxed whitespace-pre-wrap cursor-blink">
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
            <p className="text-slate-500 font-mono text-[11px] tracking-[0.2em]">
              CONTACTING ANTHROPIC API…
            </p>
          </div>
        )}

        {/* ── Memo output ───────────────────────────────────────────────────── */}
        {rawMemo && sections.length > 0 && (
          <div ref={memoTopRef} className="space-y-3">

            {/* Memo header bar */}
            <div className="no-print flex items-center justify-between py-4 border-b border-[#1a2438]">
              <div>
                <h2 className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase text-slate-500">
                  Investment Deal Memo
                </h2>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={copyMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] rounded-lg text-[11px] font-mono text-slate-500 hover:text-white transition-all"
                  title="Copy full memo"
                >
                  {copied ? '✓ Copied' : '⎘ Copy'}
                </button>
                <button
                  onClick={exportMarkdown}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] rounded-lg text-[11px] font-mono text-slate-500 hover:text-white transition-all"
                  title="Export as Markdown"
                >
                  ⎗ MD
                </button>
                <button
                  onClick={exportTXT}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] rounded-lg text-[11px] font-mono text-slate-500 hover:text-white transition-all"
                  title="Export as .txt"
                >
                  ↓ TXT
                </button>
                <button
                  onClick={resetMemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] rounded-lg text-[11px] font-mono text-slate-500 hover:text-white transition-all"
                  title="Generate new memo"
                >
                  ↺ New
                </button>
              </div>
            </div>

            {/* Verdict first — most prominent */}
            {(() => {
              const verdictSec = sections.find(s => /VERDICT|RECOMMENDATION|PRELIMINARY/.test(s.key));
              return verdictSec ? (
                <VerdictCard
                  content={verdictSec.content}
                  onCopy={copySectionContent}
                  onRegenerate={handleRegenerateSection}
                  isCopied={copiedSection === 'VERDICT'}
                  isRegenerating={regeneratingSection === verdictSec.key}
                />
              ) : null;
            })()}

            {/* All other sections */}
            {sections
              .filter(s => !/VERDICT|RECOMMENDATION|PRELIMINARY/.test(s.key))
              .map(s => {
                const meta = getSectionMeta(s.key);
                return (
                  <SectionCard
                    key={s.key}
                    header={s.header}
                    content={s.content}
                    meta={meta}
                    sectionKey={s.key}
                    isEditing={editingSections[s.key]}
                    isCopied={copiedSection === s.key}
                    isRegenerating={regeneratingSection === s.key}
                    onEdit={toggleEditSection}
                    onCopy={copySectionContent}
                    onRegenerate={handleRegenerateSection}
                  />
                );
              })
            }

            {/* Follow-up input */}
            {showFollowUp && !isLoading && (
              <div className="no-print bg-[#0d1525] border border-[#1a2438] rounded-xl p-4 space-y-3">
                <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400 font-mono">
                  Ask a Follow-Up Question
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={followUpText}
                    onChange={e => setFollowUpText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleFollowUp()}
                    placeholder="E.g., 'What's the path to profitability?' or 'Compare to Workday's valuation'"
                    className="flex-1 bg-[#070c18] border border-[#1e2c3f] rounded-lg px-3 py-2 text-slate-300 text-sm placeholder-[#1e2d47] focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/10"
                  />
                  <button
                    onClick={handleFollowUp}
                    disabled={isLoading || !followUpText.trim()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-[#0f1928] disabled:text-slate-600 text-black font-bold text-xs rounded-lg transition-all"
                  >
                    {isLoading ? '...' : 'Ask'}
                  </button>
                </div>
              </div>
            )}

            {/* Data vintage disclaimer */}
            <div className="no-print flex items-start gap-2.5 px-4 py-3 bg-[#080d1a] border border-[#141e30] rounded-xl">
              <span className="text-slate-700 text-[10px] mt-0.5 shrink-0">ⓘ</span>
              <p className="text-[11px] text-slate-600 font-mono leading-relaxed">
                This memo is AI-generated for analytical drafting purposes only. Market data, comparable multiples, and financial estimates reflect publicly available information through the model's training cutoff and have not been independently verified. Do not present to clients or use in IC materials without validating figures against live data sources (Bloomberg, PitchBook, public filings).
              </p>
            </div>

            {/* Bottom action bar */}
            <div className="no-print flex flex-wrap justify-center gap-3 pt-6 pb-10">
              <button
                onClick={copyMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] hover:border-[#28364f] rounded-xl text-sm font-mono text-slate-400 hover:text-white transition-all"
              >
                {copied ? '✓ Copied' : '⎘ Copy Full Memo'}
              </button>
              <button
                onClick={exportMarkdown}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] hover:border-[#28364f] rounded-xl text-sm font-mono text-slate-400 hover:text-white transition-all"
              >
                ⎗ Export as .md
              </button>
              <button
                onClick={exportTXT}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/[0.07] hover:bg-amber-500/[0.12] border border-amber-500/20 hover:border-amber-500/35 rounded-xl text-sm font-mono text-amber-400/70 hover:text-amber-300 transition-all"
              >
                ↓ Export as .txt
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] hover:border-[#28364f] rounded-xl text-sm font-mono text-slate-500 hover:text-white transition-all"
              >
                ⎙ Print
              </button>
              <button
                onClick={resetMemo}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0f1928] hover:bg-[#1a2438] border border-[#1e2c3f] hover:border-[#28364f] rounded-xl text-sm font-mono text-slate-500 hover:text-white transition-all"
              >
                ↺ Generate Another
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="no-print border-t border-[#1a2438] mt-6 py-5">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-slate-600">
          <span>© 2026 Developed by SoundMind AI | Powered by Anthropic</span>
          <span>For informational purposes only</span>
        </div>
      </footer>

    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
