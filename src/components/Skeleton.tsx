"use client";

type SkeletonProps = {
  className?: string;
};

/** Skeleton pulse para estados de carregamento */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[#E2E8F0] ${className}`}
      aria-hidden
    />
  );
}

/** Lista de skeletons no formato de item de conversa (avatar + 2 linhas) */
export function ConversationListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="divide-y divide-[#E2E8F0]">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Skeleton para tabela de canais (Conexões) */
export function ChannelTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <th key={i} className="px-4 py-3"><Skeleton className="h-3 w-16" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="border-b border-[#E2E8F0]">
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
                <td className="px-4 py-3 text-center"><Skeleton className="h-4 w-8 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><Skeleton className="h-4 w-8 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><Skeleton className="h-4 w-8 mx-auto" /></td>
                <td className="px-4 py-3 text-right"><Skeleton className="h-8 w-24 ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
