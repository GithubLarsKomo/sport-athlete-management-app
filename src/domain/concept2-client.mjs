const ACCEPT = 'application/vnd.c2logbook.v1+json';

function apiError(message, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode });
}

export async function fetchConcept2Results({ baseUrl = 'https://log.concept2.com', accessToken, updatedAfter = null, timeoutMs = 10000 }) {
  if (!accessToken) throw apiError('concept2_not_configured', 503);
  const root = String(baseUrl || 'https://log.concept2.com').replace(/\/$/, '');
  const first = new URL(`${root}/api/users/me/results`);
  first.searchParams.set('number', '250');
  if (updatedAfter) first.searchParams.set('updated_after', updatedAfter);
  let next = first.toString();
  const results = [];
  let pages = 0;

  while (next && pages < 50) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(next, {
        signal: controller.signal,
        headers: {
          Accept: ACCEPT,
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'sport-athlete-management-app/0.1'
        }
      });
    } catch (error) {
      throw apiError(error.name === 'AbortError' ? 'concept2_timeout' : 'concept2_unreachable');
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) throw apiError('concept2_authorization_failed', 502);
    if (!response.ok) throw apiError(`concept2_http_${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data)) throw apiError('concept2_invalid_response');
    results.push(...body.data);
    const link = body.meta?.pagination?.links?.next;
    next = typeof link === 'string' && link ? link.replace(/^http:/, 'https:') : null;
    pages += 1;
  }
  if (next) throw apiError('concept2_pagination_limit');
  return results;
}
