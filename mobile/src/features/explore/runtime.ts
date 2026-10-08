import { apiClient } from '../../api/runtime';
import { ExploreRepository } from './repository';
export const explore = new ExploreRepository(apiClient);
