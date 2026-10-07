import { client } from '../../api/runtime';
import { MoneyCatalogs } from './catalog';
export const money = new MoneyCatalogs(client);
