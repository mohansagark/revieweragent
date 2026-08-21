/** GitHub interpolates missing Actions secrets as empty string. Treat those as unset. */
export function presentSecret(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
