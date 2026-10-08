import type { ApiClient } from '../../api/client';
import { decodeTide } from '../reports/model';
import { decodeYear, decodeBallot } from './model';
import { invalid } from '../../api/validation';
export class ExploreRepository {
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  year = (year: number) =>
    this.client.get(`/years/${year}.json`, (raw) => decodeYear(raw, year));
  ballot = (path: string) =>
    this.client.get(path, (raw) =>
      decodeBallot(
        raw,
        path
          .split('/')
          .at(-1)
          ?.replace(/\.json$/, ''),
      ),
    );
  tide = (scope: 'federal' | 'all') =>
    this.client.getForAction(`/api/tide?scope=${scope}`, (raw) => {
      const data = decodeTide(raw);
      if (data.scope !== scope)
        invalid('The returned tide does not match these parliaments.');
      return data;
    });
}
