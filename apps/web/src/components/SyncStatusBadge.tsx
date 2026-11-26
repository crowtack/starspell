import type { SyncStatus } from '@starspell/shared';

export interface SyncStatusBadgeProps {
  status: SyncStatus;
  onRetry?: () => void;
}

const STATUS_META: Record<SyncStatus, { label: string; dotClass: string; textClass: string }> = {
  synced: {
    label: 'Synced',
    dotClass: 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]',
    textClass: 'text-emerald-100',
  },
  saving: {
    label: 'Saving…',
    dotClass: 'bg-amber-300 animate-pulse',
    textClass: 'text-amber-100',
  },
  offline: {
    label: 'Offline — will sync',
    dotClass: 'bg-slate-400',
    textClass: 'text-amber-100/80',
  },
  needs_attention: {
    label: 'Needs attention',
    dotClass: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.85)]',
    textClass: 'text-rose-200',
  },
};

export function SyncStatusBadge({ status, onRetry }: SyncStatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <button
      id="sync-status-badge"
      type="button"
      onClick={status === 'needs_attention' ? onRetry : undefined}
      title={status === 'needs_attention' ? 'Click to retry sync' : meta.label}
      className={`twilight-pill rounded-full px-3 py-1 flex items-center gap-2 text-[11px] font-semibold ${meta.textClass} ${
        status === 'needs_attention' ? 'cursor-pointer hover:border-rose-300/50' : 'cursor-default'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
      <span id="sync-status-label">{meta.label}</span>
    </button>
  );
}
