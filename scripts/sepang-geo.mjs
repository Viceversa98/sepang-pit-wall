/**
 * Shared Sepang local ↔ world ↔ WGS84 transforms (matches sample-sepang.js).
 */
export const ORIGIN = { lat: 2.76056, lng: 101.7375 };
export const METRES_PER_UNIT = 4;
export const HALF_SPAN_M = 800;

const mPerDegLat = 110540;
const mPerDegLng = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export const localMToLatLng = (eastM, northM) => ({
  lat: ORIGIN.lat + northM / mPerDegLat,
  lng: ORIGIN.lng + eastM / mPerDegLng,
});

export const latLngToLocalM = (lat, lng) => ({
  eastM: (lng - ORIGIN.lng) * mPerDegLng,
  northM: (lat - ORIGIN.lat) * mPerDegLat,
});

/** World units (Three.js XZ) → local metres (CSV axes). */
export const worldToLocalM = (wx, wz, transform) => {
  const lx = wx * METRES_PER_UNIT;
  const lz = wz * METRES_PER_UNIT;
  const { cos, sin, cx, cy } = transform;
  const rx = lx * cos + lz * sin;
  const rz = -lx * sin + lz * cos;
  return { eastM: rx + cx, northM: rz + cy };
};

/** Local metres → world units. */
export const localMToWorld = (eastM, northM, transform) => {
  const { cos, sin, cx, cy, flipX, reversed } = transform;
  let lx = eastM - cx;
  let lz = northM - cy;
  if (flipX) lx = -lx;
  if (reversed) {
    // handled upstream when building transform
  }
  const wx = (lx * cos - lz * sin) / METRES_PER_UNIT;
  const wz = (lx * sin + lz * cos) / METRES_PER_UNIT;
  return { x: wx, z: wz };
};

/**
 * Compute centerline mapping transform from CSV (same logic as sample-sepang.js).
 * Returns { cx, cy, cos, sin, flipX, reversed, sampled, pts }.
 */
export const buildCenterlineTransform = (raw, targetCount = 280) => {
  const segLens = [];
  let totalLen = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(d);
    totalLen += d;
  }

  const windowM = 900;
  const windowFrac = Math.min(0.25, windowM / totalLen);
  const windowPts = Math.max(20, Math.floor(raw.length * windowFrac));

  let bestI = 0;
  let bestScore = Infinity;
  for (let i = 0; i < raw.length; i++) {
    let turn = 0;
    let len = 0;
    for (let k = 0; k < windowPts; k++) {
      const i0 = (i + k) % raw.length;
      const i1 = (i + k + 1) % raw.length;
      const i2 = (i + k + 2) % raw.length;
      const ax = raw[i1].x - raw[i0].x;
      const ay = raw[i1].y - raw[i0].y;
      const bx = raw[i2].x - raw[i1].x;
      const by = raw[i2].y - raw[i1].y;
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      turn += Math.abs(ax * by - ay * bx) / (la * lb);
      len += segLens[i0];
    }
    const score = turn / Math.max(len, 1);
    if (score < bestScore) {
      bestScore = score;
      bestI = i;
    }
  }

  const sfIndex = (bestI + Math.floor(windowPts / 2)) % raw.length;
  const rotated = raw.slice(sfIndex).concat(raw.slice(0, sfIndex));

  const rotSeg = [];
  let rotTotal = 0;
  for (let i = 0; i < rotated.length; i++) {
    const a = rotated[i];
    const b = rotated[(i + 1) % rotated.length];
    rotSeg.push(Math.hypot(b.x - a.x, b.y - a.y));
    rotTotal += rotSeg[i];
  }

  const sampleAt = (s) => {
    let dist = ((s % rotTotal) + rotTotal) % rotTotal;
    for (let i = 0; i < rotated.length; i++) {
      const d = rotSeg[i];
      if (dist <= d || i === rotated.length - 1) {
        const t = d > 0 ? dist / d : 0;
        const a = rotated[i];
        const b = rotated[(i + 1) % rotated.length];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      dist -= d;
    }
    return { ...rotated[0] };
  };

  const sampled = [];
  for (let i = 0; i < targetCount; i++) {
    sampled.push(sampleAt((i / targetCount) * rotTotal));
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of sampled) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = 1 / METRES_PER_UNIT;

  const sfA = sampled[0];
  const sfB = sampled[Math.min(8, sampled.length - 1)];
  const tx = (sfB.x - sfA.x) * scale;
  const tz = (sfB.y - sfA.y) * scale;
  const angle = Math.atan2(tx, tz);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const mapPoint = (p) => {
    const lx = (p.x - cx) * scale;
    const lz = (p.y - cy) * scale;
    return {
      x: lx * cos - lz * sin,
      z: lx * sin + lz * cos,
    };
  };

  let pts = sampled.map(mapPoint);

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.z - b.x * a.z;
  }
  let flipX = false;
  let reversed = false;
  if (area > 0) {
    flipX = true;
    reversed = true;
    pts = pts.map((p) => ({ x: -p.x, z: p.z }));
    pts = [pts[0], ...pts.slice(1).reverse()];
  }

  return {
    cx,
    cy,
    cos,
    sin,
    flipX,
    reversed,
    sfIndex,
    sampled,
    pts,
    span: Math.max(maxX - minX, maxY - minY),
  };
};

export const bilinearSample = (grid, width, height, u, v) => {
  const x = Math.max(0, Math.min(width - 1.001, u * (width - 1)));
  const y = Math.max(0, Math.min(height - 1.001, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * width + x0;
  const i10 = y0 * width + x1;
  const i01 = y1 * width + x0;
  const i11 = y1 * width + x1;
  const e00 = grid[i00];
  const e10 = grid[i10];
  const e01 = grid[i01];
  const e11 = grid[i11];
  return (
    e00 * (1 - fx) * (1 - fy) +
    e10 * fx * (1 - fy) +
    e01 * (1 - fx) * fy +
    e11 * fx * fy
  );
};
