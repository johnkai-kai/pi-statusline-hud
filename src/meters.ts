export function meterFill(ratio: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return Math.round(safe * Math.floor(width));
}

// The unit is chosen from the value after rounding, not before.
//
// The original picked the unit from the raw value and printed the rounded one, so 999_500
// took the k branch and printed "1000k", and 99_950 printed "100.0k" — a contract that
// implies five columns, emitting six. A long session always passes through 99_950.
function scaled(n: number, unit: number, suffix: string): string | null {
  const value = n / unit;
  const rounded = value >= 100 ? Math.round(value) : Number(value.toFixed(1));
  if (rounded >= 1000) return null;
  return rounded >= 100 ? `${rounded}${suffix}` : `${rounded.toFixed(1)}${suffix}`;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) {
    const k = scaled(n, 1000, "k");
    if (k !== null) return k;
  }
  return scaled(n, 1_000_000, "M") ?? `${Math.round(n / 1_000_000)}M`;
}
