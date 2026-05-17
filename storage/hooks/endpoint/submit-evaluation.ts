import { Plugin } from '@nocobase/server';

export default class SubmitEvaluationPlugin extends Plugin {
  async load() {
    this.app.resourceManager.registerActionHandler('schedule:submit-evaluation', async (ctx, next) => {
      const { scheduleId, answers } = ctx.action?.params.values;
        const repo = this.db.getRepository('schedule');
        const schedule = await repo.findOne({ filter: { id: scheduleId }, appends: ['completedStudents'] });
        if (schedule.get('completedStudents').find((s: any) => s.id === ctx.auth.user.studentId)) {
          ctx.body = { success: false, message: 'You have already submitted this evaluation' };
          return;
        }

        const studentProfile = await this.db.getRepository('student').findOne({ filter: { id: ctx.auth.user.studentId } });
        if (!studentProfile) {
          ctx.body = { success: false, message: 'You are not authorized to submit this evaluation' };
          return;
        }

        const completedStudents = schedule.get('completedStudents') || [];
        const updates: Record<string, any> = {
          completedStudents: [...completedStudents, studentProfile]
        };

        for (let i = 0; i < answers.length; i++) {
          let answer = answers[i];
          let existing: Record<string, number> = schedule.get(`question${i}`) || {};

          if (completedStudents.length === 0)
            existing = {};

          if (answer === null || answer === '') continue;

          if (!Array.isArray(answer)) answer = [answer];

          for (const ans of answer)
            existing[ans] = (existing[ans] ?? 0) + 1;

          updates[`question${i}`] = existing;
        }

        if (Object.keys(updates).length > 0)
          await repo.update({
            filter: { id: scheduleId },
            values: updates,
          });

        ctx.body = { success: true };
        await next();
    });

    this.app.acl.allow('schedule', 'submitEvaluation', 'loggedIn');
  }
}
