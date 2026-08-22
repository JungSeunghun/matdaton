export type ApiErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict";

export function errorResponse(status: 400 | 401 | 403 | 404 | 409, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function badRequest(message: string): Response {
  return errorResponse(400, "bad_request", message);
}

export function unauthorized(message = "인증이 필요합니다"): Response {
  return errorResponse(401, "unauthorized", message);
}

export function forbidden(message: string): Response {
  return errorResponse(403, "forbidden", message);
}

export function notFound(message = "리소스를 찾을 수 없습니다"): Response {
  return errorResponse(404, "not_found", message);
}

export function conflict(message: string): Response {
  return errorResponse(409, "conflict", message);
}
