/** Nombre de archivo seguro y descriptivo: whatsapp_<chat>_<AAAA-MM-DD_HHMM>.<ext> */
export function safeSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'conversacion';
}

export function exportFilename(chatName: string, when: Date, ext: 'txt' | 'md' | 'json' | 'zip'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}${pad(when.getMinutes())}`;
  return `whatsapp_${safeSlug(chatName)}_${stamp}.${ext}`;
}
