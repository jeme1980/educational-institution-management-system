export const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include uppercase, lowercase, and a number.';

export function validatePasswordPolicy(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value);
}
