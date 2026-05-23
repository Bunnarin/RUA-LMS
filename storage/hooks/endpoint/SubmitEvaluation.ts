export const submitEvaluationHandler = async (ctx: any, next: any) => {
    const { scheduleId, answers } = ctx.action?.params.values;
    const scheduleRepo = ctx.db.getRepository('schedule');
    const schedule = await scheduleRepo.findOne({ filter: { id: scheduleId }, appends: ['completedStudents'] });
    if (schedule.get('completedStudents').find((s: any) => s.id === ctx.auth.user.studentId)) {
      ctx.body = { success: false, message: 'You have already submitted this evaluation' };
      return;
    }

    const studentProfile = await ctx.db.getRepository('student').findOne({ filter: { id: ctx.auth.user.studentId } });
    if (!studentProfile) {
      ctx.body = { success: false, message: 'You are not authorized to submit this evaluation' };
      return;
    }

    const completedStudents = schedule.get('completedStudents') || [];
    const updates: Record<string, any> = {
      completedStudents: [...completedStudents, studentProfile]
    };

    // find out the max number of question columns (we do this because we don't want to hardcode the num of qs in the db schema)
    const maxQuestionIndex = Math.max(
      ...Object.keys(schedule.toJSON())
        .filter(key => key.startsWith('question'))
        .map(key => parseInt(key.replace('question', '')))
    );

    for (let i = 0; i < Math.min(answers.length, maxQuestionIndex + 1); i++) {
      let answer = answers[i];
      let existing: Record<string, number> = schedule.get(`question${i}`) || {};

      // this mean that this student is the first to submit, we clear out past result
      if (completedStudents.length === 0)
        existing = {};

      if (answer === null || answer === '') continue;

      if (!Array.isArray(answer)) answer = [answer];

      for (const ans of answer)
        existing[ans] = (existing[ans] ?? 0) + 1;

      updates[`question${i}`] = existing;
    }

    if (Object.keys(updates).length > 0)
      scheduleRepo.update({
        filter: { id: scheduleId },
        values: updates,
      });

    ctx.body = { success: true };
    await next();
};
