package com.dishwasher;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/**
 * DeviceAdminReceiver — required entry point for Android Device Administration API.
 *
 * This class must be declared in AndroidManifest.xml with the
 * <receiver> tag and the BIND_DEVICE_ADMIN permission.
 *
 * The parent activates Device Admin once via Settings, which grants the app
 * permission to call DevicePolicyManager.lockNow() and lock the phone screen.
 */
public class DishwasherDeviceAdminReceiver extends DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        Toast.makeText(context, "🔒 DishwasherDuty: Phone lock activated", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        Toast.makeText(context, "DishwasherDuty: Phone lock deactivated", Toast.LENGTH_SHORT).show();
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return "Warning: disabling this will stop the phone lock feature for chore enforcement.";
    }
}
