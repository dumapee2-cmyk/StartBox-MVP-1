import { marked } from 'marked';
import type { OutputFormat } from '../lib/api';

interface Props {
  text: string;
  format: OutputFormat;
  label: string;
  appColor?: string;
}

// ── Score Card Parser ────────────────────────────────────────
// Expects AI to output: **Score: 87/100** and **Grade: B+**
function parseScoreCard(text: string) {
  const scoreMatch = text.match(/\*?\*?Score:\s*(\d+)\s*\/\s*(\d+)\*?\*?/i);
  const gradeMatch = text.match(/\*?\*?Grade:\s*([A-F][+-]?)\*?\*?/i);

  const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
  const total = scoreMatch ? parseInt(scoreMatch[2]) : 100;
  const grade = gradeMatch ? gradeMatch[1] : null;

  // Remove score/grade lines and parse breakdown sections
  const cleanText = text
    .replace(/\*?\*?Score:\s*\d+\s*\/\s*\d+\*?\*?/gi, '')
    .replace(/\*?\*?Grade:\s*[A-F][+-]?\*?\*?/gi, '')
    .trim();

  // Parse ## sections as breakdown items
  const sections = cleanText
    .split(/^##\s+/m)
    .filter((s) => s.trim())
    .map((s) => {
      const lines = s.trim().split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();
      // Try to extract a numeric value from the section for progress bars
      const numMatch = body.match(/\b(\d+(?:\.\d+)?)\s*(?:%|\/\d+)?/);
      return { title, body, numericHint: numMatch ? parseFloat(numMatch[1]) : null };
    });

  return { score, total, grade, sections, cleanText };
}

// Color based on score
function scoreColor(score: number, total: number): string {
  const pct = (score / total) * 100;
  if (pct >= 85) return '#16a34a';
  if (pct >= 70) return '#d97706';
  return '#dc2626';
}

// ── Cards Parser ─────────────────────────────────────────────
// Expects ## headers for each card, bold key:value pairs inside
function parseCards(text: string) {
  const sections = text
    .split(/^##\s+/m)
    .filter((s) => s.trim())
    .map((s) => {
      const lines = s.trim().split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      // Extract **key:** value pairs
      const kvPairs: { key: string; val: string }[] = [];
      const kvRegex = /\*\*([^*]+):\*\*\s*(.+)/g;
      let match;
      while ((match = kvRegex.exec(body)) !== null) {
        kvPairs.push({ key: match[1].trim(), val: match[2].trim() });
      }

      return { title, kvPairs, rawBody: body };
    });

  return sections;
}

// ── List Parser ──────────────────────────────────────────────
// Parses numbered or bulleted lists
function parseList(text: string): string[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const items: string[] = [];

  for (const line of lines) {
    // Match numbered list: 1. item
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) { items.push(numMatch[1].trim()); continue; }
    // Match bullet: - item or * item
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) { items.push(bulletMatch[1].trim()); continue; }
    // Plain line that isn't empty
    if (line.trim() && !line.startsWith('#')) {
      items.push(line.replace(/\*\*/g, '').trim());
    }
  }

  return items.filter(Boolean);
}

// ── Main Component ───────────────────────────────────────────
export function OutputRenderer({ text, format, label, appColor }: Props) {
  const color = appColor ?? '#165dff';

  if (format === 'score_card') {
    const { score, total, grade, sections } = parseScoreCard(text);
    const ringColor = score !== null ? scoreColor(score, total) : color;
    const pct = score !== null ? Math.round((score / total) * 100) : 0;

    return (
      <div className="output-card">
        <div className="output-card-header">
          <span className="output-card-label">{label}</span>
        </div>
        <div className="output-card-body">
          <div className="score-display">
            <div className="score-ring" style={{ borderColor: ringColor, color: ringColor }}>
              {score !== null ? (
                <>
                  <span className="score-number">{score}</span>
                  <span className="score-denom">/{total}</span>
                </>
              ) : (
                <span className="score-number">—</span>
              )}
            </div>
            <div className="score-meta">
              {grade && (
                <span className="score-grade" style={{ color: ringColor }}>
                  Grade: {grade}
                </span>
              )}
              <div className="score-summary">
                {pct >= 85 ? 'Excellent result' : pct >= 70 ? 'Good performance' : 'Needs improvement'}
              </div>
            </div>
          </div>

          {sections.length > 0 && (
            <div className="score-breakdown">
              {sections.map((s, i) => {
                // Infer bar fill from numeric hint or index
                const fillPct = s.numericHint !== null
                  ? Math.min(100, s.numericHint > 1 ? s.numericHint : s.numericHint * 100)
                  : Math.max(20, pct - i * 8);

                return (
                  <div key={i} className="breakdown-item">
                    <div className="breakdown-header">
                      <span className="breakdown-label">{s.title}</span>
                      <span className="breakdown-value">{s.body.split('\n')[0].slice(0, 50)}</span>
                    </div>
                    <div className="breakdown-bar-track">
                      <div
                        className="breakdown-bar-fill"
                        style={{ width: `${fillPct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (format === 'cards') {
    const cards = parseCards(text);
    if (cards.length === 0) {
      // Fall back to markdown
      return <MarkdownOutput text={text} label={label} />;
    }

    return (
      <div className="output-card">
        <div className="output-card-header">
          <span className="output-card-label">{label}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{cards.length} items</span>
        </div>
        <div className="output-card-body">
          <div className="cards-grid">
            {cards.map((card, i) => (
              <div key={i} className="result-card">
                <div className="result-card-title">{card.title}</div>
                {card.kvPairs.length > 0 ? (
                  <div className="result-card-kv">
                    {card.kvPairs.map((kv, j) => (
                      <div key={j} className="result-card-row">
                        <span className="result-card-key">{kv.key}</span>
                        <span className="result-card-val">{kv.val}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{card.rawBody.slice(0, 120)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (format === 'list') {
    const items = parseList(text);
    if (items.length === 0) {
      return <MarkdownOutput text={text} label={label} />;
    }

    return (
      <div className="output-card">
        <div className="output-card-header">
          <span className="output-card-label">{label}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{items.length} items</span>
        </div>
        <div className="output-card-body">
          <div className="list-output">
            {items.map((item, i) => (
              <div key={i} className="list-item">
                <span className="list-item-num" style={{ background: color }}>{i + 1}</span>
                <span className="list-item-text">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (format === 'report') {
    const html = marked.parse(text) as string;
    return (
      <div className="output-card">
        <div className="output-card-header">
          <span className="output-card-label">{label}</span>
        </div>
        <div className="output-card-body">
          <div className="report-output" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    );
  }

  if (format === 'markdown') {
    return <MarkdownOutput text={text} label={label} />;
  }

  // plain
  return (
    <div className="output-card">
      <div className="output-card-header">
        <span className="output-card-label">{label}</span>
      </div>
      <div className="output-card-body">
        <div className="plain-output">
          {text.split('\n\n').map((para, i) => (
            <p key={i}>{para.trim()}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarkdownOutput({ text, label }: { text: string; label: string }) {
  const html = marked.parse(text) as string;
  return (
    <div className="output-card">
      <div className="output-card-header">
        <span className="output-card-label">{label}</span>
      </div>
      <div className="output-card-body">
        <div className="markdown-output" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
