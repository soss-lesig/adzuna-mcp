/**
 * HTTP client for the Adzuna jobs API. The only module that talks to
 * Adzuna's servers. Handles query-parameter authentication (app_id and
 * app_key on every URL), camelCase-to-Adzuna parameter translation,
 * response normalisation (stripping the __CLASS__ Perl-class hints
 * Adzuna sprinkles onto every JSON object), and HTTP error mapping.
 * Tool handlers consume this client through its public methods.
 */

const DEFAULT_BASE = 'https://api.adzuna.com/v1/api/jobs';

// MCP-friendly camelCase to Adzuna's mixed snake_case/bareword wire names.
// See DECISIONS.md (2026-05-06: Parameter naming) for why we translate.
// Anything not in this map passes through unchanged so advanced params
// such as location0/location1 can be supplied verbatim if ever needed.
const PARAM_TRANSLATION = {
  keywords: 'what',
  keywordsAll: 'what_and',
  keywordsPhrase: 'what_phrase',
  keywordsAny: 'what_or',
  excludeKeywords: 'what_exclude',
  titleOnly: 'title_only',
  location: 'where',
  distance: 'distance',
  category: 'category',
  minimumSalary: 'salary_min',
  maximumSalary: 'salary_max',
  salaryIncludeUnknown: 'salary_include_unknown',
  fullTime: 'full_time',
  partTime: 'part_time',
  contract: 'contract',
  permanent: 'permanent',
  company: 'company',
  sortBy: 'sort_by',
  sortDirection: 'sort_dir',
  resultsPerPage: 'results_per_page',
  maxDaysOld: 'max_days_old',
};

// Adzuna expects "1"/"0" for boolean filter flags, not the strings
// "true"/"false" that String(true) would produce.
const BOOLEAN_PARAMS = new Set([
  'full_time',
  'part_time',
  'contract',
  'permanent',
  'salary_include_unknown',
]);

/**
 * Structured error for non-2xx responses from the Adzuna API. Tool handlers
 * switch on the `code` property to produce appropriate MCP error responses.
 *
 * Valid codes (closed enum; adding a new one requires a DECISIONS.md entry):
 * RATE_LIMITED, AUTH_FAILED, UPSTREAM_ERROR, NOT_FOUND, BAD_REQUEST.
 */
export class AdzunaApiError extends Error {
  /**
   * @param {string} message - Human-readable description of what went wrong.
   * @param {object} options
   * @param {number} options.status - HTTP status code from Adzuna's response.
   * @param {'RATE_LIMITED'|'AUTH_FAILED'|'UPSTREAM_ERROR'|'NOT_FOUND'|'BAD_REQUEST'} options.code
   *   Semantic error code for tool handlers to switch on.
   * @param {number} [options.retryAfter] - Seconds to wait before retrying,
   *   normalised from the Retry-After header. Adzuna's docs do not promise
   *   this header but the client parses it defensively if present.
   */
  constructor(message, { status, code, retryAfter }) {
    super(message);
    this.name = 'AdzunaApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * Thin HTTP wrapper around the Adzuna jobs API. Handles authentication,
 * parameter translation, response normalisation, and error mapping. Has no
 * MCP awareness: returns plain objects parsed (and de-`__CLASS__`-ed) from
 * Adzuna's JSON responses.
 */
export default class AdzunaClient {
  /** @type {string} */ #appId;
  /** @type {string} */ #appKey;
  /** @type {string} */ #country;
  /** @type {number} */ #callCount = 0;

  /**
   * @param {object} options
   * @param {string} options.appId - Adzuna application ID.
   * @param {string} options.appKey - Adzuna application key.
   * @param {string} [options.country='gb'] - ISO country code Adzuna uses
   *   in its URL paths. Defaults to `gb` because adzuna-mcp is positioned
   *   as a UK job-search server. Override at construction time only;
   *   v0.1.0 does not expose country at the request level.
   */
  constructor({ appId, appKey, country = 'gb' }) {
    if (!appId || !appKey) {
      throw new Error('AdzunaClient requires both appId and appKey.');
    }
    this.#appId = appId;
    this.#appKey = appKey;
    this.#country = country;
  }

  /**
   * Number of API calls this client has issued in the current process.
   * In-memory counter only; not persisted. Surfaced so the tool layer can
   * include "(N/250 daily) called this session" context in error responses
   * when Adzuna rate-limits.
   *
   * @returns {number}
   */
  get callCount() {
    return this.#callCount;
  }

  /**
   * Search Adzuna for jobs.
   *
   * @param {object} params - Search parameters using the camelCase MCP
   *   names (keywords, location, minimumSalary, fullTime, etc.). Translated
   *   to Adzuna's wire names internally. Unknown keys pass through
   *   unchanged so `location0`/`location1`/etc. work verbatim if needed.
   * @param {object} [options]
   * @param {number} [options.page=1] - Page number. Adzuna paginates via
   *   the URL path (`/search/1`, `/search/2`, ...), not an offset param.
   * @returns {Promise<object>} Adzuna's response, with `__CLASS__` markers
   *   stripped. Shape: `{ count, mean, results: [...] }`.
   * @throws {AdzunaApiError} On any non-2xx response.
   */
  async search(params = {}, { page = 1 } = {}) {
    const translated = this.#translateParams(params);
    return this.#request(`/${this.#country}/search/${page}`, translated);
  }

  /**
   * Internal: translate camelCase MCP params into Adzuna's parameter names
   * and value formats. Booleans for filter flags become "1"/"0" because
   * Adzuna expects those literal strings. Undefined and null values are
   * dropped. Unknown keys pass through unchanged.
   *
   * @param {Record<string, unknown>} params
   * @returns {Record<string, string>}
   */
  #translateParams(params) {
    const out = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      const adzunaKey = PARAM_TRANSLATION[key] ?? key;
      if (BOOLEAN_PARAMS.has(adzunaKey) && typeof value === 'boolean') {
        out[adzunaKey] = value ? '1' : '0';
      } else {
        out[adzunaKey] = String(value);
      }
    }
    return out;
  }

