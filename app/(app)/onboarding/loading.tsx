import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-6 h-16 w-full" />
        <Skeleton className="mt-4 h-10 w-full" />
      </div>
    </div>
  )
}
