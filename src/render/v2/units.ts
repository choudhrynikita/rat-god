// World units for the v2 renderer. The sim works in TILES (contract TILE_CM = 4 cm). The renderer draws 10 world px per tile
// (2.5 px/cm) so the native worker sprite (≈52 px nose→rump) is a ≈21 cm rat at 1:1, never resampled.
export const PX = 10;            // world px per tile
export const PX_PER_CM = PX / 4;
/** how far the open sky / street extends above the terrain top (world px) */
export const SKY_PX = 2600;
/** street art is drawn at this integer scale so the city towers over the rats (a 360 px painting becomes 2880 px ≈ 11.5 m) */
export const STREET_SCALE = 8;
export const t2p = (t: number) => t * PX;
export const p2t = (p: number) => p / PX;
