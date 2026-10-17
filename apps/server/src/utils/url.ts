/**
 * Formats a shareable room link for a host or guest.
 */
export function formatRoomLink(
  baseUrl: string,
  roomId: string,
  token: string,
  lang?: string
): string {
  const prefix = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : "";
  return `${prefix}/room/${roomId}?token=${token}${langParam}`;
}
