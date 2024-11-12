import { ZodError, type z } from 'zod';

export function validate<T>(
  prop: T,
  validator: z.ZodType<T>,
  errorMessage: string,
  ErrorClass?: new (message: string) => Error | undefined
): asserts prop is T {
  try {
    validator.parse(prop);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new (ErrorClass || Error)(
        `${errorMessage}: ${error.issues
          .map((issue) => issue.message)
          .join(', ')}`
      );
    }
    throw error;
  }
}
