import type {} from './env';

declare const worker: {
  fetch(request: Request, env: { ASSETS: Pick<Env['ASSETS'], 'fetch'> }): Promise<Response>;
};
export default worker;
