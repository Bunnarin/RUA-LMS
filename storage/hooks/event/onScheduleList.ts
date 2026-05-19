import { Plugin } from '@nocobase/server';

export default class OnScheduleListPlugin extends Plugin {
  async load() {
    this.app.resourceManager.use(async (ctx: any, next: any) => {
      await next();

      if (ctx.action.resourceName !== 'schedule' || ctx.action.actionName !== 'list') return;

      const userId = ctx.auth?.user?.id;
      if (!userId) return;

      const isLecturer = (s: any) =>
        (s.get('lecturers') ?? []).some((l: any) => l.id === userId);
      const isCoLecturer = (s: any) =>
        (s.get('co-lecturers') ?? []).some((l: any) => l.id === userId);

      const lecturerSchedules: any[] = [];
      const coLecturerSchedules: any[] = [];
      const rest: any[] = [];
      for (const schedule of ctx.body.rows) {
        if (isLecturer(schedule))
          lecturerSchedules.push(schedule);
        else if (isCoLecturer(schedule))
          coLecturerSchedules.push(schedule);
        else
          rest.push(schedule);
      }

      ctx.body.rows = [...lecturerSchedules, ...coLecturerSchedules, ...rest];
    });
  }
}
