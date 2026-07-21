import { useEffect, useRef, useState, type ComponentProps } from 'react';

interface StableSearchInputProps extends Omit<ComponentProps<'input'>, 'onChange' | 'value'> {
  query: string;
  onQueryChange: (query: string) => void;
}

export function StableSearchInput({ query, onQueryChange, ...inputProps }: StableSearchInputProps) {
  const [draftQuery, setDraftQuery] = useState(query);
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const lastSubmittedQueryRef = useRef<string | null>(null);
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;

  useEffect(() => {
    if (isComposingRef.current) return;
    if (query === lastSubmittedQueryRef.current) {
      lastSubmittedQueryRef.current = null;
      return;
    }
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (isComposing) return;
    if (draftQuery === query) return;
    const timer = window.setTimeout(() => {
      lastSubmittedQueryRef.current = draftQuery;
      onQueryChangeRef.current(draftQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftQuery, isComposing, query]);

  return (
    <input
      {...inputProps}
      type="search"
      value={draftQuery}
      onChange={(event) => setDraftQuery(event.currentTarget.value)}
      onCompositionStart={() => {
        isComposingRef.current = true;
        setIsComposing(true);
      }}
      onCompositionEnd={(event) => {
        isComposingRef.current = false;
        setDraftQuery(event.currentTarget.value);
        setIsComposing(false);
      }}
    />
  );
}
