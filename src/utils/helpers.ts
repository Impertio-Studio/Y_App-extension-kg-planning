/** Small stateless helpers shared across views. */

/** First token of a full name — the team view and grid use it to keep
 *  the row label compact ("Jan", not "Jan de Vries"). */
export function getFirstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}
