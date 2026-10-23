/** Split the existing semicolon-delimited location field without changing stored data. */
export const formatLocations = (locations: string | null): string[] =>
  (locations ?? "")
    .split(";")
    .map((location) => location.trim())
    .filter(Boolean);
