import { handleApi } from '../../src/server/api.mjs';

export const config = { maxDuration: 15 };

export default async function handler(request, response) {
  await handleApi(request, response);
}
