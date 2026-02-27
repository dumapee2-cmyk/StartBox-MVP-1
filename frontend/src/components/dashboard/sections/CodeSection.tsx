import { useState, useMemo } from 'react';
import { Copy, Check, Download, Code, FileCode, FolderOpen } from 'lucide-react';

interface CodeSectionProps {
  code: string | undefined;
  appName: string;
}

interface VirtualFile {
  path: string;
  name: string;
  folder: string;
  code: string;
}

function classifyComponent(name: string): string {
  if (name === 'App') return 'src/pages';
  if (/Nav|Header|Footer|Sidebar|Layout|TopBar/i.test(name)) return 'src/components/layout';
  if (/Card|List|Grid|Item|Badge|Tag|Chip|Row|Cell/i.test(name)) return 'src/components/ui';
  if (/Modal|Dialog|Popup|Drawer|Sheet|Toast/i.test(name)) return 'src/components/overlay';
  if (/Score|Ring|Chart|Graph|Meter|Gauge/i.test(name)) return 'src/components/data';
  return 'src/components';
}

function parseVirtualFiles(code: string): VirtualFile[] {
  const files: VirtualFile[] = [];
  const lines = code.split('\n');

  // Find all top-level function/const component declarations
  const componentStarts: { name: string; lineIndex: number }[] = [];
  const fnPattern = /^function\s+([A-Z][A-Za-z0-9]+)\s*\(/;
  const constPattern = /^const\s+([A-Z][A-Za-z0-9]+)\s*=\s*(?:\(|function)/;

  for (let i = 0; i < lines.length; i++) {
    const fnMatch = lines[i].match(fnPattern);
    const constMatch = lines[i].match(constPattern);
    const match = fnMatch || constMatch;
    if (match) {
      componentStarts.push({ name: match[1], lineIndex: i });
    }
  }

  if (componentStarts.length === 0) {
    return [{ path: 'src/App.jsx', name: 'App.jsx', folder: 'src', code }];
  }

  // Everything before first component is "lib/utils.jsx"
  if (componentStarts[0].lineIndex > 0) {
    const utilsCode = lines.slice(0, componentStarts[0].lineIndex).join('\n').trim();
    if (utilsCode) {
      files.push({ path: 'src/lib/utils.jsx', name: 'utils.jsx', folder: 'src/lib', code: utilsCode });
    }
  }

  // Each component gets its own virtual file
  for (let i = 0; i < componentStarts.length; i++) {
    const start = componentStarts[i].lineIndex;
    const end = i < componentStarts.length - 1 ? componentStarts[i + 1].lineIndex : lines.length;
    const name = componentStarts[i].name;

    // Skip the ReactDOM.createRoot line — attach it to the App file
    let componentCode = lines.slice(start, end).join('\n').trim();
    const lastLine = lines[end - 1]?.trim() ?? '';
    if (lastLine.startsWith('ReactDOM.createRoot') && i < componentStarts.length - 1) {
      componentCode = lines.slice(start, end - 1).join('\n').trim();
    }

    const folder = classifyComponent(name);
    files.push({ path: `${folder}/${name}.jsx`, name: `${name}.jsx`, folder, code: componentCode });
  }

  // Attach the ReactDOM.createRoot to the last file if present
  const lastLine = lines[lines.length - 1]?.trim() ?? '';
  if (lastLine.startsWith('ReactDOM.createRoot') && files.length > 0) {
    files[files.length - 1].code += '\n\n' + lastLine;
  }

  return files;
}

function buildFolderTree(files: VirtualFile[]): Map<string, VirtualFile[]> {
  const tree = new Map<string, VirtualFile[]>();
  for (const f of files) {
    const existing = tree.get(f.folder) ?? [];
    existing.push(f);
    tree.set(f.folder, existing);
  }
  return tree;
}

export function CodeSection({ code, appName }: CodeSectionProps) {
  const [copied, setCopied] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const virtualFiles = useMemo(() => code ? parseVirtualFiles(code) : [], [code]);
  const folderTree = useMemo(() => buildFolderTree(virtualFiles), [virtualFiles]);

  const selectedPath = activeFile ?? virtualFiles[0]?.path ?? null;
  const selectedFile = virtualFiles.find(f => f.path === selectedPath);

  function handleCopy() {
    const textToCopy = selectedFile?.code ?? code ?? '';
    navigator.clipboard.writeText(textToCopy).catch(() => {});
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
        <span className="dash-code-file-count">{virtualFiles.length} files</span>
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
      <div className="dash-code-split">
        {/* File tree sidebar */}
        <div className="dash-code-tree">
          {Array.from(folderTree.entries()).map(([folder, folderFiles]) => (
            <div key={folder} className="dash-code-tree-folder">
              <div className="dash-code-tree-folder-name">
                <FolderOpen size={14} />
                <span>{folder}</span>
              </div>
              {folderFiles.map((f) => (
                <button
                  key={f.path}
                  className={`dash-code-tree-file${f.path === selectedPath ? ' dash-code-tree-file--active' : ''}`}
                  onClick={() => setActiveFile(f.path)}
                >
                  <FileCode size={13} />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {/* Code viewer */}
        <div className="dash-code-viewer">
          {selectedFile && (
            <>
              <div className="dash-code-viewer-tab">
                <FileCode size={13} />
                <span>{selectedFile.path}</span>
              </div>
              <pre><code>{selectedFile.code}</code></pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
