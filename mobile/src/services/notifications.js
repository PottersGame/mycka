'use strict';

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Request notification permissions and return the Expo push token.
 * Must be called on a real device (not a simulator).
 */
export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a real device');
    return null;
  }

  // Android channel setup (must be done before requesting permissions)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('chores', {
      name: 'Chore Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,   // Override Do Not Disturb — they can't hide from this
    });

    await Notifications.setNotificationChannelAsync('shame', {
      name: 'Family Shame',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

/**
 * Configure how notifications are handled when the app is in the foreground.
 */
export function configureForegroundHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  });
}

/**
 * Schedule an aggressive local notification that cannot be easily dismissed.
 * Used as a fallback if the backend push fails.
 */
export async function scheduleLocalReminder(title, body, delaySeconds) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
    },
    trigger: { seconds: delaySeconds, channelId: 'chores' },
  });
}

export async function cancelAllLocalNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
