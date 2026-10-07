import { recordClient } from '../../api/runtime';
import { Records } from './data';
export const records = new Records(recordClient);
