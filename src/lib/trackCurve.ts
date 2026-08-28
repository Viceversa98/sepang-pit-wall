import * as THREE from "three";
import {
  PIT_SEG_ENTRY_END,
  PIT_SEG_GARAGE_END,
  SEPANG_PIT_CONTROL_POINTS,
} from "./sepangPitCad";

export { PIT_SEG_ENTRY_END, PIT_SEG_GARAGE_END };

/**
 * Real Sepang International Circuit racing line.
 * Sampled from TUMFTM racetrack-database OSM centerline (CC-friendly research data).
 * Source CSV: /public/tracks/sepang-centerline.csv
 *
 * To regenerate: npm run terrain:sample  (node scripts/sample-sepang.cjs)
 */
/** 1 world unit = 4 real metres (F1-readable overview scale). */
export const METRES_PER_UNIT = 4;
export const metresToUnits = (m: number): number => m / METRES_PER_UNIT;
export const unitsToMetres = (u: number): number => u * METRES_PER_UNIT;

export const TRACK_LENGTH_M = 5543;
export const PIT_ENTRY_M = 5501;
export const PIT_EXIT_M = 370;
export const PIT_ENTRY_T = PIT_ENTRY_M / TRACK_LENGTH_M;
export const PIT_EXIT_T = PIT_EXIT_M / TRACK_LENGTH_M;
/**
 * Pit complex offset from racing line (metres → units).
 * Dedicated RIGHT of the circuit — wide enough to read as its own road.
 */
export const PIT_LANE_OFFSET = metresToUnits(18);
/** +1 = driver-right of racing forward (matches sample-sepang-pit.js). */
export const PIT_LANE_SIDE = 1 as const;
/**
 * Stall depth to the RIGHT of the pit fast lane (toward the building).
 * Fast lane (left) = transit in/out; boxes (right) = stop only — exit never
 * drives through another team's stall.
 */
export const PIT_BOX_LATERAL_M = 3.6;
export const PIT_BOX_LATERAL = metresToUnits(PIT_BOX_LATERAL_M);
/** Start pulling into your box this far before boxT (pit progress). */
export const PIT_PULL_IN = 0.07;
/** Merge back to the left fast lane after leaving the box. */
export const PIT_PULL_OUT = 0.06;

/** FIA Grade-1 / F1 sporting layout (metres). */
export const FIA = {
  trackWidthStartM: 15,
  pitWidthM: 8,
  /** Overall length nose tip → rear wing (~Academy / F4-class with wings). */
  carLengthM: 5.7,
  carWidthM: 2.0,
  gridBoxWidthM: 2.7,
  gridBoxLengthM: 5.5,
  gridRowSpacingM: 8,
  /** Lateral center of each grid column from track centerline. */
  gridLaneOffsetM: 3.25,
  /** Pole nose distance behind the start line. */
  gridFrontGapM: 8,
  startLineWidthM: 0.25,
} as const;

