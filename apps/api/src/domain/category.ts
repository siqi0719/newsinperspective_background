export function extractRegion(category: string | null): string | null {
  if (!category) return null;
  return category.split(" | ")[0]?.trim() ?? null;
}

export function categoryMatchesRegion(category: string | null, region: string | null): boolean {
  if (!region) return true;
  return extractRegion(category) === region;
}
