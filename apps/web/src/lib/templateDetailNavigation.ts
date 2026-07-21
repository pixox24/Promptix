export interface TemplateNavigationIntent {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function shouldProtectTemplateNavigation(intent: TemplateNavigationIntent, isDirty: boolean): boolean {
  return isDirty
    && intent.button === 0
    && !intent.metaKey
    && !intent.ctrlKey
    && !intent.shiftKey
    && !intent.altKey;
}

