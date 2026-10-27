// shadcn style Skeleton, hand built: a soft shimmer block for loading states.
export function Skeleton({ label = "Loading" }: { label?: string }) {
  return <div className="gr-skeleton" role="status" aria-label={label} />;
}
