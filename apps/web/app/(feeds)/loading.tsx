import { JamCardSkeleton } from '@/app/_components/jam-card-skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      {[0, 1, 2].map((i) => (
        <JamCardSkeleton key={i} />
      ))}
    </div>
  )
}
