/**
 * MCP tool definition for searching Adzuna jobs. Exports the tool name, a Zod
 * schema describing arguments using camelCase parameter names that translate
 * to Adzuna's mixed snake_case/bareword naming inside the client, and a
 * handler that calls the Adzuna client and formats the response for MCP.
 * Stub: schema and handler are placeholders pending build step 3.
 */

import { z } from 'zod';

/** MCP tool name registered by the server. */
export const name = 'search_jobs';

/** Human-readable blurb shown in the tool's MCP metadata. */
export const description =
  'Search Adzuna for UK jobs matching the given criteria. ' +
  'Implementation pending (build step 3).';

/**
 * Zod schema for the search_jobs arguments. Filled in by build step 3.
 * @type {z.ZodObject}
 */
export const schema = z.object({});

/**
 * Handle a search_jobs tool call. Filled in by build step 3.
 *
 * @param {z.infer<typeof schema>} _args
 * @param {object} _client - Configured AdzunaClient (build step 2).
 * @returns {Promise<{ content: Array<{type: string, text: string}>, isError?: boolean }>}
 */
export async function handler(_args, _client) {
  throw new Error('search_jobs handler not yet implemented (build step 3)');
}
