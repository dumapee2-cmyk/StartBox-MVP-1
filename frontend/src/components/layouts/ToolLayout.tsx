import { useState } from 'react';
import type { Screen, RunResult } from '../../lib/api';
import { InputField } from '../InputField';
import { OutputRenderer } from '../OutputRenderer';

interface Props {
  screen: Screen;
  onSubmit: (inputs: Record<string, string>) => void;
  result: RunResult | null;
  loading: boolean;
  error: string | null;
  appColor: string;
}

export function ToolLayout({ screen, onSubmit, result, loading, error, appColor }: Props) {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  function handleChange(key: string, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(inputs);
  }

  const canSubmit = screen.input_fields
    .filter((f) => f.required)
    .every((f) => inputs[f.key]?.trim());

  // Tool layout: 2-column grid for inputs when multiple fields
  const useGrid = screen.input_fields.length > 2;

  return (
    <div className="layout-tool">
      <div className="screen-hero">
        <div className="screen-hero-title">{screen.hero.title}</div>
        <div className="screen-hero-subtitle">{screen.hero.subtitle}</div>
      </div>

      <div className="tool-card">
        <form onSubmit={handleSubmit}>
          <div className={useGrid ? 'tool-input-grid' : ''} style={useGrid ? {} : { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {screen.input_fields.map((field) => (
              <InputField
                key={field.key}
                field={field}
                value={inputs[field.key] ?? ''}
                onChange={handleChange}
              />
            ))}
          </div>
          {useGrid && <div style={{ height: 10 }} />}
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="tool-cta-btn"
            style={{ background: appColor }}
          >
            {loading ? (
              <>
                <span className="spinner spinner-sm" />
                Calculating...
              </>
            ) : (
              <>⚡ {screen.hero.cta_label}</>
            )}
          </button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <OutputRenderer
          text={result.output.text}
          format={result.output.format}
          label={screen.output_label}
          appColor={appColor}
        />
      )}
    </div>
  );
}
