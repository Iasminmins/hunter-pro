import { handleApi } from '../src/server/api.mjs';

export const config = { maxDuration: 15 };

export default async function handler(request, response) {
  const handled = await handleApi(request, response);
  if (!handled && !response.writableEnded) {
    response.statusCode = 404;
    response.end('Not found');
  }
}
