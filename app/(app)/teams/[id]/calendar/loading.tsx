import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[30rem] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
