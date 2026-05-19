import { Plugin } from '@nocobase/server';

export default class OnStaffListPlugin extends Plugin {
  async load() {
    this.app.resourceManager.use(async (ctx: any, next: any) => {
      await next();

      if (ctx.action.resourceName !== 'users' || ctx.action.actionName !== 'list') return;

      const user = await this.db.getRepository('users').findOne({
        filterByTk: ctx.auth?.user?.id,
        appends: ['faculties', 'programs']
      });
      if (!user) return;

      // prioritse non lecturers
      const isPriority = (u: any) => {
        if (user.get('faculties').length > 0) {
          const hasFaculties = (u.get('faculties') || []).some((f: any) => user.get('faculties').some((uf: any) => uf.id === f.id));
          const hasPrograms = (u.get('programs') || []).some((p: any) => user.get('faculties').some((uf: any) => uf.id === p.facultyId));
          return hasFaculties || hasPrograms;
        }
        if (user.get('programs').length > 0) {
          const hasPrograms = (u.get('programs') || []).some((p: any) => user.get('programs').some((up: any) => up.id === p.id));
          return hasPrograms;
        }
        return !u.get('roles').every((role: any) => role.get('name') === 'lecturer');
      };

      const priority: any[] = [];
      const rest: any[] = [];
      for (const u of ctx.body.rows) {
        if (isPriority(u))
          priority.push(u);
        else
          rest.push(u);
      }
      ctx.body.rows = [...priority, ...rest];
    });
  }
}
