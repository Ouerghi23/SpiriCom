// src/setupTests.js
// Mock IntersectionObserver
/* eslint-env node */
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(element) {
    // Simulate immediate intersection
    this.callback([{ isIntersecting: true, target: element }]);
  }
  unobserve() {}
  disconnect() {}
};