'use strict';

const { buildReact, copyFiles, deleteFoldersRecursive, patchHtmlFile, npmInstall } = require('@iobroker/build-tools');
const path = require('path');
const fs = require('fs');

const srcAdminDir = path.join(__dirname, 'src-admin');
const adminDir = path.join(__dirname, 'admin');

async function installAdmin() {
    console.log('Installing src-admin dependencies...');
    await npmInstall(srcAdminDir);
}

async function buildReactVite() {
    console.log('Building React admin with Vite...');
    const { execSync } = require('child_process');
    execSync('npx vite build', { cwd: srcAdminDir, stdio: 'inherit' });
}

async function copyAdmin() {
    // Copy built files to admin/ (excluding index.html - handled separately)
    console.log('Copying build to admin/...');
    deleteFoldersRecursive(path.join(adminDir, 'assets'));
    await copyFiles(
        [
            `${srcAdminDir}/build/**/*`,
            `!${srcAdminDir}/build/index.html`,
        ],
        adminDir,
    );

    // Patch index.html in-place (replaces dynamic socket.io script with static path ../../lib/js/socket.io.js)
    // then copy as index_m.html
    await patchHtmlFile(`${srcAdminDir}/build/index.html`, '../..');
    fs.copyFileSync(
        path.join(srcAdminDir, 'build', 'index.html'),
        path.join(adminDir, 'index_m.html'),
    );

    console.log('Admin copy complete.');
}

async function buildAdmin() {
    await buildReactVite();
    await copyAdmin();
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--install-admin')) {
        await installAdmin();
    } else if (args.includes('--copy-admin')) {
        await copyAdmin();
    } else {
        // Full build: install + build + copy
        await installAdmin();
        await buildAdmin();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
