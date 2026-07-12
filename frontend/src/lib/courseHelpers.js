// NOUN course codes conventionally encode the level in the numeric part
// (e.g. CIT 403 -> 400 level). Used to auto-fill the level field so admins
// don't have to enter it separately -- still overridable when it's wrong.
export function deriveLevelFromCode(courseCode) {
  const match = courseCode?.match(/(\d)\d{2}\s*$/);
  return match ? Number(match[1]) * 100 : null;
}
