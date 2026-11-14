/** Normalizes barangay names so the boundary file matches the seeded names. */
export function normalizeBarangayName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // ñ → n
    .toLowerCase()
    .replace(/\bsta\.\s*/g, "santa ")
    .replace(/\bsto\.\s*/g, "santo ")
    .replace(/\bst\.\s*/g, "saint ")
    .replace(/\bu\.p\.\s*/g, "up ")
    .replace(/['.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[base] ?? base;
}

/** Seeded name (normalized) → boundary-file name (normalized). */
const ALIASES: Record<string, string> = {
  "balon bato": "balong bato",
  "dona aurora": "aurora",
  "quirino 3-b (claro)": "claro",
  "san isidro galas": "san isidro",
  siena: "sienna",
};
