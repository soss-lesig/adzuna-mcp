/**
 * Shared helpers for Adzuna MCP tool handlers. Formatters for one job,
 * one location object, and one salary triple; a truncator; and the
 * error-code-to-message mapper used by every tool. Lives here (rather
 * than colocated with search-jobs.js) so future Adzuna tools added in
 * v0.2.0 (salary history, top companies, etc.) can reuse the same
 * formatters without circular imports.
 */

/**
 * Format a single Adzuna job result as a multi-line block. Tolerates
 * missing optional fields (Adzuna omits salary, contract type, contract
 * time, etc. for many jobs).
 *
 * @param {object} job - One Adzuna job, with `__CLASS__` markers already
 *   stripped by the client.
 * @returns {string}
 */
export function formatJob(job) {
  const company = job.company?.display_name ?? 'Unknown company';
  const header = `[#${job.id}] ${job.title} - ${company}`;

  const location = formatLocation(job.location);
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_is_predicted);
  // ISO 8601 timestamp; show just the YYYY-MM-DD portion for compactness.
  const date = job.created ? job.created.split('T')[0] : '';
  const meta = [location, salary, date].filter(Boolean).join(' | ');

  const lines = [header];
  if (meta) lines.push(`  ${meta}`);

  if (job.contract_type) lines.push(`  Contract type: ${job.contract_type}`);
  if (job.contract_time) lines.push(`  Contract time: ${job.contract_time}`);
  if (job.category?.label) lines.push(`  Category: ${job.category.label}`);
  if (job.redirect_url) lines.push(`  ${job.redirect_url}`);

  if (job.description) {
    lines.push(`  ${truncate(job.description, 240)}`);
  }

  return lines.join('\n');
}

/**
 * Format an Adzuna location object as a compact, human-readable string.
 * Falls back to the `area` array if `display_name` is absent, and
 * returns empty string if neither is present.
 *
 * @param {object|null|undefined} location - Adzuna's nested location
 *   object: `{ display_name, area: [...] }`.
 * @returns {string}
 */
export function formatLocation(location) {
  if (!location) return '';
  if (location.display_name) return location.display_name;
  if (Array.isArray(location.area) && location.area.length > 0) {
    return location.area.join(', ');
  }
  return '';
}

/**
 * Format Adzuna's salary fields as a single string. Tolerates partial
 * data (only min, only max, neither). Marks predicted salaries
 * explicitly so the LLM can convey honesty about salary signal.
 *
 * @param {number|null|undefined} min
 * @param {number|null|undefined} max
 * @param {number|null|undefined} isPredicted - 1 if Adzuna predicted the
 *   salary, 0 if real, absent if no salary at all.
 * @returns {string} e.g. "GBP 50000-55000", "GBP 50000+ (predicted)",
 *   or "" if no salary data.
 */
export function formatSalary(min, max, isPredicted) {
  let str = '';
  if (min && max) str = `GBP ${min}-${max}`;
  else if (min) str = `GBP ${min}+`;
  else if (max) str = `GBP up to ${max}`;
  if (str && isPredicted === 1) str += ' (predicted)';
  return str;
}

/**
 * Truncate a string to a maximum length, appending an ellipsis if cut.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Map an AdzunaApiError to a user-facing message for MCP error
 * responses. Every tool uses this so error wording is consistent
 * across the surface.
 *
 * @param {import('../adzuna-client.js').AdzunaApiError} error
 * @returns {string}
 */
export function messageForError(error) {
  switch (error.code) {
    case 'RATE_LIMITED':
      return error.retryAfter !== undefined
        ? `Adzuna rate-limited the request. Retry after ${error.retryAfter} seconds.`
        : 'Adzuna rate-limited the request. Try again shortly.';
    case 'AUTH_FAILED':
      return 'Adzuna rejected the credentials. Check ADZUNA_APP_ID and ADZUNA_APP_KEY are set correctly.';
    case 'BAD_REQUEST':
      return `Adzuna rejected the request: ${error.message}`;
    case 'NOT_FOUND':
      return `Adzuna returned 404: ${error.message}`;
    case 'UPSTREAM_ERROR':
    default:
      return `Adzuna upstream problem: ${error.message}`;
  }
}
