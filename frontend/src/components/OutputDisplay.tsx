import { marked } from 'marked';

interface Props {
  text: string;
  format: 'markdown' | 'json' | 'plain';
}

export function OutputDisplay({ text, format }: Props) {
  if (format === 'markdown') {
    const html = marked.parse(text) as string;
    return (
      <div
        className="output-markdown"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (format === 'json') {
    let formatted = text;
    try {
      formatted = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // keep as-is
    }
    return <pre className="output-json">{formatted}</pre>;
  }

  return (
    <div className="output-plain">
      {text.split('\n').map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}
