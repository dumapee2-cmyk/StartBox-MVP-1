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

export function AnalyzerLayout({ screen, onSubmit, result, loading, error, appColor }: Props) {
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

  return (
    <div className="layout-analyzer">
      <div className="screen-hero">
        <div className="screen-hero-title">{screen.hero.title}</div>
        <div className="screen-hero-subtitle">{screen.hero.subtitle}</div>
      </div>

      <div className="analyzer-body">
        <div className="analyzer-input-card">
          <form onSubmit={handleSubmit}>
            <div className="analyzer-fields">
              {screen.input_fields.map((field) => (
                <InputField
                  key={field.key}
                  field={field}
                  value={inputs[field.key] ?? ''}
                  onChange={handleChange}
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="analyzer-cta-btn"
              style={{ background: appColor }}
            >
              {loading ? (
                <>
                  <span className="spinner spinner-sm" />
                  Analyzing...
                </>
              ) : (
                <>🔍 {screen.hero.cta_label}</>
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
    </div>
  );
}
