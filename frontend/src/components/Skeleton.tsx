export function Spinner() {
  return <div className="spinner" />;
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: string | number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, marginBottom: 8, ...style }} />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={48} />
      ))}
    </div>
  );
}
