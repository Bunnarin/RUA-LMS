import { Plugin } from '@nocobase/server';

export default class UserAuditPlugin extends Plugin {
  async load() {
    // Add custom API endpoints
    this.app.resourceManager.define({
      name: 'submit-evaluation',
      actions: {
        execute: async (ctx, next) => {
          const { scheduleId, answers } = ctx.action.params.values;
          const repo = this.db.getRepository('schedule');
          const schedule = await repo.findOne({ filter: { id: scheduleId }, appends: ['completedStudents'] });
          // if reject if completedStudents already include the current user
          if (schedule.get('completedStudents').find((s: any) => s.id === ctx.auth.user.studentId)) {
            ctx.body = { success: false, message: 'You have already submitted this evaluation' };
            return;
          }
          //   add the current user's student profile to completedStudents
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

            // 1. If no completed students, reset answer
            if (completedStudents.length === 0)
              existing = {};

            // 2. Skip if no answer to process
            if (answer === null || answer === '') continue;

            // 3. Process the answer (string or array)
            if (!Array.isArray(answer)) answer = [answer];

            for (const ans of answer)
              existing[ans] = (existing[ans] ?? 0) + 1;

            // 4. Store the updated question tally
            updates[`question${i}`] = existing;
          }

          // 5. Update the schedule if there are changes
          if (Object.keys(updates).length > 0)
            await repo.update({
              filter: { id: scheduleId },
              values: updates,
            });

          ctx.body = { success: true };
          await next();
        }
      }
    });
  }
}