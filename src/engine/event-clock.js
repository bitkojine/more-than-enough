/* Integer game-time events. No wall clock, rendering, or loop over empty
 * ticks. Equal-time events run in stable priority/insertion order. */
export function createEventClock(epoch = 0) {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('event-clock-time');
  let now = epoch, sequence = 0;
  const heap = [];
  const before = (a, b) => a.at < b.at || (a.at === b.at && (a.priority < b.priority || (a.priority === b.priority && a.sequence < b.sequence)));
  function push(event) {
    let i = heap.length; heap.push(event);
    while (i) {
      const parent = (i - 1) >>> 1;
      if (!before(event, heap[parent])) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = event;
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
        if (!before(heap[child], last)) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  function schedule(at, run, priority = 0) {
    if (!Number.isSafeInteger(at) || at <= now || !Number.isFinite(priority) || typeof run !== 'function') throw new Error('event-clock-schedule');
    const event = { at, run, priority, sequence: sequence++, cancelled: false };
    push(event); return event;
  }
  function advanceTo(target) {
    if (!Number.isSafeInteger(target) || target < now) throw new Error('event-clock-time');
    let executed = 0;
    while (heap.length && heap[0].at <= target) {
      const event = pop();
      if (event.cancelled) continue;
      now = event.at; event.run(now); executed++;
    }
    now = target; return executed;
  }
  return { schedule, advanceTo,
    cancel(event) { event.cancelled = true; },
    get now() { return now; },
    get pending() { return heap.length; }
  };
}
