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

export function PlannerLayout({ screen, onSubmit, result, loading, error, appColor }: Props) {
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
    <div className="layout-planner">
      <div className="screen-hero">
        <div className="screen-hero-title">{screen.hero.title}</div>
        <div className="screen-hero-subtitle">{screen.hero.subtitle}</div>
      </div>

      <div className="planner-card">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
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
            className="planner-cta-btn"
            style={{ background: appColor }}
          >
            {loading ? (
              <>
                <span className="spinner spinner-sm" />
                Building plan...
              </>
            ) : (
              <>📋 {screen.hero.cta_label}</>
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
