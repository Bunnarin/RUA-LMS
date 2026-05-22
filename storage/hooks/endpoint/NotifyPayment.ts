import { Plugin } from '@nocobase/server';

export default class NotifyPaymentPlugin extends Plugin {
    async load() {
        // TODO: notify non-full student (jam telegram)
        this.app.resourceManager.registerActionHandler('student:notify-payment', async (ctx, next) => {
            // ensure that the user have finance role
            if (!ctx.auth.user.roles.find((r: any) => r.get('name') === 'finance')) {
                ctx.body = { success: false, message: 'You are not authorized to process payment' };
                return;
            }
            const { srcSemesterId } = ctx.action?.params.values;
            // shouldn't this pick up from the last one? it should not have any in-between
            // what abt the ppl with in-between? just go up one at a time.
            // whay abt ppl with debt from last sem? umm we'll also notify on the frontend, that they should clear debt from 
            const semesterRepo = this.db.getRepository('semester');
            const semesters = await semesterRepo.find({
                filter: {
                    id: { $gte: srcSemesterId },
                },
                limit: 2,
            });
            const srcSemester = semesters[0];

            // create if no semester
            let targetSemester: any;
            if (semesters.length == 1) {
                const sixMonthFromNow = new Date();
                sixMonthFromNow.setMonth(sixMonthFromNow.getMonth() + 6)
                targetSemester = await semesterRepo.create({
                    values: {
                        academicYear: srcSemester.get('number') === 2 ? srcSemester.get('academicYear') + 1 : srcSemester.get('academicYear'),
                        number: srcSemester.get('number') === 2 ? 1 : 2,
                        startDate: new Date().toDateString(),
                        endDate: sixMonthFromNow.toDateString()
                    }
                });
            } else if (semesters.length > 1)
                targetSemester = semesters[1];

            const enrollmentRepo = this.db.getRepository('enrollment');

            const fullScholarshipEnrollments = await enrollmentRepo.find({
                filter: {
                    $and: [
                        {
                            student: {
                                scholarshipCoverage: 100,
                                scholarshipSourceId: { $notEmpty: true },
                            },
                            graduationDate: null,
                            dropoutDate: null,
                        },
                        {
                            $or: [
                                { validTilSemesterId: srcSemester.get('id') },
                                {
                                    $and: [
                                        { validTilSemesterId: null },
                                        {
                                            enrollmentDate: {
                                                $dateBetween: [srcSemester.get('startDate'), semesters[0].get('endDate')]
                                            }
                                        },
                                    ]
                                },
                            ]
                        }
                    ]
                },
                appends: ['program'],
            });

            fullScholarshipEnrollments.forEach(async (e: any) => {
                // create fee and scholarship discount
                this.db.getRepository('ledger').createMany({
                    records: [
                        {
                            enrollment: e,
                            semesters,
                            type: 'fee',
                            amount: -e.get('program').get('semesterFee'),
                        },
                        {
                            enrollment: e,
                            semesters,
                            type: 'scholarship discount',
                            amount: e.get('program').get('semesterFee'),
                        }
                    ]
                });
                enrollmentRepo.update({
                    filterByTk: e.get('id'),
                    values: {
                        validTilSemesterId: semesters.at(-1).get('id'),
                    },
                });
            });

            this.db.getRepository('KV').updateOrCreate({
                filterKeys: ['id'],
                values: {
                    id: 'lastNotifiedSemesterId',
                    value: targetSemester.get('id'),
                }
            });

            ctx.body = { success: true };
        });
    }
}
