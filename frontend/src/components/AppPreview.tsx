import { useMemo } from 'react';

interface AppPreviewProps {
  code: string;
  appId: string;
  height?: string;
}

function buildIframeHtml(code: string, appId: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
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
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
          },
          fontSize: {
            'xs': ['0.75rem', { lineHeight: '1rem' }],
            'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
            'base': ['0.875rem', { lineHeight: '1.5rem' }],
            'lg': ['1rem', { lineHeight: '1.5rem' }],
            'xl': ['1.125rem', { lineHeight: '1.75rem' }],
            '2xl': ['1.25rem', { lineHeight: '1.75rem' }],
            '3xl': ['1.5rem', { lineHeight: '2rem' }],
            '4xl': ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
            '5xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em' }],
          },
          spacing: {
            '4.5': '1.125rem',
            '13': '3.25rem',
            '15': '3.75rem',
            '18': '4.5rem',
          },
          borderRadius: {
            'xl': '0.75rem',
            '2xl': '1rem',
            '3xl': '1.25rem',
          },
        },
      },
    };
  </script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/lucide-react/dist/umd/lucide-react.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: #09090b;
      color: rgba(255,255,255,0.9);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
    }
    #root { min-height: 100vh; background: #09090b; }

    /* ── Animation keyframes ── */
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fillRight { from { width: 0%; } to { width: var(--target-width, 100%); } }
    @keyframes ringFill { from { stroke-dashoffset: var(--ring-circumference, 377); } to { stroke-dashoffset: var(--ring-offset, 0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes glow { 0%, 100% { box-shadow: 0 0 20px var(--sb-primary-glow, rgba(99,102,241,0.15)); } 50% { box-shadow: 0 0 40px var(--sb-primary-glow, rgba(99,102,241,0.25)); } }

    /* ── Design system: glass surfaces ── */
    .glass {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 0.75rem;
    }
    .glass-elevated {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 0.75rem;
    }
    .glass-hover { transition: all 0.15s ease; cursor: pointer; }
    .glass-hover:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); transform: translateY(-1px); }

    /* ── Design system: inputs ── */
    .glass-input {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 0.625rem;
      color: white;
      padding: 0.625rem 0.875rem;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .glass-input::placeholder { color: rgba(255,255,255,0.25); }
    .glass-input:focus { border-color: var(--sb-primary, #6366f1); outline: none; box-shadow: 0 0 0 3px var(--sb-primary-glow, rgba(99,102,241,0.15)); }
    textarea.glass-input { min-height: 100px; resize: vertical; }

    /* ── Design system: buttons ── */
    .glass-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
      height: 2.5rem; padding: 0 1rem; border-radius: 0.625rem;
      font-weight: 500; font-size: 0.8125rem; font-family: inherit;
      border: none; cursor: pointer; transition: all 0.15s;
      white-space: nowrap;
    }
    .glass-btn-primary {
      background: var(--sb-primary, #6366f1); color: white;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 0 16px var(--sb-primary-glow, rgba(99,102,241,0.2));
    }
    .glass-btn-primary:hover { filter: brightness(1.15); box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 0 24px var(--sb-primary-glow, rgba(99,102,241,0.3)); }
    .glass-btn-primary:active { transform: scale(0.98); }
    .glass-btn-secondary {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.8);
    }
    .glass-btn-secondary:hover { background: rgba(255,255,255,0.1); color: white; }
    .glass-btn-lg { height: 2.75rem; padding: 0 1.25rem; font-size: 0.875rem; border-radius: 0.75rem; }

    /* ── Design system: cards ── */
    .sb-card {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 0.75rem; padding: 1.25rem;
    }
    .sb-stat {
      display: flex; flex-direction: column; gap: 0.25rem;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 0.75rem; padding: 1.25rem;
    }
    .sb-stat-value { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: white; }
    .sb-stat-label { font-size: 0.8125rem; color: rgba(255,255,255,0.4); font-weight: 500; }
    .sb-stat-change { font-size: 0.75rem; font-weight: 500; }
    .sb-stat-change.up { color: #22c55e; }
    .sb-stat-change.down { color: #ef4444; }

    /* ── Design system: badges / pills ── */
    .sb-badge {
      display: inline-flex; align-items: center; gap: 0.25rem;
      padding: 0.125rem 0.5rem; border-radius: 9999px;
      font-size: 0.6875rem; font-weight: 500;
      background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6);
    }
    .sb-badge-primary { background: var(--sb-primary-bg, rgba(99,102,241,0.15)); color: var(--sb-primary, #6366f1); }

    /* ── Design system: navigation ── */
    .sb-nav {
      position: sticky; top: 0; z-index: 50;
      display: flex; align-items: center; justify-content: space-between;
      height: 3.5rem; padding: 0 1.25rem;
      background: rgba(9,9,11,0.8); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .sb-nav-brand { display: flex; align-items: center; gap: 0.625rem; font-weight: 600; font-size: 0.9375rem; }
    .sb-nav-tabs { display: flex; gap: 0.25rem; }
    .sb-nav-tab {
      padding: 0.375rem 0.75rem; border-radius: 0.5rem;
      font-size: 0.8125rem; font-weight: 500; color: rgba(255,255,255,0.45);
      cursor: pointer; transition: all 0.15s; border: none; background: none;
    }
    .sb-nav-tab:hover { color: rgba(255,255,255,0.7); }
    .sb-nav-tab.active { color: white; background: rgba(255,255,255,0.08); }

    /* ── Design system: list items ── */
    .sb-list-item {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.75rem; border-radius: 0.625rem;
      transition: background 0.15s; cursor: pointer;
    }
    .sb-list-item:hover { background: rgba(255,255,255,0.04); }

    /* ── Design system: divider ── */
    .sb-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 0; border: none; }

    /* ── Design system: skeleton loading ── */
    .sb-skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
      background-size: 200% 100%; border-radius: 0.5rem;
      animation: shimmer 1.5s infinite; color: transparent;
    }

    /* ── Error state ── */
    .sb-error {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 2rem; text-align: center; background: #09090b; color: white;
    }
    .sb-error h2 { font-size: 1rem; margin-bottom: 0.75rem; color: #f87171; font-weight: 600; }
    .sb-error pre {
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 0.625rem; padding: 1rem; font-size: 0.75rem;
      color: rgba(255,255,255,0.5); text-align: left; overflow: auto; max-width: 600px; white-space: pre-wrap;
    }

    /* ── Toast notifications ── */
    .sb-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      padding: 0.5rem 1rem; border-radius: 0.5rem; font-size: 0.8125rem; font-weight: 500;
      color: white; z-index: 9999; animation: slideUp 0.3s ease-out; pointer-events: none;
      backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1);
    }
    .sb-toast--success { background: rgba(34,197,94,0.85); }
    .sb-toast--error { background: rgba(239,68,68,0.85); }
    .sb-toast--info { background: rgba(59,130,246,0.85); }

    /* ── Utility: stagger children ── */
    .sb-stagger > * { animation: slideUp 0.4s ease-out both; }
    .sb-stagger > *:nth-child(1) { animation-delay: 0s; }
    .sb-stagger > *:nth-child(2) { animation-delay: 0.06s; }
    .sb-stagger > *:nth-child(3) { animation-delay: 0.12s; }
    .sb-stagger > *:nth-child(4) { animation-delay: 0.18s; }
    .sb-stagger > *:nth-child(5) { animation-delay: 0.24s; }
    .sb-stagger > *:nth-child(6) { animation-delay: 0.3s; }
    .sb-stagger > *:nth-child(7) { animation-delay: 0.36s; }
    .sb-stagger > *:nth-child(8) { animation-delay: 0.42s; }
    .sb-stagger > *:nth-child(n+9) { animation-delay: 0.48s; }

    /* ── Design system: progress bar ── */
    .sb-progress {
      width: 100%; height: 6px; background: rgba(255,255,255,0.06);
      border-radius: 9999px; overflow: hidden;
    }
    .sb-progress-fill {
      height: 100%; border-radius: 9999px;
      background: var(--sb-primary, #6366f1);
      transition: width 0.6s ease-out;
    }

    /* ── Design system: avatar ── */
    .sb-avatar {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; min-width: 32px;
      border-radius: 9999px; font-size: 0.75rem; font-weight: 600;
      background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6);
    }

    /* ── Design system: empty state ── */
    .sb-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 0.75rem; padding: 3rem 1.5rem; text-align: center;
      color: rgba(255,255,255,0.3); font-size: 0.8125rem;
    }

    /* ── Design system: toggle switch ── */
    .sb-toggle {
      position: relative; width: 40px; height: 22px;
      background: rgba(255,255,255,0.1); border-radius: 9999px;
      cursor: pointer; transition: background 0.2s; border: none;
    }
    .sb-toggle::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 18px; height: 18px; border-radius: 9999px;
      background: white; transition: transform 0.2s;
    }
    .sb-toggle.on { background: var(--sb-primary, #6366f1); }
    .sb-toggle.on::after { transform: translateX(18px); }

    /* ── Design system: tags ── */
    .sb-tag {
      display: inline-flex; align-items: center; gap: 0.25rem;
      padding: 0.125rem 0.625rem; border-radius: 0.375rem;
      font-size: 0.6875rem; font-weight: 600; text-transform: capitalize;
      background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);
    }
    .sb-tag-success { background: rgba(34,197,94,0.12); color: #22c55e; }
    .sb-tag-warning { background: rgba(234,179,8,0.12); color: #eab308; }
    .sb-tag-error { background: rgba(239,68,68,0.12); color: #ef4444; }
    .sb-tag-primary { background: var(--sb-primary-bg, rgba(99,102,241,0.12)); color: var(--sb-primary, #6366f1); }

    /* ── Design system: table ── */
    .sb-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    .sb-th {
      text-align: left; padding: 0.5rem 0.75rem;
      font-size: 0.6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;
      color: rgba(255,255,255,0.35); border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .sb-td {
      padding: 0.625rem 0.75rem; color: rgba(255,255,255,0.8);
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .sb-table tr:hover .sb-td { background: rgba(255,255,255,0.02); }

    /* ── Design system: form group ── */
    .sb-form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .sb-form-group label {
      font-size: 0.8125rem; font-weight: 500; color: rgba(255,255,255,0.6);
    }
    .sb-form-group .sb-helper {
      font-size: 0.6875rem; color: rgba(255,255,255,0.3);
    }

    /* ── Design system: search input ── */
    .sb-search { position: relative; }
    .sb-search .glass-input { padding-left: 2.5rem; }
    .sb-search-icon {
      position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%);
      color: rgba(255,255,255,0.3); pointer-events: none; display: flex;
    }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
  </style>
</head>
<body>
  <div id="root">
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#09090b">
      <div style="text-align:center;color:rgba(255,255,255,0.4)">
        <div style="width:28px;height:28px;border:2px solid rgba(255,255,255,0.08);border-top-color:var(--sb-primary,#6366f1);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 0.75rem"></div>
        <div style="font-size:0.8125rem;font-family:Inter,sans-serif">Loading app...</div>
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

  <script>
    // StartBox SDK — pre-loaded helpers for generated apps
    window.__sb = {
      useStore: function(key, defaultValue) {
        var _a = React.useState(function() {
          try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : defaultValue; } catch(e) { return defaultValue; }
        }), val = _a[0], setVal = _a[1];
        var update = React.useCallback(function(v) {
          setVal(function(prev) {
            var next = typeof v === 'function' ? v(prev) : v;
            try { localStorage.setItem(key, JSON.stringify(next)); } catch(e) {}
            return next;
          });
        }, [key]);
        return [val, update];
      },
      copy: async function(text) {
        try { await navigator.clipboard.writeText(text); window.__sb.toast('Copied!', 'success'); return true; } catch(e) { return false; }
      },
      fmt: {
        date: function(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); },
        time: function(d) { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
        number: function(n) { return Number(n).toLocaleString(); },
        currency: function(n) { return '$' + Number(n).toFixed(2); },
        percent: function(n) { return Math.round(n) + '%'; },
        relative: function(d) {
          var s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
          if (s < 60) return 'just now';
          if (s < 3600) return Math.floor(s/60) + 'm ago';
          if (s < 86400) return Math.floor(s/3600) + 'h ago';
          return Math.floor(s/86400) + 'd ago';
        },
      },
      toast: function(msg, type) {
        var el = document.createElement('div');
        el.className = 'sb-toast sb-toast--' + (type || 'success');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
      },
      // Utility: generate hex color variants
      color: function(hex, opacity) {
        var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (opacity || 1) + ')';
      },
      // Conditional className joiner: cn('a', cond && 'b', 'c') => 'a c' or 'a b c'
      cn: function() {
        var r = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          if (typeof a === 'string' && a) r.push(a);
        }
        return r.join(' ');
      },
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
        background: '#09090b',
      }}
      title="App Preview"
    />
  );
}
