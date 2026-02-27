import { useMemo } from 'react';

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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
          },
        },
      },
    };
  </script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/lucide-react/dist/umd/lucide-react.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #ffffff;
      color: #111827;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    #root { min-height: 100vh; }

    /* Pre-loaded animation keyframes for generated apps */
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    @keyframes countUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fillRight { from { width: 0%; } to { width: var(--target-width, 100%); } }
    @keyframes ringFill { from { stroke-dashoffset: var(--ring-circumference, 377); } to { stroke-dashoffset: var(--ring-offset, 0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

    .sb-error {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 2rem; text-align: center; background: #fff; color: #111827;
    }
    .sb-error h2 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #ef4444; font-family: inherit; }
    .sb-error pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; font-size: 0.75rem;
      color: #6b7280; text-align: left; overflow: auto; max-width: 600px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="root">
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#fff">
      <div style="text-align:center;color:#9ca3af">
        <div style="width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1rem"></div>
        <div style="font-size:0.875rem;font-family:Inter,sans-serif">Loading app...</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
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
        '<div class="sb-error"><h2>App Error</h2><pre>' +
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
  const iframeKey = useMemo(() => `${appId}:${code}`, [appId, code]);

  const srcDoc = buildIframeHtml(code, appId);

  return (
    <iframe
      key={iframeKey}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      style={{
        width: '100%',
        height,
        border: 'none',
        display: 'block',
        background: '#ffffff',
      }}
      title="App Preview"
    />
  );
}
