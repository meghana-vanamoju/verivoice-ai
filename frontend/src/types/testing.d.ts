import '@testing-library/jest-dom';

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveTextContent(text: string | RegExp): T;
    toBeDisabled(): T;
    toHaveClass(className: string): T;
    toHaveValue(value: string | number): T;
    toHaveStyle(style: Record<string, any>): T;
    toBeChecked(): T;
    toBePartiallyChecked(): T;
    toHaveFocus(): T;
    toBeRequired(): T;
    toBeValid(): T;
    toBeInvalid(): T;
    toHaveDescription(text?: string | RegExp): T;
    toHaveErrorMessage(text?: string | RegExp): T;
  }
}