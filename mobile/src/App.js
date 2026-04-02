'use strict';

/**
 * App entry point.
 *
 * Sets up:
 *  - React Navigation (Home / History / Settings + Lock modal)
 *  - Expo notification listeners (handle push notifications when app is open)
 *  - Registers the Expo push token with the backend on first launch
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import HomeScreen     from './screens/HomeScreen';
import HistoryScreen  from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import LockScreen     from './screens/LockScreen';

import {
  registerForPushNotifications,
  configureForegroundHandler,
} from './services/notifications';
import { registerToken, getUserName, getBaseUrl } from './services/api';
import { lockScreen } from './services/deviceAdmin';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function tabIcon(name) {
  return ({ color, size }) => <Text style={{ fontSize: size - 4, color }}>{name}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#1a73e8',
        headerStyle: { backgroundColor: '#1a73e8' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'DishwasherDuty 🍽️', tabBarIcon: tabIcon('🍽️') }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'History', tabBarIcon: tabIcon('📋') }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings', tabBarIcon: tabIcon('⚙️') }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  const notifListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    configureForegroundHandler();
    setupPushNotifications();

    // Listen for notifications received while app is in foreground
    notifListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data || {};
      handleNotificationData(data);
    });

    // Listen for user tapping a notification (app in background/closed)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data || {};
      handleNotificationData(data, true /* tapped */);
    });

    return () => {
      if (notifListener.current)  Notifications.removeNotificationSubscription(notifListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  async function setupPushNotifications() {
    try {
      const token = await registerForPushNotifications();
      if (!token) return;

      const [name, baseUrl] = await Promise.all([getUserName(), getBaseUrl()]);
      if (!name || !baseUrl) {
        console.log('[App] Name or URL not set yet — skipping token registration');
        return;
      }

      await registerToken(name, token);
      console.log('[App] Push token registered for', name);
    } catch (err) {
      console.warn('[App] Push setup error:', err.message);
    }
  }

  function handleNotificationData(data, wasTapped = false) {
    if (!data?.type) return;

    switch (data.type) {
      case 'lock':
        // Lock the screen natively, then navigate to the lock screen
        lockScreen().catch(console.warn);
        navigationRef.current?.navigate('Lock', {
          cycleId: data.cycleId,
          assignee: data.assignee || 'YOU',
        });
        break;

      case 'lock_warning':
        if (wasTapped) {
          navigationRef.current?.navigate('Home');
        }
        break;

      case 'assigned':
      case 'reminder':
        if (wasTapped) {
          navigationRef.current?.navigate('Home');
        }
        break;

      case 'shame':
        if (wasTapped) {
          navigationRef.current?.navigate('History');
        }
        break;

      default:
        break;
    }
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Lock"
          component={LockScreen}
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,   // Can't swipe to dismiss
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
