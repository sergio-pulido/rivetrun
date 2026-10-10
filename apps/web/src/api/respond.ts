import type { ApiError } from '@rivetrun/contracts';
import type { z } from 'zod';

const json = (body: unknown, status: number): Response => Response.json(body, { status });

export const apiError = (status: number, code: ApiError['code'], error: string): Response =>
  json({ error, code } satisfies ApiError, status);

export const notImplemented = (route: string): Response =>
  apiError(501, 'not_implemented', `${route} is not implemented yet (scaffold)`);

/** Largest JSON body any route accepts. */
export const MAX_BODY_BYTES = 2_000_000;

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

const describeIssues = (error: z.ZodError): string =>
  error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.infer<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, response: apiError(400, 'bad_request', describeIssues(result.error)) };
}

/** Reads and validates a JSON body. Invalid JSON and schema failures both return 400. */
export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  // A real post is a question or one episode, well under a megabyte: anything far larger is refused before it is
  // parsed, so one request cannot tie up the server or fill its memory.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return { ok: false, response: apiError(413, 'bad_request', 'body too large') };
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, response: apiError(413, 'bad_request', 'body too large') };
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError(400, 'bad_request', 'body must be valid JSON') };
  }
  return parseWith(schema, body);
}