  /**
   * Internal: make an authenticated GET request to Adzuna and map non-2xx
   * responses to AdzunaApiError. Increments the call counter on every
   * attempt (success or failure) since each attempt counts against
   * Adzuna's rate limits.
   *
   * @param {string} path - URL path, joined to the API base URL.
   * @param {Record<string, string>} [params={}] - Query parameters
   *   (already translated to Adzuna names, all stringified).
   * @returns {Promise<object>} Parsed and normalised JSON.
   * @throws {AdzunaApiError}
   */
  async #request(path, params = {}) {
    this.#callCount += 1;

    const query = new URLSearchParams({
      app_id: this.#appId,
      app_key: this.#appKey,
      // Force JSON; Adzuna otherwise content-negotiates and may serve XML.
      'content-type': 'application/json',
      ...params,
    });

    const response = await fetch(`${DEFAULT_BASE}${path}?${query.toString()}`);

    if (!response.ok) {
      throw this.#errorFromResponse(response);
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new AdzunaApiError(
        `Adzuna returned status ${response.status} with an unparseable body`,
        { status: response.status, code: 'UPSTREAM_ERROR' },
      );
    }

    return stripClassMarkers(body);
  }

  /**
   * Internal: map a non-2xx Response to an AdzunaApiError with the
   * appropriate semantic code.
   *
   * @param {Response} response - The fetch Response object.
   * @returns {AdzunaApiError}
   */
  #errorFromResponse(response) {
    const { status } = response;

    if (status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      return new AdzunaApiError(
        'Adzuna rate limit exceeded. Free-tier limits are 25/min, 250/day, 1000/week, 2500/month.',
        { status, code: 'RATE_LIMITED', retryAfter },
      );
    }

    if (status === 401 || status === 403) {
      return new AdzunaApiError(
        'Adzuna rejected the credentials. Check ADZUNA_APP_ID and ADZUNA_APP_KEY are valid.',
        { status, code: 'AUTH_FAILED' },
      );
    }

    if (status === 404) {
      return new AdzunaApiError(
        `Adzuna returned 404 for ${response.url}`,
        { status, code: 'NOT_FOUND' },
      );
    }

    if (status === 400) {
      return new AdzunaApiError(
        'Adzuna rejected the request as malformed',
        { status, code: 'BAD_REQUEST' },
      );
    }

    return new AdzunaApiError(
      `Adzuna returned unexpected status ${status}`,
      { status, code: 'UPSTREAM_ERROR' },
    );
  }
}

/**
 * Recursively delete `__CLASS__` keys from an Adzuna response. Adzuna's
 * JSON embeds the originating Perl class on every object (e.g.
 * `Adzuna::API::Response::Job`); this is leakage from their internals
 * and has no value to consumers. Stripping at the client boundary means
 * the tool layer and any future aggregator never have to know about it.
 * See DECISIONS.md (2026-05-06: Strip __CLASS__ markers in client).
 *
 * Module-level rather than a private method because it is a pure
 * transform with no dependence on instance state.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function stripClassMarkers(value) {
  if (Array.isArray(value)) {
    return value.map(stripClassMarkers);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === '__CLASS__') continue;
      out[key] = stripClassMarkers(child);
    }
    return out;
  }
  return value;
}

/**
 * Normalise a Retry-After header value to seconds. Returns undefined if
 * the header is absent or unparseable. Accepts both the integer-seconds
 * form and the HTTP-date form.
 *
 * @param {string|null} headerValue
 * @returns {number|undefined}
 */
function parseRetryAfter(headerValue) {
  if (!headerValue) return undefined;

  const asNumber = Number(headerValue);
  if (!Number.isNaN(asNumber) && asNumber >= 0) return asNumber;

  const date = new Date(headerValue);
  if (!Number.isNaN(date.getTime())) {
    const seconds = Math.ceil((date.getTime() - Date.now()) / 1000);
    return seconds > 0 ? seconds : undefined;
  }

  return undefined;
}