export const SEPANG_CONTROL_POINTS: THREE.Vector3[] = [
  new THREE.Vector3(8.2709, 0.375, -17.1529),
  new THREE.Vector3(9.0884, 0.375, -22.0289),
  new THREE.Vector3(9.9057, 0.375, -26.905),
  new THREE.Vector3(10.7229, 0.375, -31.781),
  new THREE.Vector3(11.5404, 0.375, -36.657),
  new THREE.Vector3(12.3583, 0.375, -41.533),
  new THREE.Vector3(13.1768, 0.375, -46.4088),
  new THREE.Vector3(13.9958, 0.375, -51.2846),
  new THREE.Vector3(14.8153, 0.375, -56.1602),
  new THREE.Vector3(15.6352, 0.375, -61.0358),
  new THREE.Vector3(16.4555, 0.375, -65.9114),
  new THREE.Vector3(17.2761, 0.375, -70.7869),
  new THREE.Vector3(18.0969, 0.375, -75.6623),
  new THREE.Vector3(18.9179, 0.375, -80.5378),
  new THREE.Vector3(19.739, 0.375, -85.4132),
  new THREE.Vector3(20.5602, 0.375, -90.2885),
  new THREE.Vector3(21.3814, 0.375, -95.1639),
  new THREE.Vector3(22.2025, 0.375, -100.0393),
  new THREE.Vector3(23.0235, 0.375, -104.9148),
  new THREE.Vector3(23.8443, 0.375, -109.7902),
  new THREE.Vector3(24.665, 0.375, -114.6657),
  new THREE.Vector3(25.4853, 0.375, -119.5412),
  new THREE.Vector3(26.3052, 0.375, -124.4168),
  new THREE.Vector3(27.0972, 0.375, -129.297),
  new THREE.Vector3(27.6115, 0.375, -134.2124),
  new THREE.Vector3(27.1714, 0.375, -139.0897),
  new THREE.Vector3(23.5192, 0.375, -142.3064),
  new THREE.Vector3(18.7366, 0.375, -143.4522),
  new THREE.Vector3(13.9019, 0.375, -142.7069),
  new THREE.Vector3(10.3592, 0.375, -139.4304),
  new THREE.Vector3(9.8888, 0.375, -134.5804),
  new THREE.Vector3(10.8492, 0.375, -129.7346),
  new THREE.Vector3(11.7645, 0.375, -124.8893),
  new THREE.Vector3(10.4513, 0.375, -120.2254),
  new THREE.Vector3(6.1664, 0.375, -118.1666),
  new THREE.Vector3(1.6253, 0.375, -119.833),
  new THREE.Vector3(-2.155, 0.375, -123.0163),
  new THREE.Vector3(-5.8795, 0.375, -126.267),
  new THREE.Vector3(-9.8665, 0.375, -129.1841),
  new THREE.Vector3(-14.2187, 0.375, -131.5196),
  new THREE.Vector3(-18.87, 0.375, -133.1792),
  new THREE.Vector3(-23.7151, 0.375, -134.1443),
  new THREE.Vector3(-28.6396, 0.375, -134.5603),
  new THREE.Vector3(-33.5828, 0.375, -134.5996),
  new THREE.Vector3(-38.5237, 0.375, -134.428),
  new THREE.Vector3(-43.454, 0.375, -134.0794),
  new THREE.Vector3(-48.2803, 0.375, -133.0345),
  new THREE.Vector3(-52.9378, 0.375, -131.3811),
  new THREE.Vector3(-57.4234, 0.375, -129.3061),
  new THREE.Vector3(-61.6434, 0.375, -126.7373),
  new THREE.Vector3(-65.3807, 0.375, -123.5114),
  new THREE.Vector3(-68.6001, 0.375, -119.7622),
  new THREE.Vector3(-71.463, 0.375, -115.7335),
  new THREE.Vector3(-73.935, 0.375, -111.4542),
  new THREE.Vector3(-76.0172, 0.375, -106.9713),
  new THREE.Vector3(-77.887, 0.375, -102.3946),
  new THREE.Vector3(-79.7384, 0.375, -97.8103),
  new THREE.Vector3(-81.6334, 0.375, -93.2438),
  new THREE.Vector3(-83.5832, 0.375, -88.7005),
  new THREE.Vector3(-85.5881, 0.375, -84.1812),
  new THREE.Vector3(-87.6426, 0.375, -79.6843),
  new THREE.Vector3(-89.7415, 0.375, -75.2079),
  new THREE.Vector3(-91.8795, 0.375, -70.75),
  new THREE.Vector3(-94.0507, 0.375, -66.3082),
  new THREE.Vector3(-96.2477, 0.375, -61.8791),
  new THREE.Vector3(-98.4633, 0.375, -57.4593),
  new THREE.Vector3(-100.6901, 0.375, -53.0451),
  new THREE.Vector3(-102.924, 0.375, -48.6345),
  new THREE.Vector3(-105.1755, 0.375, -44.2328),
  new THREE.Vector3(-107.4592, 0.375, -39.8478),
  new THREE.Vector3(-109.7894, 0.375, -35.4873),
  new THREE.Vector3(-112.179, 0.375, -31.1592),
  new THREE.Vector3(-114.6063, 0.375, -26.852),
  new THREE.Vector3(-116.6074, 0.375, -22.3457),
  new THREE.Vector3(-115.7782, 0.375, -17.5407),
  new THREE.Vector3(-112.1582, 0.375, -14.5704),
  new THREE.Vector3(-107.3512, 0.375, -13.421),
  new THREE.Vector3(-102.5412, 0.375, -12.2779),
  new THREE.Vector3(-97.7634, 0.375, -11.0072),
  new THREE.Vector3(-93.0073, 0.375, -9.6569),
  new THREE.Vector3(-88.2594, 0.375, -8.2779),
  new THREE.Vector3(-83.5141, 0.375, -6.8904),
  new THREE.Vector3(-78.7691, 0.375, -5.5016),
  new THREE.Vector3(-74.0223, 0.375, -4.119),
  new THREE.Vector3(-69.272, 0.375, -2.7483),
  new THREE.Vector3(-64.5259, 0.375, -1.3634),
  new THREE.Vector3(-59.8029, 0.375, 0.098),
  new THREE.Vector3(-55.2198, 0.375, 1.9374),
  new THREE.Vector3(-51.0654, 0.375, 4.6024),
  new THREE.Vector3(-47.4068, 0.375, 7.9223),
  new THREE.Vector3(-44.2139, 0.375, 11.6881),
  new THREE.Vector3(-41.9299, 0.375, 16.0619),
  new THREE.Vector3(-40.3859, 0.375, 20.7539),
  new THREE.Vector3(-39.7113, 0.375, 25.6448),
  new THREE.Vector3(-39.7317, 0.375, 30.5859),
  new THREE.Vector3(-40.5797, 0.375, 35.4487),
  new THREE.Vector3(-42.1698, 0.375, 40.1273),
  new THREE.Vector3(-44.4759, 0.375, 44.4897),
  new THREE.Vector3(-47.6124, 0.375, 48.3038),
  new THREE.Vector3(-51.1977, 0.375, 51.7059),
  new THREE.Vector3(-55.0634, 0.375, 54.7832),
  new THREE.Vector3(-58.7927, 0.375, 58.0002),
  new THREE.Vector3(-61.7668, 0.375, 61.9426),
  new THREE.Vector3(-63.9424, 0.375, 66.3697),
  new THREE.Vector3(-64.9222, 0.375, 71.195),
  new THREE.Vector3(-64.6727, 0.375, 76.1256),
  new THREE.Vector3(-63.5576, 0.375, 80.9343),
  new THREE.Vector3(-61.7211, 0.375, 85.5203),
  new THREE.Vector3(-59.1326, 0.375, 89.7206),
  new THREE.Vector3(-55.8964, 0.375, 93.4555),
  new THREE.Vector3(-52.4819, 0.375, 97.0311),
  new THREE.Vector3(-49.0607, 0.375, 100.6002),
  new THREE.Vector3(-45.6433, 0.375, 104.173),
  new THREE.Vector3(-42.2275, 0.375, 107.7474),
  new THREE.Vector3(-38.8108, 0.375, 111.3209),
  new THREE.Vector3(-35.3909, 0.375, 114.8914),
  new THREE.Vector3(-31.9655, 0.375, 118.4565),
  new THREE.Vector3(-28.532, 0.375, 122.0139),
  new THREE.Vector3(-25.0883, 0.375, 125.5614),
  new THREE.Vector3(-21.6324, 0.375, 129.097),
  new THREE.Vector3(-18.1707, 0.375, 132.6269),
  new THREE.Vector3(-14.7173, 0.375, 136.1649),
  new THREE.Vector3(-11.2863, 0.375, 139.7248),
  new THREE.Vector3(-7.6607, 0.375, 143.0785),
  new THREE.Vector3(-3.1528, 0.375, 144.7504),
  new THREE.Vector3(1.4932, 0.375, 143.1079),
  new THREE.Vector3(6.1334, 0.375, 141.4022),
  new THREE.Vector3(10.7745, 0.375, 139.6981),
  new THREE.Vector3(15.4214, 0.375, 138.0137),
  new THREE.Vector3(19.1794, 0.375, 135.0449),
  new THREE.Vector3(21.0361, 0.375, 130.5139),
  new THREE.Vector3(21.5929, 0.375, 125.6024),
  new THREE.Vector3(22.2081, 0.375, 120.6968),
  new THREE.Vector3(22.8328, 0.375, 115.7924),
  new THREE.Vector3(23.4071, 0.375, 110.8818),
  new THREE.Vector3(23.9772, 0.375, 105.9709),
  new THREE.Vector3(24.76, 0.375, 101.0896),
  new THREE.Vector3(25.6486, 0.375, 96.2261),
  new THREE.Vector3(26.5856, 0.375, 91.3716),
  new THREE.Vector3(27.56, 0.375, 86.5245),
  new THREE.Vector3(28.5608, 0.375, 81.6828),
  new THREE.Vector3(29.5774, 0.375, 76.8444),
  new THREE.Vector3(30.6034, 0.375, 72.008),
  new THREE.Vector3(31.635, 0.375, 67.1728),
  new THREE.Vector3(32.6687, 0.375, 62.338),
  new THREE.Vector3(33.7008, 0.375, 57.5028),
  new THREE.Vector3(34.7301, 0.375, 52.6671),
  new THREE.Vector3(35.759, 0.375, 47.8313),
  new THREE.Vector3(36.7904, 0.375, 42.996),
  new THREE.Vector3(37.8273, 0.375, 38.1619),
  new THREE.Vector3(38.8687, 0.375, 33.3287),
  new THREE.Vector3(39.8909, 0.375, 28.4915),
  new THREE.Vector3(40.8922, 0.375, 23.65),
  new THREE.Vector3(42.7775, 0.375, 19.2242),
  new THREE.Vector3(47.5106, 0.375, 18.509),
  new THREE.Vector3(50.7173, 0.375, 22.0827),
  new THREE.Vector3(52.8993, 0.375, 26.5187),
  new THREE.Vector3(55.1296, 0.375, 30.931),
  new THREE.Vector3(57.3849, 0.375, 35.3307),
  new THREE.Vector3(59.9628, 0.375, 39.5368),
  new THREE.Vector3(63.5733, 0.375, 42.8958),
  new THREE.Vector3(67.7696, 0.375, 45.4872),
  new THREE.Vector3(72.5438, 0.375, 46.7028),
  new THREE.Vector3(77.4614, 0.375, 47.2055),
  new THREE.Vector3(82.402, 0.375, 47.3484),
  new THREE.Vector3(87.3331, 0.375, 47.0211),
  new THREE.Vector3(92.2048, 0.375, 46.1902),
  new THREE.Vector3(96.9674, 0.375, 44.8708),
  new THREE.Vector3(101.6039, 0.375, 43.1566),
  new THREE.Vector3(106.1009, 0.375, 41.1069),
  new THREE.Vector3(110.3992, 0.375, 38.6656),
  new THREE.Vector3(114.317, 0.375, 35.6853),
  new THREE.Vector3(115.8765, 0.375, 31.1194),
  new THREE.Vector3(114.8861, 0.375, 26.371),
  new THREE.Vector3(112.1448, 0.375, 22.2576),
  new THREE.Vector3(109.329, 0.375, 18.1938),
  new THREE.Vector3(106.5055, 0.375, 14.1352),
  new THREE.Vector3(103.69, 0.375, 10.0712),
  new THREE.Vector3(100.879, 0.375, 6.004),
  new THREE.Vector3(98.0687, 0.375, 1.9363),
  new THREE.Vector3(95.2553, 0.375, -2.1293),
  new THREE.Vector3(92.438, 0.375, -6.192),
  new THREE.Vector3(89.6197, 0.375, -10.2542),
  new THREE.Vector3(86.804, 0.375, -14.3181),
  new THREE.Vector3(83.9944, 0.375, -18.3863),
  new THREE.Vector3(81.1901, 0.375, -22.4581),
  new THREE.Vector3(78.3688, 0.375, -26.5181),
  new THREE.Vector3(75.5767, 0.375, -30.5972),
  new THREE.Vector3(73.7434, 0.375, -35.1619),
  new THREE.Vector3(73.3612, 0.375, -40.0785),
  new THREE.Vector3(74.489, 0.375, -44.8644),
  new THREE.Vector3(76.9309, 0.375, -49.156),
  new THREE.Vector3(79.8019, 0.375, -53.1805),
  new THREE.Vector3(82.6405, 0.375, -57.2275),
  new THREE.Vector3(85.1955, 0.375, -61.4596),
  new THREE.Vector3(87.5936, 0.375, -65.7826),
  new THREE.Vector3(89.5796, 0.375, -70.3036),
  new THREE.Vector3(90.5153, 0.375, -75.1471),
  new THREE.Vector3(90.9402, 0.375, -80.0725),
  new THREE.Vector3(91.0093, 0.375, -85.0132),
  new THREE.Vector3(90.3501, 0.375, -89.906),
  new THREE.Vector3(88.935, 0.375, -94.6385),
  new THREE.Vector3(86.803, 0.375, -99.0913),
  new THREE.Vector3(84.0146, 0.375, -103.1702),
  new THREE.Vector3(80.7688, 0.375, -106.8936),
  new THREE.Vector3(76.8175, 0.375, -109.8355),
  new THREE.Vector3(72.3089, 0.375, -111.81),
  new THREE.Vector3(67.4156, 0.375, -111.6331),
  new THREE.Vector3(63.1321, 0.375, -109.3379),
  new THREE.Vector3(61.0055, 0.375, -104.9272),
  new THREE.Vector3(59.7386, 0.375, -100.1483),
  new THREE.Vector3(58.4045, 0.375, -95.3876),
  new THREE.Vector3(57.058, 0.375, -90.6305),
  new THREE.Vector3(55.7149, 0.375, -85.8723),
  new THREE.Vector3(54.3899, 0.375, -81.1091),
  new THREE.Vector3(53.0975, 0.375, -76.3369),
  new THREE.Vector3(51.8427, 0.375, -71.5548),
  new THREE.Vector3(50.6145, 0.375, -66.7657),
  new THREE.Vector3(49.4007, 0.375, -61.973),
  new THREE.Vector3(48.1888, 0.375, -57.1797),
  new THREE.Vector3(46.9683, 0.375, -52.3887),
  new THREE.Vector3(45.7398, 0.375, -47.5997),
  new THREE.Vector3(44.508, 0.375, -42.8115),
  new THREE.Vector3(43.2779, 0.375, -38.0229),
  new THREE.Vector3(42.0541, 0.375, -33.2327),
  new THREE.Vector3(40.8377, 0.375, -28.4406),
  new THREE.Vector3(39.6261, 0.375, -23.6473),
  new THREE.Vector3(38.4169, 0.375, -18.8534),
  new THREE.Vector3(37.2074, 0.375, -14.0596),
  new THREE.Vector3(35.995, 0.375, -9.2665),
  new THREE.Vector3(34.7771, 0.375, -4.4747),
  new THREE.Vector3(33.5511, 0.375, 0.3149),
  new THREE.Vector3(32.3144, 0.375, 5.1018),
  new THREE.Vector3(31.0649, 0.375, 9.8854),
  new THREE.Vector3(29.8034, 0.375, 14.6658),
  new THREE.Vector3(28.5322, 0.375, 19.4436),
  new THREE.Vector3(27.2535, 0.375, 24.2195),
  new THREE.Vector3(25.9696, 0.375, 28.9939),
  new THREE.Vector3(24.6826, 0.375, 33.7675),
  new THREE.Vector3(23.3948, 0.375, 38.5409),
  new THREE.Vector3(22.1084, 0.375, 43.3147),
  new THREE.Vector3(20.8256, 0.375, 48.0895),
  new THREE.Vector3(19.5503, 0.375, 52.8662),
  new THREE.Vector3(18.292, 0.375, 57.6475),
  new THREE.Vector3(17.0619, 0.375, 62.4361),
  new THREE.Vector3(15.871, 0.375, 67.2345),
  new THREE.Vector3(14.7232, 0.375, 72.0435),
  new THREE.Vector3(13.548, 0.375, 76.8458),
  new THREE.Vector3(12.233, 0.375, 81.6114),
  new THREE.Vector3(10.7987, 0.375, 86.3428),
  new THREE.Vector3(9.4116, 0.375, 91.0882),
  new THREE.Vector3(8.0484, 0.375, 95.8403),
  new THREE.Vector3(6.0162, 0.375, 100.3248),
  new THREE.Vector3(2.4583, 0.375, 103.7011),
  new THREE.Vector3(-2.2761, 0.375, 104.6344),
  new THREE.Vector3(-6.9378, 0.375, 103.111),
  new THREE.Vector3(-10.4651, 0.375, 99.7408),
  new THREE.Vector3(-11.0337, 0.375, 94.9091),
  new THREE.Vector3(-10.1468, 0.375, 90.0454),
  new THREE.Vector3(-9.2878, 0.375, 85.1766),
  new THREE.Vector3(-8.4317, 0.375, 80.3072),
  new THREE.Vector3(-7.5762, 0.375, 75.4377),
  new THREE.Vector3(-6.7217, 0.375, 70.568),
  new THREE.Vector3(-5.8687, 0.375, 65.6981),
  new THREE.Vector3(-5.0175, 0.375, 60.8279),
  new THREE.Vector3(-4.1684, 0.375, 55.9573),
  new THREE.Vector3(-3.3217, 0.375, 51.0862),
  new THREE.Vector3(-2.4779, 0.375, 46.2147),
  new THREE.Vector3(-1.6373, 0.375, 41.3426),
  new THREE.Vector3(-0.7998, 0.375, 36.47),
  new THREE.Vector3(0.0348, 0.375, 31.5969),
  new THREE.Vector3(0.8668, 0.375, 26.7234),
  new THREE.Vector3(1.6963, 0.375, 21.8494),
  new THREE.Vector3(2.5236, 0.375, 16.975),
  new THREE.Vector3(3.3489, 0.375, 12.1003),
  new THREE.Vector3(4.1724, 0.375, 7.2253),
  new THREE.Vector3(4.9943, 0.375, 2.35),
  new THREE.Vector3(5.8149, 0.375, -2.5254),
  new THREE.Vector3(6.6344, 0.375, -7.4011),
  new THREE.Vector3(7.453, 0.375, -12.2769),
];

