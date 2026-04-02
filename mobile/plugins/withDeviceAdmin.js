'use strict';

/**
 * Expo config plugin — patches the Android build to include the Device Admin receiver.
 *
 * This plugin:
 *  1. Adds the DeviceAdminPackage to MainApplication.java
 *  2. Ensures the device_admin_policies.xml is in the right place
 *
 * It runs during `expo prebuild` (or `eas build`) and modifies the generated
 * native Android project so you don't have to manually edit Java files.
 */

const { withAndroidManifest, withMainApplication, createRunOncePlugin } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// ─── Patch MainApplication.java to register our native package ───────────────

function withDeviceAdminPackage(config) {
  return withMainApplication(config, mod => {
    const contents = mod.modResults.contents;

    // Add import
    const withImport = mergeContents({
      tag:       'dishwasher-device-admin-import',
      src:       contents,
      newSrc:    'import com.dishwasher.DeviceAdminPackage;',
      anchor:    /import com\.facebook\.react\.ReactNativeHost;/,
      offset:    1,
      comment:   '//',
    });

    // Add package to getPackages()
    const withPackage = mergeContents({
      tag:       'dishwasher-device-admin-package',
      src:       withImport.contents,
      newSrc:    '              packages.add(new DeviceAdminPackage());',
      anchor:    /List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);/,
      offset:    1,
      comment:   '//',
    });

    mod.modResults.contents = withPackage.contents;
    return mod;
  });
}

// ─── Compose and export ───────────────────────────────────────────────────────

function withDeviceAdmin(config) {
  config = withDeviceAdminPackage(config);
  return config;
}

module.exports = createRunOncePlugin(withDeviceAdmin, 'withDeviceAdmin', '1.0.0');
