'use strict';

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import HomeScreen        from './screens/HomeScreen';
import HistoryScreen     from './screens/HistoryScreen';
import RewardsScreen     from './screens/RewardsScreen';
import ShoppingScreen    from './screens/ShoppingScreen';
import CalendarScreen    from './screens/CalendarScreen';
import NoticeboardScreen from './screens/NoticeboardScreen';
import SettingsScreen    from './screens/SettingsScreen';
import LockScreen        from './screens/LockScreen';

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
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Hrnčiarovci', tabBarIcon: tabIcon('🏠') }}
      />
      <Tab.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ title: 'Odmeny', tabBarIcon: tabIcon('⭐') }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{ title: 'Nákup', tabBarIcon: tabIcon('🛒') }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: 'Kalendár', tabBarIcon: tabIcon('📅') }}
      />
      <Tab.Screen
        name="Noticeboard"
        component={NoticeboardScreen}
        options={{ title: 'Nástenka', tabBarIcon: tabIcon('📌') }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'História', tabBarIcon: tabIcon('📋') }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Nastavenia', tabBarIcon: tabIcon('⚙️') }}
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

    notifListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data || {};
      handleNotificationData(data);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data || {};
      handleNotificationData(data, true);
    });

    return () => {
      if (notifListener.current)   Notifications.removeNotificationSubscription(notifListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  async function setupPushNotifications() {
    try {
      const token = await registerForPushNotifications();
      if (!token) return;

      const [name, baseUrl] = await Promise.all([getUserName(), getBaseUrl()]);
      if (!name || !baseUrl) return;

      await registerToken(name, token);
    } catch (err) {
      console.warn('[App] Push setup error:', err.message);
    }
  }

  function handleNotificationData(data, wasTapped = false) {
    if (!data?.type) return;

    switch (data.type) {
      case 'lock':
        lockScreen().catch(console.warn);
        navigationRef.current?.navigate('Lock', {
          cycleId:   data.cycleId,
          assignee:  data.assignee || 'TY',
          choreType: data.choreType || 'dishwasher',
        });
        break;

      case 'lock_warning':
        if (wasTapped) navigationRef.current?.navigate('Home');
        break;

      case 'assigned':
      case 'reminder':
        if (wasTapped) navigationRef.current?.navigate('Home');
        break;

      case 'done':
        if (wasTapped) navigationRef.current?.navigate('Rewards');
        break;

      case 'shame':
        if (wasTapped) navigationRef.current?.navigate('History');
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
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
