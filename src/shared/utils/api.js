/**
 * API utility functions for making HTTP requests
 */

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

// Double-submit CSRF: the server sets a readable `csrf_token` cookie at login and
// requires it echoed in `x-csrf-token` on state-changing dashboard mutations.
// Sent only when the cookie exists, so API-key/CLI callers are unaffected.
function withCsrf(headers) {
  if (typeof document === "undefined") return headers;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  if (!match) return headers;
  return { ...headers, "x-csrf-token": decodeURIComponent(match[1]) };
}

/**
 * Make a GET request
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<object>}
 */
export async function get(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    ...options,
  });
  return handleResponse(response);
}

/**
 * Make a POST request
 * @param {string} url - API endpoint
 * @param {object} data - Request body
 * @param {object} options - Fetch options
 * @returns {Promise<object>}
 */
export async function post(url, data, options = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: withCsrf({ ...DEFAULT_HEADERS, ...options.headers }),
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(response);
}

/**
 * Make a PUT request
 * @param {string} url - API endpoint
 * @param {object} data - Request body
 * @param {object} options - Fetch options
 * @returns {Promise<object>}
 */
export async function put(url, data, options = {}) {
  const response = await fetch(url, {
    method: "PUT",
    headers: withCsrf({ ...DEFAULT_HEADERS, ...options.headers }),
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(response);
}

/**
 * Make a DELETE request
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<object>}
 */
export async function del(url, options = {}) {
  const response = await fetch(url, {
    method: "DELETE",
    headers: withCsrf({ ...DEFAULT_HEADERS, ...options.headers }),
    ...options,
  });
  return handleResponse(response);
}

/**
 * Handle API response
 * @param {Response} response - Fetch response
 * @returns {Promise<object>}
 */
async function handleResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || "An error occurred");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

const api = { get, post, put, del };
export default api;
