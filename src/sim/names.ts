import { nextRand } from './rng';
const A = ['GNAW', 'SCAB', 'MANG', 'VERM', 'RUST', 'SOOT', 'GRIM', 'ROT', 'MURK', 'FESTER', 'SKULK', 'TATTER', 'CRUST', 'BLIGHT', 'SLUDGE', 'WHISK', 'NIB', 'GRUB', 'MOLD', 'CHITTER', 'SCRAP', 'CINDER', 'ASH', 'DREG', 'GRIT', 'PEST', 'SNIV', 'BRACK', 'LOUSE', 'TICK'];
const B = ['LIN', 'BARD', 'Y', 'IN', 'TAIL', 'WICK', 'TOOTH', 'CLAW', 'EAR', 'NOSE', 'PAW', 'BELLY', 'ER', 'KIN', 'LET', 'MAW', 'RICK', 'SNOUT', 'WHISKER', 'BONE'];
export function ratName(s: { rng: number }): string {
  const a = A[Math.floor(nextRand(s) * A.length)];
  const b = B[Math.floor(nextRand(s) * B.length)];
  return a + b;
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
export const roman = (n: number) => ROMAN[n - 1] ?? String(n);
