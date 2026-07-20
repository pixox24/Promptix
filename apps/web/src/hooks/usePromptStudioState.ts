import { useEffect, useMemo, useReducer } from 'react';
import { buildPrompt, getDefaultValues } from '../utils/promptBuilder';
import type { PromptTemplate, SavedDraft } from '../types/prompt';

export interface DisplayedImage {
  kind: 'cover' | 'generated';
  url: string;
  width?: number;
  height?: number;
}

interface State {
  values: Record<string, string>;
  errors: Record<string, string>;
  promptMode: 'auto' | 'manual';
  manualPrompt: string;
  activeDraftId: string | null;
  displayedImage: DisplayedImage;
}

type Action =
  | { type: 'initialize'; template: PromptTemplate; draft?: SavedDraft }
  | { type: 'change'; key: string; value: string }
  | { type: 'errors'; errors: Record<string, string> }
  | { type: 'manual'; prompt: string }
  | { type: 'auto' }
  | { type: 'draftSaved'; id: string }
  | { type: 'generated'; image: Omit<DisplayedImage, 'kind'> }
  | { type: 'reset'; template: PromptTemplate };

function initial(template: PromptTemplate, draft?: SavedDraft): State {
  const values = draft?.values ?? getDefaultValues(template);
  return {
    values,
    errors: {},
    promptMode: draft?.promptMode ?? 'auto',
    manualPrompt: draft?.manualPrompt ?? draft?.prompt ?? buildPrompt(template, values),
    activeDraftId: draft?.id ?? null,
    displayedImage: draft?.generatedImage
      ? { kind: 'generated', ...draft.generatedImage }
      : { kind: 'cover', url: template.coverImage },
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'initialize': return initial(action.template, action.draft);
    case 'change': return { ...state, values: { ...state.values, [action.key]: action.value }, errors: { ...state.errors, [action.key]: '' } };
    case 'errors': return { ...state, errors: action.errors };
    case 'manual': return { ...state, promptMode: 'manual', manualPrompt: action.prompt };
    case 'auto': return { ...state, promptMode: 'auto' };
    case 'draftSaved': return { ...state, activeDraftId: action.id };
    case 'generated': return { ...state, displayedImage: { kind: 'generated', ...action.image } };
    case 'reset': return initial(action.template);
  }
}

export function usePromptStudioState(template: PromptTemplate, draft?: SavedDraft) {
  const [state, dispatch] = useReducer(reducer, initial(template, draft));
  useEffect(() => dispatch({ type: 'initialize', template, draft }), [template, draft]);
  const autoPrompt = useMemo(() => buildPrompt(template, state.values), [template, state.values]);
  return { state, dispatch, prompt: state.promptMode === 'manual' ? state.manualPrompt : autoPrompt };
}
