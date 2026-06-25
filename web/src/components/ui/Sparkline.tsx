/** Minimal inline SVG sparkline. */
export function Sparkline({
  data,
  width = 64,
  height = 24,
  up,
}: {
  data: number[];
  width?: number;
  height?: number;
  up?: boolean;
}) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = up ?? data[data.length - 1] >= data[0];
  const color = rising ? "var(--color-up)" : "var(--color-down)";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
