import type { IngestFlowStatus } from '../../../types/ingest';
const labels: Record<IngestFlowStatus,string>={idle:'未开始',queued:'排队中',running:'生成中',review:'待校对',failed:'失败'};
export function IngestEntryCard({title,description,active,status,onClick}:{title:string;description:string;active:boolean;status:IngestFlowStatus;onClick:()=>void}){
 return <button type="button" aria-pressed={active} onClick={onClick} className={`w-full rounded-xl border p-4 text-left ${active?'border-violet-500 bg-violet-50':'bg-white'}`}><div className="flex items-center justify-between"><strong>{title}</strong><span className="text-xs text-gray-500">{labels[status]}</span></div><p className="mt-2 text-sm text-gray-500">{description}</p></button>;
}
