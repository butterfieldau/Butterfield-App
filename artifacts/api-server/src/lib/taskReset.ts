type TaskLike = {
  cadence?: string | null;
  isCompleted: boolean;
  completedAt?: Date | string | null;
  completedBy?: string | null;
};

function toSydneyLocalDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(parsed);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const hour = get('hour');
  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    hour === 24 ? 0 : hour,
    get('minute'),
    get('second'),
    0,
  );
}

function currentCadenceBoundary(cadence: string | null | undefined, reference: Date): Date | null {
  if (cadence === 'one_off') return null;

  const boundary = new Date(reference);
  boundary.setHours(4, 0, 0, 0);

  if (cadence === 'weekly') {
    const dow = boundary.getDay();
    boundary.setDate(boundary.getDate() + (dow === 0 ? -6 : 1 - dow));
    if (reference < boundary) boundary.setDate(boundary.getDate() - 7);
    return boundary;
  }

  if (reference < boundary) boundary.setDate(boundary.getDate() - 1);
  return boundary;
}

export function isTaskCompletionCurrent(task: TaskLike, now = new Date()): boolean {
  if (!task.isCompleted || !task.completedAt) return false;
  if (task.cadence === 'one_off') return true;

  const completedAt = toSydneyLocalDate(task.completedAt);
  const sydneyNow = toSydneyLocalDate(now);
  if (!completedAt || !sydneyNow) return false;

  const boundary = currentCadenceBoundary(task.cadence, sydneyNow);
  if (!boundary) return true;
  return completedAt >= boundary;
}

export function normalizeTaskCompletion<T extends TaskLike>(task: T, now = new Date()): T {
  if (!task.isCompleted) return task;
  if (isTaskCompletionCurrent(task, now)) return task;
  return {
    ...task,
    isCompleted: false,
    completedAt: null,
    completedBy: null,
  };
}

export function normalizeTaskListCompletion<T extends TaskLike>(tasks: T[], now = new Date()): T[] {
  return tasks.map((task) => normalizeTaskCompletion(task, now));
}
