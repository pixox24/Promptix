import { AlertTriangle, LockKeyhole, RefreshCw, WifiOff } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';

export function GovernanceStatePanel({ status, error, onRetry }: { status: string; error: string; onRetry: () => void }) {
  if (status === 'loading') return <div className="space-y-2 p-4">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-14 w-full"/>)}</div>;
  if (status === 'empty') return <EmptyState title="当前队列没有待处理工作" description="可以切换其他队列，或通过顶部指令发起一次定向巡检。"/>;
  if (status === 'filtered-empty') return <EmptyState title="没有匹配结果" description="调整搜索或筛选条件后重试。"/>;
  if (status === 'offline') return <EmptyState icon={<WifiOff/>} title="网络连接已断开" description={error || '恢复网络后重新加载。'} actionLabel="重新加载" onAction={onRetry}/>;
  if (status === 'forbidden') return <EmptyState icon={<LockKeyhole/>} title="没有治理权限" description="当前账号不能访问模板治理，请联系系统所有者调整权限。"/>;
  if (status === 'conflict') return <EmptyState icon={<AlertTriangle/>} title="数据版本已变化" description={error || '刷新后基于最新版本重新操作。'} actionLabel="刷新数据" onAction={onRetry}/>;
  return <EmptyState icon={status === 'failed' ? <AlertTriangle/> : <RefreshCw/>} title="治理工作台加载失败" description={error || '服务暂时不可用，请稍后重试。'} actionLabel="重试" onAction={onRetry}/>;
}
