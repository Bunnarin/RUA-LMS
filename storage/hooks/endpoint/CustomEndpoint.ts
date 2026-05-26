import { Plugin } from '@nocobase/server';
import { submitEvaluationHandler } from './handler/SubmitEvaluation.ts';
import { SQLQueryHandler } from './handler/SQLQuery.ts';
import { getRecentSemestersHandler } from './handler/GetRecentSemesters.ts';
import { listSubstituteScheduleHandler } from './handler/ListSubstituteSchedule.ts';

export default class CustomEndpoint extends Plugin {
    async load() {
        this.app.resourceManager.define({
            name: 'custom',
            actions: {
                'submit-evaluation': submitEvaluationHandler,
                'sql-query': SQLQueryHandler,
                'get-recent-semesters': getRecentSemestersHandler,
                'list-substitute-schedules': listSubstituteScheduleHandler
            }
        });
        this.app.acl.allow('custom', '*', 'loggedIn');
    }
}
