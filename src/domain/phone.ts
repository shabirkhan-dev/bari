/**
 * Normalises a Pakistani mobile number to local form "03XXXXXXXXX".
 * Accepts spaces/dashes and +92 / 92 / 0092 prefixes. Returns undefined if invalid.
 */
export function normalizePkMobile(input: string): string | undefined {
  let d = input.replace(/[\s\-()]/g, "");
  if (d.startsWith("+92")) d = "0" + d.slice(3);
  else if (d.startsWith("0092")) d = "0" + d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  return /^03\d{9}$/.test(d) ? d : undefined;
}

/** "0300 1234567" */
export function formatPkMobile(local: string): string {
  return `${local.slice(0, 4)} ${local.slice(4)}`;
}
