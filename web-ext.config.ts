import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
});