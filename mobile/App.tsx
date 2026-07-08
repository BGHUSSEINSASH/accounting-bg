import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { I18nProvider, useTranslation } from './src/i18n/context';
import SalesScreen from './src/screens/SalesScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import ClientsScreen from './src/screens/ClientsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Sales') iconName = focused ? 'cart' : 'cart-outline';
          else if (route.name === 'Attendance') iconName = focused ? 'time' : 'time-outline';
          else if (route.name === 'Clients') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: 'gray',
        headerStyle: { backgroundColor: '#3b82f6' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: 'Cairo' },
      })}
    >
      <Tab.Screen name="Sales" component={SalesScreen} options={{ title: t('sales.title') }} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ title: t('attendance.title') }} />
      <Tab.Screen name="Clients" component={ClientsScreen} options={{ title: t('clients.title') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t('profile.title') }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <TabNavigator />
        </NavigationContainer>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </I18nProvider>
  );
}
