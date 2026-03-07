import { useMemo } from 'react';

interface AppPreviewProps {
  code: string;
  appId: string;
  height?: string;
  mobile?: boolean;
}

export function buildIframeHtml(code: string, appId: string, mobile: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App Preview</title>
  <script>
    (function() {
      var s = document.createElement('script');
      s.src = 'https://cdn.tailwindcss.com';
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    })();
  </script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://cdn.jsdelivr.net/npm/lucide-react@0.575.0/dist/umd/lucide-react.js"></script>
  <script crossorigin src="https://unpkg.com/lucide-react@0.575.0/dist/umd/lucide-react.js"></script>
  <script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      margin: 0;
      background: transparent;
      line-height: 1.5;
    }
    #root { width: 100%; min-height: 100%; }

    .sb-loading {
      display: grid;
      place-items: center;
      min-height: 100vh;
      color: rgba(17, 24, 39, 0.7);
      font-size: 0.875rem;
    }

    .sb-error {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 2rem;
      background: #fef2f2;
      color: #111827;
      text-align: center;
    }
    .sb-error h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      color: #b91c1c;
    }
    .sb-error pre {
      margin: 0;
      max-width: 720px;
      text-align: left;
      white-space: pre-wrap;
      background: #ffffff;
      border: 1px solid #fecaca;
      border-radius: 0.5rem;
      padding: 0.875rem;
      font-size: 0.75rem;
      color: #7f1d1d;
    }

    .sb-toast {
      position: fixed;
      left: 50%;
      bottom: 1rem;
      transform: translateX(-50%);
      padding: 0.5rem 0.875rem;
      border-radius: 0.5rem;
      color: white;
      font-size: 0.8125rem;
      font-weight: 500;
      z-index: 9999;
    }
    .sb-toast--success { background: #059669; }
    .sb-toast--error { background: #dc2626; }
    .sb-toast--info { background: #2563eb; }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    ${mobile ? 'html { -webkit-text-size-adjust: 100%; }' : ''}
  </style>
</head>
<body>
  <div id="root">
    <div class="sb-loading">Loading app preview...</div>
  </div>

  <script>
    window.__sbAI = async function(system, message) {
      const response = await fetch('/api/apps/${appId}/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: system, message: message })
      });
      const raw = await response.text();
      let payload = null;
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (_err) {
          payload = null;
        }
      }
      if (!response.ok) {
        const errMsg = payload && typeof payload === 'object' && payload.message
          ? String(payload.message)
          : 'AI request failed';
        throw new Error(errMsg);
      }
      if (!payload || typeof payload !== 'object') {
        return '';
      }
      return typeof payload.text === 'string' ? payload.text : '';
    };

    var _FallbackIcon = function(props) {
      var size = (props && props.size) || 18;
      var sw = (props && props.strokeWidth) || 1.5;
      var color = (props && props.style && props.style.color) || (props && props.color) || 'currentColor';
      return React.createElement('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: props && props.style, className: props && props.className
      },
        React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
        React.createElement('circle', { cx: '12', cy: '12', r: '1', fill: color, stroke: 'none' })
      );
    };

    var _origLR = window.LucideReact || window.lucideReact || {};
    window.LucideReact = new Proxy(_origLR, {
      get: function(target, prop) {
        var val = target[prop];
        if (val !== undefined) return val;
        if (typeof prop === 'string' && /^[A-Z]/.test(prop)) return _FallbackIcon;
        return val;
      },
      has: function(target, prop) {
        if (prop in target) return true;
        if (typeof prop === 'string' && /^[A-Z]/.test(prop)) return true;
        return false;
      }
    });
    window.lucideReact = window.LucideReact;

    window.__sbRenderComplete = false;
    window.onerror = function(msg, src, line, col, err) {
      var detail = String(msg || 'Unknown error');
      if (err && err.stack) detail += '\n' + String(err.stack);
      if (src) detail += '\nSource: ' + src + (line ? ':' + line : '') + (col ? ':' + col : '');
      console.error('[StartBox Preview Error]', detail);
      if (!window.__sbRenderComplete) {
        var root = document.getElementById('root');
        if (root) root.innerHTML = '<div class="sb-error"><div><h2>App Error</h2><pre>' + detail + '</pre></div></div>';
      }
    };

    window.addEventListener('unhandledrejection', function(e) {
      var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled promise rejection';
      console.error('[StartBox Preview] Unhandled rejection:', msg);
    });

    var __sbStore = {};
    window.__sbForceUpdate = null;

    window.__sb = {
      useStore: function(key, defaultValue) {
        if (!(key in __sbStore)) {
          try {
            var saved = localStorage.getItem(key);
            __sbStore[key] = saved !== null ? JSON.parse(saved) : defaultValue;
          } catch (e) {
            __sbStore[key] = defaultValue;
          }
        }

        var setter = function(v) {
          var next = typeof v === 'function' ? v(__sbStore[key]) : v;
          __sbStore[key] = next;
          try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) {}
          if (window.__sbForceUpdate) window.__sbForceUpdate();
        };

        var result = [__sbStore[key], setter];
        result.get = function() { return __sbStore[key]; };
        result.set = setter;
        result.value = __sbStore[key];
        return result;
      },
      copy: async function(text) {
        try {
          await navigator.clipboard.writeText(text);
          window.__sb.toast('Copied!', 'success');
          return true;
        } catch (e) {
          return false;
        }
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
          if (s < 3600) return Math.floor(s / 60) + 'm ago';
          if (s < 86400) return Math.floor(s / 3600) + 'h ago';
          return Math.floor(s / 86400) + 'd ago';
        }
      },
      toast: function(msg, type) {
        var el = document.createElement('div');
        el.className = 'sb-toast sb-toast--' + (type || 'success');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function() {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 2400);
      },
      color: function(hex, opacity) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (opacity || 1) + ')';
      },
      cn: function() {
        var out = [];
        for (var i = 0; i < arguments.length; i += 1) {
          var value = arguments[i];
          if (typeof value === 'string' && value) out.push(value);
        }
        return out.join(' ');
      },
      img: function(keyword, width, height) {
        var w = width || 400;
        var h = height || 280;
        var seed = String(keyword || 'placeholder').toLowerCase().replace(/[^a-z0-9]/g, '-');
        return 'https://picsum.photos/seed/' + seed + '/' + w + '/' + h;
      }
    };

    window.useStore = window.__sb.useStore;
    window.toast = window.__sb.toast;
    window.fmt = window.__sb.fmt;
    window.color = window.__sb.color;
    window.copy = window.__sb.copy;
    window.cn = window.__sb.cn;
    window.img = window.__sb.img;
    window.sbAI = window.__sbAI;

    (function() {
      function ErrorBoundary(props) {
        this.state = { hasError: false, error: null };
      }
      ErrorBoundary.prototype = Object.create(React.Component.prototype);
      ErrorBoundary.prototype.constructor = ErrorBoundary;
      ErrorBoundary.getDerivedStateFromError = function(error) {
        return { hasError: true, error: error };
      };
      ErrorBoundary.prototype.componentDidCatch = function(error, info) {
        console.error('[StartBox] React render error:', error, info);
      };
      ErrorBoundary.prototype.render = function() {
        if (this.state.hasError) {
          var msg = this.state.error ? String(this.state.error.message || this.state.error) : 'Unknown render error';
          return React.createElement('div', { className: 'sb-error' },
            React.createElement('div', null,
              React.createElement('h2', null, 'Something went wrong'),
              React.createElement('pre', null, msg)
            )
          );
        }
        return this.props.children;
      };
      window.__SBErrorBoundary = ErrorBoundary;
    })();

    if (typeof ReactDOM !== 'undefined' && ReactDOM.createRoot) {
      (function() {
        function SBStoreProvider(props) {
          var _a = React.useState(0), setTick = _a[1];
          React.useEffect(function() {
            window.__sbForceUpdate = function() { setTick(function(t) { return t + 1; }); };
            return function() { window.__sbForceUpdate = null; };
          }, []);
          return props.children;
        }

        var originalCreateRoot = ReactDOM.createRoot;
        ReactDOM.createRoot = function(container) {
          var root = originalCreateRoot.call(ReactDOM, container);
          var originalRender = root.render;
          root.render = function(element) {
            window.__sbRenderComplete = true;
            return originalRender.call(root,
              React.createElement(window.__SBErrorBoundary, null,
                React.createElement(SBStoreProvider, null, element)
              )
            );
          };
          return root;
        };
      })();
    }
  </script>

  <script type="text/babel" data-presets="react,env,typescript">
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
      throw new Error('React/ReactDOM CDN unavailable');
    }
    ${code}
  </script>

  <script>
    setTimeout(function() {
      if (!window.__sbRenderComplete) {
        var root = document.getElementById('root');
        if (root) {
          root.innerHTML = '<div class="sb-error"><div><h2>App failed to load</h2><pre>The generated code failed to compile or render. Check browser console for details.</pre></div></div>';
        }
      }
    }, 10000);
  </script>
</body>
</html>`;
}

export function AppPreview({ code, appId, height = '100%', mobile = false }: AppPreviewProps) {
  const iframeKey = useMemo(() => `${appId}:${code}:${mobile}`, [appId, code, mobile]);
  const srcDoc = buildIframeHtml(code, appId, mobile);

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
      }}
      title="App Preview"
    />
  );
}
