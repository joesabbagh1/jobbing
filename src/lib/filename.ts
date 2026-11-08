/** "Joe-Michel Sabbagh" → "Joe-Michel_Sabbagh": safe for download filenames. */
export function fileSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** e.g. Joe-Michel_Sabbagh_CV_Doctolib.pdf */
export function documentFilename(name: string, kind: string, company?: string): string {
  return [fileSlug(name) || "Document", kind, company && fileSlug(company)].filter(Boolean).join("_") + ".pdf";
}
