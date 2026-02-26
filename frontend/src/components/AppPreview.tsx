import { useEffect, useRef, useState, useCallback } from 'react';

export interface HoveredElement {
  tagName: string;
  text: string;
  className: string;
  rect: { top: number; left: number; width: number; height: number };
  styles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    borderRadius: string;
    padding: string;
  };
  path: string;
}

interface AppPreviewProps {
  code: string;
  appId: string;
  height?: string;
  customizeMode?: boolean;
  onElementHover?: (element: HoveredElement | null) => void;
  onElementClick?: (element: HoveredElement) => void;
}

function buildIframeHtml(code: string, appId: string, customizeMode: boolean): string {
  const hoverScript = customizeMode ? `
    // Hover-to-customize detection
    (function() {
      var currentHighlight = null;
      var highlightOverlay = document.createElement('div');
      highlightOverlay.id = 'sb-hover-overlay';
      highlightOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #2563eb;border-radius:4px;background:rgba(37,99,235,0.08);z-index:99999;display:none;transition:all 0.1s ease;';

      var labelEl = document.createElement('div');
      labelEl.style.cssText = 'position:absolute;top:-22px;left:0;background:#2563eb;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;font-family:system-ui;white-space:nowrap;';
      highlightOverlay.appendChild(labelEl);

      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(highlightOverlay);
      });

      // Build a simple CSS path for identification
      function getPath(el) {
        var parts = [];
        while (el && el !== document.body) {
          var tag = el.tagName.toLowerCase();
          if (el.id) { parts.unshift(tag + '#' + el.id); break; }
          else if (el.className && typeof el.className === 'string') {
            parts.unshift(tag + '.' + el.className.split(' ')[0]);
          } else {
            parts.unshift(tag);
          }
          el = el.parentElement;
        }
        return parts.join(' > ');
      }

      function isInteractive(el) {
        var tag = el.tagName.toLowerCase();
        var interactiveTags = ['button','a','input','select','textarea','img','h1','h2','h3','h4','h5','h6','p','span','div','li','label','nav','header','footer','section','main'];
        return interactiveTags.includes(tag) || el.getAttribute('role') || el.onclick || el.style.cursor === 'pointer';
      }

      document.addEventListener('mousemove', function(e) {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === highlightOverlay || highlightOverlay.contains(el)) return;
        if (el === document.body || el === document.documentElement) {
          highlightOverlay.style.display = 'none';
          window.parent.postMessage({ type: 'sb-hover', element: null }, '*');
          return;
        }

        // Walk up to find a meaningful interactive element
        var target = el;
        var depth = 0;
        while (target && depth < 4) {
          if (isInteractive(target) && target.offsetWidth > 10 && target.offsetHeight > 10) break;
          target = target.parentElement;
          depth++;
        }
        if (!target || target === document.body) target = el;

        if (target === currentHighlight) return;
        currentHighlight = target;

        var rect = target.getBoundingClientRect();
        highlightOverlay.style.display = 'block';
        highlightOverlay.style.top = rect.top + 'px';
        highlightOverlay.style.left = rect.left + 'px';
        highlightOverlay.style.width = rect.width + 'px';
        highlightOverlay.style.height = rect.height + 'px';

        var tag = target.tagName.toLowerCase();
        labelEl.textContent = tag + (target.className && typeof target.className === 'string' ? '.' + target.className.split(' ')[0] : '');

        var computed = window.getComputedStyle(target);
        window.parent.postMessage({
          type: 'sb-hover',
          element: {
            tagName: target.tagName,
            text: (target.textContent || '').slice(0, 60),
            className: typeof target.className === 'string' ? target.className : '',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            styles: {
              backgroundColor: computed.backgroundColor,
              color: computed.color,
              fontSize: computed.fontSize,
              borderRadius: computed.borderRadius,
              padding: computed.padding
            },
            path: getPath(target)
          }
        }, '*');
      });

      document.addEventListener('mouseleave', function() {
        highlightOverlay.style.display = 'none';
        currentHighlight = null;
        window.parent.postMessage({ type: 'sb-hover', element: null }, '*');
      });

      document.addEventListener('click', function(e) {
        if (!currentHighlight) return;
        e.preventDefault();
        e.stopPropagation();
        var rect = currentHighlight.getBoundingClientRect();
        var computed = window.getComputedStyle(currentHighlight);
        window.parent.postMessage({
          type: 'sb-click',
          element: {
            tagName: currentHighlight.tagName,
            text: (currentHighlight.textContent || '').slice(0, 60),
            className: typeof currentHighlight.className === 'string' ? currentHighlight.className : '',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            styles: {
              backgroundColor: computed.backgroundColor,
              color: computed.color,
              fontSize: computed.fontSize,
              borderRadius: computed.borderRadius,
              padding: computed.padding
            },
            path: getPath(currentHighlight)
          }
        }, '*');
      }, true);
    })();
  ` : '';

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

    ${hoverScript}
  </script>

  <script type="text/babel" data-presets="react,env">
    ${code}
  </script>
</body>
</html>`;
}

export function AppPreview({ code, appId, height = '100%', customizeMode = false, onElementHover, onElementClick }: AppPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Reload iframe when code changes
  useEffect(() => {
    setIframeKey((k) => k + 1);
  }, [code, appId, customizeMode]);

  // Listen for messages from iframe
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'sb-hover') {
      onElementHover?.(event.data.element);
    } else if (event.data?.type === 'sb-click') {
      onElementClick?.(event.data.element);
    }
  }, [onElementHover, onElementClick]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const srcDoc = buildIframeHtml(code, appId, customizeMode);

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
