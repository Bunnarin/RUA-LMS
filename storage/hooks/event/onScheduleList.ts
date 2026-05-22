import { Plugin } from '@nocobase/server';

export default class OnScheduleListPlugin extends Plugin {
  async load() {
    this.app.resourceManager.use(async (ctx: any, next: any) => {
      await next();

      if (ctx.action.resourceName !== 'schedule' || ctx.action.actionName !== 'list') return;

      const userId = ctx.auth?.user?.id;
      if (!userId) return;

      // primary filter: semester
      const semesters = await this.db.getRepository('semester').find({
        filter: {
            $or: [
                { startDate: { $dateOn: { type: "lastYear" } } },
                { startDate: { $dateOn: { type: "thisYear" } } },
                { startDate: { $dateOn: { type: "nextYear" } } }
              ]
          }
      });

      // find the semester whose end is closest to now
      const semester = semesters.reduce((prev: any, curr: any) => {
          const time = (dateStr: string) => new Date(dateStr).getTime();
          return time(curr.get('endDate')) < time(prev.get('endDate')) ? curr : prev;
      });

      const currentSchedules: any[] = [];
      const nonCurrentSchedules: any[] = [];

      const isCurrent = (s: any) =>
        s.get('course')?.get('semesterNumber') === semester.get('number');
      
      for (const schedule of ctx.body.rows) {
        if (isCurrent(schedule))
          currentSchedules.push(schedule);
        else
          nonCurrentSchedules.push(schedule);
      }

      const isLecturer = (s: any) =>
        (s.get('lecturers') ?? []).some((l: any) => l.id === userId);
      const isCoLecturer = (s: any) =>
        (s.get('co-lecturers') ?? []).some((l: any) => l.id === userId);

      const lecturerSchedules: any[] = [];
      const coLecturerSchedules: any[] = [];
      const rest: any[] = [];
      for (const schedule of currentSchedules) {
        if (isLecturer(schedule))
          lecturerSchedules.push(schedule);
        else if (isCoLecturer(schedule))
          coLecturerSchedules.push(schedule);
        else
          rest.push(schedule);
      }

      ctx.body.rows = [...lecturerSchedules, ...coLecturerSchedules, ...rest, ...nonCurrentSchedules];
    });
  }
}
