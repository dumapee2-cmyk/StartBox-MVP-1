import { useMemo } from 'react';
import {
  Calendar, Camera, Cloud, Code, Coffee, Compass, CreditCard,
  FileText, Gift, Globe, Heart, Home, Image, Layers, Mail,
  Map, MessageCircle, Music, Phone, Search, Settings, Shield,
  ShoppingCart, Star, Sun, Tv, Users, Zap, BookOpen, Briefcase,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_SET: LucideIcon[] = [
  Calendar, Camera, Cloud, Code, Coffee, Compass, CreditCard,
  FileText, Gift, Globe, Heart, Home, Image, Layers, Mail,
  Map, MessageCircle, Music, Phone, Search, Settings, Shield,
  ShoppingCart, Star, Sun, Tv, Users, Zap, BookOpen, Briefcase,
];

const ICON_COLORS = [
  'rgba(0,113,227,0.12)',
  'rgba(88,86,214,0.12)',
  'rgba(52,199,89,0.10)',
  'rgba(255,149,0,0.10)',
  'rgba(255,59,48,0.08)',
  'rgba(175,82,222,0.10)',
  'rgba(0,199,190,0.10)',
  'rgba(255,45,85,0.08)',
];

interface FloatingIconData {
  id: number;
  Icon: LucideIcon;
  x: number;
  y: number;
  size: number;
  color: string;
  animDelay: number;
  fadeDelay: number;
  duration: number;
  fadeDuration: number;
}

function generateIcons(count: number): FloatingIconData[] {
  const icons: FloatingIconData[] = [];
  for (let i = 0; i < count; i++) {
    icons.push({
      id: i,
      Icon: ICON_SET[i % ICON_SET.length],
      x: 5 + (Math.random() * 88),
      y: 5 + (Math.random() * 88),
      size: 48 + Math.floor(Math.random() * 20),
      color: ICON_COLORS[i % ICON_COLORS.length],
      animDelay: Math.random() * -8,
      fadeDelay: Math.random() * -6,
      duration: 7 + Math.random() * 6,
      fadeDuration: 5 + Math.random() * 4,
    });
  }
  return icons;
}

export function FloatingIcons() {
  const icons = useMemo(() => generateIcons(24), []);

  return (
    <div className="floating-icons-container">
      {icons.map((icon) => (
        <div
          key={icon.id}
          className="floating-icon"
          style={{
            left: `${icon.x}%`,
            top: `${icon.y}%`,
            width: `${icon.size}px`,
            height: `${icon.size}px`,
            background: icon.color,
            animationDelay: `${icon.animDelay}s, ${icon.fadeDelay}s`,
            animationDuration: `${icon.duration}s, ${icon.fadeDuration}s`,
          }}
        >
          <icon.Icon size={icon.size * 0.42} strokeWidth={1.5} />
        </div>
      ))}
    </div>
  );
}
