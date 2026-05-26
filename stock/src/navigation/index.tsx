import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createStaticNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton } from 'react-native-paper';
import { Home } from './screens/Home';
import { Profile } from './screens/Profile';
import { Settings } from './screens/Settings';
import { Updates } from './screens/Updates';
import { NotFound } from './screens/NotFound';
import { Login } from './screens/Login';

const HomeTabs = createBottomTabNavigator({
  screens: {
    Home: {
      screen: Home,
      options: {
        title: 'Today',
        tabBarIcon: ({ color, size }) => <IconButton icon="view-dashboard-outline" iconColor={color} size={size} />,
      },
    },
    Updates: {
      screen: Updates,
      options: {
        title: 'Shops',
        tabBarIcon: ({ color, size }) => <IconButton icon="storefront-outline" iconColor={color} size={size} />,
      },
    },
    Settings: {
      screen: Settings,
      options: {
        title: 'Work',
        tabBarIcon: ({ color, size }) => <IconButton icon="clipboard-list-outline" iconColor={color} size={size} />,
      },
    },
    Profile: {
      screen: Profile,
      options: {
        tabBarIcon: ({ color, size }) => <IconButton icon="account-circle-outline" iconColor={color} size={size} />,
      },
    },
  },
});

const RootStack = createNativeStackNavigator({
  screens: {
    Login: {
      screen: Login,
      options: {
        headerShown: false,
      },
    },
    HomeTabs: {
      screen: HomeTabs,
      options: {
        title: 'Home',
        headerShown: false,
      },
    },
    NotFound: {
      screen: NotFound,
      options: {
        title: '404',
      },
      linking: {
        path: '*',
      },
    },
  },
});

export const Navigation = createStaticNavigation(RootStack);

type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}
