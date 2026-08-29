/** Drop DPR cap toward 1.0 when sustained FPS falls below target; restore when stable. */
export class AdaptiveDpr {
  private samples: number[] = [];
  private currentCap: number;

  constructor(private readonly maxCap: number) {
    this.currentCap = maxCap;
  }

  get cap(): number {
    return this.currentCap;
  }

  reset(): void {
    this.currentCap = this.maxCap;
    this.samples = [];
  }

  /** Returns new cap when a change was applied, otherwise null. */
  tick(dt: number): number | null {
    this.samples.push(dt);
    if (this.samples.length > 60) this.samples.shift();
    if (this.samples.length < 24) return null;

    const total = this.samples.reduce((sum, sample) => sum + sample, 0);
    const fps = this.samples.length / total;
    const prev = this.currentCap;

    if (fps < 30) {
      this.currentCap = Math.min(this.currentCap, 1);
    } else if (fps > 52 && this.currentCap < this.maxCap) {
      this.currentCap = this.maxCap;
    }

    return prev !== this.currentCap ? this.currentCap : null;
  }
}
