// Static (GitHub Pages) build: there is no request, so no cookies or headers.
const empty = { get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} };
export async function cookies() {
  return empty;
}
export async function headers() {
  return new Headers();
}
