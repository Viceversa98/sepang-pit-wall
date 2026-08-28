# Sepang campus GLBs

Hero building meshes baked from procedural kits. Rebuild with:

```bash
npm run campus:rebuild
# or export only:
npm run campus:export
```

## Building IDs (`CampusBuildingId`)

| ID | Kit |
|----|-----|
| `pit` | pit garage |
| `mainGrandstandNorth` | tiered main stand |
| `mainGrandstandSouth` | tiered main stand |
| `tower` | welcome / Petronas-inspired tower |
| `twinTowers` | pit-exit twin spires |
| `k1` | covered grandstand |
| `grandstandF` | covered grandstand (T7–8) |
| `welcome` | welcome center |
| `medicalCenter` | medical block |
| `controlPostWelcome` | entry control booth |
| `paddockChalets` | paddock chalets |
| `southPaddock` | south paddock |
| `hillstandK2` | open hill (K2) |
| `hillstandC2` | hill + canopy (C2) |
| `motorsportPark` | workshop bays |

Override paths in `CAMPUS_GLB` inside [`src/lib/sepangCampusAssets.ts`](../../src/lib/sepangCampusAssets.ts) when needed.

When a file is missing, `SepangCampus` keeps the procedural kit for that placement.