let cachedCurve: THREE.CatmullRomCurve3 | null = null;
let cachedPitCurve: THREE.CatmullRomCurve3 | null = null;

export const metresToProgress = (metres: number): number => {
  const m = ((metres % TRACK_LENGTH_M) + TRACK_LENGTH_M) % TRACK_LENGTH_M;
  return m / TRACK_LENGTH_M;
};

export const getTrackCurve = (): THREE.CatmullRomCurve3 => {
  if (cachedCurve) return cachedCurve;
  cachedCurve = new THREE.CatmullRomCurve3(SEPANG_CONTROL_POINTS, true, "catmullrom", 0.15);
  return cachedCurve;
};

const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

/** Fraction along pit CAD (garage corridor) for stall 0. */
export const PIT_BOX_BASE_T = PIT_SEG_ENTRY_END + 0.08;
/** Spacing between team stalls along the garage segment. */
export const PIT_BOX_SPACING = 0.045;

/** Stall T clamped inside the garage corridor (not entry/exit flares). */
export const getPitBoxT = (index: number): number => {
  const lo = PIT_SEG_ENTRY_END + 0.02;
  const hi = PIT_SEG_GARAGE_END - 0.04;
  const raw = PIT_BOX_BASE_T + Math.max(0, index) * PIT_BOX_SPACING;
  return Math.min(hi, Math.max(lo, raw));
};

