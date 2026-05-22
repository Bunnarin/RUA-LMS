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
      const prevSemester = semesters.reduce((prev: any, curr: any) => {
          const time = (dateStr: string) => new Date(dateStr).getTime();
          return time(curr.get('endDate')) < time(prev.get('endDate')) ? curr : prev;
      });

      // the current sem will be the next one
      const currentSemester = semesters.find((s: any) => s.get('id') > prevSemester.get('id'));

      let schedules = ctx.body.rows;

      // we filter by sem based on tab cuz we can't do inherited block template on the UI
      if (ctx.get('referer')?.endsWith('/tab/72u1j3zz86f'))
        schedules = schedules.filter((s: any) => s.get('course')?.get('semesterNum') === currentSemester.get('number'));
      else if (ctx.get('referer')?.endsWith('/tab/f7cgx8q2xbf'))
        schedules = schedules.filter((s: any) => s.get('course')?.get('semesterNum') !== currentSemester.get('number'));

      const isLecturer = (s: any) =>
        (s.get('lecturers') ?? []).some((l: any) => l.id === userId);
      const isCoLecturer = (s: any) =>
        (s.get('co-lecturers') ?? []).some((l: any) => l.id === userId);

      const lecturerSchedules: any[] = [];
      const coLecturerSchedules: any[] = [];
      const rest: any[] = [];
      for (const schedule of schedules) {
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
