import { useCallback, useEffect, useState } from 'react';
import type { RecentItem, SavedDraft } from '../types/prompt';

const STORAGE_KEY = 'promptix.userLibrary.v1';

interface UserLibraryState {
  favorites: string[];
  recent: RecentItem[];
  drafts: SavedDraft[];
}

const defaultState: UserLibraryState = {
  favorites: [],
  recent: [],
  drafts: [],
};

function loadState(): UserLibraryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as UserLibraryState;
    return {
      favorites: parsed.favorites ?? [],
      recent: parsed.recent ?? [],
      drafts: parsed.drafts ?? [],
    };
  } catch {
    return defaultState;
  }
}

function saveState(state: UserLibraryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useUserLibrary() {
  const [state, setState] = useState<UserLibraryState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const isFavorite = useCallback(
    (templateId: string) => state.favorites.includes(templateId),
    [state.favorites],
  );

  const toggleFavorite = useCallback((templateId: string) => {
    setState((prev) => {
      const exists = prev.favorites.includes(templateId);
      return {
        ...prev,
        favorites: exists
          ? prev.favorites.filter((id) => id !== templateId)
          : [templateId, ...prev.favorites],
      };
    });
  }, []);

  const addRecent = useCallback((templateId: string) => {
    setState((prev) => {
      const filtered = prev.recent.filter((r) => r.templateId !== templateId);
      return {
        ...prev,
        recent: [
          { templateId, usedAt: new Date().toISOString() },
          ...filtered,
        ].slice(0, 20),
      };
    });
  }, []);

  const saveDraft = useCallback(
    (draft: Omit<SavedDraft, 'id' | 'updatedAt'> & { id?: string }) => {
      const id = draft.id ?? `draft-${Date.now()}`;
      setState((prev) => {
        const next: SavedDraft = {
          id,
          templateId: draft.templateId,
          templateName: draft.templateName,
          coverImage: draft.coverImage,
          values: draft.values,
          prompt: draft.prompt,
          updatedAt: new Date().toISOString(),
        };
        const others = prev.drafts.filter((d) => d.id !== id);
        return { ...prev, drafts: [next, ...others].slice(0, 50) };
      });
      return id;
    },
    [],
  );

  const deleteDraft = useCallback((draftId: string) => {
    setState((prev) => ({
      ...prev,
      drafts: prev.drafts.filter((d) => d.id !== draftId),
    }));
  }, []);

  const clearRecent = useCallback(() => {
    setState((prev) => ({ ...prev, recent: [] }));
  }, []);

  return {
    favorites: state.favorites,
    recent: state.recent,
    drafts: state.drafts,
    isFavorite,
    toggleFavorite,
    addRecent,
    saveDraft,
    deleteDraft,
    clearRecent,
  };
}

export type UserLibrary = ReturnType<typeof useUserLibrary>;
