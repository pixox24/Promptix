import { useEffect, useRef } from 'react';

export function UnsavedTemplateNavigationDialog({
  templateName,
  onSaveAndOpen,
  onOpenWithoutSaving,
  onCancel,
}: {
  templateName: string;
  onSaveAndOpen: () => void;
  onOpenWithoutSaving: () => void;
  onCancel: () => void;
}) {
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-navigation-title" aria-describedby="unsaved-navigation-description" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
      <h2 id="unsaved-navigation-title" className="text-lg font-semibold text-slate-900">保存当前修改？</h2>
      <p id="unsaved-navigation-description" className="mt-3 text-sm leading-6 text-slate-600">打开“{templateName}”前，可以先把当前模板保存为草稿。直接打开将丢弃尚未保存的修改。</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">取消</button>
        <button type="button" onClick={onOpenWithoutSaving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">直接打开</button>
        <button ref={primaryButtonRef} type="button" onClick={onSaveAndOpen} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">保存草稿并打开</button>
      </div>
    </div>
  </div>;
}

