import { Plugin } from '@nocobase/server';

export default class RunSQLPlugin extends Plugin {
  async load() {
    this.app.resourceManager.registerActionHandler('users:run-sql', async (ctx, next) => {
        const { sql } = ctx.action?.params.values;

        const allowedRoles = ['finance', 'academic', 'admin', 'lecturer'];

        if (!ctx.auth.user.roles.find((r: any) => allowedRoles.includes(r.get('name')))) {
            ctx.body = { success: false, message: 'You are not authorized to run SQL' };
            return;
        }
        
        if (/update |delete |drop |alter |create |insert |truncate /gi.test(sql)) {
            ctx.body = { success: false, message: 'You are not authorized to run this SQL' };
            return;
        }
        // execute
        const result = await this.app.db.sequelize.query(sql);

        ctx.body = result[0];
        await next();
    });
    }
}
