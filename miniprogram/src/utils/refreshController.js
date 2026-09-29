// One request at a time; stopped/superseded responses cannot repaint the page.
export function createRefreshController({ request, onData, onError, interval = 2000, timers = { setTimeout, clearTimeout } }) {
  let active = false, pending = false, running = false, generation = 0, timer;
  const clear = () => { timers.clearTimeout(timer); timer = undefined; };
  async function run() {
    if (!active || running) return;
    clear();
    running = true;
    pending = false;
    const current = generation;
    try {
      const data = await request();
      if (active && current === generation) onData(data);
    } catch (error) {
      if (active && current === generation) onError(error);
    } finally {
      running = false;
      if (active) timer = timers.setTimeout(run, pending ? 0 : interval);
    }
  }
  return {
    start() { if (active) return; active = true; pending = true; run(); },
    stop() { active = false; generation += 1; pending = false; clear(); },
    refresh() {
      if (!active) return;
      generation += 1;
      pending = true;
      return run();
    },
    // Call before appending a sent message so an earlier GET cannot remove it.
    invalidate() { generation += 1; pending = true; },
  };
}
