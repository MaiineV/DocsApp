import { Skeleton } from '@/components/skeleton'

// Skeleton del documento/editor (imita docs/[id]/page.tsx + DocEditor).
const LINES = ['w-full', 'w-11/12', 'w-5/6', 'w-full', 'w-3/4', 'w-2/3']

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="mt-6">
        <Skeleton className="h-9 w-2/3" />
        <div className="mt-6 space-y-3">
          {LINES.map((w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
