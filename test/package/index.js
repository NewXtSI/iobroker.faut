const path = require('path');
const { tests } = require('@iobroker/testing');

// Run package tests
tests.packageFiles(path.join(__dirname, '../..'), {
	// Exclude files that don't need to be part of the package
});
