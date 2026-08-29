/** Compare visual curve arc length against the physics TRACK_LENGTH_M. */
import { getTrackCurve, getPitCurve, METRES_PER_UNIT, TRACK_LENGTH_M } from "../src/lib/trackCurve";

const curve = getTrackCurve();
const lenUnits = curve.getLength();
const lenM = lenUnits * METRES_PER_UNIT;
const pitLenM = getPitCurve().getLength() * METRES_PER_UNIT;

console.log(
  JSON.stringify(
    {
      declaredTrackLengthM: TRACK_LENGTH_M,
      actualCurveLengthM: +lenM.toFixed(1),
      visualSpeedFactor: +(lenM / TRACK_LENGTH_M).toFixed(3),
      pitCurveLengthM: +pitLenM.toFixed(1),
    },
    null,
    2,
  ),
);
