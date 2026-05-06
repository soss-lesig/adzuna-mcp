/**
 * MCP tool definition for searching Adzuna jobs. Exports the tool name,
 * a Zod schema using camelCase parameter names that the client
 * translates to Adzuna's wire names, and a handler that calls the
 * Adzuna client and formats the response. AdzunaApiError instances are
 * caught and returned as structured tool errors so a rate-limit or auth
 * failure reaches the MCP client as a readable message rather than
 * crashing the server.
 */

import { z } from 'zod';
import { AdzunaApiError } from '../adzuna-client.js';
import { formatJob, messageForError } from './_shared.js';

/** MCP tool name registered by the server. */
export const name = 'search_jobs';

/** Human-readable blurb shown in the tool's MCP metadata. */
export const description =
  'Search Adzuna for UK jobs matching the given criteria. ' +
  'Provide at least one of: a keywords variant, location, category, or company. ' +
  'Distance is in kilometres.';

/**
 * Zod schema for the search_jobs arguments. Field names are camelCase
 * MCP-friendly versions of Adzuna's mixed snake_case/bareword wire
 * names; the AdzunaClient translates them. See DECISIONS.md
 * (2026-05-06: Parameter naming) for why we translate. The .refine()
 * rule enforces a usage policy not in the API itself: callers must
 * supply at least one filter, so the tool never issues an unbounded
 * query that wastes a rate-limit hit on "everything".
 */
export const schema = z
  .object({
    keywords: z
      .string()
      .optional()
      .describe('Free-text search terms (any may match), e.g. "senior backend engineer".'),
    keywordsAll: z
      .string()
      .optional()
      .describe('All of these terms must appear in the job.'),
    keywordsPhrase: z
      .string()
      .optional()
      .describe('Exact phrase match in title or description.'),
    keywordsAny: z
      .string()
      .optional()
      .describe('Any of these terms may match. Same effect as `keywords`; supplied for explicitness.'),
    excludeKeywords: z
      .string()
      .optional()
      .describe('Exclude jobs containing these terms.'),
    titleOnly: z
      .string()
      .optional()
      .describe('Match terms against the job title only.'),
    location: z
      .string()
      .optional()
      .describe('Location to search around: town, city, or postcode (e.g. "Manchester", "EH1").'),
    distance: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Search radius around `location` in kilometres (Adzuna uses km, not miles). Default 5km.'),
    category: z
      .string()
      .optional()
      .describe('Adzuna category tag, e.g. "it-jobs". The full taxonomy will be exposed via a `get_categories` tool in v0.2.0.'),
    company: z
      .string()
      .optional()
      .describe('Filter by canonical company name.'),
    minimumSalary: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Minimum annual salary in GBP.'),
    maximumSalary: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Maximum annual salary in GBP.'),
    salaryIncludeUnknown: z
      .boolean()
      .optional()
      .describe('Include jobs that have no salary listed (excluded by default).'),
    fullTime: z
      .boolean()
      .optional()
      .describe('Restrict to full-time roles.'),
    partTime: z
      .boolean()
      .optional()
      .describe('Restrict to part-time roles.'),
    contract: z
      .boolean()
      .optional()
      .describe('Restrict to contract roles.'),
    permanent: z
      .boolean()
      .optional()
      .describe('Restrict to permanent roles.'),
    sortBy: z
      .enum(['date', 'salary', 'relevance', 'hybrid'])
      .optional()
      .describe('Sort order. Adzuna defaults to relevance.'),
    sortDirection: z
      .enum(['up', 'down'])
      .optional()
      .describe('Sort direction. Pair with `sortBy`.'),
    resultsPerPage: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .describe('Results per page (default 10, max 50).'),
    maxDaysOld: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum listing age in days.'),
    page: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Page number for pagination, starting at 1. Adzuna paginates via URL path, so successive pages are independent calls against the rate limit.'),
  })
  .refine(
    (args) => {
      const hasKeyword =
        args.keywords ||
        args.keywordsAll ||
        args.keywordsPhrase ||
        args.keywordsAny ||
        args.titleOnly;
      const hasFilter = args.location || args.category || args.company;
      return Boolean(hasKeyword || hasFilter);
    },
    {
      message:
        'Provide at least one of: a keywords variant (`keywords`, `keywordsAll`, `keywordsPhrase`, `keywordsAny`, `titleOnly`), `location`, `category`, or `company`.',
    },
  );

/**
 * Handle a search_jobs tool call.
 *
 * @param {z.infer<typeof schema>} args - Arguments validated against
 *   `schema`. The `page` field is destructured out and passed as the
 *   `client.search()` options object since Adzuna paginates via URL
 *   path, not a query parameter.
 * @param {import('../adzuna-client.js').default} client - Configured
 *   AdzunaClient.
 * @returns {Promise<{ content: Array<{type: string, text: string}>, isError?: boolean }>}
 *   MCP tool response. AdzunaApiError instances become `{ isError: true, ... }`
 *   with a code-specific message. Other errors propagate.
 */
export async function handler(args, client) {
  const { page = 1, ...searchParams } = args;
  try {
    const result = await client.search(searchParams, { page });
    return {
      content: [{ type: 'text', text: formatResults(result, client) }],
    };
  } catch (error) {
    if (error instanceof AdzunaApiError) {
      return {
        isError: true,
        content: [{ type: 'text', text: errorText(error, client) }],
      };
    }
    throw error;
  }
}

/**
 * Format Adzuna's search response as a human-readable summary. Includes
 * the top-level metadata (count, mean salary), each job formatted via
 * formatJob, the Adzuna attribution block (ToS requirement), and the
 * in-session API call counter for rate-limit visibility.
 *
 * @param {object} result - Adzuna's parsed response: `{ count, mean,
 *   results: [...] }`. `__CLASS__` markers already stripped by the client.
 * @param {import('../adzuna-client.js').default} client - The client
 *   instance, queried for callCount.
 * @returns {string}
 */
function formatResults(result, client) {
  const { count = 0, mean, results = [] } = result;

  const meanLine = mean
    ? ` Mean salary across all matches: GBP ${Math.round(mean).toLocaleString('en-GB')}.`
    : '';
  const lines = [
    `Found ${count.toLocaleString('en-GB')} jobs (returned ${results.length}).${meanLine}`,
  ];

  for (const job of results) {
    lines.push('', formatJob(job));
  }

  // Attribution block. Adzuna's ToS requires "Jobs by Adzuna" branding
  // for anyone displaying their listings, and the redirect_url is the
  // canonical attribution-compliant click-through. See DECISIONS.md
  // (2026-05-06: Adzuna ToS compliance -- attribution requirements).
  lines.push(
    '',
    '---',
    "Jobs by Adzuna (https://www.adzuna.co.uk/). Click each job's redirect_url for the canonical listing.",
    `API calls this session: ${client.callCount} (Adzuna free-tier limits: 25/min, 250/day, 1000/week, 2500/month).`,
  );

  return lines.join('\n');
}

/**
 * Build the user-facing text for an AdzunaApiError. Wraps
 * messageForError and appends the in-session call count for
 * RATE_LIMITED so the LLM can decide whether to back off or surrender.
 *
 * @param {AdzunaApiError} error
 * @param {import('../adzuna-client.js').default} client
 * @returns {string}
 */
function errorText(error, client) {
  let text = messageForError(error);
  if (error.code === 'RATE_LIMITED') {
    text += ` (${client.callCount} API calls this session.)`;
  }
  return text;
}
