import { useState } from 'react';
import { Copy, Check, Download, Code } from 'lucide-react';

interface CodeSectionProps {
  code: string | undefined;
  appName: string;
}

export function CodeSection({ code, appName }: CodeSectionProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName.replace(/\s+/g, '-')}.jsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!code) {
    return (
      <div className="dash-code-empty">
        <Code size={48} strokeWidth={1} />
        <h2>No Generated Code</h2>
        <p>This app uses a dynamic spec and does not have standalone generated code.</p>
      </div>
    );
  }

  return (
    <div className="dash-code">
      <div className="dash-code-header">
        <span className="dash-code-title">Generated React Code</span>
        <div className="dash-code-actions">
          <button className="dash-btn dash-btn--ghost" onClick={handleCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="dash-btn dash-btn--ghost" onClick={handleDownload}>
            <Download size={16} />
            Download
          </button>
        </div>
      </div>
      <div className="dash-code-viewer">
        <pre><code>{code}</code></pre>
      </div>
    </div>
  );
}
