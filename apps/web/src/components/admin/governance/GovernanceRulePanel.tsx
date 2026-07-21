import { useEffect, useState } from 'react';
import type { GovernanceRuleSet } from '@promptix/shared';
import { fetchActiveGovernanceRules, saveActiveGovernanceRules } from '../../../data/templateGovernanceApi';

export function GovernanceRulePanel({ onClose, canManage }: { onClose: () => void; canManage: boolean }) {
  const [rules, setRules] = useState<GovernanceRuleSet | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { fetchActiveGovernanceRules().then((value) => setRules(value.rules)).catch((error) => setMessage(error.message)); }, []);
  if (!rules) return <aside className="absolute right-0 top-0 z-30 h-full w-96 border-l bg-white p-5 shadow-xl"><button onClick={onClose}>关闭</button><p>{message || '正在加载规则…'}</p></aside>;
  const setNumber = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  return <aside className="absolute right-0 top-0 z-30 h-full w-full max-w-96 overflow-auto border-l bg-white p-5 shadow-xl"><div className="flex justify-between"><div><h2 className="font-semibold">治理规则</h2><p className="text-xs text-slate-500">保存为新版本，历史运行不受影响</p></div><button onClick={onClose}>关闭</button></div><div className="mt-5 space-y-3">
    {!canManage && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">只读权限：修改规则需要 owner 账号。</p>}
    <label className="flex justify-between text-sm">启用定时巡检<input disabled={!canManage} type="checkbox" checked={rules.schedule.enabled} onChange={(e) => setRules({ ...rules, schedule: { ...rules.schedule, enabled: e.target.checked } })}/></label>
    <Field disabled={!canManage} label="Cron" value={rules.schedule.cron} onChange={(value) => setRules({ ...rules, schedule: { ...rules.schedule, cron: value } })}/>
    <Field disabled={!canManage} label="时区" value={rules.schedule.timezone} onChange={(value) => setRules({ ...rules, schedule: { ...rules.schedule, timezone: value } })}/>
    <Field disabled={!canManage} label="扫描上限" value={String(rules.schedule.scanLimit)} onChange={(value) => setRules({ ...rules, schedule: { ...rules.schedule, scanLimit: setNumber(value, rules.schedule.scanLimit) } })}/>
    <Field disabled={!canManage} label="最低自动置信度" value={String(rules.minimumAutoConfidence)} onChange={(value) => setRules({ ...rules, minimumAutoConfidence: setNumber(value, rules.minimumAutoConfidence) })}/>
    <Field disabled={!canManage} label="自动批次上限" value={String(rules.maximumAutoBatchSize)} onChange={(value) => setRules({ ...rules, maximumAutoBatchSize: setNumber(value, rules.maximumAutoBatchSize) })}/>
    <Field disabled={!canManage} label="回滚小时" value={String(rules.rollbackHours)} onChange={(value) => setRules({ ...rules, rollbackHours: setNumber(value, rules.rollbackHours) })}/>
    <Field disabled={!canManage} label="精选槽位" value={String(rules.featured.slotLimit)} onChange={(value) => setRules({ ...rules, featured: { ...rules.featured, slotLimit: setNumber(value, rules.featured.slotLimit) } })}/>
    <Field disabled={!canManage} label="最大替换比例" value={String(rules.featured.maximumReplacementRatio)} onChange={(value) => setRules({ ...rules, featured: { ...rules.featured, maximumReplacementRatio: setNumber(value, rules.featured.maximumReplacementRatio) } })}/>
    <Field disabled={!canManage} label="精选冷却小时" value={String(rules.featured.minimumAdjustmentHours)} onChange={(value) => setRules({ ...rules, featured: { ...rules.featured, minimumAdjustmentHours: setNumber(value, rules.featured.minimumAdjustmentHours) } })}/>
    {canManage && <button onClick={async () => { try { await saveActiveGovernanceRules(rules); setMessage('规则新版本已保存'); } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); } }} className="w-full rounded bg-violet-600 px-3 py-2 text-sm text-white">保存为新版本</button>}{message && <p className="text-xs">{message}</p>}
  </div></aside>;
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="block text-xs text-slate-600">{label}<input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:bg-slate-50"/></label>;
}
