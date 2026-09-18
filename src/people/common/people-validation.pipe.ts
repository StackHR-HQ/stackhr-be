import {
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

/**
 * Request validation for People routes: strips nothing silently (unknown
 * fields are rejected) and reports failures in the People error contract,
 * `{ code: 'VALIDATION_ERROR', message, fields }` with dotted field paths.
 */
export function createPeopleValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const fields = flattenValidationErrors(errors);
      return new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: Object.values(fields)[0] ?? 'The request is invalid',
        fields,
      });
    },
  });
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const [message] = Object.values(error.constraints ?? {});
    if (message) fields[path] = message;
    if (error.children?.length) {
      Object.assign(fields, flattenValidationErrors(error.children, path));
    }
  }
  return fields;
}
