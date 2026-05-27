import { Plugin } from '@nocobase/server';

// reject if there's a similar name (fuzzy match...)
export default class BeforeUserCreate extends Plugin {
  async load() {
    this.db.on('student.beforeCreate', async (model: any, options: any) => {
      // uppercase englishname
      model.set('englishName', model.get('englishName')?.toUpperCase());
    });
  }
}
