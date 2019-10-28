#!/usr/bin/env node
'use strict';
/**
 * Since we want to do a "npm publish" on every CI run for master, we need to:
 * 1. fetch the current published version of the core-ui package.
 * 2. IF the package.json version of the package is higher than the published version (eg: major/minor/patch: 1.0.2 - published, 1.1.0 - current),
 *        we use the package.json version.
 * 3. Otherwise, we bump the patch version of the package and do a publish.
 *
 * Usage:
 *  node version --token=NPM_TOKEN
 *      OR
 *  export NPM_TOKEN={npmToken}
 *  node version
 * */
const path = require('path'),
  fs = require('fs'),
  https = require('https'),
  projectDir = process.cwd(),
  packagePath = path.normalize(projectDir + '/package.json');

let npmToken = process.env.NPM_TOKEN,
  npmRegistry = process.env.NPM_REGISTRY;
if (!npmToken) {
  process.argv.forEach((v) => {
    if (v.indexOf('--token=') === 0) {
      npmToken = v.split('--token=')[1];
    }
  });
}
if (!npmRegistry) {
  try {
    let npmRcFile = fs.readFileSync(path.normalize(projectDir + '/.npmrc'), 'utf8');
    let nLines = npmRcFile.split('\n');
    nLines.forEach((n) => {
      n = n.trim();
      if (!n) return;
      if (n.indexOf('registry=') === 0) {
        npmRegistry = n.split('registry=')[1];
      }
    });
  } catch (e) {
  }
}
if (!npmRegistry) npmRegistry = 'https://registry.npmjs.org';
if (npmRegistry.charAt(0) === '/') npmRegistry = 'https:' + npmRegistry;

(async () => {
  let packageInfo;
  if (npmRegistry.charAt(npmRegistry.length - 1) === '/') npmRegistry = npmRegistry.substr(0, npmRegistry.length - 1);
  try {
    packageInfo = require(packagePath);
  } catch (e) {
    console.error(`Could not read package.json file from ${packagePath}`);
    console.log(e);
    return process.exit(1);
  }
  let pkgInfo;
  try {
    console.log(`-> Fetching current package information for [${packageInfo.name}]`);
    pkgInfo = await req(`${npmRegistry}/${packageInfo.name}`);
  } catch (e) {
    console.error(`-> Could not fetch current package information`);
    console.log(e);
    return process.exit(1);
  }
  let latestVersion = pkgInfo['dist-tags'].latest;
  if (!latestVersion) {
    console.error(`-> Failed to parse published package information`);
    console.log(pkgInfo);
    return process.exit(1);
  }
  console.log(`-> Published package version for [${packageInfo.name}] is [${latestVersion}]`);
  let currentVersion = semverToNumber(packageInfo.version),
    publishedVersion = semverToNumber(latestVersion);
  let shouldBump = (publishedVersion >= currentVersion);
  if (!shouldBump) {
    console.log(`-> Using local version [${packageInfo.version}]`);
    return process.exit(0);
  }
  let targetVersion = latestVersion.split('.');
  targetVersion[2] = parseInt(targetVersion[2]) + 1;
  targetVersion = targetVersion.join('.');
  console.log(`-> Bumping version to [${targetVersion}]`);
  packageInfo.version = targetVersion;
  try {
    //   fs.writeFileSync(packagePath, JSON.stringify(packageInfo, null, 2), 'utf8');
    process.exit(0);
  } catch (e) {
    console.error(`Could not update package version to [${targetVersion}]`);
    console.error(e);
    return process.exit(1);
  }
})();

/**
 * Performs a simple HTTPS Get using the given NPM_TOKEN
 * */
function req(url, opt = {}) {
  if (!opt.method) opt.method = 'GET';
  if (!opt.headers) opt.headers = {};
  if (npmToken) {
    opt.headers['Authorization'] = `Bearer ${npmToken}`;
  }
  opt.headers['Accept'] = 'application/json';
  return new Promise((resolve, reject) => {
    let r = https.get(url, opt, (res) => {
      let data = '';
      res.on('data', (d) => data += d.toString());
      res.on('end', () => {
        try {
          data = JSON.parse(data);
        } catch (e) {
        }
        if (typeof data === 'object' && data && data.error) {
          return reject(new Error(`NPM Error: ${data.error}`));
        }
        resolve(data);
      });
    });
    r.on('error', reject);
  });
}


/*
* Given a string semver, it will convert it to a number.
* How we do it:
* parseInt(MAJOR * 100 + MINOR + 100 + PATCH * 100)
* */
function semverToNumber(ver) {
  let t = ver.split('.'),
    major = '1' + t[0],
    minor = t[1],
    patch = t[2];

  for (let i = 0; i < 3; i++) {
    if (major.length < i) major += '0';
    if (minor.length <= i) minor += '0';
    if (patch.length <= i) patch += '0';
  }
  let total = `${major}${minor}${patch}`;
  return parseInt(total, 10);
}
