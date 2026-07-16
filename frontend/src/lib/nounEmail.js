// Students sign in with their NOUN institutional email, which is always
// their matric number @noun.edu.ng -- this is the single source of truth for
// that derivation on the client (mirrored server-side by the handle_new_user
// DB trigger and the admin-invite-user edge function, which are the actual
// enforcement points).
export function deriveNounEmail(matricNumber) {
  return matricNumber.trim().toLowerCase().replace(/\s+/g, "") + "@noun.edu.ng";
}
