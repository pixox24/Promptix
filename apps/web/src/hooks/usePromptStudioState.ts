import { useEffect, useMemo, useReducer } from 'react';
import { buildPrompt, getDefaultValues } from '../utils/promptBuilder';
import type { PromptTemplate, SavedDraft } from '../types/prompt';
import { createPromptStudioDirtySignature, type PromptStudioEditableSnapshot } from '../lib/promptStudioDirtyState';

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
  baselineSignature: string;
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
  const editable: PromptStudioEditableSnapshot = {
    values,
    promptMode: draft?.promptMode ?? 'auto',
    manualPrompt: draft?.manualPrompt ?? draft?.prompt ?? buildPrompt(template, values),
    displayedImage: draft?.generatedImage
      ? { kind: 'generated', ...draft.generatedImage }
      : { kind: 'cover', url: template.coverImage },
  };
  return {
    ...editable,
    errors: {},
    activeDraftId: draft?.id ?? null,
    baselineSignature: createPromptStudioDirtySignature(editable),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'initialize': return initial(action.template, action.draft);
    case 'change': return { ...state, values: { ...state.values, [action.key]: action.value }, errors: { ...state.errors, [action.key]: '' } };
    case 'errors': return { ...state, errors: action.errors };
    case 'manual': return { ...state, promptMode: 'manual', manualPrompt: action.prompt };
    case 'auto': return { ...state, promptMode: 'auto' };
    case 'draftSaved': return { ...state, activeDraftId: action.id, baselineSignature: createPromptStudioDirtySignature(state) };
    case 'generated': return { ...state, displayedImage: { kind: 'generated', ...action.image } };
    case 'reset': return initial(action.template);
  }
}

export function usePromptStudioState(template: PromptTemplate, draft?: SavedDraft) {
  const [state, dispatch] = useReducer(reducer, initial(template, draft));
  useEffect(() => dispatch({ type: 'initialize', template, draft }), [template, draft]);
  const autoPrompt = useMemo(() => buildPrompt(template, state.values), [template, state.values]);
  const isDirty = createPromptStudioDirtySignature(state) !== state.baselineSignature;
  return { state, dispatch, prompt: state.promptMode === 'manual' ? state.manualPrompt : autoPrompt, isDirty };
}