/** Garage midpoint along pit CAD — for building alignment. */
export const getPitGarageMidT = (): number =>
  (PIT_SEG_ENTRY_END + PIT_SEG_GARAGE_END) * 0.5;

/**
 * Dedicated pit FAST lane (LEFT / transit through the pit complex).
 * Boxes sit on a parallel RIGHT working lane — exit stays on this curve.
 */
export const getPitCurve = (): THREE.CatmullRomCurve3 => {
  if (cachedPitCurve) return cachedPitCurve;
  cachedPitCurve = new THREE.CatmullRomCurve3(
    SEPANG_PIT_CONTROL_POINTS,
    false,
    "catmullrom",
    0.2,
  );
  return cachedPitCurve;
};

let cachedPitBoxLane: THREE.CatmullRomCurve3 | null = null;

/** Right-side box/working lane — parallel to fast lane toward the building. */
export const getPitBoxLaneCurve = (): THREE.CatmullRomCurve3 => {
  if (cachedPitBoxLane) return cachedPitBoxLane;
  const fast = getPitCurve();
  const up = new THREE.Vector3(0, 1, 0);
  const steps = 64;
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = fast.getPointAt(u);
    const tan = fast.getTangentAt(u).normalize();
    const side = new THREE.Vector3().crossVectors(up, tan).normalize();
    samples.push(p.clone().addScaledVector(side, -PIT_BOX_LATERAL));
  }
  cachedPitBoxLane = new THREE.CatmullRomCurve3(samples, false, "catmullrom", 0.2);
  return cachedPitBoxLane;
};

