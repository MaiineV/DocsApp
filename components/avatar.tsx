import Image from 'next/image'
import { cursorColor } from '@/lib/collab'

// Avatar redondo: la foto si hay; si no, la inicial sobre un color estable
// (mismo seed → mismo color, igual que el cursor de colaboración).
export default function Avatar({
  src,
  name,
  seed,
  size = 28,
}: {
  src?: string | null
  name: string
  seed: string
  size?: number
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  const initial = (name.trim()[0] || '?').toUpperCase()
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: cursorColor(seed), fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </span>
  )
}
