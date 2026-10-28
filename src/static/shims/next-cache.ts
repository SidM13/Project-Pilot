// Static (GitHub Pages) build: the demo store notifies subscribers on every write
// (lib/demo/store.ts → commitDemo), so pages re-read data without a server refresh.
export function refresh() {}
export function revalidatePath() {}
export function revalidateTag() {}