export type TrackPose = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
};

/**
 * Sample the pit FAST lane (left / transit) at progress u.
 * Boxes sit to the driver-right of this lane.
 */
export const samplePitFastLane = (
  u: number,
): TrackPose => {
  const pit = getPitCurve();
  const t = Math.min(1, Math.max(0, u));
  const position = pit.getPointAt(t);
  const tangent = pit.getTangentAt(t).normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tangent).normalize();
  return { position, tangent, side };
};

/** World pose of a pit stall — offset RIGHT of the fast lane toward the building. */
export const getPitBoxPose = (index: number): TrackPose & { rotationY: number; pitT: number } => {
  const pitT = getPitBoxT(index);
  const fast = samplePitFastLane(pitT);
  // Driver-right of forward = −side (side is left)
  const position = fast.position.clone().addScaledVector(fast.side, -PIT_BOX_LATERAL);
  return {
    position,
    tangent: fast.tangent,
    side: fast.side,
    rotationY: Math.atan2(fast.tangent.x, fast.tangent.z),
    pitT,
  };
};

/**
 * 0 = left fast lane (transit), 1 = right box stall.
 * In: stay left until near own box, then pull right. Out: pull left immediately, stay left.
 */
export const pitBoxLaneBlend = (
  pitProgress: number,
  boxT: number,
  pitPhase: "in" | "stopped" | "out" | null,
  holdTraffic: boolean,
): number => {
  if (pitPhase === "stopped" || holdTraffic) return 1;
  if (pitPhase === "in") {
    const pullStart = Math.max(0, boxT - PIT_PULL_IN);
    if (pitProgress <= pullStart) return 0;
    if (pitProgress >= boxT) return 1;
    return (pitProgress - pullStart) / Math.max(1e-4, boxT - pullStart);
  }
  if (pitPhase === "out") {
    const pullEnd = Math.min(1, boxT + PIT_PULL_OUT);
    if (pitProgress <= boxT) return 1;
    if (pitProgress >= pullEnd) return 0;
    return 1 - (pitProgress - boxT) / Math.max(1e-4, pullEnd - boxT);
  }
  return 0;
};

