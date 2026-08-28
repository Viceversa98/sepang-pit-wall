/** Framework-agnostic PID controller for steering / speed channels. */
export type PidConfig = {
  kp: number;
  ki: number;
  kd: number;
  outputMin: number;
  outputMax: number;
  integralClamp: number;
};

export class PidController {
  private integral = 0;
  private previousError = 0;

  constructor(private readonly config: PidConfig) {}

  reset(): void {
    this.integral = 0;
    this.previousError = 0;
  }

  step(error: number, dt: number): number {
    if (dt <= 0) return 0;

    this.integral += error * dt;
    this.integral = clamp(
      this.integral,
      -this.config.integralClamp,
      this.config.integralClamp,
    );

    const derivative = (error - this.previousError) / dt;
    this.previousError = error;

    const output =
      this.config.kp * error +
      this.config.ki * this.integral +
      this.config.kd * derivative;

    return clamp(output, this.config.outputMin, this.config.outputMax);
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
