import { Rng, mulberry32 } from './rng';

export interface Template {
  headlines: string[];
  colors: string[];
  ctas: string[];
}
export interface VariantSpec {
  headline: string;
  color: string;
  cta: string;
}

export const MAX_VARIANTS = 8;

const unique = (items: string[]) => [...new Set(items.map((s) => s.trim()).filter(Boolean))];

// Mix every headline with every color and every button text.
export function generateVariants(
  template: Template,
  max = MAX_VARIANTS,
  rng: Rng = mulberry32(1),
): VariantSpec[] {
  const all: VariantSpec[] = [];
  for (const headline of unique(template.headlines))
    for (const color of unique(template.colors))
      for (const cta of unique(template.ctas)) all.push({ headline, color, cta });

  if (all.length <= max) return all;

  // Shuffle, then take the first `max`.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, max);
}
