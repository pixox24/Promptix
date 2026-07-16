export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between px-4 py-6 md:px-8">
        <p className="text-xs text-muted-foreground">
          Promptix · AI 提示词模板 MVP
        </p>
        <p className="text-xs text-muted-foreground">未接入真实生成模型</p>
      </div>
    </footer>
  );
}
