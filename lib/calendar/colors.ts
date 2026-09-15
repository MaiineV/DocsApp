// Team colours. A team without an explicit colour gets a stable one from the
// palette, keyed by its id, so the profile calendar can tell teams apart.

export const TEAM_PALETTE: readonly string[] = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#ea580c', // orange
  '#0d9488', // teal
]

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function defaultTeamColor(teamId: string): string {
  return TEAM_PALETTE[hashString(teamId) % TEAM_PALETTE.length]
}

export function teamColor(team: { id: string; color: string | null }): string {
  return team.color && HEX_COLOR_RE.test(team.color) ? team.color : defaultTeamColor(team.id)
}
