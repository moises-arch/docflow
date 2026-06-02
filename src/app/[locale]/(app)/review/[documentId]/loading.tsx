export default function ReviewLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="skeleton-shimmer h-12 w-full rounded" />
      <div className="flex flex-1 gap-4 p-4">
        <div className="skeleton-shimmer h-96 flex-1 rounded-md" />
        <div className="skeleton-shimmer h-96 w-96 rounded-md" />
      </div>
    </div>
  );
}
