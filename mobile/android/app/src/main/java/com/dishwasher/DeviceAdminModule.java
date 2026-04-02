package com.dishwasher;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Native React Native module exposing Device Admin capabilities to JavaScript.
 *
 * Registered as "DeviceAdminModule" — accessed in JS via NativeModules.DeviceAdminModule
 */
public class DeviceAdminModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "DeviceAdminModule";

    private final ReactApplicationContext reactContext;
    private DevicePolicyManager dpm;
    private ComponentName adminComponent;

    public DeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.dpm = (DevicePolicyManager) reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE);
        this.adminComponent = new ComponentName(reactContext, DishwasherDeviceAdminReceiver.class);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Check whether this app is an active Device Administrator.
     * Resolves to true/false.
     */
    @ReactMethod
    public void isAdminActive(Promise promise) {
        try {
            boolean active = dpm.isAdminActive(adminComponent);
            promise.resolve(active);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * Open the system Device Admin activation dialog.
     * The user must tap "Activate" in the system UI.
     * Resolves to true when the intent is launched (doesn't guarantee activation).
     */
    @ReactMethod
    public void requestAdminActivation(Promise promise) {
        try {
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
            intent.putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "DishwasherDuty needs Device Admin access to lock this phone when chores are ignored for too long."
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * Lock the screen immediately (requires Device Admin to be active).
     * Resolves to true on success, rejects if not an admin.
     */
    @ReactMethod
    public void lockScreen(Promise promise) {
        try {
            if (!dpm.isAdminActive(adminComponent)) {
                promise.reject("NOT_ADMIN", "Device Admin is not active. Ask a parent to activate it in Settings.");
                return;
            }
            dpm.lockNow();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
