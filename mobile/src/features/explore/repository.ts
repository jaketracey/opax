import type { ApiClient } from '../../api/client';
import { decodeTide } from '../reports/model';
import { decodeYear } from './model';
import { invalid } from '../../api/validation';
import { decodePictures } from './pictures';
export class ExploreRepository {
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  year = (year: number) =>
    this.client.get(`/years/${year}.json`, (raw) => decodeYear(raw, year));
  pictures = () => this.client.get('/years/pictures.json', decodePictures);
  tide = (scope: 'federal' | 'all') =>
    this.client.getForAction(`/api/tide?scope=${scope}`, (raw) => {
      const data = decodeTide(raw);
      if (data.scope !== scope)
        invalid('The returned tide does not match these parliaments.');
      return data;
    });
}