export const getPoseAt = (t: number): TrackPose => {
  const curve = getTrackCurve();
  const tt = wrap01(t);
  const position = curve.getPointAt(tt);
  const tangent = curve.getTangentAt(tt).normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tangent).normalize();
  return { position, tangent, side };
};

export const getStartFinishPose = (): TrackPose => getPoseAt(0);

/** @deprecated use getStartFinishPose */
export const getStartFinishPosition = (): THREE.Vector3 => getStartFinishPose().position;

/**
 * FIA F1 grid slot: rows 8m apart, odd/even staggered L/R.
 * Index 0 = pole. Progress is behind the start line (t wraps near 1).
 */
export const getGridSlot = (index: number): TrackPose & { rotationY: number } => {
  const behindM = FIA.gridFrontGapM + index * FIA.gridRowSpacingM;
  const t = wrap01(1 - behindM / TRACK_LENGTH_M);
  const pose = getPoseAt(t);
  // Pole (0) on left of forward — Sepang T1 is a right-hander, racing line left.
  const sideSign = index % 2 === 0 ? -1 : 1;
  const position = pose.position
    .clone()
    .addScaledVector(pose.side, sideSign * metresToUnits(FIA.gridLaneOffsetM));
  return {
    position,
    tangent: pose.tangent,
    side: pose.side,
    rotationY: Math.atan2(pose.tangent.x, pose.tangent.z),
  };
};
