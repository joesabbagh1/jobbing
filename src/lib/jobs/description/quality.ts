// Under this, a description is usually a teaser or a cut-off scrape: too little to tailor a CV or letter against.
const MIN_POSTING_CHARS = 800;

/** A note for the user when a posting is too short to work from, e.g. LinkedIn's two-sentence preview. */
export function thinPostingWarning(description: string): string | undefined {
  const length = description.trim().length;
  if (length >= MIN_POSTING_CHARS) return undefined;
  return `This posting is only ${length} characters long, so it is probably a preview and not the full text. Paste the full description on the job page for a result that fits the job.`;
}
