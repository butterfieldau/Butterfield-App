import { db, staffTasksTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

export async function autoResetTasks(): Promise<void> {
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const sydHour = sydneyNow.getHours();

  // Daily boundary: today 4am Sydney; if before 4am, use yesterday 4am
  const dailyBoundary = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), sydneyNow.getDate(), 4, 0, 0, 0);
  if (sydHour < 4) dailyBoundary.setDate(dailyBoundary.getDate() - 1);

  // Weekly boundary: this Monday 4am Sydney
  const weeklyBoundary = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), sydneyNow.getDate(), 4, 0, 0, 0);
  const dow = weeklyBoundary.getDay();
  weeklyBoundary.setDate(weeklyBoundary.getDate() + (dow === 0 ? -6 : 1 - dow));
  if (sydneyNow < weeklyBoundary) weeklyBoundary.setDate(weeklyBoundary.getDate() - 7);

  const completed = await db
    .select({ id: staffTasksTable.id, cadence: staffTasksTable.cadence, completedAt: staffTasksTable.completedAt })
    .from(staffTasksTable)
    .where(eq(staffTasksTable.isCompleted, true));

  const toReset = completed.filter((t) => {
    if (!t.completedAt) return false;
    const cat = new Date(t.completedAt);
    if (t.cadence === 'daily')  return cat < dailyBoundary;
    if (t.cadence === 'weekly') return cat < weeklyBoundary;
    return false;
  });

  if (toReset.length > 0) {
    await Promise.all(
      toReset.map((t) =>
        db.update(staffTasksTable)
          .set({ isCompleted: false, completedBy: null, completedAt: null })
          .where(eq(staffTasksTable.id, t.id)),
      ),
    );
  }
}
