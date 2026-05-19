import { Plugin } from '@nocobase/server';

export default class SubmitEvaluationPlugin extends Plugin {
    async load() {
        this.app.resourceManager.registerActionHandler('student:process-payment', async (ctx, next) => {
            // ensure that the user have finance role
            if (!ctx.auth.user.roles.find((r: any) => r.get('name') === 'finance')) {
                ctx.body = { success: false, message: 'You are not authorized to process payment' };
                return;
            }
            // const { studentIds } = ctx.action?.params.values;
            // by default, everyone is in debt? yeah that should be it?
            // so there's an endpoint to put everyone in debt, and another to lift them out of debt? aight
            // so there should be another psuedo audit log. yay. it should explain how we got to the student.balance
            // it should be called ledger   
            // so they should be able to lift out of debt either semester or annual, which determine the validTilSemester
            ctx.body = { success: true };
        });
    }
}
