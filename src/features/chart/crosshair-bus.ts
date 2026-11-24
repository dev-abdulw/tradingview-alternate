/** Tiny pub/sub so charts in a multi-chart layout can mirror each other's crosshair. */
type Listener = (fromPane: number, time: number | null) => void;
const listeners = new Set<Listener>();

export const crosshairBus = {
  publish(fromPane: number, time: number | null) {
    for (const l of listeners) l(fromPane, time);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
