import { Skeleton } from '@/components/skeleton'

// Skeleton de la papelera. Antes lo cubría el loading.tsx de /docs; al mover
// ese boundary al route group (index) — para que las navegaciones doc→doc no
// flasheen — la papelera necesita el suyo propio.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between py-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-24" />
          </li>
        ))}
      </ul>
    </div>
  )
}
