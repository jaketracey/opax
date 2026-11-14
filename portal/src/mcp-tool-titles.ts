/**
 * Human-readable titles for MCP tools. Connector directories require a title
 * on every tool beside the read-only and destructive hints. A tool without an
 * entry here takes a title made from its name, so no tool is listed untitled.
 */
export const MCP_TOOL_TITLES: Readonly<Record<string, string>> = Object.freeze({
  search_records: 'Search the public record',
  read_record: 'Read a public record',
  find_connections: 'Find recorded connections',
  corpus_coverage: 'Check record coverage',
  read_grant_recipient: 'Read a grant recipient',
  read_grant_program: 'Read a grant program',
})

export function mcpToolTitle(name: string): string {
  const title = MCP_TOOL_TITLES[name]
  if (title) return title
  const words = name.replace(/_+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : name
}
