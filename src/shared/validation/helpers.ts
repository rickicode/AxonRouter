export function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));

  return {
    success: false,
    error: {
      message: "Validation failed",
      details,
    },
  };
}

export function isValidationFailure(result) {
  return !result?.success;
}
