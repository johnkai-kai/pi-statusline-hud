export class AgentTracker {
  private live = new Set<string>();

  start(id: string): void {
    this.live.add(id);
  }

  end(id: string): void {
    this.live.delete(id);
  }

  activeCount(): number {
    return this.live.size;
  }

  reset(): void {
    this.live.clear();
  }
}
