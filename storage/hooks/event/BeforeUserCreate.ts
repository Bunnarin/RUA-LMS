import { Plugin } from '@nocobase/server';

// reject if there's a similar name (fuzzy match...)
export default class BeforeUserCreate extends Plugin {
  async load() {
    this.db.on('users.beforeCreate', async (model: any, options: any) => {
      if (model.get('studentId')) return;

      // fuzzy match is expensive? first try to find if the same thing exists
      const enName = model.get('englishName').split(' ');
      const firstEnName = enName[0];
      const lastEnName = enName[enName.length - 1];
      const khName = model.get('khmerName').split(' ');
      const firstKhName = khName[0];
      const lastKhName = khName[khName.length - 1];
      const userRepo = this.db.getRepository('users');
      const existingUser = await userRepo.findOne({
        filter: {
          $or: [
            { englishName: `${lastEnName} ${firstEnName}` },
            { khmerName: `${lastKhName} ${firstKhName}` },
          ],
        },
      });
      if (existingUser) {
        // if the exisiting email is empty, we just replace it and cancel the creation​ quietly
        if (!existingUser.get('email') && model.get('email'))
          // just replace it and cancel the creation​ quietly
          await userRepo.update({
            filterByTk: existingUser.get('id'),
            values: {
              email: model.get('email'),
            },
          });

        throw new Error(`please select ${existingUser.get('englishName')} instead`);
      }

      // I should find inclusion of part of name and then do fuzzy match
      const potentialMatches = await userRepo.find({
        filter: {
          $or: [
            { englishName: { $includes: firstEnName } },
            { englishName: { $includes: lastEnName } },
            { khmerName: { $includes: firstKhName } },
            { khmerName: { $includes: lastKhName } },
          ],
        },
      });

      for (const match of potentialMatches) {
        const similarity = Math.max(
          getSimilarity(match.get('englishName'), `${lastEnName} ${firstEnName}`),
          getSimilarity(match.get('khmerName'), `${lastKhName} ${firstKhName}`),
          getSimilarity(match.get('englishName'), `${firstEnName} ${lastEnName}`),
          getSimilarity(match.get('khmerName'), `${firstKhName} ${lastKhName}`),
        );
        if (similarity > 0.8) {
          // if the exisiting email is empty, we just replace it and cancel the creation​ quietly
          if (!match.get('email') && model.get('email'))
            // just replace it and cancel the creation​ quietly
            await userRepo.update({
              filterByTk: match.get('id'),
              values: {
                email: model.get('email'),
              },
            });
          throw new Error(`please select ${match.get('englishName')} instead`);
        }
      }
    });
  }
}

function getSimilarity(s1: string, s2: string) {
    if (!s1 || !s2) return 0; // Don't match empty names
    let longer = s1.length > s2.length ? s1 : s2;
    let shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1: string, s2: string) {
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) != s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}
