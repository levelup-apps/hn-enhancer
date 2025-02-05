import { hello } from './main.js';

describe('hello function', () => {
    it('should return "hello"', () => {
        expect(hello()).toBe("hello");
    });
});