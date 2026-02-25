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

// Static placeholder stats shown before any run
const PLACEHOLDER_STATS = [
  { value: '—', label: 'Total' },
  { value: '—', label: 'Today' },
  { value: '—', label: 'Streak' },
];

export function DashboardLayout({ screen, onSubmit, result, loading, error, appColor }: Props) {
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
    <div className="layout-dashboard">
      <div className="dashboard-stats-row">
        {PLACEHOLDER_STATS.map((stat, i) => (
          <div key={i} className="dashboard-stat-card">
            <div className="dashboard-stat-value" style={{ color: appColor }}>{stat.value}</div>
            <div className="dashboard-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-main-card">
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{screen.hero.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{screen.hero.subtitle}</div>
        </div>

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
            className="dashboard-cta-btn"
            style={{ background: appColor }}
          >
            {loading ? (
              <>
                <span className="spinner spinner-sm" />
                Processing...
              </>
            ) : (
              <>📊 {screen.hero.cta_label}</>
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
