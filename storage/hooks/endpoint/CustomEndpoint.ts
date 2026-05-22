import { Plugin } from '@nocobase/server';
import { submitEvaluationHandler } from './SubmitEvaluation.ts';
import { SQLQueryHandler } from './SQLQuery.ts';

export default class CustomEndpoint extends Plugin {
    async load() {
        this.app.resourceManager.define({
            name: 'custom',
            actions: {
                'submit-evaluation': submitEvaluationHandler.bind(this),
                'sql-query': SQLQueryHandler.bind(this)
            }
        });
        this.app.acl.allow('custom', '*', 'loggedIn');
    }
}
