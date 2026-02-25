import { useEffect, useRef, useState } from 'react';

interface AppPreviewProps {
  code: string;
  appId: string;
  height?: string;
}

function buildIframeHtml(code: string, appId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/lucide-react/dist/umd/lucide-react.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #root { min-height: 100vh; }
    .sb-error {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 2rem; text-align: center; background: #0f172a; color: #f1f5f9;
    }
    .sb-error h2 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #f87171; }
    .sb-error pre { background: #1e293b; border-radius: 8px; padding: 1rem; font-size: 0.75rem;
      color: #94a3b8; text-align: left; overflow: auto; max-width: 600px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="root">
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a">
      <div style="text-align:center;color:#6b7280">
        <div style="font-size:2rem;margin-bottom:1rem">⚡</div>
        <div style="font-size:0.875rem">Loading app...</div>
      </div>
    </div>
  </div>

  <script>
    // Inject AI proxy function
    window.__sbAI = async function(system, message) {
      const response = await fetch('/api/apps/${appId}/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: system, message: message })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(err.message || 'AI request failed');
      }
      const data = await response.json();
      return data.text;
    };

    // Map lucide-react UMD export
    if (window.LucideReact) {
      window.lucideReact = window.LucideReact;
    }

    // Global error handler
    window.onerror = function(msg, src, line, col, err) {
      document.getElementById('root').innerHTML =
        '<div class="sb-error"><h2>⚠ App Error</h2><pre>' +
        String(msg) + (err ? '\\n' + String(err.stack || '') : '') +
        '</pre></div>';
    };
  </script>

  <script type="text/babel" data-presets="react,env">
    ${code}
  </script>
</body>
</html>`;
}

export function AppPreview({ code, appId, height = '100%' }: AppPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Reload iframe when code changes
  useEffect(() => {
    setIframeKey((k) => k + 1);
  }, [code, appId]);

  const srcDoc = buildIframeHtml(code, appId);

  return (
    <iframe
      key={iframeKey}
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      style={{
        width: '100%',
        height,
        border: 'none',
        display: 'block',
        background: '#0f172a',
      }}
      title="App Preview"
    />
  );
}
