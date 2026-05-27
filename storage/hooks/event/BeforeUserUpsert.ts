import { Plugin } from '@nocobase/server';

// reject if there's a similar name (fuzzy match...)
export default class BeforeUserUpsert extends Plugin {
    async load() {
        this.db.on('users.beforeCreate', this.standardizePhone.bind(this));
        this.db.on('users.beforeUpdate', this.standardizePhone.bind(this));
    }
    async standardizePhone(model: any, options: any) {
        let phone = model.get('phone')?.replace(/\s/g, '');
        if (!phone) return;
        if (phone.startsWith('0'))
            phone = phone.substring(1);
        if (!phone.startsWith('855'))
            model.set('phone', '855' + phone);
    }
}