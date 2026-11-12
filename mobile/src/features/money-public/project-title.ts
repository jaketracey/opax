/** A list title from the published purpose. The item retains the full text. */
export function projectTitle(purpose: string): string {
  const title = purpose
    .trim()
    .replace(
      /^the project will deliver\s+(?:the\s+)?(?:construction of\s+(?:the\s+)?)?/i,
      '',
    )
    .split(
      /[,;:]|\.\s+|\s+(?:comprising|including|which|that will|to provide)\b/i,
    )[0]!
    .trim()
    .replace(/[.]$/, '');
  return title
    ? title[0]!.toLocaleUpperCase('en-AU') + title.slice(1)
    : purpose;
}
