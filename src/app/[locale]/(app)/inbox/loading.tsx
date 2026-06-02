export default function InboxLoading() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-12 rounded" />
      ))}
    </div>
  );
}
