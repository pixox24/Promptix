import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Badge({
  children,
  active,
  onClick,
  className = '',
}: BadgeProps) {
  const interactive = Boolean(onClick);
  const Comp = interactive ? 'button' : 'span';

  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      } ${interactive ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </Comp>
  );
}

/** HeroPrompt-style lime tag */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
      {children}
    </span>
  );
}
