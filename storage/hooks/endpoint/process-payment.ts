import { Plugin } from '@nocobase/server';

export default class SubmitEvaluationPlugin extends Plugin {
    async load() {
        this.app.resourceManager.registerActionHandler('student:process-payment', async (ctx, next) => {
            // ensure that the user have finance role
            if (!ctx.auth.user.roles.find(r => r.get('name') === 'finance')) {
                ctx.body = { success: false, message: 'You are not authorized to process payment' };
                return;
            }
            // const { studentIds } = ctx.action?.params.values;
            ctx.body = { success: true };
        });
    }
}
