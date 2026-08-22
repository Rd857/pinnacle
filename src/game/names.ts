const FIRST = [
  "Ada", "Niko", "Remy", "Sable", "Ivo", "Mira", "Jules", "Wren",
  "Theo", "Lana", "Omar", "Pia", "Ellis", "Noor", "Kai", "Hana",
  "Felix", "Inez", "Arlo", "Yuna", "Seth", "Cleo", "Hugo", "Asha",
  "Leif", "Vera", "Nash", "Iris", "Cole", "Zara", "Quinn", "Esme",
];

const LAST = [
  "Voss", "Hart", "Cho", "Lang", "Okoye", "Perez", "Nash", "Berg",
  "Dunn", "Sato", "Klein", "Iyer", "Wade", "Lowe", "Shah", "Beck",
];

export function personName(seed: number): string {
  const f = FIRST[Math.abs(seed) % FIRST.length]!;
  const l = LAST[Math.abs((seed * 7) >> 3) % LAST.length]!;
  return `${f} ${l}`;
}
