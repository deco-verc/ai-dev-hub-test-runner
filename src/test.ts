import { runAllTests } from './tests/test-runner.js';

runAllTests()
  .then(res => {
    if (res.failed > 0) {
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  });
