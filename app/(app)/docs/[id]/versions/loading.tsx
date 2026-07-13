import { Skeleton } from '@/components/skeleton'

// Skeleton del historial: lista de versiones + panel de preview.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row">
        <div className="w-full shrink-0 space-y-3 sm:w-72">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 flex-1" />
      </div>
    </div>
  )
}
