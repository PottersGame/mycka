'use strict';

/**
 * Device Admin integration for Android.
 *
 * This module calls the native DeviceAdmin module (implemented in Java) to:
 *   - Request Device Admin activation (parent must approve once during setup)
 *   - Lock the phone screen when the kid ignores the chore
 *
 * The native module is defined in:
 *   android/app/src/main/java/com/dishwasher/DeviceAdminModule.java
 */

import { NativeModules, Alert, Linking } from 'react-native';

const { DeviceAdminModule } = NativeModules;

/**
 * Check whether Device Admin is currently active for this app.
 */
export async function isDeviceAdminActive() {
  if (!DeviceAdminModule) return false;
  return DeviceAdminModule.isAdminActive();
}

/**
 * Open the system screen to request Device Admin activation.
 * The user (parent, during setup) must tap "Activate" in the system dialog.
 */
export async function requestDeviceAdmin() {
  if (!DeviceAdminModule) {
    Alert.alert(
      'Not Available',
      'Device Admin is only available on physical Android devices with the production build.',
    );
    return false;
  }
  return DeviceAdminModule.requestAdminActivation();
}

/**
 * Lock the phone screen immediately.
 * Only works if Device Admin has been activated.
 */
export async function lockScreen() {
  if (!DeviceAdminModule) {
    console.warn('[DeviceAdmin] Native module not available');
    return false;
  }

  const isAdmin = await isDeviceAdminActive();
  if (!isAdmin) {
    console.warn('[DeviceAdmin] Not an active device admin — cannot lock screen');
    return false;
  }

  return DeviceAdminModule.lockScreen();
}

/**
 * Show a prompt guiding the parent through Device Admin setup.
 */
export function showDeviceAdminSetupGuide() {
  Alert.alert(
    '🔒 Enable Phone Lock',
    "To allow DishwasherDuty to lock this phone when chores are ignored, you need to grant it Device Administrator access.\n\nTap 'Activate' on the next screen.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: requestDeviceAdmin },
    ],
  );
}
