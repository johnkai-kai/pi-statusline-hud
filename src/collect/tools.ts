export class ToolTally {
  private counts = new Map<string, number>();
  private active = new Map<string, number>();

  record(name: string): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  running(name: string): void {
    this.active.set(name, (this.active.get(name) ?? 0) + 1);
  }

  finished(name: string): void {
    const current = this.active.get(name) ?? 0;
    if (current <= 1) this.active.delete(name);
    else this.active.set(name, current - 1);
  }

  top(limit: number): Array<{ name: string; count: number }> {
    return [...this.counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, Math.max(0, limit));
  }

  runningCount(): number {
    let total = 0;
    for (const n of this.active.values()) total += n;
    return total;
  }

  reset(): void {
    this.counts.clear();
    this.active.clear();
  }
}
