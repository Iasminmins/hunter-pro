import { handleApi } from '../../src/server/api.mjs';

export const config = { runtime: 'nodejs' };

export default async function handler(request, response) {
  await handleApi(request, response);
}
