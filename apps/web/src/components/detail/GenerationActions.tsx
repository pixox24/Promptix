import { Copy, RefreshCw, Save, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
export function GenerationActions({ busy, canRetry, onGenerate, onRetry, onCopy, onSave, onReset }: { busy:boolean; canRetry:boolean; onGenerate:()=>void; onRetry:()=>void; onCopy:()=>void; onSave:()=>void; onReset:()=>void }) { return <div className="space-y-2">
  <Button size="lg" fullWidth disabled={busy} onClick={canRetry?onRetry:onGenerate}><Sparkles size={17}/>{busy?'正在生成…':canRetry?'重试生成':'立即生成'}</Button>
  <div className="grid grid-cols-3 gap-2"><Button variant="secondary" onClick={onCopy}><Copy size={15}/>复制</Button><Button variant="secondary" onClick={onSave}><Save size={15}/>保存</Button><Button variant="ghost" onClick={onReset}><RefreshCw size={15}/>重置</Button></div>
  </div> }
