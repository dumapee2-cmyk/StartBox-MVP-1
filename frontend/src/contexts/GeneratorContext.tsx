import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { api, type GenerateResult } from '../lib/api';

interface GeneratorState {
  generatedApp: GenerateResult | null;
  liveCode: string | null;
  generating: boolean;
  refining: boolean;
  pipelineStep: number;
  buildError: string | null;
  statusMessage: string | null;
  selectedModel: 'sonnet' | 'opus';
}

interface GeneratorActions {
  generate: (prompt: string, model: 'sonnet' | 'opus') => Promise<void>;
  refine: (instruction: string) => Promise<void>;
  resetProject: () => void;
  setSelectedModel: (model: 'sonnet' | 'opus') => void;
}

type GeneratorContextValue = GeneratorState & GeneratorActions;

const GeneratorContext = createContext<GeneratorContextValue | null>(null);

export function useGenerator(): GeneratorContextValue {
  const ctx = useContext(GeneratorContext);
  if (!ctx) throw new Error('useGenerator must be used within GeneratorProvider');
  return ctx;
}

const STEP_COUNT = 4;

const INITIAL_STATE: GeneratorState = {
  generatedApp: null,
  liveCode: null,
  generating: false,
  refining: false,
  pipelineStep: 0,
  buildError: null,
  statusMessage: null,
  selectedModel: 'sonnet',
};

export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GeneratorState>(INITIAL_STATE);
  const pipelineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appIdRef = useRef<string | null>(null);

  const advancePipeline = useCallback((step: number) => {
    if (step < STEP_COUNT) {
      setState((s) => ({ ...s, pipelineStep: step }));
      pipelineTimer.current = setTimeout(() => advancePipeline(step + 1), 2800);
    }
  }, []);

  const generate = useCallback(
    async (prompt: string, model: 'sonnet' | 'opus') => {
      if (pipelineTimer.current) clearTimeout(pipelineTimer.current);

      setState((s) => ({
        ...s,
        generating: true,
        buildError: null,
        statusMessage: null,
        generatedApp: null,
        liveCode: null,
        pipelineStep: 0,
        selectedModel: model,
      }));
      advancePipeline(0);

      try {
        const result = await api.generate(prompt, model);
        if (pipelineTimer.current) clearTimeout(pipelineTimer.current);
        setState((s) => ({
          ...s,
          pipelineStep: STEP_COUNT,
          generatedApp: result,
          liveCode: result.generated_code ?? null,
          statusMessage: `${result.name} created successfully.`,
          generating: false,
        }));
      } catch (err) {
        if (pipelineTimer.current) clearTimeout(pipelineTimer.current);
        setState((s) => ({
          ...s,
          buildError:
            err instanceof Error ? err.message : 'Build failed. Please try again.',
          generating: false,
        }));
      }
    },
    [advancePipeline]
  );

  const refine = useCallback(async (instruction: string) => {
    setState((prev) => {
      if (!prev.generatedApp) return prev;
      appIdRef.current = prev.generatedApp.id;
      return { ...prev, refining: true, statusMessage: null, buildError: null };
    });

    const appId = appIdRef.current;
    if (!appId) return;

    try {
      const result = await api.refineApp(appId, instruction);
      setState((s) => ({
        ...s,
        liveCode: result.updated_code,
        statusMessage: 'Changes applied to preview.',
        refining: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        buildError: err instanceof Error ? err.message : 'Update failed.',
        refining: false,
      }));
    }
  }, []);

  const resetProject = useCallback(() => {
    if (pipelineTimer.current) clearTimeout(pipelineTimer.current);
    appIdRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const setSelectedModel = useCallback((model: 'sonnet' | 'opus') => {
    setState((s) => ({ ...s, selectedModel: model }));
  }, []);

  const value: GeneratorContextValue = {
    ...state,
    generate,
    refine,
    resetProject,
    setSelectedModel,
  };

  return (
    <GeneratorContext.Provider value={value}>
      {children}
    </GeneratorContext.Provider>
  );
}
