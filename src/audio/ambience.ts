// The drip beds are retired. The synthwave loop is the only sound. ambMix stays so the old tests still describe a world.
export const AMB = ['amb_sewer_drips', 'amb_street_rain', 'amb_machine_hum', 'amb_crowd_murmur', 'amb_silence_dread', 'amb_retro_cave'] as const;
export type AmbId = (typeof AMB)[number];
export type AmbMix = Partial<Record<AmbId, number>>;

export class Ambience {
  set(_mix: AmbMix, _fade = 1.5) { /* not played */ }
}
/** pure mixing rule (unit-tested): world context → bed levels */
export function ambMix(o: { underground: number; /** 0 = street view, 1 = deep */ rain: number; storm: boolean; machines: number; crowd: number; dread: boolean; dead: boolean; night: boolean }): AmbMix {
  const surf = 1 - o.underground;
  return {
    amb_sewer_drips: o.dead ? 0.3 : 0.25 + 0.35 * o.underground + 0.2 * o.rain * o.underground,
    amb_street_rain: Math.min(0.8, (0.1 + 0.6 * o.rain + (o.storm ? 0.2 : 0)) * (0.25 + 0.75 * surf)),
    amb_machine_hum: o.dead ? 0 : Math.min(0.5, 0.05 + 0.45 * o.machines),
    amb_crowd_murmur: o.dead ? 0 : Math.min(0.55, o.crowd * (o.night ? 0.5 : 1)),
    amb_silence_dread: o.dread || o.dead ? 0.6 : 0,
    // CC0 chiptune bed (Void Estate). Kept under the drip bed, and ducked when the street is loud, so it does not fight music or rain.
    amb_retro_cave: o.dead ? 0.03 : (0.06 + 0.08 * o.underground) * (1 - 0.45 * o.crowd),
  };
}
