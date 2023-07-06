export {}
// for tests
declare module 'expect' {
    interface AsymmetricMatchers {
        toShallowEqual(toMatch: string|number): void;
    }
    interface Matchers<R> {
        toShallowEqual(toMatch: string|number): R;
    }
}