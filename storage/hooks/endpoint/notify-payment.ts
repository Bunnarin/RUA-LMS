import { Plugin } from '@nocobase/server';

export default class SubmitEvaluationPlugin extends Plugin {
    async load() {
        this.app.resourceManager.registerActionHandler('student:notify-payment', async (ctx, next) => {
            // ensure that the user have finance role
            if (!ctx.auth.user.roles.find((r: any) => r.get('name') === 'finance')) {
                ctx.body = { success: false, message: 'You are not authorized to process payment' };
                return;
            }
            const { targetSemesterId } = ctx.action?.params.values;
            // shouldn't this pick up from the last one? it should not have any in-between
            // what abt the ppl with in-between? just go up one at a time.
            // whay abt ppl with debt from last sem? umm we'll also notify on the frontend, that they should clear debt from 
            const [lastSemester, currentSemester] = await this.db.getRepository('semester').find({
                filter: {
                    $or: [
                        { id: { $lte: targetSemesterId } },
                    ]
                },
                limit: 2,
            });

            const enrollmentRepo = this.db.getRepository('enrollment');

            const fullScholarshipEnrollments = await enrollmentRepo.find({
                filter: {
                    student: {
                        scholarshipCoverage: 100,
                        scholarshipSourceId: { $ne: null },
                    },
                    validTilSemesterId: lastSemester.get('id'),
                    graduationDate: null,
                    dropoutDate: null,
                },
                appends: ['program', 'student'],
            });

            fullScholarshipEnrollments.forEach(async (e: any) => {
                // create fee and scholarship discount
                // shouldn't I push for robustness and edit the enrollment field with onrecord create? man fk u
                // but still we need to make sure the student have no debt, right? meh, it can't be that bad? cuz we can just create in the db level and the app wouldn't know
                // but I don't want future maintainer to mess this up. alright so whenever create, we check if they have debt and update. aish, but we can still update student.enrollemtns anw. ugh f u
                this.db.getRepository('ledger').createMany({
                    records: [
                        {
                            enrollmentId: e.get('id'),
                            semesters: [currentSemester],
                            type: 'fee',
                            amount: -e.get('program').get('semesterFee'),
                        },
                        {
                            enrollmentId: e.get('id'),
                            semesters: [currentSemester],
                            type: 'scholarship discount',
                            amount: e.get('program').get('semesterFee'),
                        }
                    ]
                });
                enrollmentRepo.update({
                    filterByTk: e.get('id'),
                    values: {
                        validTilSemesterId: currentSemester.get('id'),
                    },
                });
            });

            ctx.body = { success: true };
        });
    }
}
