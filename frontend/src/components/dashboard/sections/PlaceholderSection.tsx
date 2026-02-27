import type { ComponentType } from 'react';
import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface PlaceholderSectionProps {
  title: string;
  description: string;
  iconName: string;
}

export function PlaceholderSection({ title, description, iconName }: PlaceholderSectionProps) {
  const iconMap = LucideIcons as unknown as Record<string, ComponentType<LucideProps>>;
  const Icon = iconMap[iconName] ?? iconMap.Circle;

  return (
    <div className="dash-placeholder">
      <div className="dash-placeholder-icon">
        {Icon ? <Icon size={48} strokeWidth={1} /> : null}
      </div>
      <h2 className="dash-placeholder-title">{title}</h2>
      <p className="dash-placeholder-desc">{description}</p>
      <span className="dash-placeholder-badge">Coming Soon</span>
    </div>
  );
}
