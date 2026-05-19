import { Plugin } from '@nocobase/server';

export default class OnStaffCreatePlugin extends Plugin {
  async load() {
    this.db.on('users.beforeCreate', this.beforeUpsert.bind(this));
    this.db.on('users.beforeUpdate', this.beforeUpsert.bind(this));
  }

  async beforeUpsert(model: any, options: any) {
    if (model.get('studentId')) return;
    const email = model.get('email');
    const username = model.get('username');
    const repo = this.db.getRepository('users');

    if (email) {
      const emailAsUsername = await repo.findOne({ filter: { username: email } });
      if (emailAsUsername)
        throw new Error(`user already exists as ${emailAsUsername.get('englishName')}`);
    }

    if (username) {
      const usernameAsEmail = await repo.findOne({ filter: { email: username } });
      if (usernameAsEmail)
        throw new Error(`user already exists as ${usernameAsEmail.get('englishName')}`);
    }
  }
}
