import { Plugin } from '@nocobase/server';

export default class SubmitEvaluationPlugin extends Plugin {
    async load() {
        this.app.resourceManager.registerActionHandler('student:notify-payment', async (ctx, next) => {
            // ensure that the user have finance role
            if (!ctx.auth.user.roles.find((r: any) => r.get('name') === 'finance')) {
                ctx.body = { success: false, message: 'You are not authorized to process payment' };
                return;
            }
            const { semesterId } = ctx.action?.params.values;
            // shouldn't this pick up from the last one?
            const semesters = await ctx.db.getRepository('semester').find({
                filter: {
                    id: { $lte: semesterId },
                },
            });
            const semester = semesters.find((s: any) => s.get('id') === semesterId);
            if (!semester) {
                ctx.body = { success: false, message: 'Semester not found' };
                return;
            }
            const fullScholarshipStudents = await ctx.db.getRepository('student').find({
                filter: {
                    scholarshipCoverage: 100,
                    scholarshipSourceId: { $ne: null },
                    enrollments: {
                        validTilSemesterId: { $lt: semesterId },
                        graduationDate: null,
                        dropoutDate: null,
                    },
                },
                appends: ['enrollments', 'enrollments.program'],
                fields: ['id', 'scholarshipSourceId', 'scholarshipCoverage']
            });

            // for scholarship student, create both the fee and the ledger entry for only one sem
            fullScholarshipStudents.forEach((s: any) => {
                // create fee
                s.get('enrollments').forEach((e: any) => {
                    const programFee = e.get('program').get('semesterFee');
                    // TODO: create fee for this program
                    // create a ledger entry for this fee
                    this.db.getRepository('ledger').create({
                        values: {
                            enrollmentId: e.get('id'),
                            semesterId: semesterId,
                            amount: programFee.get('amount'),
                            currency: programFee.get('currency'),
                            type: 'fee',
                            description: 'Scholarship payment',
                        },
                    });
                });
                // create ledger entry
            });

            ctx.body = { success: true };
        });
    }
}
