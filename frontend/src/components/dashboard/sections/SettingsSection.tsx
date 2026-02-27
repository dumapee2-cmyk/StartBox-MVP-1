import { AlertTriangle } from 'lucide-react';
import type { AppRecord } from '../../../lib/api';

interface SettingsSectionProps {
  app: AppRecord;
}

export function SettingsSection({ app }: SettingsSectionProps) {
  return (
    <div className="dash-settings">
      <h2 className="dash-section-title">Settings</h2>

      <div className="dash-settings-form">
        <div className="dash-field">
          <label className="dash-field-label">App Name</label>
          <input className="dash-field-input" value={app.name} readOnly />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">Tagline</label>
          <input className="dash-field-input" value={app.tagline ?? ''} readOnly />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">Description</label>
          <textarea className="dash-field-textarea" value={app.description} readOnly rows={4} />
        </div>
        <button className="dash-btn dash-btn--primary" disabled>
          Save Changes
        </button>
        <p className="dash-settings-hint">Editing app settings coming soon.</p>
      </div>

      <div className="dash-danger-zone">
        <div className="dash-danger-header">
          <AlertTriangle size={18} strokeWidth={1.5} />
          <span>Danger Zone</span>
        </div>
        <p className="dash-danger-text">Permanently delete this app and all its data. This action cannot be undone.</p>
        <button className="dash-btn dash-btn--danger" disabled>
          Delete App
        </button>
      </div>
    </div>
  );
}
