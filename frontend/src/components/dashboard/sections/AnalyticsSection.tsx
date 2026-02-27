import { BarChart3, Activity, Hash, Calendar } from 'lucide-react';
import type { AppRecord } from '../../../lib/api';

interface AnalyticsSectionProps {
  app: AppRecord;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AnalyticsSection({ app }: AnalyticsSectionProps) {
  return (
    <div className="dash-analytics">
      <h2 className="dash-section-title">Analytics</h2>

      <div className="dash-stat-grid">
        <div className="dash-stat-card">
          <Activity size={20} strokeWidth={1.5} className="dash-stat-icon" />
          <div className="dash-stat-value">{app.run_count}</div>
          <div className="dash-stat-label">Total Runs</div>
        </div>
        <div className="dash-stat-card">
          <Calendar size={20} strokeWidth={1.5} className="dash-stat-icon" />
          <div className="dash-stat-value">{formatDate(app.created_at)}</div>
          <div className="dash-stat-label">Created</div>
        </div>
        <div className="dash-stat-card">
          <Hash size={20} strokeWidth={1.5} className="dash-stat-icon" />
          <div className="dash-stat-value dash-stat-value--mono">{app.short_id}</div>
          <div className="dash-stat-label">App ID</div>
        </div>
      </div>

      <div className="dash-chart-placeholder">
        <BarChart3 size={48} strokeWidth={1} />
        <h3>Detailed Analytics</h3>
        <p>Usage charts, token consumption, and performance metrics coming soon.</p>
      </div>

      {app.original_prompt && (
        <div className="dash-prompt-card">
          <h3 className="dash-prompt-title">Original Prompt</h3>
          <p className="dash-prompt-text">{app.original_prompt}</p>
        </div>
      )}
    </div>
  );
}
