// Release builds never read launch arguments: the welcome tour follows the
// device's seen flag only.
export function e2eTourRequested(): boolean {
  return false;
}
