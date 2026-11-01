export class SunoClient {
  constructor({ fetchImpl = fetch, timeout = 120000 } = {}) {
    this.fetch = fetchImpl;
    this.timeout = timeout;
  }

  async request(url, { method = 'GET', body } = {}) {
    const response = await this.fetch(url, {
      method,
      headers: {
        // Do not leave redirect connections keeping consumer processes alive.
        Connection: 'close',
        ...(body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : {}),
        Origin: 'https://suno.com', Referer: 'https://suno.com/',
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit', signal: AbortSignal.timeout(this.timeout), redirect: 'follow',
    });
    if (!response.ok) {
      await response.body?.cancel();
      const retry = response.status === 429 ? ` Retry after ${response.headers.get('Retry-After') || 60} seconds.` : '';
      throw new Error(`Suno ${new URL(url).pathname} returned HTTP ${response.status}.${retry}`);
    }
    return response;
  }

  async songPage(input) {
    return (await this.request(input.url)).text();
  }

  async rights(id) {
    return (await this.request('https://suno.com/a/api/mango/rights', {
      method: 'POST', body: { content_params: { content_id: id, content_type: 'clip' } },
    })).json();
  }
}
