import {
  LayoutDashboard, Code, BarChart3, Settings,
  Users, Database, Globe, Plug, Shield,
  Bot, Zap, ScrollText, Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const MAIN_ITEMS: SidebarItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'code', label: 'Code', icon: Code },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const FUTURE_ITEMS: SidebarItem[] = [
  { id: 'users', label: 'Users', icon: Users, disabled: true },
  { id: 'data', label: 'Data', icon: Database, disabled: true },
  { id: 'domains', label: 'Domains', icon: Globe, disabled: true },
  { id: 'integrations', label: 'Integrations', icon: Plug, disabled: true },
  { id: 'security', label: 'Security', icon: Shield, disabled: true },
  { id: 'agents', label: 'Agents', icon: Bot, disabled: true },
  { id: 'automations', label: 'Automations', icon: Zap, disabled: true },
  { id: 'logs', label: 'Logs', icon: ScrollText, disabled: true },
  { id: 'api', label: 'API', icon: Terminal, disabled: true },
];

interface DashboardSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function DashboardSidebar({ activeSection, onSectionChange }: DashboardSidebarProps) {
  return (
    <nav className="dash-sidebar">
      <div className="dash-sidebar-group">
        {MAIN_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`dash-sidebar-item${activeSection === item.id ? ' dash-sidebar-item--active' : ''}`}
            onClick={() => onSectionChange(item.id)}
          >
            <item.icon size={18} strokeWidth={1.5} className="dash-sidebar-icon" />
            <span className="dash-sidebar-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="dash-sidebar-divider" />

      <div className="dash-sidebar-group">
        {FUTURE_ITEMS.map((item) => (
          <button
            key={item.id}
            className="dash-sidebar-item dash-sidebar-item--disabled"
            disabled
          >
            <item.icon size={18} strokeWidth={1.5} className="dash-sidebar-icon" />
            <span className="dash-sidebar-label">{item.label}</span>
            <span className="dash-sidebar-badge">Soon</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
