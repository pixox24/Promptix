export interface PromptStudioEditableSnapshot {
  values: Record<string, string>;
  promptMode: 'auto' | 'manual';
  manualPrompt: string;
  displayedImage: {
    kind: 'cover' | 'generated';
    url: string;
    width?: number;
    height?: number;
  };
}

export function createPromptStudioDirtySignature(snapshot: PromptStudioEditableSnapshot): string {
  const values = Object.fromEntries(
    Object.entries(snapshot.values).sort(([left], [right]) => left.localeCompare(right)),
  );

  return JSON.stringify({
    values,
    promptMode: snapshot.promptMode,
    manualPrompt: snapshot.manualPrompt,
    displayedImage: {
      kind: snapshot.displayedImage.kind,
      url: snapshot.displayedImage.url,
      width: snapshot.displayedImage.width ?? null,
      height: snapshot.displayedImage.height ?? null,
    },
  });
}

