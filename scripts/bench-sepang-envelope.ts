import { sepangBrakingEnvelopeMps, sepangLocalLimitMps } from "../src/lib/sepangSpeedProfile.ts";

for (const t of [0, 0.02, 0.05, 0.08, 0.1, 0.15, 0.3, 0.5, 0.85, 0.92]) {
  const env = sepangBrakingEnvelopeMps(t, 1);
  const loc = sepangLocalLimitMps(t);
  console.log(
    `t=${t.toFixed(2)} local=${(loc * 3.6).toFixed(0)} env=${(env * 3.6).toFixed(0)} km/h`,
  );
}
