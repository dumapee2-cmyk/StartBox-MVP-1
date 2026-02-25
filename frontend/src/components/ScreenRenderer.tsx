import type { Screen, RunResult } from '../lib/api';
import { AnalyzerLayout } from './layouts/AnalyzerLayout';
import { GeneratorLayout } from './layouts/GeneratorLayout';
import { ToolLayout } from './layouts/ToolLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { PlannerLayout } from './layouts/PlannerLayout';

interface Props {
  screen: Screen;
  onSubmit: (inputs: Record<string, string>) => void;
  result: RunResult | null;
  loading: boolean;
  error: string | null;
  appColor: string;
}

export function ScreenRenderer({ screen, onSubmit, result, loading, error, appColor }: Props) {
  switch (screen.layout) {
    case 'analyzer':
      return <AnalyzerLayout screen={screen} onSubmit={onSubmit} result={result} loading={loading} error={error} appColor={appColor} />;
    case 'generator':
      return <GeneratorLayout screen={screen} onSubmit={onSubmit} result={result} loading={loading} error={error} appColor={appColor} />;
    case 'tool':
      return <ToolLayout screen={screen} onSubmit={onSubmit} result={result} loading={loading} error={error} appColor={appColor} />;
    case 'dashboard':
      return <DashboardLayout screen={screen} onSubmit={onSubmit} result={result} loading={loading} error={error} appColor={appColor} />;
    case 'planner':
      return <PlannerLayout screen={screen} onSubmit={onSubmit} result={result} loading={loading} error={error} appColor={appColor} />;
    default:
      return <AnalyzerLayout screen={screen} onSubmit={onSubmit} result={result} loading={loading} error={error} appColor={appColor} />;
  }
}
