import { Skeleton } from '@/components/skeleton'

// Skeleton de la página de miembros (imita teams/[id]/page.tsx).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-44" />

      <div className="mt-8">
        <Skeleton className="h-3 w-20" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-7 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
