export function meterFill(ratio: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return Math.round(safe * Math.floor(width));
}

// 分檔要看進位「之後」的值,不是進位前的。
//
// 原本用原值判檔、用四捨五入後的值輸出,所以 999_500 走到 k 檔卻印成
// "1000k"、99_950 印成 "100.0k"——契約隱含五欄,卻吐出六欄。長 session
// 必經 99_950 這一段。
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
