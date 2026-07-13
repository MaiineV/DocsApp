import { Skeleton } from '@/components/skeleton'

// Skeleton de la lista de documentos (imita docs/page.tsx).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between py-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-16" />
          </li>
        ))}
      </ul>
    </div>
  )
}
