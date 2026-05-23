import { Plugin } from '@nocobase/server';
import { submitEvaluationHandler } from './SubmitEvaluation.ts';
import { SQLQueryHandler } from './SQLQuery.ts';
import { getRecentSemestersHandler } from './GetRecentSemesters.ts';

export default class CustomEndpoint extends Plugin {
    async load() {
        this.app.resourceManager.define({
            name: 'custom',
            actions: {
                'submit-evaluation': submitEvaluationHandler,
                'sql-query': SQLQueryHandler,
                'get-recent-semesters': getRecentSemestersHandler
            }
        });
        this.app.acl.allow('custom', '*', 'loggedIn');
    }
}
