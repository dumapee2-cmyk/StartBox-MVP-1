import { DashboardSidebar } from './DashboardSidebar';
import { OverviewSection } from './sections/OverviewSection';
import { CodeSection } from './sections/CodeSection';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { SettingsSection } from './sections/SettingsSection';
import { PlaceholderSection } from './sections/PlaceholderSection';
import type { AppRecord } from '../../lib/api';

const PLACEHOLDER_INFO: Record<string, { title: string; description: string; icon: string }> = {
  users: { title: 'Users', description: 'Manage user access, roles, and permissions for your application.', icon: 'Users' },
  data: { title: 'Data', description: 'View and manage your application data, entities, and records.', icon: 'Database' },
  domains: { title: 'Domains', description: 'Connect custom domains and manage DNS settings.', icon: 'Globe' },
  integrations: { title: 'Integrations', description: 'Connect third-party services and APIs to your app.', icon: 'Plug' },
  security: { title: 'Security', description: 'Configure authentication, authorization, and security policies.', icon: 'Shield' },
  agents: { title: 'Agents', description: 'Create and manage AI agents that power your application.', icon: 'Bot' },
  automations: { title: 'Automations', description: 'Set up automated workflows and triggers.', icon: 'Zap' },
  logs: { title: 'Logs', description: 'Monitor application logs, errors, and system events.', icon: 'ScrollText' },
  api: { title: 'API', description: 'Access your application API endpoints and documentation.', icon: 'Terminal' },
};

interface DashboardLayoutProps {
  app: AppRecord;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onShare: () => void;
  shareCopied: boolean;
  onOpenApp: () => void;
}

export function DashboardLayout({
  app,
  activeSection,
  onSectionChange,
  onShare,
  shareCopied,
  onOpenApp,
}: DashboardLayoutProps) {
  function renderSection() {
    switch (activeSection) {
      case 'overview':
        return (
          <OverviewSection
            app={app}
            onShare={onShare}
            shareCopied={shareCopied}
            onOpenApp={onOpenApp}
          />
        );
      case 'code':
        return <CodeSection code={app.generated_code} appName={app.name} />;
      case 'analytics':
        return <AnalyticsSection app={app} />;
      case 'settings':
        return <SettingsSection app={app} />;
      default: {
        const info = PLACEHOLDER_INFO[activeSection];
        if (info) {
          return <PlaceholderSection title={info.title} description={info.description} iconName={info.icon} />;
        }
        return <PlaceholderSection title="Unknown" description="This section is not available." iconName="HelpCircle" />;
      }
    }
  }

  return (
    <div className="dash-layout">
      <DashboardSidebar activeSection={activeSection} onSectionChange={onSectionChange} />
      <div className="dash-content">
        {renderSection()}
      </div>
    </div>
  );
}
