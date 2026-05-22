import { Plugin } from '@nocobase/server';

// this is only for full paying, not debt
// god I so need to test this thing
export default class ProcessPaymentPlugin extends Plugin {
    async load() {
        this.app.resourceManager.registerActionHandler('student:process-payment', async (ctx, next) => {
            // ensure that the user have finance role
            if (!ctx.auth.user.roles.find((r: any) => r.get('name') === 'finance')) {
                ctx.body = { success: false, message: 'You are not authorized to process payment' };
                return;
            }
            // assumption: it's one of the student that's not full scholarship (cuz we already paid for them in notify-payment.ts)
            const { enrollmentId, payAnnual } = ctx.action?.params.values;
            // so we just append only one sem at a time yay
            const enrollment = await this.db.getRepository('enrollment').findOne({
                filter: {
                    id: enrollmentId,
                },
                appends: ['student'],
            });

            // check if the validTilSemester is the first semester of the year
            // get last and next 2 sem
            let semesters = await this.db.getRepository('semester').find({
                filter: {
                    id: { $gte: enrollment.get('validTilSemesterId') },
                },
                sort: 'id', // hopefully ascending
                limit: 3,
            });
            const canPayAnnual = semesters[0].get('number') === 1;
            // now we design the semesters to be put on the ledger
            if (canPayAnnual && payAnnual)
                semesters = semesters.slice(1);
            else
                semesters = semesters.slice(1, 2);

            const ledgerRepo = this.db.getRepository('ledger');
            const ledgersToCreate = [];
            // first repay debt
            // aight so the server logic is whoever has the debt, have to repay the debt, no crossing
            const debtRelatedLedgers = ledgerRepo.find({
                filter: {
                    $and: [
                        {
                            enrollmentId,
                        },
                        {
                            $or: [
                                {
                                    type: 'debt',
                                },
                                {
                                    type: 'debt repayment',
                                },
                            ],
                        },
                    ],
                },
            });
            // count diff from debt and repayment
            const debt = debtRelatedLedgers.filter((l: any) => l.get('type') === 'debt').reduce((a: number, b: any) => a + b.get('amount'), 0);
            const repayment = debtRelatedLedgers.filter((l: any) => l.get('type') === 'debt repayment').reduce((a: number, b: any) => a + b.get('amount'), 0);
            const unpaidDebt = debt - repayment;
            if (unpaidDebt > 0)
                ledgersToCreate.push({
                    enrollmentId,
                    type: 'debt repayment',
                    amount: unpaidDebt,
                    semesters
                });

            // now create fee
            const program = enrollment.get('program');
            const fee = payAnnual && canPayAnnual ? program.get('annualFee') : program.get('semesterFee');
            ledgersToCreate.push({
                enrollmentId,
                type: 'fee',
                amount: -fee,
                semesters
            });

            // now scholarship
            const student = enrollment.get('student');
            const scholarshipSourceId = student.get('scholarshipSourceId');
            const scholarshipCoverage = student.get('scholarshipCoverage');
            if (scholarshipSourceId && scholarshipCoverage > 0)
                ledgersToCreate.push({
                    enrollmentId,
                    type: 'scholarship discount',
                    amount: fee * scholarshipCoverage / 100,
                    semesters
                });

            // now the payment
            ledgersToCreate.push({
                enrollmentId,
                type: 'payment',
                amount: fee * (1 - scholarshipCoverage / 100),
                semesters
            });

            await ledgerRepo.createMany({ records: ledgersToCreate });
            ctx.body = { success: true };
        });
    }
}
