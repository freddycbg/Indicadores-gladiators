/** Une clases, descartando lo falso. Sin dependencia externa: no hace falta. */
export function cn(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(' ')
}
